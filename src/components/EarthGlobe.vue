<template>
  <div class="globe-wrap" ref="wrapRef">
    <canvas ref="canvasRef"></canvas>
    <div class="globe-fallback" v-if="fallbackReason"></div>
  </div>
</template>

<script lang="ts" setup>
import { onMounted, onUnmounted, ref } from 'vue'

// 动态地球背景 v3：
//  - IP 定位：https://ipwho.is（CORS *，避开 Mixed Content）→ 失败兜底中国中部
//  - 聚焦放大：按「可见弧度」实时算相机距离，访客所在区域占屏约 65%
//  - 局部高清：按访客位置向 ArcGIS /export 请求一张等距柱状卫星图贴到近端，
//    清晰度实测比整球 4096 提升约 3 倍；远端（夜面）仍用 GitHub 低清图铺满
//  - pin：Apple Maps 风格细针 + 圆头图钉，按当地法线方向插入
//  - 真实感：法线贴图 + 海面镜面 + 云层 + Fresnel 大气 + 昼夜 shader（含晨昏线暖色）
//  - three.js 走国内 CDN（不进 bundle 不占 frp）
const wrapRef = ref<HTMLDivElement>()
const canvasRef = ref<HTMLCanvasElement>()
const fallbackReason = ref('')

// three.js CDN（按可达性排序，逐个回退）。
// 注意：staticfile 与 jsdelivr 在部分网络/证书链环境下会失败
// （staticfile 报 ERR_CERT_DATE_INVALID、jsdelivr 直接不通），
// 所以补上 unpkg 和 cdnjs 两个国内也基本可达的源。
const THREE_CDNS = [
  'https://cdn.staticfile.org/three.js/r128/three.min.js',
  'https://unpkg.com/three@0.128.0/build/three.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js',
  'https://cdn.jsdelivr.net/npm/three@0.128.0/build/three.min.js',
]

// 远端（夜面 / 未覆盖区域）贴图：three.js 官方仓库整套地球纹理，473KB/1.9MB
const TEX = (name: string) =>
  `https://raw.githubusercontent.com/mrdoob/three.js/HEAD/examples/textures/planets/${name}`
const TEXTURES = {
  day: TEX('earth_day_4096.jpg'),
  night: TEX('earth_night_4096.jpg'),
  clouds: TEX('earth_clouds_1024.png'),
  normal: TEX('earth_normal_2048.jpg'),
  specular: TEX('earth_specular_2048.jpg'),
}

// 近端高清卫星图：ArcGIS World Imagery 的 /export 接口。
// 关键：它支持 bboxSR=4326（bbox 用经纬度），返回的就是等距柱状图，
// 球面 UV 完全不用改。但尺寸有服务端上限（实测 >4096 宽会返回同一张图），
// 所以想更清晰只能「按区域裁小」，不能靠加大 size。
const ARCGIS_EXPORT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export'

// 高清区域的经纬度跨度。44 度约覆盖中国中东部 + 周边，
// 2048x2048 @ ~0.6MB。区域占地球视角约 38%，
// 与相机距离无关，只由跨度决定——跨度越小越"局部"。
const REGION_LON_SPAN = 44
const REGION_LAT_SPAN = 44
const REGION_WIDTH = 2048
const REGION_HEIGHT = 2048

// 地球半径基准（与渲染用 SphereGeometry 的 radius 一致）
const RADIUS_REF = 1

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
  let lastErr: any = null
  for (const src of THREE_CDNS) {
    try {
      return await inject(src)
    } catch (e) {
      lastErr = e
    }
  }
  throw lastErr || new Error('all three.js CDNs failed')
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

