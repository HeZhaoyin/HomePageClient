<template>
  <div class="globe-wrap" ref="wrapRef">
    <canvas ref="canvasRef"></canvas>
    <div class="globe-fallback" v-if="fallbackReason">
      <!--
        降级原因提示。之前降级只 console.error，用户看到的就是一张
        静态地球图，完全不知道发生了什么、也不知道该找谁。
        这里把原因和版本号直接显示出来，便于自查与反馈。
        只在 URL 带 ?debug 或降级时显示，不影响正常观感。
      -->
      <div class="globe-fallback__note">
        <div class="globe-fallback__title">3D 地球未加载，已降级为静态图</div>
        <div class="globe-fallback__reason">原因：{{ fallbackDetail }}</div>
        <div class="globe-fallback__hint">
          若你刚更新过版本，请强制刷新（Ctrl/Cmd + Shift + R）；
          仍不行请把这一行和浏览器控制台的报错一起反馈。
        </div>
      </div>
    </div>
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
// 降级原因的可读描述，直接显示在静态图上，便于用户自查与反馈
const fallbackDetail = ref('')

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

// 整球昼图：ArcGIS World Imagery 的 /export（等距柱状，2048x1024 约 417KB）。
// 为什么不再用 GitHub raw 的 earth_day_4096：
//   raw.githubusercontent.com 实测时通时断（3 次里挂 1 次，SSL 错误），
//   而它是「核心贴图」，一旦失败整个 3D 地球直接降级成 CSS 静态图。
//   ArcGIS 已验证稳定且 CORS:*，且能按 bboxSR=4326 直接出等距柱状图，
//   球面 UV 完全不用改。
// 近端高清卫星图：ArcGIS World Imagery 的 /export 接口。
// 关键：它支持 bboxSR=4326（bbox 用经纬度），返回的就是等距柱状图，
// 球面 UV 完全不用改。但尺寸有服务端上限（实测 >4096 宽会返回同一张图），
// 所以想更清晰只能「按区域裁小」，不能靠加大 size。
const ARCGIS_EXPORT = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/export'

// 整球昼图 URL（等距柱状）
const GLOBAL_DAY_URL =
  `${ARCGIS_EXPORT}?bbox=-180,-90,180,90&bboxSR=4326&imageSR=4326` +
  `&size=2048,1024&format=jpg&f=image`

// 云层/法线/镜面贴图仍用 three.js 官方仓库（非核心，失败可安全跳过）
const TEX = (name: string) =>
  `https://raw.githubusercontent.com/mrdoob/three.js/HEAD/examples/textures/planets/${name}`
const TEXTURES = {
  clouds: TEX('earth_clouds_1024.png'),
  normal: TEX('earth_normal_2048.jpg'),
  specular: TEX('earth_specular_2048.jpg'),
}

// 高清区域的经纬度跨度。
// 【关键】必须 ≥ 屏幕实际可见范围，否则区域外的低清图会露在画面里 ——
// 之前 10x8 度，而 2:1 宽屏在 d=1.10 时横向能看 14 度，
// 结果就是「只有中间一块清晰，左右两侧全是糊的」。
// 现在取 14x10 度（略大于可见范围），高纬度会按 1/cos(lat) 自动放宽。
const REGION_LON_SPAN = 14
const REGION_LAT_SPAN = 10

// ---- 分辨率：为什么不是简单的「屏幕宽 = 纹理宽」----
//
// 球面投影有个固有几何缺陷：越靠屏幕边缘，同样的像素宽度对应的地表越小
// （掠射角趋近切线）。实测本投影下最边缘的纹理拉伸倍数稳定在 ~1.98x，
// 且与相机距离无关 —— 拉近相机也消不掉。
//
// 也就是说：中心 1:1 的纹理，到屏幕左右边缘等价于被拉宽 2 倍 → 看起来糊。
// 若想让边缘也清晰，纹理密度必须按「边缘拉伸倍数 × 可接受清晰度」来抬：
//     需要 px/度 = (屏幕宽 / 跨度) × 1.98 × 目标清晰度
//
// 例：2557px 屏 / 14 度 = 183 px/度；×1.98×0.7 ≈ 253 px/度
//     → 需要约 3544px 宽的纹理。
//
// 但不同屏幕需求差别很大（1080p 只要 ~2660px，4K 要 ~5300px 超过服务端上限），
// 所以按实际屏幕像素宽度动态决定，并夹在 [2048, 4096]（ArcGIS 单次上限）。
// 之前固定 2560px 时边缘只有 ~51% 清晰度，这就是「两侧发糊」的根因。
const REGION_EDGE_STRETCH = 1.98 // 屏幕最边缘的纹理拉伸倍数（实测）
const REGION_EDGE_TARGET = 0.7 // 边缘目标清晰度（1.0 = 完全 1:1）
const REGION_MIN_WIDTH = 2048
const REGION_MAX_WIDTH = 4096

/** 按屏幕像素宽度算出合适的区域纹理宽度 */
function computeRegionWidth(screenW: number): number {
  const screenPxPerDeg = screenW / REGION_LON_SPAN
  const needPxPerDeg = screenPxPerDeg * REGION_EDGE_STRETCH * REGION_EDGE_TARGET
  const needWidth = Math.round(needPxPerDeg * REGION_LON_SPAN)
  return Math.max(REGION_MIN_WIDTH, Math.min(REGION_MAX_WIDTH, needWidth))
}

