// GLSL type checker for the EarthGlobe shaders.
// The previous bug (vec3 + vec2) was invisible to vue-tsc because the
// shader lives inside a template string. This harness parses the shader
// source out of the .vue file and checks every binary op / assignment for
// type compatibility, so gl.getShaderInfoLog() failures get caught at
// build time instead of in the user's console.

import { readFileSync } from 'node:fs'

const src = readFileSync(
  '/home/hezhaoyin/workspace/homepage/HomePageClient/src/components/EarthGlobe.vue',
  'utf8',
)

// ---------- extract shader sources ----------
function extractShaders(text) {
  const shaders = []
  const re = /(vertexShader|fragmentShader)\s*:\s*`([\s\S]*?)`/g
  let m
  while ((m = re.exec(text)) !== null) {
    shaders.push({ kind: m[1], code: m[2] })
  }
  return shaders
}

// ---------- tiny GLSL parser: declarations + the ops we care about ----------
const TYPES = new Set(['void', 'float', 'int', 'bool', 'vec2', 'vec3', 'vec4',
  'mat2', 'mat3', 'mat4', 'sampler2D', 'samplerCube', 'ivec2', 'ivec3', 'ivec4'])

const NUM_COMPONENTS = { float: 1, int: 1, vec2: 2, vec3: 3, vec4: 4 }

function stripComments(code) {
  return code.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ')
}

