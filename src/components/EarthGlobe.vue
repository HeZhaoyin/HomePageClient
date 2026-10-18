<template>
  <div class="globe-wrap" ref="wrapRef">
    <canvas ref="canvasRef"></canvas>
    <div class="globe-fallback" v-if="fallbackReason"></div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue'

// 炫酷"聚焦你所在地 + 实时昼夜"3D 地球背景：
//  - 取访客 IP 定位（ip-api 主 + ipwho.is 备）→ 聚焦到该城市，放大的地球 + 发光 pin
//  - 实时昼夜：太阳位置随 UTC 时实时计算，地球朝向固定，太阳射入方向逐帧更新，
//    城市灯/白天/黑夜随你当地真实时间自然变化（"现在是晚上就显示夜景"）
//  - 云层独立球慢速自转（云飘动）；Fresnel 大气散射；星空闪烁；鼠标视差
//  - three.js 走国内 CDN（不进 bundle、不占 frp），贴图走 GitHub raw 直连
//  - 无 WebGL / CDN / 核心贴图失败 → CSS 兜底（顺带修 2K 留白）
const wrapRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const fallbackReason = ref('')

// three.js CDN（国内可达性已验证：staticfile 主 ~0.4s，jsDelivr 备）
const THREE_CDN_PRIMARY = 'https://cdn.staticfile.org/three.js/r128/three.min.js'
const THREE_CDN_BACKUP = 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'

// three.js 官方仓库的整套地球贴图（HEAD tag 下均在，~1MB 总）
const TEX = (name: string) =>
  `https://raw.githubusercontent.com/mrdoob/three.js/HEAD/examples/textures/planets/${name}`
const TEXTURES = {
  day: TEX('earth_day_4096.jpg'),
  night: TEX('earth_night_4096.jpg'),
  clouds: TEX('earth_clouds_1024.png'),
}

// IP 定位服务（主 + 备，均免费、国内可达）
const GEO_PRIMARY = 'http://ip-api.com/json/?fields=lat,lon,timezone,status'
const GEO_BACKUP = 'https://ipwho.is/'

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

// ---- IP 定位：返回 {lat, lon} 或 null（失败则用默认北京，不影响地球展示）----
async function getGeoLocation(): Promise<{ lat: number; lon: number } | null> {
  const tryFetch = async (url: string, parse: (j: any) => { lat: number; lon: number } | null) => {
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
    j && j.status === 'success' && j.lat != null ? { lat: j.lat, lon: j.lon } : null,
  )
  if (primary) return primary
  const backup = await tryFetch(GEO_BACKUP, (j) =>
    j && j.success && j.latitude != null ? { lat: j.latitude, lon: j.longitude } : null,
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
  ])
  if (!results.day) return null
  return results
}

// ---- 天文算法：太阳黄经 → 子夜点经纬度（随时间实时变化）----
// 这是"实时昼夜"的核心：给定 UTC 时间，算出此刻地球上"正午"（太阳在头顶）的经度，
// 与当前时刻对应，地球朝向固定时，太阳射入方向就该绕 Y 轴旋转，昼夜自然随你当地真实时间变。
const D2R = Math.PI / 180
function sunDirectionToDate(date: Date): { x: number; y: number; z: number } {
  const T = (date.getTime() / 86400000 - 2451545) / 36525 // 世纪数（J2000 起）
  // 平黄经
  const L = (280.46646 + T * (36000.76983 + T * 0.00041)) % 360
  // 太阳黄经（小行星修正略，精度足够用于昼夜示意）
  const g = (357.52911 + T * (35999.05029 - 0.0001537 * T)) % 360 * D2R
  const lambda = (L + 1.9146 * Math.sin(g) + 0.0203 * Math.sin(2 * g)) % 360 * D2R
  // 太阳赤纬
  const eps = 0.4090928 // 23.4393°
  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda))
  // 平子午点经度（UTC 时）：本地恒星时 ≈ UT*15° + 0（粗略，足够）
  const utcHours = date.getUTCHours() + date.getUTCMinutes() / 60 + date.getUTCSeconds() / 3600
  const lst = (utcHours * 15 + 0) * D2R // 子夜点经度（正午点）
  // 太阳在地心坐标系（X 指向春分点方向投影到赤道面）：
  // 此处简化为：太阳方向 = 指向"正午经度 + 赤纬"
  const sx = Math.cos(decl) * Math.cos(lst)
  const sy = Math.sin(decl)
  const sz = Math.cos(decl) * Math.sin(lst)
  return { x: sx, y: sy, z: sz }
}

