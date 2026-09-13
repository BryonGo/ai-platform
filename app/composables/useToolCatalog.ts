// 创作工具目录（数据层）。
//
// 一次拉取、全局共享：首页工具 tabs、/effects 工具页、创作页的工具胶囊与模板选择器
// 读的都是这一份 —— 三处各自请求会出现"关掉工具后首页没了、工具页还在"这类不同步。
//
// 目录由后端驱动（GET /hougong/tools）：运营在后台停用一个工具，前台入口立刻消失，
// 不需要发版。前端**不做**任何权限判断，只消费服务端下发的列表。

export interface ToolTemplate {
  code: string
  name: string
  summary: string
}

export interface ToolItem {
  code: string
  name: string
  category: string
  summary: string
  icon: string
  /** 封面图（效果卡缩略图）；空 = 用图标占位，不留空框。 */
  cover?: string
  /** 角标文案（热门/新品/精选…）；空 = 不显示。 */
  badge?: string
  engine: string
  input: string
  supportsTemplates: boolean
  templates: ToolTemplate[]
}

export function useToolCatalog() {
  const tools = useState<ToolItem[]>('hg:tools', () => [])
  const loaded = useState<boolean>('hg:tools:loaded', () => false)
  const loading = useState<boolean>('hg:tools:loading', () => false)
  const error = useState<string>('hg:tools:error', () => '')

  /** 拉取目录。失败不清空已有列表：一次网络抖动不该让工具入口整体消失。 */
  async function refresh(): Promise<ToolItem[]> {
    if (loading.value) return tools.value
    loading.value = true
    try {
      const items = await useHougongApi().listTools()
      tools.value = items.map(it => ({ ...it, templates: it.templates || [] }))
      error.value = ''
    } catch (e) {
      error.value = e instanceof Error ? e.message : '工具目录加载失败'
      // 首次加载失败时保持空列表（下面 hasTools=false，调用方可以回落兜底数据）
    } finally {
      loading.value = false
      loaded.value = true
    }
    return tools.value
  }

  /** 首次进入各页面时调用：已加载过就不重复请求。 */
  async function ensure(): Promise<ToolItem[]> {
    if (loaded.value) return tools.value
    return refresh()
  }

  function get(code: string): ToolItem | undefined {
    return tools.value.find(t => t.code === code)
  }

  function byCategory(category: string): ToolItem[] {
    if (!category || category === 'all') return tools.value
    return tools.value.filter(t => t.category === category)
  }

  function search(keyword: string): ToolItem[] {
    const q = keyword.trim().toLowerCase()
    if (!q) return tools.value
    return tools.value.filter(t =>
      `${t.name} ${t.summary} ${t.code}`.toLowerCase().includes(q)
    )
  }

  function templatesOf(code: string): ToolTemplate[] {
    return get(code)?.templates || []
  }

  /** 该工具是否需要先选图（后端 input 形态决定输入面板与必填校验）。 */
  function needsImage(code: string): boolean {
    const input = get(code)?.input || ''
    return input !== '' && input !== 'text'
  }

  return {
    tools, loaded, loading, error,
    refresh, ensure, get, byCategory, search, templatesOf, needsImage
  }
}
