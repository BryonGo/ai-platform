// 工具的能力边界提示（前端）。
//
// 为什么要有这个文件
// ------------------
// 脱衣现在只支持**单人女性**：模型是按女性人体训的，男性会出废图，多人合影只会
// 处理其中一个人。这个限制必须写在**传图之前** —— 等出图了再说"不支持男性"就晚了，
// 用户已经等了一两分钟、积分也扣了，最后拿到一张废图。
//
// 为什么放前端而不是后台字段
// --------------------------
// 三个理由：
//   1. 这是**临时**约束（男性/多人后续要支持），临时约束配临时代码，删的时候删一个文件；
//   2. 后台的 `hougong_tool.summary` 只在这一个页面渲染（效果列表卡片不显示
//      summary，见 app/pages/effects.vue），写进 summary 就是在同一屏上把同一句话
//      说两遍；
//   3. 提示要有视觉重量（琥珀色边框 + 图标），summary 是 <p> 里的灰字，给不了。
//
// 真要交给运营随时改，得给 hougong_tool 加一个 notice 字段 —— 那是另一件事。
// 在那之前，改文案就是改这个文件。

export interface ToolNotice {
  /** 一句话说清限制本身。 */
  text: string
  /** 可选：补充"不符合会怎样"，帮用户判断要不要换图。 */
  detail?: string
}

const TOOL_NOTICES: Record<string, ToolNotice> = {
  'undress-ai': {
    text: '目前仅支持单人女性照片',
    detail: '男性、多人合影、卡通/插画暂时出不了图，这几类后续会陆续支持。'
  }
}

/** toolNotice 取某个工具的边界提示；没有就返回 undefined（不渲染提示块）。 */
export function toolNotice(code: string): ToolNotice | undefined {
  return code ? TOOL_NOTICES[code] : undefined
}