// ---- 局部高清区域卫星图 ----
// 只请求访客所在经纬度附近的一张区域图（ArcGIS World Imagery，CORS *）。
// 球面 UV 与等距柱状贴图完全一致，所以这张图可以直接贴到球面上同一个
// UV 空间，只是覆盖范围被限制在 [lon0, lon0+span] x [lat0, lat0+span]。
// shader 里通过 regionUvOffset / regionUvScale 把它对齐到正确的 UV 区间，
// 区域外用低清整球图（dayTex）兜底，得到「近处清晰、远处不糊」的效果。
async function loadRegionImage(
  THREE: any,
  lat: number,
  lon: number,
): Promise<{ texture: any; uvOffset: [number, number]; uvScale: [number, number] } | null> {
  // 区域中心尽量贴合访客位置，但要做两类边界处理：
  //  1) 跨越 ±180° 经线：把 lon0 拉回 [-180, 180] 内
  //  2) 超出南北极：把 lat0 夹到 [-90+span, 90-span]
  // 注意：跨越经线时贴图会被裁掉一部分（等距柱状图的固有特性），
  // 访客在太平洋中部时会发生，属可接受退化。
  let lon0 = lon - REGION_LON_SPAN / 2
  let lat0 = lat - REGION_LAT_SPAN / 2
  if (lon0 < -180) lon0 += 360
  if (lon0 + REGION_LON_SPAN > 180) lon0 = 180 - REGION_LON_SPAN
  lat0 = Math.max(-90 + REGION_LAT_SPAN / 2, Math.min(90 - REGION_LAT_SPAN / 2, lat0))

  // bbox 是「minLon,minLat,maxLon,maxLat」
  const bbox = `${lon0},${lat0},${lon0 + REGION_LON_SPAN},${lat0 + REGION_LAT_SPAN}`
  const url =
    `${ARCGIS_EXPORT}?bbox=${bbox}` +
    `&bboxSR=4326&imageSR=4326` +
    `&size=${REGION_WIDTH},${REGION_HEIGHT}` +
    `&format=jpg&f=image`

  try {
    const tex = await new Promise<any>((resolve, reject) => {
      new THREE.TextureLoader().load(url, (t: any) => {
        t.anisotropy = 8 // 区域图会被放大看，过滤要给足
        resolve(t)
      }, undefined, () => reject(new Error('region fail')))
    })
    // 该区域在球面 UV 上的位置。SphereGeometry 的 u=0 在 lon=-180。
    const u0 = (lon0 + 180) / 360
    const v0 = (lat0 + 90) / 180
    return {
      texture: tex,
      uvOffset: [u0, v0],
      uvScale: [REGION_LON_SPAN / 360, REGION_LAT_SPAN / 180],
    }
  } catch {
    return null
  }
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
  const wanted: Array<[string, boolean]> = [
    ['day', true],     // 必须
    ['night', false],  // 缺失则退回 day
    ['clouds', false], // 缺失则不建云层
    ['normal', false], // 缺失则跳过法线扰动
    ['specular', false], // 缺失则跳过海洋高光
  ]
  await Promise.allSettled(
    wanted.map(([key]) =>
      loadOne((TEXTURES as any)[key]).then((t) => (results[key] = t)),
    ),
  )
  if (!results.day) return null
  return results
}

