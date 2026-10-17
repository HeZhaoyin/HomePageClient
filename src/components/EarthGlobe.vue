<template>
  <div class="globe-wrap" ref="wrapRef">
    <canvas ref="canvasRef"></canvas>
    <div class="globe-fallback" v-if="fallbackReason"></div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue'

// 动态地球：three.js 走国内 CDN 动态加载（不进 bundle、不走 frp 小水管）；
// WebGL 不可用 / 加载失败时自动回退 CSS 动态背景（用现有地球图 cover 铺满 + 呼吸光晕），
// 顺带修掉旧实现"2K 屏四周留白"的 bug（旧 CSS 缺 background-size: cover）。
const wrapRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const fallbackReason = ref('')

// three.js CDN（国内可达性已验证：staticfile 最快 ~0.4s，jsDelivr 做备份）
const THREE_CDN_PRIMARY = 'https://cdn.staticfile.org/three.js/r128/three.min.js'
const THREE_CDN_BACKUP = 'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js'

// three.js 官方仓库的球面展开地球贴图（2048x1024 equirectangular，~500KB，
// 国内 GitHub raw 直连可达；下载走 CDN 直连不占 frp）。
// 用户要求"贴图尽量 1K"：拉到 2K 后本地 canvas 缩到 1024x512 再送 GPU，省显存/解码。
const EARTH_TEXTURE_RAW =
  'https://raw.githubusercontent.com/mrdoob/three.js/HEAD/examples/textures/planets/earth_atmos_2048.jpg'

let disposed = false

// 动态注入 <script> 的节点存模块级数组保引用（防 GC）
const pendingScripts: HTMLScriptElement[] = []
// 已发起加载的 src 集合（防重复注入同一个 CDN）
const loadedScripts = new Set<string>()

// ---- 贴图：下载 → 1K 缩放 → 得一张 1024x512 的 JPEG dataURL ----
// 关键：canvas 缩放失败时不能让整个 boot reject（会导致整地球降级）。
// 回退策略：缩放失败就**直接用原始 2K 贴图 URL**（TextureLoader 走 <img> 加载，
// 不受 CORS 限制，2K 也比降级成 CSS 好）。
async function loadEarthTexture1k(): Promise<string> {
  try {
    const resp = await fetch(EARTH_TEXTURE_RAW)
    if (!resp.ok) throw new Error('texture fetch ' + resp.status)
    const blob = await resp.blob()
    const bmp = await createImageBitmap(blob)
    const scale = 1024 / bmp.width
    const off = document.createElement('canvas')
    off.width = 1024
    off.height = Math.max(1, Math.round(bmp.height * scale))
    off.getContext('2d')!.drawImage(bmp as CanvasImageSource, 0, 0, off.width, off.height)
    bmp.close?.()
    const dataUrl = off.toDataURL('image/jpeg', 0.85)
    return dataUrl
  } catch (e) {
    // 缩放/canvas 失败 → 直接用原始 2K 贴图 URL（img 加载不受 CORS 限制）
    console.warn('[EarthGlobe] 贴图 1K 缩放失败，回退用原始 2K 贴图 URL', e)
    return EARTH_TEXTURE_RAW
  }
}

