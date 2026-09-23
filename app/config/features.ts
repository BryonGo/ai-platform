/**
 * 前台功能开关。
 *
 * 只控制**入口可见性**，不删功能：被关掉的页面、接口、组件都还在仓库里，直接访问 URL
 * 依然可用；恢复就是把这个开关改回 true（不需要回滚代码）。
 *
 * 为什么用集中式开关而不是把入口注释掉：注释掉的入口没有任何提示，过两周没人知道
 * "这块功能到底是没有、还是被藏了"。开关 + 这里的说明把"为什么藏、怎么开回来"写在一处。
 */
export const FEATURES = {
  /**
   * 角色资产（/characters 及其侧栏 / 资产分区 / 搜索入口）。
   *
   * 2026-09 起暂时从前台入口撤下：角色资产库的种子数据与筛选口径还要再定，
   * 入口开着会让用户点进一个半成品。功能（页面、/hougong/characters 接口、卡片与表单组件、
   * 创作页里的角色选择）全部保留，改回 true 即可恢复入口。
   */
  characterAssets: false
} as const

export type FeatureKey = keyof typeof FEATURES

/** 读开关：写成函数是为了以后能接远程配置/灰度而不动调用点。 */
export function featureEnabled(key: FeatureKey): boolean {
  return FEATURES[key]
}

/**
 * 画布入口开关。
 *
 * 与上面写死在代码里的开关不同：画布由产品侧并发开发中，本地/dev 必须能用、生产必须屏蔽，
 * 所以它取 runtimeConfig.public.canvasEnabled（env `NUXT_PUBLIC_CANVAS_ENABLED`，见
 * nuxt.config.ts），生产由 compose 传 `false` —— 屏蔽与恢复都只改环境变量，不动代码。
 *
 * 关闭时只隐藏侧栏入口（app.vue）；/canvas 路由仍然可以通过直达链接访问。
 * 入口可见性与路由可访问性分开，避免历史链接或作品内的画布入口失效。
 *
 * 取值容错：环境变量在运行时覆盖时可能是字符串（'false'），也可能是布尔（false），
 * 两种都按关闭处理；缺省=开启，避免本地被误关。
 */
export function canvasFeatureEnabled(): boolean {
  const value: unknown = useRuntimeConfig().public.canvasEnabled
  if (value === undefined || value === null || value === '') return true
  if (typeof value === 'boolean') return value
  const text = String(value).trim().toLowerCase()
  return !(text === 'false' || text === '0' || text === 'no' || text === 'off')
}