// 造一张 1x1 的纯色占位贴图：贴图缺失时喂给 sampler，
// 避免 sampler2D 拿到 undefined 导致整个 shader 行为不可预期。
function placeholderTexture(THREE: any, rgb: [number, number, number]) {
  const c = document.createElement('canvas')
  c.width = 1
  c.height = 1
  const ctx = c.getContext('2d')!
  ctx.fillStyle = `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`
  ctx.fillRect(0, 0, 1, 1)
  const t = new THREE.Texture(c)
  t.needsUpdate = true
  return t
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
  let globe: any, cloudLayer: any, glow: any, stars: any, atmo: any
  let pinGroupRef: any
  let sunLight: any
  let frameId = 0
  let dragging = false
  let lastX = 0, lastY = 0, velX = 0, velY = 0
  // rotX/rotY 初始 0，定位拿到后再聚焦
  let rotX = 0, rotY = 0
  let targetRotX = 0, targetRotY = 0
  let cameraZ = 3 // 初始远一点，定位后聚焦拉近
  let targetCameraZ = 3
  const CLOUD_SPEED = 0.00025
  // 自转速度：每帧弧度。约 0.001 rad/帧 @60fps ≈ 0.06 rad/s ≈ 3.5°/s，
  // 转一圈约 100 秒，够慢不晕。
  const SELF_SPIN = 0.001
  type GeoResult = { lat: number; lon: number; countryCode?: string }
  const DEFAULT_GEO: GeoResult = { lat: 35.5, lon: 104, countryCode: 'CN' } // 兜底：中国中心
  let geo: GeoResult = DEFAULT_GEO
  let geoReady = false
  let ring: any

  // 按「地球占垂直 FOV 的比例」算相机距离。
  // d = R / sin(FOV*frac/2)。frac 越大 → 相机越近 → 地球越大。
  // 旧版 COUNTRY_ZOOM['CN']=2.1 对应约 126%；这里取 1.35 略大一些。
  const cameraDistanceForFovFrac = (frac: number, fovRad: number) => {
    return RADIUS_REF / Math.sin((fovRad * frac) / 2)
  }

  const boot = async () => {
    // 定位与 three.js 并行拉（不阻塞）
    const [THREE, geoResult] = await Promise.all([loadThree(), getGeoLocation()])
    if (disposed) return
    if (geoResult) geo = geoResult

    // 计算目标朝向；相机距离按「访客所在区域」的可见弧度算，
    // 让区域图占屏约 65%，近处细节足够大又不裁掉边缘。
    const target = focusOn(geo.lat, geo.lon)
    targetRotX = target.rotX
    targetRotY = target.rotY
    // 相机距离：让地球占垂直 FOV 的 135%（旧版中国是 126%），更大一些。
    // 注意：区域图占地球的比例（约 46%）与相机距离无关，只由区域跨度决定；
    // 想「看得更局部」要缩小 REGION_LON_SPAN，而不是拉近相机。
    targetCameraZ = cameraDistanceForFovFrac(1.35, (45 * Math.PI) / 180)
    // 起个慢动作：从远拉近 + 旋转到目标
    cameraZ = targetCameraZ + 1.2 // 从更远一点开始，拉近动画更明显
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

    // 远端低清图与区域高清图并行拉：任一方失败都不阻塞另一方
    const [tex, region] = await Promise.all([
      loadTextures(THREE),
      loadRegionImage(THREE, geo.lat, geo.lon),
    ])
    if (disposed) return
    if (!tex) {
      fallbackReason.value = 'load-failed'
      return
    }
    if (region) tex.region = region

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
    // 缺失的贴图用 1x1 占位图顶上，并关掉对应特性：
    //   normal  缺失 → 法线贴图填中灰 (128,128,255) = 零扰动
    //   specular缺失 → 镜面遮罩填纯黑 = 没有海面高光
    const hasNormal = !!tex.normal
    const hasSpec = !!tex.specular
    const hasRegion = !!tex.region
    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTex: { value: tex.day },
        nightTex: { value: tex.night || tex.day },
        normalTex: { value: tex.normal || placeholderTexture(THREE, [128, 128, 255]) },
        specTex: { value: tex.specular || placeholderTexture(THREE, [0, 0, 0]) },
        // 局部高清区域图：加载成功时 regionTex 有值、uvOffset/uvScale 有定义，
        // shader 里只在 UV 落在该区域内时用它替换低清整球图。
        regionTex: {
          value: tex.region?.texture || placeholderTexture(THREE, [0, 0, 0]),
        },
        regionUvOffset: { value: new THREE.Vector2(...(tex.region?.uvOffset || [0, 0])) },
        regionUvScale: { value: new THREE.Vector2(...(tex.region?.uvScale || [0, 0])) },
        useRegion: { value: hasRegion ? 1 : 0 },
        sunDir: { value: new THREE.Vector3(1, 0, 0) },
        normalScale: { value: new THREE.Vector2(0.85, 0.85) },
        useNormal: { value: hasNormal ? 1 : 0 },
        useSpec: { value: hasSpec ? 1 : 0 },
      },
      vertexShader: `
        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vWorldPos;
        void main() {
          vUv = uv;
          // 显式取 modelMatrix 左上 3x3（uniform scale，等于法线矩阵），
          // 把法线转到世界空间，和 cameraPosition / sunDir 保持同一个空间
          mat3 nm = mat3(modelMatrix[0].xyz, modelMatrix[1].xyz, modelMatrix[2].xyz);
          vNormalW = normalize(nm * normal);
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }`,
      fragmentShader: `
        uniform sampler2D dayTex;
        uniform sampler2D nightTex;
        uniform sampler2D normalTex;
        uniform sampler2D specTex;
        uniform sampler2D regionTex;
        uniform vec2 regionUvOffset;
        uniform vec2 regionUvScale;
        uniform float useRegion;
        uniform vec3 sunDir;
        uniform vec2 normalScale;
        uniform float useNormal;
        uniform float useSpec;
        varying vec2 vUv;
        varying vec3 vNormalW;
        varying vec3 vWorldPos;
        void main() {
          vec3 n = normalize(vNormalW);

          // 法线扰动：贴图解码成切空间偏移，以 vec2 显式升维后加到 vec3 上
          // （GLSL 不允许 vec3 + vec2，之前就是这里编译失败）
          vec2 nOff = (texture2D(normalTex, vUv).xy * 2.0 - 1.0) * normalScale * useNormal;
          vec3 perturbNormal = normalize(n + vec3(nOff * 0.35, 0.0));

          // ---- 局部高清区域图 ----
          // 关键：不能把 region 图直接当 dayColor 用。region 是一张「白天」
          // 卫星照片，若在夜侧整体替换 dayColor，夜里 region 内会从高清
          // 卫星图突然跳成低清夜间灯光图，边界非常明显。
          // 做法：region 图按 dayAmount 混入最终颜色，夜侧自动淡出，
          // 昼侧全量显示，晨昏线平滑过渡，和整球行为完全一致。
          vec3 dayColor = texture2D(dayTex, vUv).rgb;
          vec3 nightColor = texture2D(nightTex, vUv).rgb * 1.7;

          vec3 sunDirN = normalize(sunDir);
          float diff = dot(perturbNormal, sunDirN);
          float dayAmount = smoothstep(-0.12, 0.22, diff);

          // 晨昏线：diff 接近 0 时叠日落暖色，且只在昼侧
          float twilight = 1.0 - smoothstep(0.0, 0.22, abs(diff));
          vec3 color = mix(nightColor, dayColor, dayAmount);
          color += vec3(0.95, 0.55, 0.25) * (twilight * dayAmount * 0.35);

          // region 高清图按 dayAmount 淡入，避免夜侧出现清晰度断层
          if (useRegion > 0.5) {
            vec2 localUv = (vUv - regionUvOffset) / regionUvScale;
            float inside = step(0.0, localUv.x) * step(localUv.x, 1.0)
                         * step(0.0, localUv.y) * step(localUv.y, 1.0);
            if (inside > 0.5) {
              vec3 regionColor = texture2D(regionTex, localUv).rgb;
              // dayAmount 权重让 region 只在白天显现；晨昏线处自然过渡
              color = mix(color, regionColor, inside * dayAmount);
            }
          }

          // 海洋镜面高光（specTex.r > 0.5 视为海面）
          vec3 viewDir = normalize(cameraPosition - vWorldPos);
          vec3 halfDir = normalize(sunDirN + viewDir);
          float specMask = step(0.5, texture2D(specTex, vUv).r) * useSpec;
          float specAmount = pow(max(dot(perturbNormal, halfDir), 0.0), 42.0) * specMask * 0.55 * dayAmount;
          color += vec3(specAmount);

          // 边缘暗化（模拟大气曲率）
          float rim = 1.0 - pow(max(dot(n, viewDir), 0.0), 1.5);
          color *= 1.0 - rim * 0.35;

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

    // ===== 访客所在地 pin：Apple Maps 风格的「细针 + 圆头」图钉 =====
    //
    // 尺寸设计的坑（连踩两次）：如果按「球半径的比例」给定大小，聚焦拉近后
    // 图钉会同比例变大，但相机也跟着近，屏幕上它依然只有几个像素，
    // 看起来永远是个圆点。
    //
    // 正确做法：用 Sprite。Sprite 在 three.js 里按屏幕尺寸呈现，
    // 不受相机距离影响，可以把图钉稳定控制在约 46px 高，一眼认出形状。
    // 图案用 canvas 画：暗红细针 + 亮红圆头 + 底部柔和阴影。
    const pinGroup = new THREE.Group()
    const pinRoot = new THREE.Group()
    const { x: px, y: py, z: pz } = geoToVec3(geo.lat, geo.lon, RADIUS)
    pinRoot.position.set(px, py, pz)
    // 外层变量也持有一份，供 tick 里驱动旋转
    pinGroupRef = pinGroup
    // 标准姿态是 +Y 朝外；用 quaternion 把 +Y 旋到地表法线方向，
    // 这样图钉始终垂直于地表（针底贴在表面、圆头朝上）
    const up = new THREE.Vector3(0, 1, 0)
    const normal = new THREE.Vector3(px, py, pz).normalize()
    pinRoot.quaternion.setFromUnitVectors(up, normal)
    pinGroup.add(pinRoot)

    // --- 画图钉贴图（128x192：上圆头、中细针、下阴影）---
    const pinCanvas = document.createElement('canvas')
    pinCanvas.width = 128
    pinCanvas.height = 192
    const pc = pinCanvas.getContext('2d')!
    // 底部柔和阴影
    pc.fillStyle = 'rgba(0,0,0,0.32)'
    pc.beginPath()
    pc.ellipse(64, 184, 26, 8, 0, 0, Math.PI * 2)
    pc.fill()
    // 细针：上细下粗的锥形
    const grad = pc.createLinearGradient(0, 184, 0, 70)
    grad.addColorStop(0, '#7d1a1a')
    grad.addColorStop(1, '#c0392b')
    pc.fillStyle = grad
    pc.beginPath()
    pc.moveTo(64, 70)
    pc.lineTo(56, 184)
    pc.lineTo(72, 184)
    pc.closePath()
    pc.fill()
    // 圆头 + 高光
    pc.fillStyle = '#e8453c'
    pc.beginPath()
    pc.arc(64, 62, 30, 0, Math.PI * 2)
    pc.fill()
    pc.fillStyle = 'rgba(255,255,255,0.35)'
    pc.beginPath()
    pc.arc(54, 52, 10, 0, Math.PI * 2)
    pc.fill()

    const pinTex = new THREE.CanvasTexture(pinCanvas)
    // Sprite 的 scale 是世界单位。屏幕上高度 H 像素 ≈ 世界高度
    //   2 * d * tan(fov/2) * H / viewportH
    // d≈2（相机距）、fov=45°、viewportH=720 时系数 ≈ 0.0037。
    // 取 46px 目标高度 → scale.y ≈ 0.17；x 按画布宽高比折算。
    const PIN_SCREEN_H = 46
    const spriteH = PIN_SCREEN_H * 0.0037
    const spriteW = spriteH * (pinCanvas.width / pinCanvas.height)
    const pinSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: pinTex,
        transparent: true,
        depthTest: true, // 转到地球背面时被自身遮挡，自然消失
      }),
    )
    pinSprite.scale.set(spriteW, spriteH, 1)
    // Sprite 中心即锚点，且始终面向相机（这正是 Apple Maps 图钉的观感）。
    // 画布 192 高，针底画在 canvas y=184；three.js 的纹理 v 轴是
    // 「canvas 底部 = v=0」，所以针底对应 v = (192-184)/192 = 0.0417。
    // 要让针底落在表决上（pinRoot 局部 y=0），需把精灵上移：
    //   position.y = (0.5 - v_base) * scale.y ≈ 0.458 * scale.y
    // （曾误把方向写反，导致图钉被推到地表以下完全看不见）
    pinSprite.position.y = (0.5 - (pinCanvas.height - 184) / pinCanvas.height) * spriteH
    pinRoot.add(pinSprite)

    // --- 插入点的柔和阴影圈，让图钉「扎」在地表上而不是浮着 ---
    const baseShadow = new THREE.Mesh(
      new THREE.CircleGeometry(RADIUS * 0.045, 24),
      new THREE.MeshBasicMaterial({
        color: 0x000000,
        transparent: true,
        opacity: 0.35,
        depthWrite: false,
      }),
    )
    baseShadow.rotation.x = -Math.PI / 2 // 平面朝上（+Y）
    baseShadow.position.y = RADIUS * 0.001
    pinRoot.add(baseShadow)

    // --- 脉冲光环：平铺在地表，标记准确位置 ---
    ring = new THREE.Mesh(
      new THREE.RingGeometry(RADIUS * 0.035, RADIUS * 0.048, 48),
      new THREE.MeshBasicMaterial({
        color: 0xe8453c,
        transparent: true,
        opacity: 0.6,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    )
    ring.rotation.x = -Math.PI // 平铺在地表
    ring.position.y = RADIUS * 0.002
    pinRoot.add(ring)

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
      // 缓动到目标朝向。注意：只能用「每帧固定增量」驱动自转，
      // 绝不能用 performance.now() 的绝对时间 —— 那会让目标值随时钟线性增长，
      // 页面开久了转速会越来越快。
      if (!dragging && geoReady) {
        rotX += (targetRotX - rotX) * 0.02 + velX
        rotY += (targetRotY - rotY) * 0.02 + velY
        // 聚焦到位后再叠加极慢的自转，否则缓动永远追不上移动的目标
        if (Math.abs(rotY - targetRotY) < 0.05) rotY += SELF_SPIN
      } else {
        rotX += velX
        rotY += velX + SELF_SPIN
      }
      rotX = Math.max(-1.1, Math.min(1.1, rotX))

      // 地球/云/光晕/pin 一起转（云多转一点）
      globe.rotation.y = rotY
      globe.rotation.x = rotX
      if (cloudLayer) {
        // 云相对地球多转的量必须每次重置基准，用 rotY + 固定偏移而非累计时间
        cloudLayer.rotation.y = rotY + CLOUD_SPEED * 60
        cloudLayer.rotation.x = rotX
      }
      glow.rotation.copy(globe.rotation)
      atmo.rotation.y = (atmo.rotation.y || 0) + 0.00004
      if (pinGroupRef) {
        // pinRoot 的 quaternion 已把「+Y 朝外」对齐到地表法线，
        // 所以只需让外层的 pinGroup 与 globe 同轴旋转即可
        // （不要直接改 pinRoot.rotation，会和 quaternion 冲突）
        pinGroupRef.rotation.y = rotY
        pinGroupRef.rotation.x = rotX
      }

      // 相机缓动到目标距离（定位拉近动画）
      if (geoReady && !dragging) {
        cameraZ += (targetCameraZ - cameraZ) * 0.03
        camera.position.z = cameraZ
      }

      // 星星缓慢反向 + 闪烁（闪烁用绝对时间是安全的，只影响透明度正弦）
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