// ---- three.js：优先国内 CDN，失败回退 jsDelivr；成功则挂到 window.THREE 复用 ----
// 注意：script 节点必须存到模块级数组里保引用，否则 inject 函数返回后局部变量 s
// 失去引用、脚本节点会被 GC/清出 DOM，onload 永不触发 → 静默降级（无报错）。
async function loadThree(): Promise<any> {
  const windowAny = window as any
  if (windowAny.THREE) return windowAny.THREE
  const inject = (src: string) =>
    new Promise<any>((resolve, reject) => {
      if (loadedScripts.has(src)) {
        // 该 src 已在加载/已加载完成：轮询等 window.THREE 就绪（防重复注入）
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
      pendingScripts.push(s) // 保持引用，防节点被 GC
      document.head.appendChild(s)
    })
  try {
    return await inject(THREE_CDN_PRIMARY)
  } catch {
    return await inject(THREE_CDN_BACKUP)
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

  let renderer: any, scene: any, camera: any, globe: any, glow: any, stars: any
  let frameId = 0
  let dragging = false
  let lastX = 0, lastY = 0, velX = 0.0006, velY = 0
  let rotX = 0, rotY = 0

  const boot = async () => {
    // 贴图与 three.js 并行拉，缩短首帧等待
    const [THREE, textureUrl] = await Promise.all([loadThree(), loadEarthTexture1k()])
    if (disposed) return

    const w = wrap.clientWidth || window.innerWidth
    const h = wrap.clientHeight || window.innerHeight

    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true })
    renderer.setSize(w, h, false)
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    scene = new THREE.Scene()
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100)
    camera.position.z = 3

    // 地球（1K 贴图）
    const RADIUS = 1
    globe = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS, 64, 64),
      new THREE.MeshPhongMaterial({
        map: new THREE.TextureLoader().load(textureUrl),
        specular: new THREE.Color(0x333333),
        shininess: 12,
      }),
    )
    scene.add(globe)

    // 大气光晕（背面球体 + 半透明蓝）
    glow = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.06, 64, 64),
      new THREE.MeshBasicMaterial({
        color: 0x4d8dff,
        transparent: true,
        opacity: 0.16,
        side: THREE.BackSide,
      }),
    )
    scene.add(glow)

    // 星星背景
    const starGeo = new THREE.BufferGeometry()
    const N = 600
    const pos = new Float32Array(N * 3)
    for (let i = 0; i < N; i++) {
      const r = 20 + Math.random() * 20
      const t = Math.random() * Math.PI * 2
      const p = Math.acos(2 * Math.random() - 1)
      pos[i * 3] = r * Math.sin(p) * Math.cos(t)
      pos[i * 3 + 1] = r * Math.sin(p) * Math.sin(t)
      pos[i * 3 + 2] = r * Math.cos(p)
    }
    starGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3))
    stars = new THREE.Points(
      starGeo,
      new THREE.PointsMaterial({ color: 0xffffff, size: 0.06, transparent: true, opacity: 0.8 }),
    )
    scene.add(stars)

    // 光
    scene.add(new THREE.AmbientLight(0xffffff, 0.55))
    const sun = new THREE.DirectionalLight(0xffffff, 1.1)
    sun.position.set(2, 1, 3)
    scene.add(sun)

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
      if (!dragging) return
      velX = (e.clientX - lastX) * 0.005
      velY = (e.clientY - lastY) * 0.005
      lastX = e.clientX
      lastY = e.clientY
    }
    const onUp = () => (dragging = false)
    wrap.addEventListener('pointerdown', onDown)
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)

    const tick = () => {
      if (disposed) return
      // 惯性 + 自转（未拖拽时速度衰减，地球持续缓转）
      if (!dragging) {
        velX *= 0.96
        velY *= 0.96
      }
      rotY += velX + 0.0006
      rotX += velY
      globe.rotation.y = rotY
      globe.rotation.x = Math.max(-1.2, Math.min(1.2, rotX))
      glow.rotation.copy(globe.rotation)
      stars.rotation.y -= 0.0001

      renderer.render(scene, camera)
      frameId = requestAnimationFrame(tick)
    }
    tick()

    // 暴露清理（onUnmounted 调）
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
    // 降级 2：CDN / 贴图加载失败 → CSS 兜底
    console.error('globe init failed, fallback:', e)
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
  background: #0a0e1a;

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

/* WebGL/加载失败时的 CSS 降级：现有地球图 cover 铺满（修 2K 留白 bug）+ 呼吸光晕 */
.globe-fallback {
  position: absolute;
  inset: 0;
  background: url('@/assets/bgtiny.webp') no-repeat center center;
  background-size: cover; /* 关键修复：铺满任意分辨率，2K/4K 不留白 */
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
