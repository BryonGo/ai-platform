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

  /**
   * 拉取目录。**成功才置 loaded**：失败只记 error、保持空列表。
   *
   * 旧实现在 finally 里无条件置 loaded=true —— 首次加载失败会被当成"已加载"，
   * ensure() 此后再也不请求，SSR 抖动一次就永久空目录。现在失败保持 loaded=false，
   * 页面 onMounted 的 ensure() 还有机会重试。
   * 已有列表不在失败时清空：一次网络抖动不该让工具入口整体消失。
   */
  async function refresh(): Promise<ToolItem[]> {
    if (loading.value) return tools.value
    loading.value = true
    try {
      const items = await useHougongApi().listTools()
      tools.value = items.map(it => ({ ...it, templates: it.templates || [] }))
      error.value = ''
      loaded.value = true
    } catch (e) {
      error.value = e instanceof Error ? e.message : '工具目录加载失败'
    } finally {
      loading.value = false
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

/**
 * 公开工具目录的 SSR 预取。
 *
 * 在页面 `setup` 顶层 `await useToolCatalogSsr()`：服务端会在 render 前把目录取好、
 * 写进共享 `useState`，随 Nuxt payload 水合到浏览器 —— 首页 / 技能页 / 工具页的首屏
 * HTML 里就有真实技能卡、工具名与选中的玩法，而不是等客户端脚本再 fetch 一次。
 *
 * 目录是**公开**数据：请求不带 Authorization、也不透传浏览器 Cookie（apiRequest 用的是
 * 裸 fetch），因此不会把某个用户的会话带给另一个用户。
 *
 * 服务端抖动只记录 error、保持空目录（不伪造工具，也不抛错让整页 500）；失败时 `loaded`
 * 保持 false，页面 onMounted 里的 `catalog.ensure()` 仍会重试。SSR 成功时水合直接复用
 * 这份 state，之后跨页面导航也因 loaded=true 不再重复请求。
 */
export async function useToolCatalogSsr(): Promise<ReturnType<typeof useToolCatalog>> {
  const catalog = useToolCatalog()
  // 固定 key：同一路由内 Nuxt 会去重；SSR 结果进 payload，水合时不会重跑 handler。
  await useAsyncData('hg:tools:list', async () => {
    if (catalog.loaded.value) return catalog.tools.value
    return catalog.refresh()
  })
  return catalog
}