// 夜间灯光高清区：NASA GIBS VIIRS Black Marble，epsg4326 瓦片拼接。
// 真数据约 15 弧秒，但 GIBS 服务端最高只到 L7（228 px/度）。
// L6 = 114 px/度（现有整球 night 贴图仅 11.4 px/度，差 20 倍），
// 广东范围 6 张瓦片约 1.5MB；L7 需 4.5MB，对 frp 3M 小水管偏大，故取 L6。
const NIGHT_TILE_LEVEL = 6
const NIGHT_TILE_BASE = 'https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/VIIRS_Black_Marble/default/500m'
const NIGHT_TILE_SIZE = 512

// 图钉在屏幕上的目标高度（CSS 像素）。Sprite 按屏幕尺寸呈现，
// 所以这个值是恒定的，不受相机距离 / DPR / 画布大小影响。
const PIN_SCREEN_H = 26
// 图钉画布尺寸（宽 x 高）。用高分辨率绘制再缩放，避免边缘锯齿。
const PIN_CANVAS_W = 256
const PIN_CANVAS_H = 384
// 针底在画布上的 y 坐标（与绘制代码保持一致）
const PIN_NEEDLE_BASE_Y = PIN_CANVAS_H - 8

// 屏幕上想看到的经度跨度（度）。14 度略小于广东+周边（广东 7.5 度），
// 既能看清一个省，又不会放大到失去地理上下文。
// 必须与 REGION_LON_SPAN 匹配或略小，否则区域外会露出低清图。
const TARGET_LON_SPAN = 14

// 屏幕尺寸的换算：d≈1.14 时 1 世界单位 ≈ 1340 CSS px（2:1 屏）。
// 取 0.018 -> 单边约 24px，轻微跟随、不抢注意力。
// （曾是 0.08 = 107px，鼠标一动地图就大幅晃动）
const PARALLAX_AMP = 0.018

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
  maxAnisotropy?: number,
  screenWidth?: number,
): Promise<{ texture: any; uvOffset: [number, number]; uvScale: [number, number] } | null> {
  // 高纬度修正：经线在高纬收敛，同样的相机距离下屏幕横向对应的
  // 经度跨度会按 1/cos(lat) 放大（60°N 可见约 28 度）。
  // 若固定 14 度，高纬用户就只能看到中间一半清晰。
  //
  // 纹理宽度：
  //   1) 基础宽度按「屏幕实际像素宽度」算（见 computeRegionWidth），
  //      目的让球体左右边缘也清晰，而不只是中间那圈；
  //   2) 再按 latFactor 等比放大 —— 高纬跨度被放宽后，要保持同样的
  //      px/度 密度，宽度就得同倍数增长；
  //   3) 最后夹到服务端单次出图上限 4096。
  //
  // 【曾经写错的地方】原先把 latFactor > 1.001 当成"高纬"改用固定 2400px，
  // 但 1.001 这个阈值太严：连 22.5°N 的深圳（factor=1.08）都被判成高纬，
  // 结果中低纬也走了 2400px 分支，左右边缘照样糊 —— 这正是「左侧模糊」的成因之一。
  const latFactor = Math.min(2.9, 1 / Math.max(0.35, Math.cos((lat * Math.PI) / 180)))
  const spanLon = REGION_LON_SPAN * latFactor
  const spanLat = REGION_LAT_SPAN * latFactor
  const baseWidth = computeRegionWidth(screenWidth || 2560)
  const imgW = Math.min(REGION_MAX_WIDTH, Math.round(baseWidth * latFactor))
  const imgH = Math.round(imgW * (spanLat / spanLon))

  // 区域中心尽量贴合访客位置，但要做两类边界处理：
  //  1) 跨越 ±180° 经线：把 lon0 拉回 [-180, 180] 内
  //  2) 超出南北极：把 lat0 夹到 [-90+span, 90-span]
  // 注意：跨越经线时贴图会被裁掉一部分（等距柱状图的固有特性），
  // 访客在太平洋中部时会发生，属可接受退化。
  let lon0 = lon - spanLon / 2
  let lat0 = lat - spanLat / 2
  if (lon0 < -180) lon0 += 360
  if (lon0 + spanLon > 180) lon0 = 180 - spanLon
  lat0 = Math.max(-90 + spanLat / 2, Math.min(90 - spanLat / 2, lat0))

  // bbox 是「minLon,minLat,maxLon,maxLat」
  const bbox = `${lon0},${lat0},${lon0 + spanLon},${lat0 + spanLat}`
  const url =
    `${ARCGIS_EXPORT}?bbox=${bbox}` +
    `&bboxSR=4326&imageSR=4326` +
    `&size=${imgW},${imgH}` +
    `&format=jpg&f=image`

  try {
    const tex = await new Promise<any>((resolve, reject) => {
      new THREE.TextureLoader().load(url, (t: any) => {
        // 各向异性过滤：球面边缘的纹理会以极大的掠射角呈现，
        // 这正是各向异性过滤要处理的场景。用硬件支持的最大值，
        // 而不是写死 8 —— 高端卡支持到 16，写死会明显糊在球体两侧。
        t.anisotropy = maxAnisotropy || 8
        // 明示三线性 + mipmap，避免缩小时闪烁、放大时用最近邻
        t.minFilter = THREE.LinearMipmapLinearFilter
        t.magFilter = THREE.LinearFilter
        t.generateMipmaps = true
        resolve(t)
      }, undefined, () => reject(new Error('region fail')))
    })
    // 该区域在球面 UV 上的位置。SphereGeometry 的 u=0 在 lon=-180。
    const u0 = (lon0 + 180) / 360
    const v0 = (lat0 + 90) / 180
    return {
      texture: tex,
      uvOffset: [u0, v0],
      uvScale: [spanLon / 360, spanLat / 180],
    }
  } catch {
    return null
  }
}

