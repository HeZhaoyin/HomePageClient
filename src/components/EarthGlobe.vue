<template>
  <div class="globe-wrap" ref="wrapRef">
    <canvas ref="canvasRef"></canvas>
    <div class="globe-fallback" v-if="fallbackReason"></div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue'

// 炫酷动态地球：three.js + 多贴图（日间/夜间城市灯光/云层/法线/凹凸）
// three.js 走国内 CDN（不进 bundle、不占 frp 小水管），贴图走 GitHub raw 直连。
// WebGL / CDN / 贴图失败时自动降级 CSS 动态背景（顺带修 2K 留白 bug）。
const wrapRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const fallbackReason = ref('')

// three.js CDN（国内可达性已验证：staticfile 最快 ~0.4s，jsDelivr 备份）
const THREE_CDN_PRIMARY = 'https://cdn.staticfile.org/three.js/r128/three.min.js'
const THREE_CDN_BACKUP = 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'

// three.js 官方仓库自带的一整套地球贴图（全在 examples/textures/planets/）
const TEX = (name: string) =>
  `https://raw.githubusercontent.com/mrdoob/three.js/HEAD/examples/textures/planets/${name}`
const TEXTURES = {
  day: TEX('earth_day_4096.jpg'),
  night: TEX('earth_night_4096.jpg'),
  clouds: TEX('earth_clouds_1024.png'),
  normal: TEX('earth_normal_2048.jpg'),
  bump: TEX('earth_bump_roughness_clouds_4096.jpg'),
}

let disposed = false
// 动态注入 <script> 的节点存模块级数组保引用（防 GC）
const pendingScripts: HTMLScriptElement[] = []
// 已发起加载的 src 集合（防重复注入同一个 CDN）
const loadedScripts = new Set<string>()

// ---- three.js：优先国内 CDN，失败回退 jsDelivr ----
// script 节点必须存模块级数组保引用，否则局部变量被 GC → 静默降级（无报错）。
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

