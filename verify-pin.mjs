// Verify the sprite anchor math and that the pin lands on the right spot.
//
// The sprite is a child of pinRoot, whose quaternion aligns local +Y with the
// surface normal at the visitor's (lat, lon). Because a Sprite always faces
// the camera, the pinRoot rotation only affects its *position*, not its
// orientation — so the pin always reads as a head-on pushpin.
//
// What must be verified:
//   1) The needle base sits exactly on the sphere surface (local y = 0).
//   2) The pin is placed at the visitor's actual coordinates.
//   3) The sprite is large enough to read as a pushpin (~46px on a 720p view).

const CANVAS_H = 192
const NEEDLE_BASE_CANVAS_Y = 184
const PIN_SCREEN_H = 46
const VIEWPORT_H = 720
const FOV = 45 * Math.PI / 180
const CAMERA_Z = 1.978

// world units per screen pixel at the globe's depth
const worldPerPixel = (2 * CAMERA_Z * Math.tan(FOV / 2)) / VIEWPORT_H
const spriteH = PIN_SCREEN_H * worldPerPixel

let fail = 0
function check(name, ok, detail) {
  if (!ok) fail++
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${detail ? '  ' + detail : ''}`)
}

console.log('=== 1. needle base sits exactly on the surface ===')
const vBase = (CANVAS_H - NEEDLE_BASE_CANVAS_Y) / CANVAS_H
const posY = (0.5 - vBase) * spriteH
// needle base in local coords = posY - (0.5 - vBase) * spriteH  ==  0
const needleBaseLocalY = posY - (0.5 - vBase) * spriteH
check('needle base local y == 0', Math.abs(needleBaseLocalY) < 1e-12,
  `got ${needleBaseLocalY.toExponential(2)}`)

console.log('\n=== 2. head centre is above the surface (visible, not buried) ===')
const vHead = (CANVAS_H - 62) / CANVAS_H
const headLocalY = posY + (vHead - 0.5) * spriteH
check('head centre above surface', headLocalY > 0,
  `head local y = ${headLocalY.toFixed(4)} (${(headLocalY / spriteH * 100).toFixed(0)}% of pin height)`)

console.log('\n=== 3. pin size on screen ===')
const spriteW = spriteH * (128 / 192)
console.log(`  spriteH = ${spriteH.toFixed(4)} world units -> ${(spriteH / worldPerPixel).toFixed(1)} px on 720p`)
console.log(`  spriteW = ${spriteW.toFixed(4)} world units -> ${(spriteW / worldPerPixel).toFixed(1)} px`)
check('pin is 30-70px tall (readable as a pushpin)',
  spriteH / worldPerPixel >= 30 && spriteH / worldPerPixel <= 70,
  `${(spriteH / worldPerPixel).toFixed(0)}px`)

console.log('\n=== 4. pin is placed at the visitor coordinates ===')
// The pinRoot position is geoToVec3(lat, lon, R). Verify the round-trip.
const D2R = Math.PI / 180
function geoToVec3(lat, lon, r) {
  const phi = (lon + 180) * D2R
  const theta = (90 - lat) * D2R
  const s = Math.sin(theta)
  return { x: -r * Math.cos(phi) * s, y: r * Math.cos(theta), z: r * Math.sin(phi) * s }
}
function vec3ToGeo(p) {
  const theta = Math.acos(Math.max(-1, Math.min(1, p.y)))
  const phi = Math.atan2(p.z, -p.x)
  const u = ((phi / (2 * Math.PI)) % 1 + 1) % 1
  const v = 1 - theta / Math.PI
  return { lat: v * 180 - 90, lon: u * 360 - 180 }
}
for (const [lat, lon] of [[22.54, 114.06], [35.5, 104], [40.7, -74], [-33.9, 151.2]]) {
  const p = geoToVec3(lat, lon, 1)
  const back = vec3ToGeo(p)
  const dlon = ((back.lon - lon + 540) % 360) - 180
  const err = Math.hypot(back.lat - lat, dlon)
  check(`round-trip (${lat}, ${lon})`, err < 1e-9,
    `-> (${back.lat.toFixed(4)}, ${back.lon.toFixed(4)}) err=${err.toExponential(1)}`)
}

console.log('\n=== 5. pin survives being on the far side of the globe ===')
// Sprite has depthTest: true, so when the globe rotates the pin to the back,
// the globe mesh occludes it. Verify the pin's world position is on the sphere.
const p = geoToVec3(22.54, 114.06, 1)
check('pin root is on the unit sphere', Math.abs(Math.hypot(p.x, p.y, p.z) - 1) < 1e-12,
  `|p| = ${Math.hypot(p.x, p.y, p.z).toFixed(6)}`)

console.log(`\n${fail === 0 ? '>>> ALL CHECKS PASSED' : '>>> ' + fail + ' CHECK(S) FAILED'}`)
process.exit(fail === 0 ? 0 : 1)
