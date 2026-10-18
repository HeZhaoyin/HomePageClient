<template>
  <div class="globe-wrap" ref="wrapRef">
    <canvas ref="canvasRef"></canvas>
    <div class="globe-fallback" v-if="fallbackReason"></div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue'

// 动态地球背景 v2：
//  - IP 定位：https://ipwho.is（CORS *，避开 Mixed Content）→ 失败兜底北京
//  - 聚焦到国家尺度：访客 IP 的 country_code 查中心点，相机距离使该国占屏 ~50%
//  - pin：小圆点 + 细环（去长杆，不突兀）
//  - 真实感：法线贴图 + 镜面 + 云层 + Fresnel 大气 + 昼夜 shader（含晨昏线暖色）
//  - three.js 走国内 CDN（不进 bundle 不占 frp），贴图走 GitHub raw 直连
//  - 无 WebGL / CDN / 核心贴图失败 → CSS 兜底
const wrapRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const fallbackReason = ref('')

// three.js CDN（国内可达：staticfile 主 ~0.4s，jsDelivr 备）
const THREE_CDN_PRIMARY = 'https://cdn.staticfile.org/three.js/r128/three.min.js'
const THREE_CDN_BACKUP = 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'

// 贴图：three.js 官方仓库（HEAD tag）一整套地球纹理
const TEX = (name: string) =>
  `https://raw.githubusercontent.com/mrdoob/three.js/HEAD/examples/textures/planets/${name}`
const TEXTURES = {
  day: TEX('earth_day_4096.jpg'),
  night: TEX('earth_night_4096.jpg'),
  clouds: TEX('earth_clouds_1024.png'),
  normal: TEX('earth_normal_2048.jpg'),
  specular: TEX('earth_specular_2048.jpg'),
}

// 国家尺度的相机距离：让该国大致占屏一半（半径 R=1，45° 垂直张角）。
// 横跨大的国家（中/美/俄/澳/加/印/巴西）拉远到 2.1~2.5，其余 1.9。
const COUNTRY_ZOOM: Record<string, number> = {
  CN: 2.1, US: 2.3, RU: 2.5, BR: 2.2, CA: 2.3, IN: 2.1, AU: 2.1,
}
const DEFAULT_ZOOM = 1.9

// IP 定位（全部 https，避开 Mixed Content；ip-api 的 https 端点 403 已弃用）
const GEO_PRIMARY = 'https://ipwho.is/'
const GEO_BACKUP = 'https://ipinfo.io/json'

let disposed = false
// 动态注入 <script> 的节点存模块级数组保引用（防 GC，onload 永不触发的经典坑）
const pendingScripts: HTMLScriptElement[] = []
const loadedScripts = new Set<string>()

// ---- three.js 动态加载（保留引用 + 去重）----
async function loadThree(): Promise<any> {
  const windowAny = window as any
  if (windowAny.THREE) return windowAny.THREE
  const inject = (src: string) =>
    new Promise<any>((resolve, reject) => {
      if (loadedScripts.has(src)) {
        const t0 = Date.now()
        const poll = () => {
          if ((window as any).THREE) return resolve((window as any).THREE)
          if (Date.now() - t0 > 20000) return reject(new Error('three.js poll timeout ' + src))
          setTimeout(poll, 200)
        }
        poll()
        return
      }
      loadedScripts.add(src)
      const s = document.createElement('script')
      s.src = src
      s.async = true
      s.onload = () => {
        const t = (window as any).THREE
        if (t) resolve(t)
        else {
          loadedScripts.delete(src)
          reject(new Error('three.js loaded but window.THREE missing'))
        }
      }
      s.onerror = () => {
        loadedScripts.delete(src)
        reject(new Error('cdn fail ' + src))
      }
      pendingScripts.push(s) // 保引用防 GC
      document.head.appendChild(s)
    })
  try {
    return await inject(THREE_CDN_PRIMARY)
  } catch {
    return await inject(THREE_CDN_BACKUP)
  }
}

