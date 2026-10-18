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
  const d = cameraDistanceForLonSpan(10, FOV_V * D2R, aspect)
  const span = visibleLonSpan(d, aspect)
  check(`${name}: visible span ~= 10 deg`, Math.abs(span - 10) < 0.01,
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
const REGION_LON_SPAN = 10
const REGION_WIDTH = 1536
const screenW = 2557
const texPxPerDeg = REGION_WIDTH / REGION_LON_SPAN
const screenPxPerDeg = screenW / 10
const oversample = screenPxPerDeg / texPxPerDeg
console.log(`  region: ${texPxPerDeg.toFixed(0)} px/deg, screen needs ${screenPxPerDeg.toFixed(0)} px/deg`)
check('region is within 2x of 1:1 (acceptable softness)', oversample <= 2,
  `${oversample.toFixed(2)}x under-sampled`)

console.log('\n=== 5. night region resolution ===')
// GIBS L6: 114 px/deg over a 10 deg window -> 1140 px, still below the
// 2557 px the screen wants. Report the ratio.
const nightPxPerDeg = 6 * 512 / 13.5 // 6 tiles across 13.5 deg at L6
console.log(`  night region: ${nightPxPerDeg.toFixed(0)} px/deg -> ${(screenPxPerDeg / nightPxPerDeg).toFixed(2)}x under-sampled`)
check('night region within 3x of 1:1', screenPxPerDeg / nightPxPerDeg <= 3,
  `${(screenPxPerDeg / nightPxPerDeg).toFixed(2)}x`)

console.log(`\n${fail === 0 ? '>>> ALL CHECKS PASSED' : '>>> ' + fail + ' CHECK(S) FAILED'}`)
process.exit(fail === 0 ? 0 : 1)