function latLonToVec3(lat: number, lon: number, r: number): { x: number; y: number; z: number } {
  const la = lat * D2R
  const lo = lon * D2R
  return {
    x: r * Math.cos(la) * Math.cos(lo),
    y: r * Math.sin(la),
    z: r * Math.cos(la) * Math.sin(lo),
  }
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
  let rotX = 0.15, rotY = 0
  const CLOUD_SPEED = 0.00028 // 云层相对自转速度（比地球快一点点 → 云在飘）
  const DEFAULT_GEO = { lat: 39.9, lon: 116.4 } // 兜底北京
  let geo = DEFAULT_GEO

  const boot = async () => {
    // 定位与 three.js 并行拉（不阻塞）
    const [THREE, geoResult] = await Promise.all([loadThree(), getGeoLocation()])
    if (disposed) return
    if (geoResult) geo = geoResult

    const w = wrap.clientWidth || window.innerWidth
    const h = wrap.clientHeight || window.innerHeight

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setSize(w, h, false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200)
    camera.position.z = 3.0 // 聚焦放大：地球占屏更大

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

    // ===== 地球本体：昼夜 shader（白天贴图 + 夜间城市灯光，晨昏线 smoothstep）=====
    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTex: { value: tex.day },
        nightTex: { value: tex.night || tex.day },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: `
        uniform sampler2D dayTex;
        uniform sampler2D nightTex;
        uniform vec3 sunDir;
        varying vec2 vUv;
        varying vec3 vNormal;
        void main() {
          vec3 dayColor = texture2D(dayTex, vUv).rgb;
          vec3 nightColor = texture2D(nightTex, vUv).rgb * 1.7;
          float diff = dot(vNormal, normalize(sunDir));
          float mixRatio = smoothstep(-0.12, 0.28, diff);
          vec3 color = mix(nightColor, dayColor, mixRatio);
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
          opacity: 0.42,
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

    // ===== 访客所在地 pin（发光圆点 + 脉冲光环 + 竖直杆）=====
    const pinGroup = new THREE.Group()
    // 竖杆（从球面往外伸出）
    const { x: px, y: py, z: pz } = latLonToVec3(geo.lat, geo.lon, RADIUS)
    const pinDir = new THREE.Vector3(px, py, pz).normalize()
    const pinTip = pinDir.clone().multiplyScalar(RADIUS * 1.35)
    const poleGeo = new THREE.BufferGeometry()
    poleGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(
        new Float32Array([px, py, pz, pinTip.x, pinTip.y, pinTip.z]),
        3,
      ),
    )
    const pole = new THREE.Line(
      poleGeo,
      new THREE.LineBasicMaterial({ color: 0xffcc33, transparent: true, opacity: 0.9 }),
    )
    pinGroup.add(pole)
    // 圆点
    const dot = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 0.045, 24, 24),
      new THREE.MeshBasicMaterial({ color: 0xffcc33 }),
    )
    dot.position.set(px, py, pz)
    pinGroup.add(dot)
    // 脉冲光环
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(RADIUS * 0.06, RADIUS * 0.09, 32),
      new THREE.MeshBasicMaterial({
        color: 0xffcc33,
        transparent: true,
        opacity: 0.7,
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
    scene.add(new THREE.AmbientLight(0xffffff, 0.22))
    sunLight = new THREE.DirectionalLight(0xffffff, 1.7)
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
    const tick = () => {
      if (disposed) return
      const now = performance.now()

      // 惯性 + 极缓自转（比上一版慢很多，配合"聚焦"主题）
      if (!dragging) {
        velX *= 0.94
        velY *= 0.94
      }
      rotY += velX + 0.00018
      rotX += velY
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

      // 星星缓慢反向 + 闪烁
      stars.rotation.y -= 0.00006
      ;(stars.material as any).opacity = 0.7 + 0.18 * Math.sin(now * 0.0011)

      // 实时昼夜：逐帧算此刻太阳方向（你当地真实时间驱动）
      const sun = sunDirectionToDate(new Date())
      const sunVec = new THREE.Vector3(sun.x, sun.y, sun.z)
      ;(earthMat.uniforms.sunDir as any).value.copy(sunVec)
      sunLight.position.copy(sunVec.multiplyScalar(5))

      // pin 脉冲光环（半径 + 透明度周期性变化）
      ringPhase = (ringPhase + 0.02) % (Math.PI * 2)
      const pulse = 0.5 + 0.5 * Math.sin(ringPhase)
      ;(ring as any).scale.setScalar(0.6 + pulse * 1.6)
      ;(ring.material as any).opacity = 0.75 - pulse * 0.55

      // 视差：相机随鼠标轻微位移
      camera.position.x += (mouse.x * 0.12 - camera.position.x) * 0.04
      camera.position.y += (-mouse.y * 0.12 - camera.position.y) * 0.04
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
