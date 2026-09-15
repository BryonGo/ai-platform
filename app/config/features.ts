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
