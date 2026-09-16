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
  /** 该玩法自己一张卡的缩略图（效果图）；空 = 前台回落用所属工具的封面。 */
  cover?: string
  /**
   * 对比原图（处理**前**）。与 cover 成对时前台出可拖动的对比滑块。
   *
   * 两张必须**同一画面坐标**（同机位/同姿势/同构图/同宽高比）：滑块是裁切整幅同尺寸
   * 图层实现的，两张错位一点点，一拖就露馅。只有 cover 时退化成单图。
   */
  coverBefore?: string
  /** 玩法角标（热门/新品/精选…），空 = 不显示（**不**继承工具角标）。 */
  badge?: string
  /** 标签（分类），效果列表的标签行按它筛。 */
  tags?: string[]
  /**
   * 是否在「全部效果」里单独成一张卡。
   * false = 只是父工具的一个选项（全脱/上半身/下半身），只在工具页作为玩法切换出现。
   * 后端没下发时按 true 处理：漏一个字段不该让整批玩法从效果列表里消失。
   */
  isCard?: boolean
}

export interface ToolItem {
  code: string
  name: string
  category: string
  summary: string
  icon: string
  /** 效果图（处理**后**）。服务端下发的是**限时签名地址**，别缓存进持久状态。 */
  cover?: string
  /** 对比原图（处理**前**），见 ToolTemplate.coverBefore。 */
  coverBefore?: string
  /**
   * 卡片循环预览视频（mp4）。有值时首页效果卡在进入视口后静音循环播放它，
   * cover 作为它的封面帧；没有就还是静态图（+ 对比滑块）。
   */
  coverVideo?: string
  /** 角标文案（热门/新品/精选…）；空 = 不显示。 */
  badge?: string
  /** 标签（分类），效果列表的标签行按它筛。 */
  tags?: string[]
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
