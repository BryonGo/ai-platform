#!/usr/bin/env node
// 前端索引生成器：把 app/ 下的「导出符号 / 组合式函数方法 / 组件契约 / 页面路由 / 类型字段」
// 抽成给 AI 读的索引文档，避免每次改动都让模型把 useChatStudio.ts(68KB)、useHougongApi.ts(53KB)
// 这些大文件整份读一遍。
//
// 设计要点：
//   1. 索引内容**从源码生成**——符号名、签名、行号、以及函数上方那行中文注释都来自代码本身，
//      所以只要注释跟着函数一起改，索引就不会说谎；不存在「手工维护的清单慢慢过期」。
//   2. 语义（每个文件干什么、链路怎么走、改哪里要同步什么）写在 docs/FRONTEND-INDEX.md 的手写区，
//      生成器只替换 <!-- BEGIN GENERATED --> 与 <!-- END GENERATED --> 之间的内容，手写区永不被动。
//   3. --check 用于校验索引是否过期；--grep / --file 用于只取需要的一小段（省 token 的正经用法）。
//
// 用法：
//   node scripts/gen-frontend-index.mjs             # 重新生成（写盘）
//   node scripts/gen-frontend-index.mjs --check      # 只校验，过期则退出码 1
//   node scripts/gen-frontend-index.mjs --grep 导出   # 只打印匹配的索引行
//   node scripts/gen-frontend-index.mjs --file app/composables/useHougongApi.ts
//   node scripts/gen-frontend-index.mjs --stdout     # 打到标准输出，不写盘
//
// 解析是正则 + 花括号配平的启发式实现，不是完整 TS 解析器：它只负责「找出符号与大致签名」。
// 少数写法（注释里带花括号、一行里塞多个声明）可能抽不准，此时以源码为准，并把它改写成常见写法。

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join, relative, basename, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const APP = join(ROOT, 'app')
const HUB = join(ROOT, 'docs/FRONTEND-INDEX.md')
const OUT_DIR = join(ROOT, 'docs/frontend-index')

const ARGS = process.argv.slice(2)
const flag = name => ARGS.includes(name)
const opt = (name) => {
  const i = ARGS.indexOf(name)
  return i >= 0 ? ARGS[i + 1] : undefined
}

// ---------------------------------------------------------------- 基础工具

function walk(dir, exts) {
  if (!existsSync(dir)) return []
  const out = []
  for (const e of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const p = join(dir, e.name)
    if (e.isDirectory()) out.push(...walk(p, exts))
    else if (exts.some(x => e.name.endsWith(x))) out.push(p)
  }
  return out
}

const rel = p => relative(ROOT, p)

/** 一行里的注释文本压成一句：截到第一个句号，或 80 字。用于索引里的「说明」列。 */
function oneLine(text) {
  if (!text) return ''
  let t = String(text).replace(/\s+/g, ' ').trim()
  t = t.replace(/^[-*·]\s*/, '')
  // 分区标题（── 导出（工程包）── / ---- 输入器 ---- / ---------- 创作工具 ----------）不是符号说明：
  // 整条丢掉；若它和真正的说明挤在同一个注释块里，只剥掉前缀。
  t = t.replace(/^(?:[-─—]{2,})\s*[^-─—]*?(?:[-─—]{2,})\s*/, '')
  if (!t || /^[-─—\s]+$/.test(t)) return ''
  const cut = t.search(/[。；]/)
  if (cut > 0) t = t.slice(0, cut)
  if (t.length > 80) t = t.slice(0, 78) + '…'
  return t.trim()
}

/** 取第 idx 行（0 基）**紧邻上方**的注释块。返回 { text, line } 或 null。 */
function commentAbove(lines, idx) {
  let i = idx - 1
  if (i < 0) return null
  // 块注释的最后一行常常是「说明文字 + */」，不能要求整行只有 */（早期版本因此丢掉了
  // computed<string[]>(...) 这类成员上方那段 JSDoc）。
  if (/\*\/\s*$/.test(lines[i]) && !/^\s*\/\//.test(lines[i])) {
    let j = i
    let found = false
    while (j >= 0 && i - j <= 40) {
      // 必须是「行首的 /*」：注释正文里出现 `/api/v1/canvas/*` 这类通配路径时，
      // 按「包含 /*」去找块首会把路径当成注释开始，于是只剩最后两行
      // （canvas.vue 的用途说明就是这么被截成半句话的）。
      if (/^\s*\/\*\*?/.test(lines[j])) {
        found = true
        break
      }
      if (j !== i && !/^\s*\*/.test(lines[j])) break
      j--
    }
    if (!found) return null
    const body = lines
      .slice(j, i + 1)
      .join('\n')
      .replace(/^[\s\S]*?\/\*\*?/, '')
      .replace(/\*\/[\s\S]*$/, '')
      .split('\n')
      .map(l => l.replace(/^\s*\*\s?/, ''))
      .join('\n')
    return { text: oneLine(body), line: j + 1 }
  }
  if (/^\s*\/\//.test(lines[i])) {
    let j = i
    while (j >= 0 && /^\s*\/\//.test(lines[j])) j--
    const body = lines
      .slice(j + 1, i + 1)
      .map(l => l.replace(/^\s*\/\/\s?/, ''))
      .join('\n')
    return { text: oneLine(body), line: j + 2 }
  }
  return null
}

/** 从 src 的 openPos（必须指向 '{'）开始，返回配平的大括号内部文本。 */
function sliceBalanced(src, openPos) {
  let depth = 0
  for (let i = openPos; i < src.length; i++) {
    const c = src[i]
    if (c === '{') depth++
    else if (c === '}') {
      depth--
      if (depth === 0) return src.slice(openPos + 1, i)
    }
  }
  return null
}

function lineTable(src) {
  const starts = [0]
  for (let i = 0; i < src.length; i++) if (src[i] === '\n') starts.push(i + 1)
  return (pos) => {
    let lo = 0,
      hi = starts.length - 1
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1
      if (starts[mid] <= pos) lo = mid
      else hi = mid - 1
    }
    return lo + 1
  }
}

