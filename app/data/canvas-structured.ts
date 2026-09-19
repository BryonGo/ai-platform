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