// ---- 局部高清夜间灯光图 ----
// GIBS 的 epsg4326 瓦片拼接成一张等距柱状图。
// 网格（来自 WMTSCapabilities.xml）：L 级为 2*2^L 列 x 2^L 行，
// 每瓦片 512px。瓦片 (col,row) 覆盖
//   lon: [col*360/W - 180, (col+1)*360/W - 180]
//   lat: [90 - (row+1)*180/H, 90 - row*180/H]   （row 0 在最北）
// 按行从上到下拼，正好得到「左边缘 180W、上边缘 90N」的等距柱状图，
// 与球面 UV 约定完全一致 —— 所以拼接结果可以按同一套 uvOffset/uvScale 贴。
async function loadNightRegion(
  THREE: any,
  lat: number,
  lon: number,
): Promise<{ texture: any; uvOffset: [number, number]; uvScale: [number, number] } | null> {
  const L = NIGHT_TILE_LEVEL
  // 关键：GIBS '500m' 集的网格不是 2 的幂！
  // 实测（WMTSCapabilities.xml）：L0=2x1, L1=3x2, L2=5x3, L3=10x5,
  // L4=20x10, L5=40x20, L6=80x40, L7=160x80。
  // 曾用 2*2^L x 2^L 把 L6 算成 128x64，行列号全部越界 → 整批 400。
  const [gridW, gridH] = ({
    0: [2, 1], 1: [3, 2], 2: [5, 3], 3: [10, 5],
    4: [20, 10], 5: [40, 20], 6: [80, 40], 7: [160, 80],
  } as Record<number, [number, number]>)[L] || [80, 40]

  // 想要的窗口（以访客为中心），再对齐到瓦片边界
  let lon0 = lon - REGION_LON_SPAN / 2
  let lat0 = lat - REGION_LAT_SPAN / 2
  if (lon0 < -180) lon0 += 360
  if (lon0 + REGION_LON_SPAN > 180) lon0 = 180 - REGION_LON_SPAN
  lat0 = Math.max(-90 + REGION_LAT_SPAN / 2, Math.min(90 - REGION_LAT_SPAN / 2, lat0))
  const lon1 = lon0 + REGION_LON_SPAN
  const lat1 = lat0 + REGION_LAT_SPAN

  // 取整到瓦片边界，保证不出现半张瓦片
  const col0 = Math.max(0, Math.floor(((lon0 + 180) / 360) * gridW))
  const col1 = Math.min(gridW - 1, Math.ceil(((lon1 + 180) / 360) * gridW) - 1)
  const row0 = Math.max(0, Math.floor(((90 - lat1) / 180) * gridH))
  const row1 = Math.min(gridH - 1, Math.floor(((90 - lat0) / 180) * gridH))

  const cols = col1 - col0 + 1
  const rows = row1 - row0 + 1
  if (cols <= 0 || rows <= 0) return null

  // 实际覆盖范围（瓦片对齐后可能比目标窗口略大）
  const coverLon0 = (col0 * 360) / gridW - 180
  const coverLon1 = ((col1 + 1) * 360) / gridW - 180
  const coverLat1 = 90 - (row0 * 180) / gridH
  const coverLat0 = 90 - ((row1 + 1) * 180) / gridH

  const canvas = document.createElement('canvas')
  canvas.width = cols * NIGHT_TILE_SIZE
  canvas.height = rows * NIGHT_TILE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  try {
    // 并发拉瓦片，按 (row, col) 画到画布。
    // 必须加超时：某些网络环境下请求会挂起（不触发 onload 也不触发
    // onerror），若没有超时，Promise.all 会永远 pending，把整个地球
    // 的启动流程堵死 —— 表现就是"地球完全不显示且无报错"。
    const withTimeout = (p: Promise<void>, ms: number) =>
      new Promise<void>((resolve) => {
        const t = setTimeout(resolve, ms)
        p.then(() => { clearTimeout(t); resolve() }, () => { clearTimeout(t); resolve() })
      })

    let okCount = 0
    await Promise.all(
      Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => {
          const url = `${NIGHT_TILE_BASE}/${L}/${row0 + r}/${col0 + c}.png`
          return withTimeout(
            new Promise<void>((resolve) => {
              const img = new Image()
              img.crossOrigin = 'anonymous'
              img.onload = () => {
                ctx.drawImage(img, c * NIGHT_TILE_SIZE, r * NIGHT_TILE_SIZE)
                okCount++
                resolve()
              }
              img.onerror = () => resolve() // 单张失败就留空，不拖垮整体
              img.src = url
            }),
            12000, // 单张瓦片最多等 12 秒
          )
        }),
      ).flat(),
    )
    // 瓦片大面积失败时这张 canvas 是半黑的，宁可返回 null 让 shader
    // 退回整球夜灯图，也不要把黑块贴到地球上。
    if (okCount < cols * rows * 0.6) return null
    const tex = new THREE.CanvasTexture(canvas)
    tex.needsUpdate = true
    return {
      texture: tex,
      uvOffset: [(coverLon0 + 180) / 360, (coverLat0 + 90) / 180],
      uvScale: [(coverLon1 - coverLon0) / 360, (coverLat1 - coverLat0) / 180],
    }
  } catch {
    return null
  }
}

// ---- 贴图加载 ----
// 分两阶段：核心（昼图，决定能否出 3D）优先拿到，非核心（夜灯/云/法线/镜面）
// 尽力而为。之前把核心和非核心塞进同一个 Promise.all，任何一慢就把整体
// 拖过总超时，导致明明昼图已成功却仍判「load-failed」降级。
async function loadCoreDayTexture(THREE: any): Promise<any | null> {
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
  try {
    return await loadOne(GLOBAL_DAY_URL) // ArcGIS，稳定
  } catch {
    try {
      return await loadOne(TEX('earth_day_4096.jpg')) // 退回 GitHub raw
    } catch {
      return null
    }
  }
}