const collapse = s => String(s).replace(/\s+/g, ' ').trim()

/** 超长索引行（组件 props 一行可能几千字）按命中位置截一个窗口，别把整行倒出来。 */
function clip(line, kw) {
  if (line.length <= 320) return line
  const i = line.toLowerCase().indexOf(kw)
  const start = Math.max(0, i - 150)
  return (start > 0 ? '…' : '') + line.slice(start, start + 320) + '…'
}

// ---------------------------------------------------------------- composables

/** 取出 app/composables 里每个文件的内容、行、以及顶层导出行。 */
function parseComposableFile(path) {
  const src = readFileSync(path, 'utf8')
  const lines = src.split('\n')
  const lineOf = lineTable(src)

  const exports = []
  lines.forEach((l, i) => {
    const m = l.match(/^export\s+(async\s+)?function\s+([A-Za-z0-9_$]+)\s*(\(|<)/)
    if (m) {
      const sig = signatureFrom(lines, i)
      exports.push({ kind: 'function', name: m[2], sig, line: i + 1, doc: commentAbove(lines, i)?.text || '' })
      return
    }
    const c = l.match(/^export\s+const\s+([A-Za-z0-9_$]+)/)
    if (c) {
      exports.push({
        kind: 'const',
        name: c[1],
        sig: collapse(l.replace(/^export\s+/, ''))
          .replace(/\s*=\s*/, ' = ')
          .slice(0, 120),
        line: i + 1,
        doc: commentAbove(lines, i)?.text || ''
      })
      return
    }
    const t = l.match(/^export\s+(interface|type)\s+([A-Za-z0-9_$]+)/)
    if (t) exports.push({ kind: t[1], name: t[2], sig: '', line: i + 1, doc: commentAbove(lines, i)?.text || '' })
  })

  // 组合式函数（返回对象的那种）内部成员
  const composables = []
  lines.forEach((l, i) => {
    const m = l.match(/^export\s+function\s+(use[A-Za-z0-9_$]*|create[A-Za-z0-9_$]*)\s*\(\s*\)/)
    if (!m) return
    const end = findBlockEnd(lines, i)
    // 只列真正出现在 `return { ... }` 里的成员：内部变量（如 const session = useAuthSession()）
    // 调用方拿不到，列进来只会增加噪音。
    const keys = returnKeys(lines, i + 1, end)
    const members = parseMembers(lines, i + 1, end).filter(x => !keys || keys.has(x.name))
    if (!members.length) return
    composables.push({
      name: m[1],
      line: i + 1,
      doc: commentAbove(lines, i)?.text || '',
      members,
      returned: keys ? keys.size : null
    })
  })

  return { path, src, lines, lineOf, exports, composables, size: statSync(path).size }
}

/** 从 startLine..endLine 里找 `return { ... }` 并取出键名。没有 return 对象则返回 null。 */
function returnKeys(lines, from, to) {
  const text = lines.slice(from, to + 1).join('\n')
  const ri = text.lastIndexOf('return {')
  if (ri < 0) return null
  const inner = sliceBalanced(text, text.indexOf('{', ri))
  if (!inner) return null
  // 只按 ()[]{} 配平分段；尖括号不算层级（`=>` 的 '>' 会把层级算坏）
  const segs = []
  let depth = 0
  let cur = ''
  for (const ch of inner) {
    if (ch === '(' || ch === '[' || ch === '{') depth++
    else if (ch === ')' || ch === ']' || ch === '}') depth--
    if (ch === ',' && depth === 0) {
      segs.push(cur)
      cur = ''
    } else cur += ch
  }
  segs.push(cur)
  const keys = new Set()
  for (const s of segs) {
    const t = s
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/\/\/[^\n]*/g, ' ')
      .trim()
    if (!t) continue
    const m = t.match(/^([A-Za-z0-9_$]+)\s*[:(]/) || t.match(/^([A-Za-z0-9_$]+)$/)
    if (m) keys.add(m[1])
  }
  return keys
}

/** 从 startLine（0 基，函数声明那行）往下找第一行顶格的 '}'，视为块结束。 */
function findBlockEnd(lines, startLine) {
  for (let i = startLine + 1; i < lines.length; i++) {
    if (/^\}/.test(lines[i])) return i
  }
  return lines.length - 1
}

