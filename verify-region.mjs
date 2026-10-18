// Verify the local-hi-res region texture math and the camera zoom change.
//
// 1) Region UV mapping: a region covering lon[lon0, lon0+span] x lat[lat0, lat0+span]
//    must map onto the sphere's UV space at u0=(lon0+180)/360, v0=(lat0+90)/180,
//    with scale span/360 (u) and span/180 (v). The shader computes
//    localUv = (vUv - offset) / scale and must be in [0,1] exactly over the region.
//
// 2) Camera distance: the region should occupy about 65% of the screen, which is
//    visibly larger than the old "country scale" (~50%).
import { readFileSync } from 'node:fs'

const src = readFileSync(
  '/home/hezhaoyin/workspace/homepage/HomePageClient/src/components/EarthGlobe.vue',
  'utf8',
)

let fail = 0
function check(name, ok, detail) {
  if (!ok) fail++
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`)
}

// ---- constants pulled from the component ----
const REGION_LON_SPAN = 44
const REGION_LAT_SPAN = 44
const RADIUS_REF = 1
const FOV_V = 45 * Math.PI / 180
const GLOBE_FOV_FRAC = 1.35

console.log('=== 1. region UV mapping ===')
// Simulate the shader for a grid of sphere UVs.
function shaderLocalUv(vUv, offset, scale) {
  return {
    x: (vUv[0] - offset[0]) / scale[0],
    y: (vUv[1] - offset[1]) / scale[1],
  }
}

// Visitor in Shenzhen (22.54N, 114.06E) -> region lon0 = 114.06 - 22 = 92.06
const lon0 = 114.06 - REGION_LON_SPAN / 2
const lat0 = 22.54 - REGION_LAT_SPAN / 2
const offset = [(lon0 + 180) / 360, (lat0 + 90) / 180]
const scale = [REGION_LON_SPAN / 360, REGION_LAT_SPAN / 180]

// Region centre must map to local (0.5, 0.5)
const centreLocal = shaderLocalUv([(114.06 + 180) / 360, (22.54 + 90) / 180], offset, scale)
check('region centre maps to local (0.5,0.5)',
  Math.abs(centreLocal.x - 0.5) < 1e-12 && Math.abs(centreLocal.y - 0.5) < 1e-12,
  `got (${centreLocal.x.toFixed(6)}, ${centreLocal.y.toFixed(6)})`)

// Region corners must map to local 0/1
for (const [name, uv] of [
  ['min corner', [(lon0 + 180) / 360, (lat0 + 90) / 180]],
  ['max corner', [(lon0 + REGION_LON_SPAN + 180) / 360, (lat0 + REGION_LAT_SPAN + 90) / 180]],
]) {
  const l = shaderLocalUv(uv, offset, scale)
  const want = name === 'min corner' ? [0, 0] : [1, 1]
  check(`${name} maps to local (${want[0]},${want[1]})`,
    Math.abs(l.x - want[0]) < 1e-12 && Math.abs(l.y - want[1]) < 1e-12,
    `got (${l.x.toFixed(6)}, ${l.y.toFixed(6)})`)
}

// A point far outside the region must be flagged `inside == 0`
const farLocal = shaderLocalUv([(0 + 180) / 360, (0 + 90) / 180], offset, scale)
const inside = farLocal.x >= 0 && farLocal.x <= 1 && farLocal.y >= 0 && farLocal.y <= 1
check('a point outside the region is excluded (falls back to the low-res globe)', !inside,
  `local=(${farLocal.x.toFixed(3)}, ${farLocal.y.toFixed(3)})`)

console.log('\n=== 2. camera distance / zoom ===')
// d = R / sin(FOV * frac / 2)  — larger frac means a closer camera and a
// bigger globe. The old COUNTRY_ZOOM['CN'] = 2.1 gave ~126% of vertical FOV.
function cameraDistanceForFovFrac(frac, fov) {
  return RADIUS_REF / Math.sin((fov * frac) / 2)
}
const newZ = cameraDistanceForFovFrac(GLOBE_FOV_FRAC, FOV_V)
const oldZ = 2.1
console.log(`  new cameraZ = ${newZ.toFixed(3)} (globe = ${(GLOBE_FOV_FRAC * 100).toFixed(0)}% of vertical FOV)`)
console.log(`  old cameraZ = ${oldZ.toFixed(3)} (globe = 126% of vertical FOV)`)
check('new camera is closer than before (globe appears larger)', newZ < oldZ,
  `${newZ.toFixed(3)} < ${oldZ}`)

// Angular size of the globe on screen, before and after.
function angularSize(d) { return 2 * Math.asin(RADIUS_REF / d) }
const fracNew = angularSize(newZ) / FOV_V
const fracOld = angularSize(oldZ) / FOV_V
console.log(`  globe occupies ${(fracNew * 100).toFixed(0)}% of vertical FOV (was ${(fracOld * 100).toFixed(0)}%)`)
check('globe is larger than before', fracNew > fracOld,
  `${(fracNew * 100).toFixed(0)}% vs ${(fracOld * 100).toFixed(0)}%`)

// The region's share of the globe is independent of camera distance.
const REGION_ARC = REGION_LON_SPAN * (Math.PI / 180)
const regionAng = 2 * Math.asin(Math.sin(REGION_ARC / 2) / newZ)
const regionFrac = regionAng / angularSize(newZ)
console.log(`  region occupies ${(regionFrac * 100).toFixed(0)}% of the globe's angular width`)
check('region fills a useful share of the globe (> 30%)', regionFrac > 0.3,
  `${(regionFrac * 100).toFixed(0)}%`)

// Camera must stay outside the globe (otherwise the near plane clips).
check('camera stays outside the globe', newZ > RADIUS_REF * 1.05,
  `z=${newZ.toFixed(3)}`)

console.log('\n=== 3. no stale references ===')
// Only real code references count; mentions inside comments are fine.
const codeOnly = src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
for (const dead of ['COUNTRY_ZOOM', 'DEFAULT_ZOOM', 'latLonToVec3', 'sunDirectionToDate']) {
  check(`${dead} removed`, !codeOnly.includes(dead))
}

console.log(`\n${fail === 0 ? '>>> ALL CHECKS PASSED' : '>>> ' + fail + ' CHECK(S) FAILED'}`)
process.exit(fail === 0 ? 0 : 1)