async function loadOptionalTextures(THREE: any): Promise<Record<string, any>> {
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
  const out: Record<string, any> = {}
  await Promise.allSettled([
    // 夜灯：GIBS VIIRS 全球 L2 拼接（15 张，约 1.2MB）
    loadNightGlobal(THREE).then((t) => t && (out.night = t)),
    // 退回 GitHub raw 的整球夜灯
    (async () => {
      if (out.night) return
      try {
        const t = await loadOne(TEX('earth_night_4096.jpg'))
        if (!out.night) out.night = t
      } catch {
        /* 缺失时 shader 退回 dayTex */
      }
    })(),
    // 云 / 法线 / 镜面
    loadOne(TEXTURES.clouds).then((t) => (out.clouds = t)),
    loadOne(TEXTURES.normal).then((t) => (out.normal = t)),
    loadOne(TEXTURES.specular).then((t) => (out.specular = t)),
  ])
  return out
}

// ---- 整球夜灯图：GIBS VIIRS Black Marble L2 拼接 ----
// L2 网格为 5x3 tiles、每张 512px -> 2560x1536 等距柱状图，约 1.2MB。
// 按行从上到下拼即得到「左 180W、上 90N」的等距柱状图，与球面 UV 一致。
async function loadNightGlobal(THREE: any): Promise<any | null> {
  const L = 2
  const gridW = 5
  const gridH = 3
  const canvas = document.createElement('canvas')
  canvas.width = gridW * NIGHT_TILE_SIZE
  canvas.height = gridH * NIGHT_TILE_SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null

  const withTimeout = (p: Promise<void>, ms: number) =>
    new Promise<void>((resolve) => {
      const t = setTimeout(resolve, ms)
      p.then(() => { clearTimeout(t); resolve() }, () => { clearTimeout(t); resolve() })
    })

  let okCount = 0
  const jobs: Promise<void>[] = []
  for (let r = 0; r < gridH; r++) {
    for (let c = 0; c < gridW; c++) {
      const url = `${NIGHT_TILE_BASE}/${L}/${r}/${c}.png`
      jobs.push(
        withTimeout(
          new Promise<void>((resolve) => {
            const img = new Image()
            img.crossOrigin = 'anonymous'
            img.onload = () => {
              ctx.drawImage(img, c * NIGHT_TILE_SIZE, r * NIGHT_TILE_SIZE)
              okCount++
              resolve()
            }
            img.onerror = () => resolve()
            img.src = url
          }),
          15000,
        ),
      )
    }
  }
  await Promise.all(jobs)
  // 大部分瓦片失败就不值得用（会是一张半黑图）
  if (okCount < gridW * gridH * 0.6) return null
  const tex = new THREE.CanvasTexture(canvas)
  tex.needsUpdate = true
  return tex
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

// WebGL 可用性检测。
//
// 【曾经的 bug 1】只试 'webgl' / 'experimental-webgl'，而 three.js r128 的
//   创建优先级是 ["webgl2", "webgl", "experimental-webgl"]（优先 WebGL2）。
//   在「只暴露 WebGL2」的驱动上会误判为不支持。
//
// 【曾经的 bug 2】探测用的 canvas 拿到上下文后没有释放，白白占掉一个配额。
//   浏览器对同时存活的 WebGL 上下文有硬上限（通常 16 个），
//   探测本身也在吃配额，长期运行/热更新后会把配额耗光。
//
// 返回：'ok' | 'no-api' | 'exhausted'
//   exhausted = API 存在但创建不出上下文，通常是配额耗尽或 GPU 进程崩溃，
//   这种情况重开标签页有较大概率恢复，需要给用户不同的提示。
function webglProbe(): 'ok' | 'no-api' | 'exhausted' {
  const has1 = !!window.WebGLRenderingContext
  const has2 = !!(window as any).WebGL2RenderingContext
  if (!has1 && !has2) return 'no-api'

  for (const kind of ['webgl2', 'webgl', 'experimental-webgl']) {
    try {
      const c = document.createElement('canvas')
      const ctx = c.getContext(kind as any)
      if (ctx) {
        // 探测完立刻归还配额，避免自己成为泄漏源
        try {
          ;(ctx as any).getExtension?.('WEBGL_lose_context')?.loseContext?.()
        } catch {
          /* 释放失败不影响结论 */
        }
        return 'ok'
      }
    } catch {
      /* 换下一个类型 */
    }
  }
  return 'exhausted'
}

onMounted(() => {
  const canvas = canvasRef.value
  const wrap = wrapRef.value
  if (!canvas || !wrap) return

  // 降级 1：设备无 WebGL → 直接 CSS 兜底。
  // 区分「确实不支持」和「配额耗尽/GPU 进程崩溃」——后者重开标签页即可恢复，
  // 给用户的提示必须不一样，否则会让人以为自己的电脑出了问题。
  const probe = webglProbe()
  if (probe !== 'ok') {
    fallbackReason.value = 'no-webgl'
    fallbackDetail.value =
      probe === 'no-api'
        ? '浏览器不支持 WebGL（版本过旧，或被策略完全禁用）'
        : 'WebGL 上下文暂时无法创建（通常是当前标签页的 WebGL 配额已耗尽，' +
          '或 GPU 进程崩溃过）。请关闭本标签页后重新打开；若仍不行，' +
          '重启浏览器即可恢复——浏览器设置里的硬件加速开关不用改'
    return
  }

  let renderer: any, scene: any, camera: any
  let globe: any, cloudLayer: any, glow: any, stars: any, atmo: any
  let pinGroupRef: any
  let pinSpriteRef: { sprite: any; canvasW: number; canvasH: number } | null = null
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

  // 相机距离按「地球占屏宽的比例」算，且随屏幕宽高比自适应。
  // 相机距离按「屏幕上能看到的经度跨度」算。
  //
  // 踩过的坑（三次，前两次都错）：
  //  1) 按垂直 FOV 算 → 宽屏上地球只占屏宽 76%，显小；
  //  2) 按水平 FOV 占屏宽 95% → 2:1 屏高只有屏宽一半，地球上下全出画，
  //     且能看到约 50 度经度，仍是"整个中国"而不是"一个省"；
  //  3) 用 d = 1/sin(span/2) 近似 → 这是错的，正确解要求射线-球求交。
  //
  // 正确推导（世界系，相机在 (0,0,d) 看向地心，聚焦点位于世界 +Z）：
  //   屏幕边缘视线在 y=0 平面内，与 -Z 轴夹角 θ = fovH/2：
  //     point = (t·sinθ, 0, d - t·cosθ)，|point|² = 1
  //     t = d·cosθ - √(1 - d²sin²θ)
  //   该点的经度相对聚焦点偏移 φ = atan2(x, z)（+X 方向为经度增加 90°）。
  //   令 φ = span/2 反解 d 即可。
  //
  // 实测（见 verify-region.mjs）：d=1.10 时 2:1 屏可见 9.96°、16:9 可见 8.70°，
  // 即"一个省"的量级，且随宽高比自适应 —— 宽屏看到更宽，符合直觉。
  const cameraDistanceForLonSpan = (lonSpanDeg: number, fovV: number, aspect: number) => {
    const target = lonSpanDeg * (Math.PI / 180) // 目标全跨度（弧度），与 spanAt 同基准
    const fovH = 2 * Math.atan(Math.tan(fovV / 2) * aspect)
    const theta = fovH / 2
    // 解析解：由 φ = atan2(x, z) = target，代入求交公式可解出 d。
    //   x = t·sinθ,  z = d - t·cosθ
    //   tan(φ) = x/z  =>  t·sinθ = (d - t·cosθ)·tanφ
    //   =>  t = d·tanφ / (sinθ + cosθ·tanφ)
    //  代入 t = d·cosθ - √(1 - d²sin²θ) 后整理得：
    //   d² (sin²θ + cos²θ·tan²φ/(sinθ+cosθtanφ)² ...) 太繁，改用数值法（稳定且足够快）。
    // 数值法：d 单调 → 跨度单调减小，二分求交。
    let lo = 1.0001
    let hi = 1 / Math.sin(theta) // 球体恰好填满 FOV 的距离，再远屏幕边缘就空了
    const spanAt = (d: number) => {
      const s = Math.sin(theta)
      const disc = 1 - d * d * s * s
      if (disc < 0) return null
      const t = d * Math.cos(theta) - Math.sqrt(disc)
      return 2 * Math.atan2(t * s, d - t * Math.cos(theta))
    }
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2
      const span = spanAt(mid)
      // spanAt 返回的是【全跨度】。跨度随 d 单调递增：
      //   相机贴近球面 → 只看到很小一块；相机远离 → 看到大半个球。
      // 所以跨度不够就拉远（抬 lo），跨度过大就拉近（压 hi）。
      if (span === null) hi = mid // 边缘射线打不到球：相机太远
      else if (span < target) lo = mid
      else hi = mid
    }
    return (lo + hi) / 2
  }

  // URL 参数覆盖定位结果：?lat=22.54&lon=114.06
  // 便于调试与验收（测试环境 IP 定位服务常被限流，看不到真实效果）。
  const urlOverride = (() => {
    try {
      const q = new URLSearchParams(window.location.search)
      const lat = parseFloat(q.get('lat') || '')
      const lon = parseFloat(q.get('lon') || '')
      if (Number.isFinite(lat) && Number.isFinite(lon)) {
        return { lat: Math.max(-90, Math.min(90, lat)), lon: ((lon + 180) % 360) - 180 }
      }
    } catch {
      /* ignore */
    }
    return null
  })()

  const boot = async () => {
    // 定位与 three.js 并行拉（不阻塞）；URL 参数优先
    const [THREE, geoResult] = await Promise.all([loadThree(), getGeoLocation()])
    if (disposed) return
    if (urlOverride) geo = urlOverride
    else if (geoResult) geo = geoResult

    // 计算目标朝向；相机距离按「屏幕可见经度跨度」算，随宽高比自适应，
    // 目标是让画面上主要就是访客所在的那个省。
    const target = focusOn(geo.lat, geo.lon)
    targetRotX = target.rotX
    targetRotY = target.rotY
    const aspect = (wrap.clientWidth || window.innerWidth) / (wrap.clientHeight || window.innerHeight)
    targetCameraZ = cameraDistanceForLonSpan(TARGET_LON_SPAN, (45 * Math.PI) / 180, aspect)
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

    // 加载超时兜底：任何一路挂起都不能让整球一直转圈。
    const withTotalTimeout = <T,>(p: Promise<T>, ms: number): Promise<T | null> =>
      new Promise((resolve) => {
        const t = setTimeout(() => resolve(null), ms)
        p.then((v) => { clearTimeout(t); resolve(v) },
               () => { clearTimeout(t); resolve(null) })
      })

    // 阶段一：只等核心昼图（决定能否出 3D）。20 秒兜底，超时即降级。
    const dayTex = await withTotalTimeout(loadCoreDayTexture(THREE), 20000)
    if (disposed) return
    if (!dayTex) {
      fallbackReason.value = 'load-failed'
      fallbackDetail.value =
        '卫星底图加载失败（ArcGIS 与备用源均不可达，或网络超时）'
      return
    }
    const tex: Record<string, any> = { day: dayTex }

    // 各向异性上限：取自当前 GPU（常见 16），用于抑制球体边缘的掠射角模糊
    const maxAniso = renderer?.capabilities?.getMaxAnisotropy?.() || 8
    // 用画布实际像素宽度决定区域图分辨率（见 computeRegionWidth 的推导）
    const canvasCssW = wrap.clientWidth || window.innerWidth
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2)
    const screenPxWidth = Math.round(canvasCssW * pixelRatio)

    // 区域高清图（昼/夜）也并行拿，但同样限时，拿不到就用整球图
    const [region, nightRegion] = await Promise.all([
      withTotalTimeout(loadRegionImage(THREE, geo.lat, geo.lon, maxAniso, screenPxWidth), 20000),
      withTotalTimeout(loadNightRegion(THREE, geo.lat, geo.lon), 15000),
    ])
    if (disposed) return
    if (region) tex.region = region
    if (nightRegion) tex.nightRegion = nightRegion

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
    const hasNightRegion = !!tex.nightRegion
    const earthMat = new THREE.ShaderMaterial({
      uniforms: {
        dayTex: { value: tex.day },
        nightTex: { value: tex.night || tex.day },
        normalTex: { value: tex.normal || placeholderTexture(THREE, [128, 128, 255]) },
        specTex: { value: tex.specular || placeholderTexture(THREE, [0, 0, 0]) },
        // 局部高清昼间卫星图：UV 落在区域内时替换低清整球图
        regionTex: {
          value: tex.region?.texture || placeholderTexture(THREE, [0, 0, 0]),
        },
        regionUvOffset: { value: new THREE.Vector2(...(tex.region?.uvOffset || [0, 0])) },
        regionUvScale: { value: new THREE.Vector2(...(tex.region?.uvScale || [0, 0])) },
        useRegion: { value: hasRegion ? 1 : 0 },
        // 局部高清夜间灯光图（GIBS 瓦片拼接，114 px/度）
        nightRegionTex: {
          value: tex.nightRegion?.texture || placeholderTexture(THREE, [0, 0, 0]),
        },
        nightRegionUvOffset: {
          value: new THREE.Vector2(...(tex.nightRegion?.uvOffset || [0, 0])),
        },
        nightRegionUvScale: {
          value: new THREE.Vector2(...(tex.nightRegion?.uvScale || [0, 0])),
        },
        useNightRegion: { value: hasNightRegion ? 1 : 0 },
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
        uniform sampler2D nightRegionTex;
        uniform vec2 nightRegionUvOffset;
        uniform vec2 nightRegionUvScale;
        uniform float useNightRegion;
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

          vec3 sunDirN = normalize(sunDir);
          float diff = dot(perturbNormal, sunDirN);
          float dayAmount = smoothstep(-0.12, 0.22, diff);

          // 整球的昼/夜基础色（低清，作为区域外的兜底）
          vec3 dayColor = texture2D(dayTex, vUv).rgb;
          vec3 nightColor = texture2D(nightTex, vUv).rgb * 1.7;
          vec3 color = mix(nightColor, dayColor, dayAmount);

          // 晨昏线：diff 接近 0 时叠日落暖色，且只在昼侧
          float twilight = 1.0 - smoothstep(0.0, 0.22, abs(diff));
          color += vec3(0.95, 0.55, 0.25) * (twilight * dayAmount * 0.35);

          // ---- 访客所在区域的高清图 ----
          // 昼间用 ArcGIS 卫星图，夜间用 GIBS VIIRS 城市灯光图（114 px/度）。
          // 两者按 dayAmount 交叉淡入：白天卫星、夜里灯光、晨昏线平滑过渡。
          // 这样既保证「访客所在地看得清」，夜间也不会出现清晰度断层。
          if (useRegion > 0.5 || useNightRegion > 0.5) {
            // 昼间区域图的局部 UV
            vec2 dayLocal = (vUv - regionUvOffset) / regionUvScale;
            float dayInside = step(0.0, dayLocal.x) * step(dayLocal.x, 1.0)
                            * step(0.0, dayLocal.y) * step(dayLocal.y, 1.0)
                            * useRegion;
            // 夜间灯光区域图的局部 UV（瓦片对齐后的范围可能略大于昼间图）
            vec2 nightLocal = (vUv - nightRegionUvOffset) / nightRegionUvScale;
            float nightInside = step(0.0, nightLocal.x) * step(nightLocal.x, 1.0)
                              * step(0.0, nightLocal.y) * step(nightLocal.y, 1.0)
                              * useNightRegion;

            // 关键：昼图/夜图有【各自的】覆盖范围（夜灯按瓦片对齐，通常略大），
            // 必须各用各的边界和羽化权重，否则会出现「夜灯没叠上去」或
            // 「硬边界方块」。
            vec3 regionDay = texture2D(regionTex, clamp(dayLocal, 0.0, 1.0)).rgb;
            vec3 regionNight = texture2D(nightRegionTex, clamp(nightLocal, 0.0, 1.0)).rgb;

            // 昼图羽化（区域内侧 10% 平滑过渡到整球图）
            vec2 dEdge = min(dayLocal, 1.0 - dayLocal);
            float dFeather = smoothstep(0.0, 0.18, min(dEdge.x, dEdge.y)) * useRegion;
            // 夜灯图羽化（同样处理，独立边界）
            vec2 nEdge = min(nightLocal, 1.0 - nightLocal);
            float nFeather = smoothstep(0.0, 0.18, min(nEdge.x, nEdge.y)) * useNightRegion;

            // 白天的区域色：有昼图用昼图，否则保持整球色
            vec3 dayBase = mix(color, regionDay, dFeather);

            // 夜间的区域色：不能只用灯光图 —— 纯灯光图没有地形细节，
            // 整片会发灰发蓝。做法是「卫星图压暗」当底 + 灯光提亮：
            //   底色 = 卫星图 * 0.30（保留海岸线与地貌层次）
            //   灯光 = 夜灯图 * 2.2（城市亮起）
            // 昼图缺失时底色退回整球色，仍然可读。
            vec3 nightSat = mix(color, regionDay * 0.30, dFeather);
            vec3 nightBase = nightSat + regionNight * 2.2 * nFeather;

            color = mix(nightBase, dayBase, dayAmount);
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
    // 始终创建，贴图后到再补（非核心资源不该阻塞首屏）
    cloudLayer = new THREE.Mesh(
      new THREE.SphereGeometry(RADIUS * 1.015, 64, 64),
      new THREE.MeshLambertMaterial({
        transparent: true,
        opacity: 0.45,
        depthWrite: false,
        visible: !!tex.clouds,
        map: tex.clouds || null,
      }),
    )
    scene.add(cloudLayer)

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

    // --- 画图钉贴图 ---
    // 造型参考 Apple Maps 图钉：圆头有明确的高光与暗边（球体感），
    // 细针上细下粗并带渐变（金属感），底部一个小阴影让它"扎"在地表。
    // 画布用高分辨率（256x384）再缩放到 PIN_SCREEN_H，避免边缘锯齿。
    const pinCanvas = document.createElement('canvas')
    pinCanvas.width = PIN_CANVAS_W
    pinCanvas.height = PIN_CANVAS_H
    const pc = pinCanvas.getContext('2d')!
    const CX = PIN_CANVAS_W / 2
    const BASE_Y = PIN_CANVAS_H - 8 // 针底位置
    const HEAD_R = 46 // 圆头半径
    const HEAD_CY = BASE_Y - 118 // 圆头中心
    const NEEDLE_TOP = HEAD_CY + HEAD_R * 0.55 // 针顶端（接入圆头）
    const NEEDLE_HALF_BOTTOM = 15 // 针底半宽
    const NEEDLE_HALF_TOP = 5 // 针顶半宽

    // 底部阴影（小而收敛，不要摊一大片）
    pc.fillStyle = 'rgba(0,0,0,0.28)'
    pc.beginPath()
    pc.ellipse(CX, BASE_Y + 3, 22, 6, 0, 0, Math.PI * 2)
    pc.fill()

    // 细针：上细下粗的锥形，暗红 → 亮红渐变（受光感）
    const needleGrad = pc.createLinearGradient(0, BASE_Y, 0, NEEDLE_TOP)
    needleGrad.addColorStop(0, '#8e1b1b')
    needleGrad.addColorStop(1, '#d63c2f')
    pc.fillStyle = needleGrad
    pc.beginPath()
    pc.moveTo(CX - NEEDLE_HALF_TOP, NEEDLE_TOP)
    pc.lineTo(CX - NEEDLE_HALF_BOTTOM, BASE_Y)
    pc.lineTo(CX + NEEDLE_HALF_BOTTOM, BASE_Y)
    pc.lineTo(CX + NEEDLE_HALF_TOP, NEEDLE_TOP)
    pc.closePath()
    pc.fill()

    // 圆头：主体径向渐变（左上受光 → 右下暗部，做出球体感）
    const headGrad = pc.createRadialGradient(
      CX - HEAD_R * 0.35, HEAD_CY - HEAD_R * 0.4, HEAD_R * 0.15,
      CX, HEAD_CY, HEAD_R,
    )
    headGrad.addColorStop(0, '#ff7a6b')
    headGrad.addColorStop(0.45, '#e8453c')
    headGrad.addColorStop(1, '#a3201a')
    pc.fillStyle = headGrad
    pc.beginPath()
    pc.arc(CX, HEAD_CY, HEAD_R, 0, Math.PI * 2)
    pc.fill()

    // 圆头高光（小而集中，像玻璃珠）
    pc.fillStyle = 'rgba(255,255,255,0.55)'
    pc.beginPath()
    pc.ellipse(CX - HEAD_R * 0.34, HEAD_CY - HEAD_R * 0.42, HEAD_R * 0.22, HEAD_R * 0.15, -0.5, 0, Math.PI * 2)
    pc.fill()

    // 圆头底部一点环境光反射，增强立体感
    pc.fillStyle = 'rgba(255,180,150,0.25)'
    pc.beginPath()
    pc.arc(CX, HEAD_CY + HEAD_R * 0.45, HEAD_R * 0.55, 0.15 * Math.PI, 0.85 * Math.PI)
    pc.fill()

    const pinTex = new THREE.CanvasTexture(pinCanvas)
    const pinSprite = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: pinTex,
        transparent: true,
        depthTest: true, // 转到地球背面时被自身遮挡，自然消失
      }),
    )
    // 尺寸不在这里设死，交给 tick 每帧按「屏幕像素恒定」刷新，
    // 否则高分屏（DPR=2）下物理尺寸会翻倍，相机距离一变大小也漂。
    pinRoot.add(pinSprite)
    pinSpriteRef = {
      sprite: pinSprite,
      canvasW: PIN_CANVAS_W,
      canvasH: PIN_CANVAS_H,
    }

    // 注：不再额外放地表阴影圈和脉冲光环。图钉贴图自带底部阴影，
    // 再叠一个黑色圆盘会显脏；脉冲光环在聚焦到这个尺度后也显得多余。

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
      // 宽高比变了要重算目标距离，否则窗口变化后可见范围会漂
      if (geoReady) {
        targetCameraZ = cameraDistanceForLonSpan(TARGET_LON_SPAN, (45 * Math.PI) / 180, nw / nh)
      }
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

      // 图钉尺寸：按屏幕像素恒定，与相机距离 / DPR / 画布大小无关。
      // 世界单位 → 屏幕像素的换算：
      //   屏幕高 H_px 对应的世界高度 = 2 * d * tan(fov/2)
      //   （d 为相机到地心的距离，fov 为垂直张角）
      if (pinSpriteRef) {
        const d = camera.position.length()
        const worldH = 2 * d * Math.tan((camera.fov * Math.PI) / 360)
        // camera.fov 是垂直张角；drawingBufferHeight 是物理像素，
        // 而 PIN_SCREEN_H 想要的是 CSS 像素，所以除以 pixelRatio。
        const cssH = wrap.clientHeight || window.innerHeight
        const perPixel = worldH / cssH
        const h = PIN_SCREEN_H * perPixel
        const w = h * (pinSpriteRef.canvasW / pinSpriteRef.canvasH)
        pinSpriteRef.sprite.scale.set(w, h, 1)
        // 针底对齐地表：three.js 纹理 v 轴以画布底部为 0，
        // 故 v_base = (canvasH - needleBaseY) / canvasH，
        // 需把精灵上移 (0.5 - v_base) * h 让针底正好落在 y=0
        const vBase = (pinSpriteRef.canvasH - PIN_NEEDLE_BASE_Y) / pinSpriteRef.canvasH
        pinSpriteRef.sprite.position.y = (0.5 - vBase) * h
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

      // 视差：相机随鼠标轻微位移（不影响聚焦）。
      // 幅度必须按「屏幕上多少像素」来定，不能靠拍脑袋。
      // 在 d≈1.14 的缩放下，1 世界单位 ≈ 1340 屏幕像素，
      // 原来的 0.08 振幅 = 单边 107px 位移，鼠标一动地图就大幅晃动。
      // PARALLAX_AMP = 0.018 -> 单边约 24px，是"轻微跟随"的量级。
      camera.position.x += (mouse.x * PARALLAX_AMP - camera.position.x) * 0.03
      camera.position.y += (-mouse.y * PARALLAX_AMP - camera.position.y) * 0.03
      camera.lookAt(0, 0, 0)

      renderer.render(scene, camera)
      frameId = requestAnimationFrame(tick)
    }
    tick()

    // ===== 非核心贴图：场景已跑起来后异步补，不阻塞首屏 =====
    // 夜灯（决定夜间观感）/ 云 / 法线 / 镜面，哪张先到就先挂上。
    loadOptionalTextures(THREE).then((opt) => {
      if (disposed) return
      if (opt.night) {
        ;(earthMat.uniforms.nightTex as any).value = opt.night
      }
      if (opt.normal) {
        ;(earthMat.uniforms.normalTex as any).value = opt.normal
        ;(earthMat.uniforms.useNormal as any).value = 1
      }
      if (opt.specular) {
        ;(earthMat.uniforms.specTex as any).value = opt.specular
        ;(earthMat.uniforms.useSpec as any).value = 1
      }
      if (opt.clouds && cloudLayer) {
        ;(cloudLayer.material as any).map = opt.clouds
        ;(cloudLayer.material as any).needsUpdate = true
        ;(cloudLayer.material as any).visible = true
        cloudLayer.visible = true
      }
    }).catch(() => {
      /* 非核心资源失败不影响已渲染的地球 */
    })

    ;(wrap as any)._cleanup = () => {
      cancelAnimationFrame(frameId)
      window.removeEventListener('resize', resize)
      wrap.removeEventListener('pointerdown', onDown)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      // 关键：renderer.dispose() 只释放 GPU 资源，**不会释放 WebGL 上下文**。
      // 浏览器对同时存活的上下文有硬上限（通常 16 个），一旦泄漏累积到上限，
      // 后续所有 getContext 都返回 null —— 表现就是「WebGL 突然不可用」，
      // 且刷新页面也不一定恢复（同一个标签页内配额是共享的）。
      // forceContextLoss() 才是真正让上下文失效并归还配额的方法。
      try {
        renderer?.forceContextLoss?.()
      } catch {
        /* 上下文可能已丢失，忽略 */
      }
      renderer?.dispose?.()
      renderer = null
    }
  }

  boot().catch((e) => {
    console.error('[EarthGlobe] init failed, fallback:', e)
    fallbackReason.value = 'load-failed'
    fallbackDetail.value = '初始化异常：' + (e?.message || String(e))
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

  // 降级说明：默认半透明低调展示，鼠标悬停或移动端长按时可读。
  // 目的是让用户知道「这不是坏了，是降级了」以及该怎么办。
  &__note {
    position: absolute;
    left: 50%;
    bottom: 40px;
    transform: translateX(-50%);
    max-width: min(680px, 88vw);
    padding: 14px 20px;
    border-radius: 12px;
    background: rgba(8, 12, 24, 0.72);
    border: 1px solid rgba(255, 255, 255, 0.12);
    backdrop-filter: blur(8px);
    color: rgba(255, 255, 255, 0.86);
    font-size: 13px;
    line-height: 1.6;
    text-align: center;
    user-select: text;
    animation: none; // 父级有 breathe 动画，这里保持静止以便阅读
  }
  &__title {
    font-size: 14px;
    font-weight: 600;
    color: #ffd8a8;
    margin-bottom: 4px;
  }
  &__reason {
    color: #ffb4a8;
    word-break: break-all;
  }
  &__hint {
    margin-top: 6px;
    color: rgba(255, 255, 255, 0.55);
    font-size: 12px;
  }
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
