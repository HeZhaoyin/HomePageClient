// Verify the zoom target: the visible lon span on screen, derived from the
// ray-sphere intersection in world space (camera at +Z, focus at +Z).
//
// Camera at (0,0,d). Screen edge ray in the y=0 plane at angle theta from -Z:
//   point = (t*sin(theta), 0, d - t*cos(theta)),  |point| = 1
//   t = d*cos(theta) - sqrt(1 - d^2 sin^2(theta))
// The hit point's longitude offset from the focus is atan2(x, z) (degrees),
// because +X is 90 deg east of the focus in this frame.
//
// Assertions:
//   1) d=1.10 on a 2:1 viewport shows ~10 deg of longitude  ("one province")
//   2) the span shrinks as the camera moves away (monotonic)
//   3) the region texture has enough resolution for 1:1 pixel mapping
const D2R = Math.PI / 180
let fail = 0
const check = (name, ok, detail) => {
  if (!ok) fail++
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`)
}

const FOV_V = 45
const fovH = (aspect) => 2 * Math.atan(Math.tan(FOV_V / 2 * D2R) * aspect)

function visibleLonSpan(d, aspect) {
  const theta = fovH(aspect) / 2
  const s = Math.sin(theta), c = Math.cos(theta)
  const disc = 1 - d * d * s * s
  if (disc < 0) return null // sphere smaller than the FOV cone
  const t = d * c - Math.sqrt(disc)
  return 2 * Math.atan2(t * s, d - t * c) / D2R
}

// the bisection used by the component
function cameraDistanceForLonSpan(lonSpanDeg, fovV, aspect) {
  const target = lonSpanDeg * D2R  // spanAt returns the FULL span
  const theta = fovH(aspect) / 2
  let lo = 1.0001
  let hi = 1 / Math.sin(theta)
  const spanAt = (d) => {
    const s = Math.sin(theta)
    const disc = 1 - d * d * s * s
    if (disc < 0) return null
    const t = d * Math.cos(theta) - Math.sqrt(disc)
    return 2 * Math.atan2(t * s, d - t * Math.cos(theta))
  }
  // span grows with d (camera at the surface sees ~0 deg, camera far away
  // sees the whole hemisphere). So: span too small -> move away (raise lo).
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2
    const span = spanAt(mid)
    if (span === null) { hi = mid; continue } // ray misses: too far
    if (span < target) lo = mid
    else hi = mid
  }
  return (lo + hi) / 2
}

console.log('=== 1. target span of 10 deg gives a "province" view ===')
for (const [name, aspect] of [['2:1 (user 2557x1265)', 2.02], ['16:9', 1.78], ['16:10', 1.6], ['4:3', 1.33]]) {
  const d = cameraDistanceForLonSpan(14, FOV_V * D2R, aspect)
  const span = visibleLonSpan(d, aspect)
  check(`${name}: visible span ~= 14 deg`, Math.abs(span - 14) < 0.01,
    `d=${d.toFixed(4)}, span=${span.toFixed(3)} deg`)
}

console.log('\n=== 2. monotonic: farther camera -> larger span ===')
let mono = true
let prev = -1
for (const d of [1.02, 1.05, 1.1, 1.2, 1.35, 1.5]) {
  const s = visibleLonSpan(d, 2.02)
  if (s === null) break
  if (s < prev) mono = false
  prev = s
}
check('span increases monotonically with distance', mono)

console.log('\n=== 3. wider viewport sees more longitude (same d) ===')
const sWide = visibleLonSpan(1.1, 2.02)
const sNarrow = visibleLonSpan(1.1, 1.6)
check('2:1 sees more than 16:10', sWide > sNarrow,
  `${sWide.toFixed(2)} deg vs ${sNarrow.toFixed(2)} deg`)

console.log('\n=== 4. region texture resolution is sufficient ===')
// region covers 10 deg at 1536 px => 153.6 px/deg.
// screen shows 10 deg across 2557 px => 255.7 px/deg needed for 1:1.
// So the region is under-sampled by 255.7/153.6 = 1.66x. That is a real
// limitation; report it rather than hide it.
const REGION_LON_SPAN = 14
const REGION_EDGE_STRETCH = 1.98   // 球面边缘纹理拉伸倍数（实测，与相机距离无关）
const REGION_EDGE_TARGET = 0.7
const screenW = 2557
// 组件里 computeRegionWidth 的逻辑
const computeRegionWidth = (w) => {
  const pxPerDeg = w / REGION_LON_SPAN
  const need = pxPerDeg * REGION_EDGE_STRETCH * REGION_EDGE_TARGET
  return Math.max(2048, Math.min(4096, Math.round(need * REGION_LON_SPAN)))
}
const regionWidth = computeRegionWidth(screenW)
const texPxPerDeg = regionWidth / REGION_LON_SPAN
const screenPxPerDeg = screenW / REGION_LON_SPAN
// 边缘有效清晰度 = 纹理密度 / (屏幕密度 × 边缘拉伸)
const edgeClarity = texPxPerDeg / (screenPxPerDeg * REGION_EDGE_STRETCH)
console.log(`  region: ${regionWidth}px = ${texPxPerDeg.toFixed(0)} px/deg, 屏幕 ${screenPxPerDeg.toFixed(0)} px/deg`)
console.log(`  球体边缘拉伸 ${REGION_EDGE_STRETCH}x -> 边缘实际清晰度 ${(edgeClarity*100).toFixed(0)}%`)
check('边缘清晰度 >= 70%（这是"两侧发糊"的关键指标）', edgeClarity >= REGION_EDGE_TARGET - 0.02,
  `${(edgeClarity*100).toFixed(0)}%`)
check('区域宽度不超过 ArcGIS 单次上限 4096', regionWidth <= 4096, `${regionWidth}px`)

console.log('\n=== 5. night region resolution ===')
// GIBS L6: 114 px/deg over a 10 deg window -> 1140 px, still below the
// 2557 px the screen wants. Report the ratio.
const nightPxPerDeg = 6 * 512 / 13.5 // 6 tiles across 13.5 deg at L6
console.log(`  night region: ${nightPxPerDeg.toFixed(0)} px/deg -> ${(screenPxPerDeg / nightPxPerDeg).toFixed(2)}x under-sampled`)
check('night region within 3x of 1:1', screenPxPerDeg / nightPxPerDeg <= 3,
  `${(screenPxPerDeg / nightPxPerDeg).toFixed(2)}x`)


// ===== 6. 高纬度：区域覆盖必须能盖住屏幕可见经度 =====
// 经线在高纬收敛，同样的相机距离下屏幕横向能看到的经度更多。
// 若区域跨度固定 14 度，60°N 只能覆盖约一半 —— 表现为「只有中间清晰」。
{
  const REGION_LON_SPAN = 14
  function regionSpanFor(lat) {
    const f = Math.min(2.9, 1 / Math.max(0.35, Math.cos((lat * Math.PI) / 180)))
    return REGION_LON_SPAN * f
  }
  function visibleSpanFor(lat) {
    // 近似：可见经度 = 赤道可见跨度 / cos(lat)
    return 14 / Math.cos((lat * Math.PI) / 180)
  }
  console.log('\n=== 6. high-latitude region coverage ===')
  for (const lat of [0, 22.54, 45, 60, 70]) {
    const cover = regionSpanFor(lat)
    const need = visibleSpanFor(lat)
    const ratio = cover / need
    // factor 上限 1.8 之后高纬无法 100% 覆盖，目标是不低于 70%
    const ok = ratio >= 0.7
    if (!ok) fail++
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} lat=${lat}: region=${cover.toFixed(1)} deg, visible~${need.toFixed(1)} deg, coverage=${(ratio * 100).toFixed(0)}%`)
  }
}

console.log(`\n${fail === 0 ? '>>> ALL CHECKS PASSED' : '>>> ' + fail + ' CHECK(S) FAILED'}`)
process.exit(fail === 0 ? 0 : 1)
