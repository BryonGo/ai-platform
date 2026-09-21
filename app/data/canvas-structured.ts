/** JSON 保持原始结构；界面仅编辑字符串叶子，不把 ID、数字或嵌套结构转成文本。 */
export type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue }
export interface TextCell { path: (string | number)[], label: string, value: string }

export function parseStructured(text: string): JsonValue | undefined {
  try { return JSON.parse(text.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')) as JsonValue } catch { return undefined }
}

export function textCells(value: JsonValue, path: (string | number)[] = []): TextCell[] {
  if (typeof value === 'string') return [{ path, label: path.map(p => typeof p === 'number' ? `第 ${p + 1} 项` : p).join(' / ') || '正文', value }]
  if (!value || typeof value !== 'object') return []
  return Object.entries(value).flatMap(([key, child]) => textCells(child, [...path, Array.isArray(value) ? Number(key) : key]))
}

export function replaceText(value: JsonValue, path: (string | number)[], text: string): JsonValue {
  if (!path.length) return typeof value === 'string' ? text : value
  const copy = structuredClone(value)
  let target = copy as Record<string | number, JsonValue>
  for (const key of path.slice(0, -1)) target = target[key] as Record<string | number, JsonValue>
  const last = path[path.length - 1]!
  if (typeof target[last] === 'string') target[last] = text
  return copy
}

/** 增量流仅展示已闭合的字符串字段；不补全 JSON，也不将半成品保存为产物。 */
export function streamCells(text: string): TextCell[] {
  const parsed = parseStructured(text)
  if (parsed !== undefined) return textCells(parsed)
  const cells: TextCell[] = []
  let label = '内容'
  for (let i = 0; i < text.length; i++) {
    if (text[i] !== '"') continue
    const start = ++i
    let escaped = false
    for (; i < text.length; i++) {
      const char = text[i]
      if (!escaped && char === '"') break
      if (!escaped && char === '\\') escaped = true
      else escaped = false
    }
    const complete = i < text.length
    const raw = text.slice(start, i)
    if (complete && /^\s*:/.test(text.slice(i + 1))) {
      try { label = JSON.parse(`"${raw}"`) as string } catch { /* malformed key */ }
      continue
    }
    let value = raw
    try { value = JSON.parse(`"${raw}"`) as string } catch { /* partial escape remains visible, never saved */ }
    cells.push({ path: [cells.length], label, value })
    if (!complete) break
  }
  return cells
}

/**
 * 从"某一口的 JSON 文本"里取出条目：标签按 `labelKeys` 的先后取第一个非空字符串，
 * `extraKeys` 里的值接在后面（场景的「破庙」＋「夜」= 破庙 · 夜）。
 *
 * 人物与场景的字段名不一样（人物是 `name`，场景是 `title`），但"按名字挑一条"是同一件事 ——
 * 所以把键名当参数，别写两套解析（下一处不同就会开始漂移）。
 */
function entriesFrom(
  text: string,
  container: string,
  labelKeys: string[],
  extraKeys: string[] = []
): { name: string, description: string, index: number }[] {
  const parsed = parseStructured(text)
  const list = Array.isArray(parsed) ? parsed : parsed && typeof parsed === 'object' ? (parsed as Record<string, JsonValue>)[container] : undefined
  if (!Array.isArray(list)) return []
  return list.flatMap((item, index) => {
    const row = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, JsonValue> : undefined
    const base = typeof item === 'string' ? item : row ? firstString(row, labelKeys) : undefined
    if (typeof base !== 'string' || !base.trim()) return []
    const extras = row ? extraKeys.map(k => firstString(row, [k])).filter((v): v is string => !!v && !base.includes(v)) : []
    return [{
      name: [base, ...extras].join(' · '),
      description: structuredCells(item).map(c => `${c.label}：${c.value}`).join('\n'),
      index
    }]
  })
}

function firstString(row: Record<string, JsonValue>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = row[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }
  return undefined
}

export function characterEntries(text: string): { name: string, description: string, index: number }[] {
  return entriesFrom(text, 'characters', ['name', 'characterName', '姓名', '角色名'])
}

/**
 * 场景条目。标签是 `title`（契约里的键；老产物可能只有 `location`），后面接 `time`
 * （「破庙 · 夜」）—— 光有地点分不出白天还是夜里，而环境参考图要的正是"这个场景在什么时候"。
 */
export function sceneEntries(text: string): { name: string, description: string, index: number }[] {
  return entriesFrom(text, 'scenes', ['title', 'name', 'location', '场景名', '地点'], ['time'])
}

/**
 * 列表类产物的**行视图**：一行一项、一列一个字段。
 *
 * 为什么要有它：拆解产物（人物 / 场景 / 分镜）此前在右栏是一张**扁平的两列表**
 * （`字段 | 内容`）——7 镜的分镜会摊成几十行，用户看到的是
 * `shots / 第 3 项 / description` 这种键路径，而不是一张能横着比对"哪一镜是什么"的表。
 * 契约里的键名已经固定（`run.go` 的 `splitSystemPrompt` + `prompt_test.go` 钉住），
 * 所以"按项成行"是安全的：列就是那些键，行就是清单里的每一条。
 *
 * 用 `outputSlot` 找清单：右栏本来就是**按口**展示的（比如正在看「分镜大纲」那一口），
 * 于是"这一口的内容"就是那张表。取不到清单（单个对象、纯文本）时返回 undefined，
 * 调用方退回原来的扁平表 —— 不是所有产物都是清单。
 */
export const STRUCT_FIELD_LABELS: Record<string, string> = {
  id: '标识', name: '姓名', title: '场景', location: '地点', time: '时间',
  summary: '概要', description: '画面', action: '动作', dialogue: '台词',
  shot_type: '景别', scene_id: '所属场景', characters: '出场角色', idx: '镜号'
}

export interface StructuredRow {
  /** 行首那一格：这一项叫什么（姓名 / 场景名 / 第 N 镜）。 */
  label: string
  cells: (TextCell & { readonly: boolean })[]
}

export interface StructuredTable {
  headers: string[]
  rows: StructuredRow[]
}

export function structuredTable(value: JsonValue, slot: string): StructuredTable | undefined {
  const list = Array.isArray(value)
    ? value
    : value && typeof value === 'object' ? (value as Record<string, JsonValue>)[slot] : undefined
  if (!Array.isArray(list) || !list.length) return undefined
  const inList = Array.isArray(value)
  // 列 = 各项键的**并集**（按首次出现顺序）：
  // 契约要求"没内容也给空串、不要省键"，但真实产物总会漏；取并集能让漏键的那一项
  // 落在正确的列上，而不是把后面的字段整体左移（那是最容易看错的一种错法）。
  const keys: string[] = []
  for (const item of list) {
    if (!item || typeof item !== 'object' || Array.isArray(item)) continue
    for (const key of Object.keys(item as Record<string, JsonValue>)) if (!keys.includes(key)) keys.push(key)
  }
  if (!keys.length) return undefined
  const base = inList ? [] : [slot]
  const rows = list.map((item, index) => ({
    label: rowLabel(item, index),
    cells: keys.map((key) => {
      const raw = item && typeof item === 'object' && !Array.isArray(item) ? (item as Record<string, JsonValue>)[key] : undefined
      const path = [...base, index, key]
      // 只有**字符串叶子**才绑定到可编辑的那一格；数组/对象一律只读并排成一行文字。
      // （早先这里用 textCells(...)[0] 取"第一个字符串叶子"，于是台词那一列显示的是
      // 说话人「甲」，而不是"甲：我来了" —— 一列信息看着有、其实是错的。）
      if (typeof raw === 'string') {
        return { path, label: fieldLabel(key), value: raw, readonly: protectedPath(path) }
      }
      return { path, label: fieldLabel(key), value: valueText(raw), readonly: true }
    })
  }))
  return { headers: keys.map(fieldLabel), rows }
}

function fieldLabel(key: string): string { return STRUCT_FIELD_LABELS[key] ?? key }

/** 行首那一格：优先"这一项叫什么"，其次镜号，最后退回序号。 */
function rowLabel(item: JsonValue, index: number): string {
  const row = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, JsonValue> : undefined
  if (typeof item === 'string' && item.trim()) return item.trim()
  const name = row ? firstString(row, ['name', 'title', 'location']) : undefined
  if (name) return name
  const idx = row?.idx
  if (typeof idx === 'number' || (typeof idx === 'string' && idx.trim())) return `第 ${idx} 镜`
  return `第 ${index + 1} 项`
}

/** 非字符串叶子的展示文本：只读格也总要有东西可看。 */
// 入参放宽到 undefined：调用点传的是 `Record<string, JsonValue>[key]`，取不到就是 undefined，
// 而函数体第一行本来就在处理这个分支（返回 '—'）。签名写窄了反而与实现对不上，typecheck 报 TS2345。
function valueText(value: JsonValue | undefined): string {
  if (value === null || value === undefined) return '—'
  if (Array.isArray(value)) {
    // 台词是契约里的固定形状（`[{speaker,line}]`）：排成"谁：说了什么"。
    // 通用拼接会变成"speaker：甲；line：我来了"——同一份信息，读起来费劲得多。
    const dialogue = dialogueText(value)
    if (dialogue) return dialogue
    return value.map(v => valueText(v)).filter(v => v !== '—').join('、') || '—'
  }
  if (typeof value === 'object') return Object.entries(value).map(([k, v]) => `${fieldLabel(k)}：${valueText(v)}`).join('；')
  return String(value)
}

/** 台词数组 → 多行文本；不是台词形状（没有 line）时返回 undefined，交给通用拼接。 */
function dialogueText(list: JsonValue[]): string | undefined {
  const lines = list.map((item) => {
    const row = item && typeof item === 'object' && !Array.isArray(item) ? item as Record<string, JsonValue> : undefined
    const line = row ? firstString(row, ['line', 'text']) : undefined
    if (!line) return undefined
    const speaker = firstString(row!, ['speaker', 'name'])
    return speaker ? `${speaker}：${line}` : line
  }).filter((v): v is string => !!v)
  return lines.length ? lines.join('\n') : undefined
}

export function protectedPath(path: (string | number)[]): boolean {
  return path.some(key => typeof key === 'string' && (/^(id|.*_id|.*Id|.*_ids|.*Ids)$/.test(key)))
    || (path.includes('characters') && typeof path[path.length - 1] === 'number')
}

export function structuredCells(value: JsonValue, path: (string | number)[] = []): (TextCell & { readonly: boolean })[] {
  if (value === null || typeof value !== 'object') return [{ path, label: path.map(p => typeof p === 'number' ? `第 ${p + 1} 项` : p).join(' / ') || '正文', value: value === null ? '—' : String(value), readonly: typeof value !== 'string' || protectedPath(path) }]
  return Object.entries(value).flatMap(([key, child]) => structuredCells(child, [...path, Array.isArray(value) ? Number(key) : key]))
}

export function validateStructuredEdit(original: string, text: string, slot: string): string | undefined {
  const value = parseStructured(text)
  if (value === undefined) return 'JSON 格式无效'
  const list = Array.isArray(value) ? value : value && typeof value === 'object' ? value[slot] : undefined
  if (!Array.isArray(list)) return '拆解结果必须是清单数组，或包含对应清单的 JSON 对象'
  if (slot === 'characters' && list.length && !characterEntries(JSON.stringify(list)).length) return '人物列表缺少可识别的姓名字段'
  if (slot === 'scenes' && list.length && !sceneEntries(JSON.stringify(list)).length) return '场景列表缺少可识别的场景名（应有 title 或 location）'
  const before = parseStructured(original)
  if (before !== undefined) {
    const locked = (data: JsonValue) => structuredCells(data).filter(c => c.readonly).map(c => ({ path: c.path, value: c.value }))
    if (JSON.stringify(locked(before)) !== JSON.stringify(locked(value))) return '标识、引用与非文本字段不可在正文编辑中修改'
  }
}