// ---- IP 定位：返回 {lat, lon, countryCode} 或 null（失败兜底北京）----
// 全部 https，浏览器 fetch 时服务端返回的是"发起请求者的 IP"（访客本机 IP）。
async function getGeoLocation(): Promise<{
  lat: number
  lon: number
  countryCode?: string
} | null> {
  const tryFetch = async (
    url: string,
    parse: (j: any) => { lat: number; lon: number; countryCode?: string } | null,
  ) => {
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 6000)
      const r = await fetch(url, { signal: ctrl.signal })
      clearTimeout(t)
      if (!r.ok) return null
      const j = await r.json()
      return parse(j)
    } catch {
      return null
    }
  }
  const primary = await tryFetch(GEO_PRIMARY, (j) =>
    j && j.success && j.latitude != null
      ? { lat: j.latitude, lon: j.longitude, countryCode: j.country_code }
      : null,
  )
  if (primary) return primary
  const backup = await tryFetch(GEO_BACKUP, (j) =>
    j && j.loc
      ? { lat: parseFloat(j.loc.split(',')[0]), lon: parseFloat(j.loc.split(',')[1]), countryCode: j.country_code }
      : null,
  )
  if (backup) return backup
  return null
}

// ---- 贴图：核心 day 必须，其余失败跳过（非关键层不拖垮主体）----
async function loadTextures(THREE: any): Promise<Record<string, any> | null> {
  const loadOne = (url: string) =>
    new Promise<any>((resolve, reject) => {
      const loader = new THREE.TextureLoader()
      loader.load(
        url,
        (tex: any) => {
          tex.anisotropy = 4
          resolve(tex)
        },
        undefined,
        () => reject(new Error('tex fail ' + url)),
      )
    })
  const results: Record<string, any> = {}
  await Promise.allSettled([
    loadOne(TEXTURES.day).then((t) => (results.day = t)),
    loadOne(TEXTURES.night).then((t) => (results.night = t)),
    loadOne(TEXTURES.clouds).then((t) => (results.clouds = t)),
    loadOne(TEXTURES.normal).then((t) => (results.normal = t)),
    loadOne(TEXTURES.specular).then((t) => (results.specular = t)),
  ])
  if (!results.day) return null
  return results
}

// ---- 天文算法：太阳直射点经纬度（随时间实时变化）----
// 这是"实时昼夜"的核心：给定 UTC 时间，算出此刻地球上"正午"（太阳在头顶）的经纬度，
// 地球朝向固定时，太阳射入方向逐帧更新，昼夜自然随真实时间变化。
const D2R = Math.PI / 180
function subsolarPoint(date: Date): { lat: number; lon: number } {
  const T = (date.getTime() / 86400000 - 2451545) / 36525
  // 平黄经
  const L = (280.46646 + T * (36000.76983 + T * 0.00041)) % 360
  const g = (357.52911 + T * (35999.05029 - 0.0001537 * T)) % 360 * D2R
  const lambda = (L + 1.9146 * Math.sin(g) + 0.0203 * Math.sin(2 * g)) % 360 * D2R
  // 太阳赤纬（±23.44°）
  const eps = 0.4090928
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda)) / D2R
  // 直射点经度：UTC 正午在 0° 经线，每小时向西 15°
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const lon = ((12 - utcHours) * 15 + 540) % 360 - 180
  return { lat: decl, lon }
}

// 经纬度 → three.js SphereGeometry 上的局部坐标。
// 必须和球体 UV 严格对齐，否则 pin / 太阳方向会落在错误的位置：
//   three r128: x=-cos(phi)sin(theta), y=cos(theta), z=sin(phi)sin(theta)
//   phi=(lon+180)°, theta=(90-lat)°（等距柱状贴图 u=0 在 180°W）
// 化简后即：x = cos(lat)cos(lon+180)... 直接写标准形式：
//   x = -cos(lat)*cos(lon+180)  →  实算用下面的 phi/theta 形式，避免符号踩坑
function geoToVec3(lat: number, lon: number, r: number): { x: number; y: number; z: number } {
  const phi = (lon + 180) * D2R
  const theta = (90 - lat) * D2R
  const s = Math.sin(theta)
  return {
    x: -r * Math.cos(phi) * s,
    y: r * Math.cos(theta),
    z: r * Math.sin(phi) * s,
  }
}

// 计算"聚焦到某经纬度"需要的 rotX/rotY，使该点转到相机正对的方向（+Z）。
// three.js 默认欧拉序是 'XYZ'，等价于 R = Rx(rx) * Ry(ry) * Rz(rz)：
//   1) Ry(ry) 把该点转到 x=0 平面 → ry = -90 - lon
//   2) Rx(rx) 把该点抬到 +Z      → rx = lat
// （数值已用 three r128 的 Matrix4.makeRotationFromEuler 精确矩阵验证，误差 ~1e-16）
function focusOn(lat: number, lon: number): { rotX: number; rotY: number } {
  return { rotX: lat * D2R, rotY: (-90 - lon) * D2R }
}