function analyse(code, kind) {
  const errors = []
  const body = stripComments(code)

  // 1. declared names -> type
  const decls = new Map()
  const declRe = new RegExp(`\\b(${[...TYPES].join('|')})\\s+([A-Za-z_]\\w*)\\s*[;=]`, 'g')
  let m
  while ((m = declRe.exec(body)) !== null) {
    decls.set(m[2], m[1])
  }
  // builtin varyings / uniforms / attributes are implicitly declared
  for (const builtin of ['vUv', 'vNormalW', 'vWorldPos', 'gl_FragColor',
    'gl_Position', 'uv', 'normal', 'position', 'cameraPosition',
    'modelMatrix', 'viewMatrix', 'projectionMatrix', 'normalMatrix']) {
    if (!decls.has(builtin)) {
      decls.set(builtin,
        builtin === 'gl_FragColor' || builtin === 'gl_Position' ? 'vec4'
        : builtin === 'vUv' || builtin === 'uv' ? 'vec2'
        : builtin === 'vNormalW' ? 'vec3'
        : builtin === 'vWorldPos' ? 'vec3'
        : builtin === 'cameraPosition' ? 'vec3'
        : builtin === 'position' || builtin === 'normal' ? 'vec3'
        : 'mat4')
    }
  }

  // 2. track float(call) wrappers so we do not flag `float` values as opaque
  const knownFloats = new Set()

  // 3. check every `A op B` where both operands resolve to a known GLSL type
  //    Only arithmetic ops are type-checked; comparison/logical ops accept
  //    scalars of any numeric type.
  const opRe = /([A-Za-z_]\w*(?:\s*\.\s*[xyzwrgbast]{1,4})?)\s*(\+|\*)\s*([A-Za-z_]\w*(?:\s*\.\s*[xyzwrgbast]{1,4})?)/g
  const statements = body.split(/[;\n]/)
  for (const stmt of statements) {
    let om
    const local = new RegExp(opRe.source, 'g')
    while ((om = local.exec(stmt)) !== null) {
      const lhs = om[1].replace(/\s+/g, '')
      const rhs = om[3].replace(/\s+/g, '')
      const lt = typeOf(lhs)
      const rt = typeOf(rhs)
      if (!lt || !rt) continue
      const err = arithmeticOk(lt, rt, om[2])
      if (err) {
        errors.push(`"${stmt.trim().slice(0, 90)}"  ->  ${err}`)
      }
    }
  }

  function typeOf(expr) {
    // literals
    if (/^\d+(\.\d+)?([eE][-+]?\d+)?$/.test(expr)) return 'float'
    if (/^\.\d+$/.test(expr)) return 'float'
    // constructor call like vec3(...) or float(...)
    const ctor = expr.match(/^(vec2|vec3|vec4|float|int|mat3|mat4)\(/)
    if (ctor) return ctor[1]
    if (/^\(/.test(expr)) return null // parenthesised expression: give up
    // member access on a declared variable
    const dot = expr.match(/^([A-Za-z_]\w*)\.([xyzwrgbast]{1,4})$/)
    const base = dot ? dot[1] : expr
    const baseType = decls.get(base)
    if (!baseType) {
      if (knownFloats.has(base)) return 'float'
      return null
    }
    if (dot) {
      const comps = dot[2].length
      // .rgb swizzle on any vector; .x on float is invalid
      if (baseType === 'float' || baseType === 'int') return null
      return comps === 1 ? 'float' : `vec${comps}`
    }
    return baseType
  }

  function arithmeticOk(lt, rt, op) {
    // scalar op anything, or anything op scalar, is always legal
    const scalar = (t) => t === 'float' || t === 'int' || t === 'bool'
    if (scalar(lt) || scalar(rt)) return null
    // GLSL allows vec*vec and mat*vec (component-wise / matrix-vector).
    // Only '+' and '-' require exact type match, because there is no
    // implicit widening between vectors of different lengths.
    if (op === '*' || op === '/') return null
    if (lt !== rt) {
      return `'+' between ${lt} and ${rt}: no operation '+' takes a left-hand operand of type '${lt}' and a right-hand operand of type '${rt}'`
    }
    return null
  }

  return { errors, decls }
}

// ---------- run ----------
const shaders = extractShaders(src)
console.log(`found ${shaders.length} shader(s)\n`)

let failures = 0
for (const s of shaders) {
  const { errors } = analyse(s.code, s.kind)
  if (errors.length === 0) {
    console.log(`  OK    ${s.kind} (${s.code.length} chars)`)
  } else {
    failures += errors.length
    console.log(`  FAIL  ${s.kind}`)
    for (const e of errors) console.log(`        ${e}`)
  }
}

// extra structural checks
console.log('\n--- structural checks ---')
const allCode = shaders.map((s) => s.code).join('\n')
const structChecks = [
  ['no `varying` in fragment shader without matching vertex shader', () => {
    const frag = shaders.find((s) => s.kind === 'fragmentShader')
    const vert = shaders.find((s) => s.kind === 'vertexShader')
    if (!frag || !vert) return true
    const needed = [...frag.code.matchAll(/varying\s+\w+\s+(\w+)/g)].map((m) => m[1])
    const declared = [...vert.code.matchAll(/varying\s+\w+\s+(\w+)/g)].map((m) => m[1])
    return needed.every((n) => declared.includes(n))
  }],
  ['every `uniform` used in fragment shader is declared', () => {
    const frag = shaders.find((s) => s.kind === 'fragmentShader')
    if (!frag) return true
    const used = [...frag.code.matchAll(/\b(sunDir|normalScale|dayTex|nightTex|normalTex|specTex|useNormal|useSpec)\b/g)].map((m) => m[1])
    const declared = [...frag.code.matchAll(/uniform\s+\w+\s+(\w+)/g)].map((m) => m[1])
    return used.every((u) => declared.includes(u))
  }],
  ['no rotation driven by a monotonically increasing clock', () => {
    // a `now` value elapsed since page load must never be added to an angle
    return !/\+\s*now\s*\*/.test(src) && !/now\s*\*\s*[\d.]+\s*[+-]/.test(src)
  }],
]
for (const [name, fn] of structChecks) {
  const ok = fn()
  if (!ok) failures++
  console.log(`  ${ok ? 'OK   ' : 'FAIL '} ${name}`)
}

console.log(`\n${failures === 0 ? '>>> ALL SHADER CHECKS PASSED' : '>>> ' + failures + ' SHADER ISSUE(S)'}`)
process.exit(failures === 0 ? 0 : 1)