// ---- 贴图：并行拉整套；任一失败降级为"少贴图层"，绝不整球降级 ----
// 关键设计：核心 day 贴图失败才整球降级（CSS 兜底），其余层失败则跳过该层，
// 保证 3D 主体始终能出（非关键资源失败不能拖垮关键路径）。
async function loadTextures(THREE: any): Promise<Record<string, any> | null> {
  const loadOne = async (url: string) => {
    const loader = new THREE.TextureLoader()
    return new Promise<any>((resolve, reject) => {
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
  }
  const results: Record<string, any> = {}
  // 全部并行，失败的收集起来跳过
  await Promise.allSettled([
    loadOne(TEXTURES.day).then((t) => (results.day = t)),
    loadOne(TEXTURES.night).then((t) => (results.night = t)),
    loadOne(TEXTURES.clouds).then((t) => (results.clouds = t)),
    loadOne(TEXTURES.normal).then((t) => (results.normal = t)),
    loadOne(TEXTURES.bump).then((t) => (results.bump = t)),
  ])
  // day 是核心，没有 day 就整球降级
  if (!results.day) return null
  return results
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
  let globe: any, cloudLayer: any, glow: any, stars: any, atmo: any
  let sunLight: any
  let frameId = 0
  let dragging = false
  let lastX = 0, lastY = 0, velX = 0, velY = 0
  let rotX = 0.15, rotY = 0
  const CLOUD_SPEED = 0.00045 // 云层相对自转速度（比地球快 → 产生"云在动"）

  const boot = async () => {
    const THREE = await loadThree()
    if (disposed) return

    const w = wrap.clientWidth || window.innerWidth
    const h = wrap.clientHeight || window.innerHeight

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setSize(w, h, false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 200)
    camera.position.z = 3.2

    // 贴图（day 必须，其余可选）
    const tex = await loadTextures(THREE)
    if (disposed) return
    if (!tex) {
      fallbackReason.value = 'load-failed'
      return
    }

    const RADIUS = 1

    // ===== 大气（Fresnel shader：边缘亮蓝、中心透明 → 真实大气散射）=====
    atmo = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.18, 64, 64),
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
            float intensity = pow(0.72 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 4.5);
            gl_FragColor = vec4(0.30, 0.55, 1.0, 1.0) * intensity;
          }`,
        blending: THREE.AdditiveBlending,
        side: THREE.BackSide,
        transparent: true,
      }),
    )
    scene.add(atmo)

    // ===== 地球本体（日间 + 夜间灯光 shader：朝向太阳面白天，背向面显示城市灯）=====
    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTex: { value: tex.day },
        nightTex: { value: tex.night || tex.day },
        sunDir: { value: new THREE.Vector3(1, 0.4, 0.8) },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
          vUv = uv;
          vNormal = normalize(normalMatrix * normal);
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          vPos = mv.xyz;
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: `
        uniform sampler2D dayTex;
        uniform sampler2D nightTex;
        uniform vec3 sunDir;
        varying vec2 vUv;
        varying vec3 vNormal;
        varying vec3 vPos;
        void main() {
          vec3 dayColor = texture2D(dayTex, vUv).rgb;
          vec3 nightColor = texture2D(nightTex, vUv).rgb * 1.6;
          // 法线与太阳光夹角 → 白天/黑夜混合（smoothstep 让晨昏线柔和）
          float diff = dot(vNormal, normalize(sunDir));
          float mixRatio = smoothstep(-0.15, 0.35, diff);
          vec3 color = mix(nightColor, dayColor, mixRatio);
          // 法线/凹凸（若加载到）
          gl_FragColor = vec4(color, 1.0);
        }`,
      transparent: false,
    })
    // 若加载到法线/凹凸贴图，挂到 phong 之外的层（这里简化：shader 里没用，留作扩展）
    globe = new THREE.Mesh(new THREE.SphereGeometry(RADIUS, 96, 96), earthMat)
    scene.add(globe)

    // ===== 云层（独立半透明球，比地球稍大、自转更快 → "云在飘"）=====
    if (tex.clouds) {
      cloudLayer = new THREE.Mesh(
        new THREE.SphereGeometry(RADIUS * 1.015, 64, 64),
        new THREE.MeshLambertMaterial({
          map: tex.clouds,
          transparent: true,
          opacity: 0.4,
          depthWrite: false,
        }),
      )
      scene.add(cloudLayer)
    }

    // ===== 内部大气光晕（紧贴地球，柔和蓝光）=====
    glow = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.04, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x66aaff,
        transparent: true,
        opacity: 0.1,
        side: THREE.BackSide,
      }),
    )
    scene.add(glow)

    // ===== 星空（多颗大小/透明度不一，缓慢旋转）=====
    const starGeo = new THREE.BufferGeometry()
    const N = 1200
    const pos = new Float32Array(N * 3)
    const sizes = new Float32Array(N)
    for (let i = 0; i < N; i++) {
      const r = 30 + Math.random() * 60
      const t = Math.random() * Math.PI * 2
      const p = Math.acos(2 * Math.random() - 1)
      pos[i * 3] = r * Math.sin(p) * Math.cos(t)
      pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t)
      pos[i * 3 + 2] = r * Math.cos(p)
      sizes[i] = Math.random()
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

    // ===== 光（模拟太阳）=====
    scene.add(new THREE.AmbientLight(0xffffff, 0.25))
    sunLight = new THREE.DirectionalLight(0xffffff, 1.6)
    sunLight.position.set(1, 0.4, 0.8)
    scene.add(sunLight)

    // ---- 交互：拖拽旋转 + 惯性 + 视差 ----
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
      // 视差（不拖拽时也轻微跟随鼠标）
      mouse.x = (e.clientX / window.innerWidth - 0.5) * 2
      mouse.y = (e.clientY / window.innerHeight - 0.5) * 2
      if (!dragging) return
      velX = (e.clientX - lastX) * 0.004
      velY = (e.clientY - lastY) * 0.004
      lastX = e.clientX
      lastY = e.clientY
    }
    const onUp = () => (dragging = false)
    wrap.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    const tick = () => {
      if (disposed) return
      const now = performance.now()

      // 惯性 + 持续自转
      if (!dragging) {
        velX *= 0.95
        velY *= 0.95
      }
      rotY += velX + 0.00045
      rotX += velY
      rotX = Math.max(-1.1, Math.min(1.1, rotX))

      // 地球 + 云 + 光晕一起转（云多转一点 → 云飘动）
      globe.rotation.y = rotY
      globe.rotation.x = rotX
      if (cloudLayer) {
        cloudLayer.rotation.y = rotY + now * CLOUD_SPEED
        cloudLayer.rotation.x = rotX
      }
      glow.rotation.copy(globe.rotation)
      atmo.rotation.y = now * 0.00005 // 大气几乎不动

      // 星星缓慢反向旋转 + 闪烁（用 size 属性做微幅脉动）
      stars.rotation.y -= 0.00008
      ;(stars.material as any).opacity = 0.7 + 0.15 * Math.sin(now * 0.0012)

      // 视差：相机随鼠标轻微位移
      camera.position.x += (mouse.x * 0.15 - camera.position.x) * 0.05
      camera.position.y += (-mouse.y * 0.15 - camera.position.y) * 0.05
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
  // 深空渐变底色（地球之外的空间感）
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