/**
 * 把跨行的签名压成一行。
 *
 * 不能简单地把换行换成空格：TS 的类型字面量里成员可以用换行分隔而不写逗号
 * （`{ hidden?: boolean\n  kind?: string }`），换空格会得到 `hidden?: boolean kind?: string`；
 * 反过来，参数表里已经写了逗号时再补一个就会变成 `,,`。所以按「上一行结尾 + 本行开头」
 * 判断该补逗号还是只补空格，同时丢掉注释（注释里有中文说明，但塞进签名只会变噪音）。
 */
function joinSig(text) {
  const ls = text
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
  let out = ''
  for (const raw of ls) {
    let l = raw.replace(/\/\*[\s\S]*?\*\//g, ' ').trim()
    if (!l || /^\/\//.test(l) || /^\*/.test(l)) continue
    l = l.replace(/\/\/.*$/, '').trim()
    if (!l) continue
    const prev = out.trimEnd()
    const needsComma = prev && !/[{(,|&:<=[]$/.test(prev) && !/^[)\]}>.,|&]/.test(l)
    out += (out ? (needsComma ? ', ' : ' ') : '') + l
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * 抽函数签名的参数与返回类型。
 *
 * 必须按**括号配平**扫描：参数里常出现对象字面量类型（`opts: { method?: string }`），
 * 按「第一个 '{' 就截断」会把签名切在参数中间（早期版本就是这样把
 * `apiRequest<T>(path: string, opts: {...})` 截成半截的）。窗口要够大：
 * `createTask` 的参数类型本身就有 23 行。
 */
function signatureFrom(lines, startLine) {
  const src = lines.slice(startLine, Math.min(lines.length, startLine + 80)).join('\n')
  const clean = s =>
    joinSig(s)
      .replace(/^(export\s+)?(async\s+)?(function|const)\s+/, '')
      .replace(/\(\s+/g, '(')
      .replace(/\s+\)/g, ')')
      .replace(/\s*:\s*/g, ': ')
      .replace(/\s*,\s*/g, ', ')
      .replace(/\s*=\s*/g, ' = ')
      .trim()
  const openParen = src.indexOf('(')
  if (openParen < 0) return clean(src.split('\n')[0])
  let depth = 0
  let close = -1
  for (let i = openParen; i < src.length; i++) {
    const c = src[i]
    if (c === '(') depth++
    else if (c === ')') {
      depth--
      if (depth === 0) {
        close = i
        break
      }
    }
  }
  if (close < 0) return clean(src.split('\n')[0])
  const head = src.slice(0, close + 1)
  const rest = src.slice(close + 1)
  const rt = rest.match(/^\s*:\s*/)
  if (!rt) return clean(head)
  // 返回类型：跳过泛型尖括号，遇到函数体的 '{' 或箭头 '=>' 停
  let angle = 0
  let end = rest.length
  for (let i = rt[0].length; i < rest.length; i++) {
    const c = rest[i]
    if (c === '<') angle++
    else if (c === '>') angle = Math.max(0, angle - 1)
    else if (c === '{' && angle === 0) {
      end = i
      break
    } else if (c === '=' && rest[i + 1] === '>') {
      end = i
      break
    }
  }
  const rtype = joinSig(rt[0] + rest.slice(rt[0].length, end))
    .replace(/^:\s*/, '')
    .trim()
  return clean(rtype ? `${head}: ${rtype}` : head)
}

/**
 * 解析组合式函数体内 2 空格缩进的成员。
 * 支持：分区注释（── x ── / ---- x ----）、async function / const x = ref()/computed()/箭头函数，
 * 以及成员函数体里 apiRequest('...') 的接口路径。
 */
function parseMembers(lines, from, to) {
  const out = []
  let section = ''
  for (let i = from; i < to; i++) {
    const l = lines[i]
    const sec = l.match(/^\s{2}\/\/\s*──\s*(.+?)\s*──/) || l.match(/^\s{2}\/\*\s*-+\s*(.+?)\s*-+\s*\*\//)
    if (sec) {
      section = sec[1]
      continue
    }
    if (!/^\s{2}\S/.test(l)) continue
    if (/^\s{2}\/\//.test(l) || /^\s{2}\*/.test(l) || /^\s{2}\/\*/.test(l)) continue
    if (/^\s{2}(return|if|for|while|switch|try|catch|await|throw|const \{|\})/.test(l)) {
      // 允许 const { a } = ... 之外的语句跳过；const x = ... 由下面的规则处理
      if (!/^\s{2}const\s+[A-Za-z0-9_$]+\s*=/.test(l)) continue
    }
    const fn = l.match(/^\s{2}(async\s+)?function\s+([A-Za-z0-9_$]+)/)
    if (fn) {
      const end = findMemberEnd(lines, i, to)
      out.push({
        section,
        name: fn[2],
        kind: fn[1] ? 'async fn' : 'fn',
        sig: signatureFrom(lines, i),
        line: i + 1,
        doc: commentAbove(lines, i)?.text || '',
        paths: pathsIn(lines.slice(i, end + 1).join('\n'))
      })
      continue
    }
    const c = l.match(/^\s{2}const\s+([A-Za-z0-9_$]+)\s*=\s*(.*)$/)
    if (c) {
      const rhs = c[2]
      let kind = 'value'
      if (/^computed\s*[<(]/.test(rhs)) kind = 'computed'
      else if (/^(shallowRef|ref|useState|useCookie)\s*[<(]/.test(rhs)) kind = 'ref'
      else if (/^use[A-Z][A-Za-z0-9_$]*\s*\(/.test(rhs)) kind = 'composable'
      else if (/^(async\s*)?\(/.test(rhs) || /=>/.test(rhs)) kind = 'fn'
      const end = findMemberEnd(lines, i, to)
      // 非函数成员只记「右边是什么调用」：ref<ComposerMode>(...) → ref<ComposerMode>
      const head = collapse(rhs)
      const call = head.match(/^([A-Za-z0-9_$.]+(?:<[^>]*>)?)\s*\(/)?.[1] || (kind === 'value' ? head.slice(0, 60) : '')
      out.push({
        section,
        name: c[1],
        kind,
        sig: kind === 'fn' ? '' : call,
        line: i + 1,
        doc: commentAbove(lines, i)?.text || '',
        paths: pathsIn(lines.slice(i, end + 1).join('\n'))
      })
    }
  }
  return out
}

/** 成员体结束：下一个 2 空格缩进的声明，或 2 空格 '}'。 */
function findMemberEnd(lines, startLine, limit) {
  for (let i = startLine + 1; i < limit; i++) {
    if (/^\s{2}\}/.test(lines[i])) return i
    if (/^\s{2}(async\s+)?function\s/.test(lines[i])) return i - 1
    if (/^\s{2}const\s+[A-Za-z0-9_$]+\s*=/.test(lines[i])) return i - 1
    if (/^\s{2}\/\/\s*──/.test(lines[i])) return i - 1
  }
  return limit
}

/** 在代码片段里找 apiRequest / fetch / EventSource 的路径参数。 */
function pathsIn(body) {
  const paths = []
  const push = (p) => {
    // 模板字符串带 ${...} 时（内层还可能嵌反引号）只保留静态前缀，避免抄出半截路径
    let v = p.includes('${') ? p.slice(0, p.indexOf('${')).replace(/[?&]$/, '') + '…' : p
    v = v.replace(/\$\{[^}]*\}/g, '{…}')
    if (v && !paths.includes(v)) paths.push(v)
  }
  const re = /apiRequest\s*(?:<[^>]*>)?\s*\(\s*[`'"]([^`'"]+)[`'"]/g
  let m
  while ((m = re.exec(body))) push(m[1])
  const reRaw = /(?:fetch|EventSource)\s*\(\s*[`'"]([^`'"]+)[`'"]/g
  while ((m = reRaw.exec(body))) push(m[1])
  return paths
}

// ---------------------------------------------------------------- vue 文件

function parseVue(path) {
  const src = readFileSync(path, 'utf8')
  const lines = src.split('\n')
  const setup = src.match(/<script setup[^>]*>/)
  // 文件用途 = `<script setup>` 之后的第一个注释块。注意要跳到「第一条真正的语句」再往上取注释，
  // 否则注释块自身会被当成语句，往上找只能看到 <script setup> 这一行（早期版本就是这么空的）。
  let purpose = ''
  if (setup) {
    const afterIdx = src.slice(0, setup.index + setup[0].length).split('\n').length - 1
    let j = afterIdx + 1
    while (j < lines.length && (/^\s*$/.test(lines[j]) || /^\s*(\/\/|\/\*|\*)/.test(lines[j]))) j++
    purpose = commentAbove(lines, j)?.text || ''
  }

  const props = []
  const emits = []
  const models = []
  const slots = []
  const exposes = []
  const defaults = {}

  const dpIdx = src.search(/(?:withDefaults\s*\(\s*)?defineProps\s*</)
  if (dpIdx >= 0) {
    const bracePos = src.indexOf('{', dpIdx)
    const ltPos = src.indexOf('<', dpIdx)
    if (bracePos >= 0 && ltPos >= 0 && bracePos > ltPos) {
      const inner = sliceBalanced(src, bracePos)
      if (inner) {
        let pendingDoc = ''
        for (const raw of inner.split('\n')) {
          const l = raw.trim()
          if (!l) continue
          const docOnly = l.match(/^\/\*\*?\s*(.*?)\s*\*\/$/)
          if (docOnly) {
            pendingDoc = oneLine(docOnly[1])
            continue
          }
          const m = l.match(/^(?:\/\*\*?\s*(.*?)\s*\*\/\s*)?([A-Za-z0-9_$]+)(\??)\s*:\s*(.+?)\s*$/)
          if (m) {
            props.push({
              name: m[2],
              optional: !!m[3],
              type: collapse(m[4]).slice(0, 60),
              doc: oneLine(m[1] || pendingDoc)
            })
            pendingDoc = ''
          } else if (/^\/\//.test(l)) pendingDoc = oneLine(l.replace(/^\/\/\s?/, ''))
        }
      }
    }
  }
  // withDefaults 的默认值
  const wdIdx = src.search(/withDefaults\s*\(/)
  if (wdIdx >= 0 && props.length) {
    const rel2 = src.slice(wdIdx).search(/,\s*\{/)
    if (rel2 >= 0) {
      const bpos = src.indexOf('{', wdIdx + rel2)
      const inner = sliceBalanced(src, bpos)
      if (inner) {
        for (const raw of inner.split('\n')) {
          const m = raw.trim().match(/^([A-Za-z0-9_$]+)\s*:\s*(.+?),?$/)
          if (m) defaults[m[1]] = collapse(m[2])
        }
      }
    }
  }

  for (const m of src.matchAll(/defineEmits\s*</g)) {
    const bracePos = src.indexOf('{', m.index)
    const inner = bracePos >= 0 ? sliceBalanced(src, bracePos) : null
    if (!inner) continue
    for (const e of inner.matchAll(/\(\s*e\s*:\s*'([^']+)'/g)) emits.push(e[1])
    for (const e of inner.matchAll(/^\s*'?([A-Za-z0-9_:$-]+)'?\s*:\s*\[/gm)) emits.push(e[1])
  }

  const modelRe = /defineModel\s*(?:<[^>]*>)?\s*\(([^)]*)\)/g
  for (const m of src.matchAll(modelRe)) {
    const nm = m[1].match(/'([^']+)'/)
    models.push(nm ? nm[1] : 'modelValue')
  }

  for (const m of src.matchAll(/defineSlots\s*</g)) {
    const bracePos = src.indexOf('{', m.index)
    const inner = bracePos >= 0 ? sliceBalanced(src, bracePos) : null
    if (!inner) continue
    for (const s of inner.matchAll(/^\s*'?([A-Za-z0-9_$-]+)'?\s*[?:(]/gm)) slots.push(s[1])
  }

  const ex = src.match(/defineExpose\s*\(\s*\{/)
  if (ex) {
    const inner = sliceBalanced(src, src.indexOf('{', ex.index))
    if (inner)
      for (const l of inner.split('\n')) {
        const m = l.trim().match(/^([A-Za-z0-9_$]+)/)
        if (m) exposes.push(m[1])
      }
  }

  const composablesUsed = [
    ...new Set((src.match(/\b(use[A-Z][A-Za-z0-9_]*)\s*\(/g) || []).map(s => s.replace(/\s*\($/, '')))
  ].filter(n => existsSync(join(APP, 'composables', `${n}.ts`)))

  return {
    purpose,
    props,
    emits,
    models,
    slots,
    exposes,
    defaults,
    composablesUsed,
    size: statSync(path).size,
    lines: lines.length
  }
}

// ---------------------------------------------------------------- 类型索引

function parseTypes(path) {
  const src = readFileSync(path, 'utf8')
  const lines = src.split('\n')
  const out = []
  lines.forEach((l, i) => {
    const m = l.match(/^export\s+(interface|type)\s+([A-Za-z0-9_$]+)(.*)$/)
    if (!m) return
    const fields = []
    // 类型体：从该行往后 400 字符内出现的第一对花括号（`interface X {…}` 或 `type X = {…}`）
    const headPos = src.split('\n').slice(0, i).join('\n').length + (i > 0 ? 1 : 0)
    const local = src.indexOf('{', headPos)
    if (local >= 0 && local < headPos + 400) {
      const inner = sliceBalanced(src, local)
      if (inner) {
        for (const raw of inner.split('\n')) {
          const fm = raw.trim().match(/^(?:readonly\s+)?'?([A-Za-z0-9_$.-]+)'?(\??)\s*[:(]/)
          if (fm) fields.push(fm[1] + (fm[2] || ''))
        }
      }
    }
    out.push({
      kind: m[1],
      name: m[2],
      fields,
      line: i + 1,
      doc: commentAbove(lines, i)?.text || '',
      tail: collapse(m[3])
    })
  })
  return out
}

// ---------------------------------------------------------------- 生成各段

function buildComposablesSection() {
  const files = walk(join(APP, 'composables'), ['.ts'])
  const out = []
  out.push(
    '本文件列出 `app/composables/` 下每个文件的导出符号，以及返回对象型组合式函数（`useXxx()` / `createXxx()`）的**全部成员**。'
  )
  out.push('只需要一个符号时不要整份读：`node scripts/gen-frontend-index.mjs --grep <关键词>`。')
  out.push('')
  for (const f of files) {
    const p = parseComposableFile(f)
    const rp = rel(f)
    out.push(`## ${rp}`)
    const fns = p.exports.filter(e => e.kind === 'function' || e.kind === 'const')
    const types = p.exports.filter(e => e.kind === 'interface' || e.kind === 'type')
    if (fns.length) {
      const ex = fns.map(e => `\`${e.sig || e.name}\` L${e.line}${e.doc ? ` — ${e.doc}` : ''}`)
      out.push(`- 导出函数/常量：${ex.join(' · ')}`)
    }
    if (types.length)
      out.push(
        `- 导出类型 ${types.length} 个 → 字段见 \`types.md\`（${types
          .slice(0, 6)
          .map(t => `\`${t.name}\``)
          .join(' · ')}${types.length > 6 ? ' …' : ''}）`
      )
    for (const c of p.composables) {
      out.push('')
      out.push(
        `### \`${c.name}()\` — L${c.line} · 返回 ${c.returned ?? c.members.length} 个成员${c.doc ? ` — ${c.doc}` : ''}`
      )
      let cur = null
      for (const m of c.members) {
        if (m.section !== cur) {
          cur = m.section
          if (cur) out.push(`- **${cur}**`)
        }
        const indent = cur ? '  ' : ''
        const isFn = m.kind === 'fn' || m.kind === 'async fn'
        const parts = [isFn ? `\`${m.sig || m.name}\`` : `\`${m.name}\``, `L${m.line}`]
        if (!isFn) parts.push(m.sig ? `${m.kind} \`${m.sig}\`` : m.kind)
        if (m.paths.length) parts.push(`\`${m.paths.join('`, `')}\``)
        out.push(`${indent}- ${parts.join(' · ')}${m.doc ? ` — ${m.doc}` : ''}`)
      }
    }
    out.push('')
  }
  return out.join('\n')
}

function buildComponentsSection() {
  const files = walk(join(APP, 'components'), ['.vue'])
  const out = []
  out.push('组件的对外契约（props / v-model / emits / slots / expose）。改组件前先看这里，不用读整个 `.vue`。')
  out.push('')
  for (const f of files) {
    const p = parseVue(f)
    const rp = rel(f)
    const propsItems = p.props.map((x) => {
      const def = p.defaults[x.name] !== undefined ? `=${p.defaults[x.name]}` : ''
      return `\`${x.name}${x.optional ? '?' : ''}\`${def}${x.doc ? `(${x.doc})` : ''}`
    })
    const meta = []
    if (p.models.length) meta.push(`v-model: ${p.models.map(m => `\`${m}\``).join(' · ')}`)
    if (p.emits.length) meta.push(`emits: ${[...new Set(p.emits)].map(e => `\`${e}\``).join(' · ')}`)
    if (p.slots.length) meta.push(`slots: ${[...new Set(p.slots)].map(s => `\`${s}\``).join(' · ')}`)
    if (p.exposes.length) meta.push(`expose: ${p.exposes.map(s => `\`${s}\``).join(' · ')}`)
    if (p.composablesUsed.length) meta.push(`用: ${p.composablesUsed.map(s => `\`${s}\``).join(' · ')}`)
    out.push(`### ${basename(rp, '.vue')} — ${rp} · ${p.lines} 行`)
    if (p.purpose) out.push(p.purpose)
    out.push(...wrapLine('- props: ', propsItems))
    if (meta.length) out.push(`- ${meta.join(' · ')}`)
    if (p.lines > 300) {
      const d = localDecls(readFileSync(f, 'utf8').split('\n'))
      if (d.length) out.push(...wrapLine(`- 本文件声明 ${d.length} 个: `, d.map(x => `\`${x.name}\` L${x.line}`)))
    }
    out.push('')
  }
  return out.join('\n')
}

/** 文件顶部的注释块（Nitro 路由、数据表、中间件都用这种写法当文件说明）。 */
function fileDoc(src) {
  const lines = src.split('\n')
  if (!/^\s*(\/\/|\/\*)/.test(lines[0] || '')) return ''
  let end = 0
  if (/^\s*\/\*/.test(lines[0])) {
    while (end < lines.length && !/\*\/\s*$/.test(lines[end])) end++
  } else {
    while (end + 1 < lines.length && /^\s*\/\//.test(lines[end + 1])) end++
  }
  return oneLine(
    lines
      .slice(0, end + 1)
      .join('\n')
      .replace(/^\s*\/\*\*?/, '')
      .replace(/\*\/\s*$/, '')
      .replace(/^\s*\/\/\s?/gm, '')
  )
}

/** 组件/页面里本文件自己声明的顶层函数与常量（只在文件较大时才值得列）。 */
function localDecls(lines) {
  const out = []
  lines.forEach((l, i) => {
    const fn = l.match(/^(?:async\s+)?function\s+([A-Za-z0-9_$]+)/)
    if (fn) { out.push({ name: fn[1], line: i + 1, doc: commentAbove(lines, i)?.text || '' }); return }
    const c = l.match(/^const\s+([A-Za-z0-9_$]+)\s*=\s*(?:async\s*)?(?:\(|computed|ref|useState|watch|useAsyncData|useFetch)/)
    if (c) out.push({ name: c[1], line: i + 1, doc: commentAbove(lines, i)?.text || '' })
  })
  return out
}

function routeOf(p) {
  let r = rel(p)
    .replace(/^app\/pages\//, '')
    .replace(/\.vue$/, '')
  r = r.replace(/\/index$/, '')
  r = r.replace(/\[([^\]]+)\]/g, ':$1')
  return '/' + r.replace(/^index$/, '')
}

function buildPagesSection() {
  const pages = walk(join(APP, 'pages'), ['.vue'])
  const out = []
  out.push('路由、页面职责与它用到的组合式函数。')
  out.push('')
  for (const f of pages) {
    const p = parseVue(f)
    const rp = rel(f)
    const meta = []
    if (p.composablesUsed.length) meta.push(p.composablesUsed.map(s => `\`${s}\``).join(' · '))
    out.push(`### \`${routeOf(f)}\` — ${rp} · ${p.lines} 行`)
    if (p.purpose) out.push(p.purpose)
    if (meta.length) out.push(`- 用: ${meta.join(' · ')}`)
    if (p.lines > 300) {
      const d = localDecls(readFileSync(f, 'utf8').split('\n'))
      if (d.length) out.push(...wrapLine(`- 本文件声明 ${d.length} 个: `, d.map(x => `\`${x.name}\` L${x.line}`)))
    }
    out.push('')
  }
  out.push('## 应用外壳与 Nitro 服务端路由')
  const shell = [join(APP, 'app.vue'), join(APP, 'app.config.ts')].filter(existsSync)
  for (const f of shell) {
    const src = readFileSync(f, 'utf8')
    const n = src.split('\n').length
    const doc = f.endsWith('.vue') ? parseVue(f).purpose : fileDoc(src)
    out.push(`- \`${rel(f)}\` · ${n} 行${doc ? ` — ${doc}` : ''}`)
    if (n > 300) {
      const d = localDecls(src.split('\n'))
      if (d.length) out.push(...wrapLine('  - 本文件声明: ', d.map(x => `\`${x.name}\` L${x.line}`), '    '))
    }
  }
  for (const f of walk(join(ROOT, 'server'), ['.ts']))
    out.push(`- \`${rel(f)}\`${fileDoc(readFileSync(f, 'utf8')) ? ` — ${fileDoc(readFileSync(f, 'utf8'))}` : ''}`)

  const others = [...walk(join(APP, 'middleware'), ['.ts']), ...walk(join(APP, 'plugins'), ['.ts'])]
  if (others.length) {
    out.push('')
    out.push('## 中间件与插件')
    for (const f of others) {
      const src = readFileSync(f, 'utf8')
      out.push(`- \`${rel(f)}\` — ${fileDoc(src) || '—'}`)
    }
  }
  return out.join('\n')
}

function buildTypesSection() {
  const files = [
    ...walk(join(APP, 'composables'), ['.ts']),
    ...walk(join(APP, 'data'), ['.ts']),
    ...walk(join(APP, 'config'), ['.ts'])
  ]
  const out = []
  out.push('导出的 `interface` / `type` 及**字段名**（不抄字段类型，需要类型时按行号去源码看）。')
  out.push('')
  for (const f of files) {
    const types = parseTypes(f)
    if (!types.length) continue
    out.push(`## ${rel(f)}`)
    for (const t of types) {
      const f2 = t.fields.length ? `{${t.fields.join(', ')}}` : t.tail.replace(/^=\s*/, '')
      out.push(
        `- \`${t.name}\`${t.kind === 'type' ? ' *type*' : ''} L${t.line} ${f2.length > 320 ? f2.slice(0, 318) + '…' : f2}${t.doc ? ` — ${t.doc}` : ''}`
      )
    }
    out.push('')
  }
  return out.join('\n')
}

function buildUtilsSection() {
  const files = [
    ...walk(join(APP, 'utils'), ['.ts']),
    ...walk(join(APP, 'data'), ['.ts']),
    ...walk(join(APP, 'config'), ['.ts'])
  ]
  const out = []
  out.push('纯函数、常量表与静态数据（没有响应式状态，可直接在任意上下文调用）。')
  out.push('')
  for (const f of files) {
    const src = readFileSync(f, 'utf8')
    const lines = src.split('\n')
    const rows = []
    lines.forEach((l, i) => {
      const m = l.match(
        /^export\s+(async\s+)?(function\s+([A-Za-z0-9_$]+)|const\s+([A-Za-z0-9_$]+)|default\s+([A-Za-z0-9_$]+))/
      )
      if (!m) return
      const sig = m[3] ? signatureFrom(lines, i) : collapse(l.replace(/^export\s+/, '')).slice(0, 80)
      const doc = commentAbove(lines, i)?.text
      rows.push(`- \`${sig}\` L${i + 1}${doc ? ` — ${doc}` : ''}`)
    })
    if (!rows.length) continue
    out.push(`## ${rel(f)}`)
    out.push(...rows)
    out.push('')
  }
  return out.join('\n')
}

function buildHubSection(parts) {
  const out = []
  out.push('| 想看什么 | 文件 | 行数 |')
  out.push('| --- | --- | --- |')
  for (const p of parts) out.push(`| ${p.title} | \`${rel(p.path)}\` | ${p.body.split('\n').length} |`)
  out.push('')
  // 大文件体检
  const all = [...walk(join(APP), ['.ts', '.vue'])]
  const big = all
    .map(f => ({ f, lines: readFileSync(f, 'utf8').split('\n').length }))
    .sort((a, b) => b.lines - a.lines)
    .slice(0, 12)
  out.push('最大的源文件（整份读最贵，优先查上面的索引再定点读）：')
  out.push('')
  out.push('| 文件 | 行数 |')
  out.push('| --- | --- |')
  for (const b of big) out.push(`| \`${rel(b.f)}\` | ${b.lines} |`)
  return out.join('\n')
}

// ---------------------------------------------------------------- 写盘 / 校验

/**
 * 把一长串条目折成多行（每行不超过 ~200 字）。
 * 组件 props 与大文件的本地声明动辄一两百项，挤成一行虽然只占一行，但没法扫。
 */
function wrapLine(prefix, items, indent = '  ', width = 200) {
  if (!items.length) return [prefix + '—']
  const lines = []
  let cur = prefix
  for (const it of items) {
    const isFirst = cur === prefix || cur === indent
    const piece = isFirst ? it : ` · ${it}`
    if (!isFirst && cur.length + piece.length > width) {
      lines.push(cur)
      cur = indent + it
    } else {
      cur += piece
    }
  }
  lines.push(cur)
  return lines
}

const BEGIN = tag => `<!-- BEGIN GENERATED:${tag} -->`
const END = tag => `<!-- END GENERATED:${tag} -->`

function splice(original, tag, body) {
  const b = BEGIN(tag)
  const e = END(tag)
  const i = original.indexOf(b)
  const j = original.indexOf(e)
  if (i < 0 || j < 0 || j < i) return null
  return (
    original.slice(0, i + b.length)
    + `\n<!-- 本区由 npm run index:frontend 生成，勿手改 -->\n\n`
    + body.trim()
    + `\n\n`
    + original.slice(j)
  )
}

const TARGETS = [
  { tag: 'hub', title: '总览与体检', path: HUB, build: null },
  {
    tag: 'composables',
    title: '组合式函数方法索引（最重要）',
    path: join(OUT_DIR, 'composables.md'),
    build: buildComposablesSection
  },
  {
    tag: 'components',
    title: '组件契约 props/emits',
    path: join(OUT_DIR, 'components.md'),
    build: buildComponentsSection
  },
  { tag: 'pages', title: '页面路由', path: join(OUT_DIR, 'pages-routes.md'), build: buildPagesSection },
  { tag: 'types', title: '类型与字段', path: join(OUT_DIR, 'types.md'), build: buildTypesSection },
  { tag: 'utils', title: '工具函数与静态数据', path: join(OUT_DIR, 'utils-data.md'), build: buildUtilsSection }
]

function main() {
  if (!existsSync(HUB)) {
    console.error(`缺少 ${rel(HUB)}：手写区必须先在文件里存在（生成器只替换标记之间的内容）。`)
    process.exit(2)
  }
  const bodies = {}
  for (const t of TARGETS) if (t.build) bodies[t.tag] = t.build()
  bodies.hub = buildHubSection(
    TARGETS.filter(t => t.tag !== 'hub').map(t => ({ title: t.title, path: t.path, body: bodies[t.tag] }))
  )

  // 单文件查询模式
  const grep = opt('--grep')
  if (grep) {
    const kw = grep.toLowerCase()
    let n = 0
    for (const t of TARGETS) {
      for (const l of bodies[t.tag].split('\n')) {
        if (l.toLowerCase().includes(kw)) {
          console.log(`${t.tag}\t${clip(l, kw)}`)
          n++
        }
      }
    }
    if (!n) console.log(`（没有匹配 「${grep}」 的索引行）`)
    return
  }
  const only = opt('--file')
  if (only) {
    const norm = only.replace(/^\.?\//, '')
    const lines = []
    for (const t of TARGETS) {
      const body = bodies[t.tag].split('\n')
      for (let i = 0; i < body.length; i++) {
        const m = body[i].match(/^(#{2,3})\s+(.*)$/)
        if (!m || !m[2].includes(norm)) continue
        const level = m[1].length
        const block = [`[${t.tag}] ${body[i]}`]
        for (let j = i + 1; j < body.length; j++) {
          const m2 = body[j].match(/^(#{2,3})\s/)
          if (m2 && m2[1].length <= level) break
          block.push(body[j])
        }
        lines.push(block.join('\n'))
      }
    }
    if (lines.length) {
      console.log(lines.join('\n\n'))
      return
    }
    // 该文件没有任何导出符号（索引里没有标题）时，退回按行匹配
    const hits = TARGETS.flatMap(t =>
      bodies[t.tag]
        .split('\n')
        .filter(l => l.includes(norm))
        .map(l => `${t.tag}\t${clip(l, norm)}`)
    )
    if (hits.length) {
      console.log(hits.join('\n'))
      return
    }
    console.error(`索引里没有 ${only}（该文件可能没有任何导出符号）`)
    process.exit(2)
  }

  let stale = []
  const writes = []
  for (const t of TARGETS) {
    const orig = existsSync(t.path)
      ? readFileSync(t.path, 'utf8')
      : t.tag === 'hub'
        ? readFileSync(HUB, 'utf8')
        : hubStub(t)
    const next = splice(orig, t.tag, bodies[t.tag])
    if (next === null) {
      console.error(`✗ ${rel(t.path)} 缺少 ${BEGIN(t.tag)} / ${END(t.tag)} 标记，跳过`)
      continue
    }
    if (next !== orig) stale.push(rel(t.path))
    writes.push({ path: t.path, next })
  }

  if (flag('--check')) {
    if (stale.length) {
      console.error('前端索引已过期，与源码不一致：')
      for (const s of stale) console.error(`  · ${s}`)
      console.error('请运行：npm run index:frontend')
      process.exit(1)
    }
    console.log('前端索引与源码一致 ✓')
    return
  }

  if (flag('--stdout')) {
    for (const t of TARGETS) console.log(`\n===== ${rel(t.path)} =====\n` + bodies[t.tag])
    return
  }

  mkdirSync(OUT_DIR, { recursive: true })
  for (const w of writes) writeFileSync(w.path, w.next)
  const total = TARGETS.reduce((n, t) => n + bodies[t.tag].split('\n').length, 0)
  console.log(`前端索引已生成（${TARGETS.length} 个文件，索引正文 ${total} 行）：`)
  for (const t of TARGETS) console.log(`  · ${rel(t.path)}  ${bodies[t.tag].split('\n').length} 行`)
  if (stale.length) console.log(`（本次内容有变化：${stale.join(', ')}）`)
}

/** 新增索引分文件时用统一骨架兜底。 */
function hubStub(t) {
  return `# ${t.title}\n\n${BEGIN(t.tag)}\n${END(t.tag)}\n`
}

main()