function webglAvailable(): boolean {
  try {
    const c = document.createElement('canvas')
    return !!(
      window.WebGLRenderingContext &&
      (c.getContext('webgl') || c.getContext('experimental-webgl'))
    )
  } catch {
    return false
  }
}

onMounted(() => {
  const canvas = canvasRef.value
  const wrap = wrapRef.value
  if (!canvas || !wrap) return

  // 降级 1：设备无 WebGL → 直接 CSS 兜底
  if (!webglAvailable()) {
    fallbackReason.value = 'no-webgl'
    return
  }

  let renderer: any, scene: any, camera: any
  let globe: any, cloudLayer: any, glow: any, stars: any, atmo: any, pin: any
  let sunLight: any
  let frameId = 0
  let dragging = false
  let lastX = 0, lastY = 0, velX = 0, velY = 0
  // rotX/rotY 初始 0，定位拿到后再聚焦
  let rotX = 0, rotY = 0
  let targetRotX = 0, targetRotY = 0
  let cameraZ = DEFAULT_ZOOM // 初始远一点，定位后聚焦拉近
  let targetCameraZ = DEFAULT_ZOOM
  const CLOUD_SPEED = 0.00025
  type GeoResult = { lat: number; lon: number; countryCode?: string }
  const DEFAULT_GEO: GeoResult = { lat: 35.5, lon: 104, countryCode: 'CN' } // 兜底：中国中心
  let geo: GeoResult = DEFAULT_GEO
  let geoReady = false
  let ring: any

  const boot = async () => {
    // 定位与 three.js 并行拉（不阻塞）
    const [THREE, geoResult] = await Promise.all([loadThree(), getGeoLocation()])
    if (disposed) return
    if (geoResult) geo = geoResult

    // 计算目标朝向 + 相机距离（国家尺度）
    const target = focusOn(geo.lat, geo.lon)
    targetRotX = target.rotX
    targetRotY = target.rotY
    targetCameraZ = COUNTRY_ZOOM[geo.countryCode || ''] || DEFAULT_ZOOM
    // 起个慢动作：从远拉近 + 旋转到目标
    cameraZ = targetCameraZ + 0.8 // 从稍远一点开始
    rotX = targetRotX
    rotY = targetRotY - 0.3 // 稍偏一点开始，缓动到目标
    geoReady = true

    const w = wrap.clientWidth || window.innerWidth
    const h = wrap.clientHeight || window.innerHeight

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setSize(w, h, false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200)
    camera.position.z = cameraZ

    const tex = await loadTextures(THREE)
    if (disposed) return
    if (!tex) {
      fallbackReason.value = 'load-failed'
      return
    }

    const RADIUS = 1

    // ===== 大气（Fresnel shader：边缘亮蓝、中心透明）=====
    atmo = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.22, 64, 64),
      new THREE.ShaderMaterial({
        vertexShader: `
          varying vec3 vNormal;
          void main() {
            vNormal = normalize(normalMatrix * normal);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
          }`,
        fragmentShader: `
          varying vec3 vNormal;
          void main() {
            float intensity = pow(0.66 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 4.5);
            gl_FragColor = vec4(0.30, 0.55, 1.0, 1.0) * intensity;
          }`,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
      }),
    )
    scene.add(atmo)

    // ===== 地球本体：昼夜 shader（白天 + 夜间灯光 + 法线凹凸 + 镜面 + 晨昏线暖色）=====
    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTex: { value: tex.day },
        nightTex: { value: tex.night || tex.day },
        normalTex: { value: tex.normal },
        specTex: { value: tex.specular },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        normalScale: { value: new THREE.Vector2(0.85, 0.85) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform sampler2D dayTex;
        uniform sampler2D nightTex;
        uniform sampler2D normalTex;
        uniform sampler2D specTex;
        uniform vec3 sunDir;
        uniform vec2 normalScale;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vWorldPos;
        void main() {
          // 法线扰动（让山地/海洋更真实）
          vec3 nrm = normalize(texture2D(normalTex, vUv).xyz * 2.0 - 1.0);
          nrm.xy *= normalScale;
          // 简化：用法线扰动调整光照（不重算切线空间，够示意）
          vec3 perturbNormal = normalize(vNormal + nrm.xy * 0.3);

          vec3 dayColor = texture2D(dayTex, vUv).rgb;
          vec3 nightColor = texture2D(nightTex, vUv).rgb * 1.7;

          // 镜面（海洋反光）
          float spec = 0.0;
          if (texture2D(specTex, vUv).r > 0.5) {
            spec = 0.4;
          }

          float diff = dot(perturbNormal, normalize(sunDir));
          float dayAmount = smoothstep(-0.1, 0.3, diff);

          // 晨昏线：diff 在 0 附近加暖色（日落橙红）
          float twilight = 1.0 - smoothstep(0.0, 0.25, abs(diff));
          vec3 twilightColor = vec3(0.95, 0.55, 0.25) * twilight * 0.4;

          // 镜面高光（简化 Blinn-Phong）
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 halfDir = normalize(normalize(sunDir) + viewDir);
          float specAmount = pow(max(dot(perturbNormal, halfDir), 0.0), 32.0) * spec * dayAmount;

          vec3 color = mix(nightColor, dayColor, dayAmount);
          color += twilightColor;
          color += vec3(specAmount) * dayAmount;

          // 大气边缘暗化（模拟曲率）
          float edge = 1.0 - pow(max(dot(normalize(vNormal), viewDir), 0.0), 1.5);
          color *= 1.0 - edge * 0.35;

          gl_FragColor = vec4(color, 1.0);
        }`,
    })
    globe = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 96, 96), earthMat)
    scene.add(globe)

    // ===== 云层（独立球，稍大、自转更快 → 云飘动）=====
    if (tex.clouds) {
      cloudLayer = new THREE.Mesh(
        new THREE.SphereGeometry(RADIUS * 1.015, 64, 64),
        new THREE.MeshLambertMaterial({
          map: tex.clouds,
          transparent: true,
          opacity: 0.45,
          depthWrite: false,
        }),
      )
      scene.add(cloudLayer)
    }

    // ===== 内部柔和光晕（紧贴地球）=====
    glow = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.04, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x66aaff,
        transparent: true,
        opacity: 0.09,
        side: THREE.BackSide,
      }),
    )
    scene.add(glow)

    // ===== 访客所在地 pin（小圆点 + 细环，去长杆，不突兀）=====
    const pinGroup = new THREE.Group()
    const { x: px, y: py, z: pz } = geoToVec3(geo.lat, geo.lon, RADIUS)
    // 圆点（较小）
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 0.03, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xff5555, transparent: true, opacity: 0.95 }),
    )
    dot.position.set(px, py, pz)
    pinGroup.add(dot)
    // 细环（脉冲）
    ring = new THREE.Mesh(
      new THREE.RingGeometry(RADIUS * 0.04, RADIUS * 0.055, 48),
      new THREE.MeshBasicMaterial({
        color: 0xff5555,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
      }),
    )
    ring.position.set(px, py, pz)
    ring.lookAt(0, 0, 0)
    ring.rotateX(Math.PI / 2)
    pinGroup.add(ring)
    pin = pinGroup
    scene.add(pinGroup)

    // ===== 星空（1200 颗、缓慢反向旋转、透明度脉动）=====
    const starGeo = new THREE.BufferGeometry()
    const N = 1200
    const pos = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const r = 30 + Math.random() * 60
      const t = Math.random() * Math.PI * 2
      const p = Math.acos(2 * Math.random() - 1)
      pos[i * 3] = r * Math.sin(p) * Math.cos(t)
      pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t)
      pos[i * 3 + 2] = r * Math.cos(p)
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({
        color: 0xffffff,
        size: 0.12,
        sizeAttenuation: true,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    )
    scene.add(stars)

    // ===== 光（模拟太阳，逐帧更新方向）=====
    scene.add(new THREE.AmbientLight(0xffffff, 0.25))
    sunLight = new THREE.DirectionalLight(0xffffff, 1.8)
    scene.add(sunLight)

    // ---- 交互：拖拽惯性 + 视差 ----
    const mouse = { x: 0, y: 0 }
    const resize = () => {
      const nw = wrap.clientWidth || window.innerWidth
      const nh = wrap.clientHeight || window.innerHeight
      renderer.setSize(nw, nh, false)
      camera.aspect = nw / nh
      camera.updateProjectionMatrix()
    }
    window.addEventListener('resize', resize)

    const onDown = (e: PointerEvent) => {
      dragging = true
      lastX = e.clientX
      lastY = e.clientY
    }
    const onMove = (e: PointerEvent) => {
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2
      mouse.y = (e.clientY / window.innerHeight - 0.5) * 2
      if (!dragging) return
      velX = (e.clientX - lastX) * 0.003
      velY = (e.clientY - lastY) * 0.003
      lastX = e.clientX
      lastY = e.clientY
    }
    const onUp = () => (dragging = false)
    wrap.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    let ringPhase = 0
    // 复用的太阳方向向量（避免每帧分配）
    const sunVec = new (window as any).THREE.Vector3()
    const tick = () => {
      if (disposed) return
      const now = performance.now()

      // 惯性 + 极缓自转（配合"聚焦"主题，慢转）
      if (!dragging) {
        velX *= 0.94
        velY *= 0.94
      }
      // 未手动拖拽时，向"目标朝向 + 国家中心"缓动（实现"定位后自动聚焦"）
      if (!dragging && geoReady) {
        rotX += (targetRotX + 0.00012 * now - rotX) * 0.02 + velX
        rotY += (targetRotY + 0.00012 * now - rotY) * 0.02 + velY
      } else {
        rotX += velX
        rotY += velX + 0.00012
      }
      rotX = Math.max(-1.1, Math.min(1.1, rotX))

      // 地球/云/光晕/pin 一起转（云多转一点）
      globe.rotation.y = rotY
      globe.rotation.x = rotX
      if (cloudLayer) {
        cloudLayer.rotation.y = rotY + now * CLOUD_SPEED
        cloudLayer.rotation.x = rotX
      }
      glow.rotation.copy(globe.rotation)
      atmo.rotation.y = now * 0.00004
      if (pin) {
        pin.rotation.y = rotY
        pin.rotation.x = rotX
      }

      // 相机缓动到目标距离（定位拉近动画）
      if (geoReady && !dragging) {
        cameraZ += (targetCameraZ - cameraZ) * 0.03
        camera.position.z = cameraZ
      }

      // 星星缓慢反向 + 闪烁
      stars.rotation.y -= 0.00006
      ;(stars.material as any).opacity = 0.7 + 0.18 * Math.sin(now * 0.0011)

      // 实时昼夜：逐帧算此刻太阳直射点，转成地球局部向量后再随地球一起转，
      // 保证被照亮的地方永远是地球上"此刻是正午"的那一半。
      const sub = subsolarPoint(new Date())
      const sunLocal = geoToVec3(sub.lat, sub.lon, 1)
      sunVec.set(sunLocal.x, sunLocal.y, sunLocal.z)
      // 应用地球当前的旋转（与 globe.rotation 一致），得到世界方向
      sunVec.applyEuler(globe.rotation)
      ;(earthMat.uniforms.sunDir as any).value.copy(sunVec)
      sunLight.position.copy(sunVec).multiplyScalar(5)

      // pin 脉冲细环（半径 + 透明度周期性变化，幅度小不突兀）
      ringPhase = (ringPhase + 0.025) % (Math.PI * 2)
      const pulse = 0.5 + 0.5 * Math.sin(ringPhase)
      ;(ring as any).scale.setScalar(0.7 + pulse * 0.6)
      ;(ring.material as any).opacity = 0.6 - pulse * 0.35

      // 视差：相机随鼠标轻微位移（不影响聚焦）
      camera.position.x += (mouse.x * 0.08 - camera.position.x) * 0.03
      camera.position.y += (-mouse.y * 0.08 - camera.position.y) * 0.03
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
      frameId = requestAnimationFrame(tick)
    }
    tick()

    ;(wrap as any)._cleanup = () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
      wrap.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      renderer?.dispose()
    }
  }

  boot().catch((e) => {
    console.error('[EarthGlobe] init failed, fallback:', e)
    fallbackReason.value = 'load-failed'
  })
})

onUnmounted(() => {
  disposed = true
  const w = wrapRef.value as any
  if (w && w._cleanup) {
    w._cleanup()
    w._cleanup = null
  }
})
</script>

<style scoped lang="less">
.globe-wrap {
  position: fixed;
  inset: 0;
  z-index: -2;
  overflow: hidden;
  // 深空径向渐变底色
  background: radial-gradient(ellipse at 50% 40%, #0d1530 0%, #070a18 55%, #03040a 100%);

  canvas {
    width: 100%;
    height: 100%;
    display: block;
    cursor: grab;
    &:active {
      cursor: grabbing;
    }
  }
}

/* WebGL/加载失败时的 CSS 降级：现有地球图 cover 铺满（修 2K 留白）+ 呼吸光晕 */
.globe-fallback {
  position: absolute;
  inset: 0;
  background: url('@/assets/bgtiny.webp') no-repeat center center;
  background-size: cover;
  animation: globe-breathe 9s ease-in-out infinite;
}

@keyframes globe-breathe {
  0%,
  100% {
    transform: scale(1);
    filter: brightness(1);
  }
  50% {
    transform: scale(1.05);
    filter: brightness(1.12);
  }
}
</style>
