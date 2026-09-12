// 画幅与分辨率选项（对齐即梦：8 档比例 + 1K/2K）。
//
// 尺寸口径沿用既有创作页的默认值：16:9 = 1344×768（1K），其余按同量级像素换算，
// 2K 为 1K 的 2 倍边长。本地模型按 width/height 提交，云端模型按 quality 提交。
export interface RatioOption {
  value: string
  label: string
  /** 横/竖/方，用于图标 */
  shape: 'wide' | 'portrait' | 'square'
  /** 1K 下的输出尺寸 */
  size1k: [number, number]
}

export const RATIO_OPTIONS: RatioOption[] = [
  { value: '21:9', label: '21:9', shape: 'wide', size1k: [1536, 640] },
  { value: '16:9', label: '16:9', shape: 'wide', size1k: [1344, 768] },
  { value: '3:2', label: '3:2', shape: 'wide', size1k: [1248, 832] },
  { value: '4:3', label: '4:3', shape: 'wide', size1k: [1152, 864] },
  { value: '1:1', label: '1:1', shape: 'square', size1k: [1024, 1024] },
  { value: '3:4', label: '3:4', shape: 'portrait', size1k: [864, 1152] },
  { value: '2:3', label: '2:3', shape: 'portrait', size1k: [832, 1248] },
  { value: '9:16', label: '9:16', shape: 'portrait', size1k: [768, 1344] }
]

export const RESOLUTIONS = [
  { value: '1K', label: '1K', factor: 1 },
  { value: '2K', label: '2K', factor: 2 }
] as const

export function ratioIcon(shape: RatioOption['shape']) {
  return shape === 'portrait' ? 'i-lucide-smartphone' : shape === 'square' ? 'i-lucide-square' : 'i-lucide-monitor'
}

/** 画幅 + 分辨率 → 输出尺寸（本地模型用） */
export function sizeFor(ratio: string, resolution: string): [number, number] {
  const option = RATIO_OPTIONS.find(item => item.value === ratio) ?? RATIO_OPTIONS[1]!
  const factor = RESOLUTIONS.find(item => item.value === resolution)?.factor ?? 1
  return [option.size1k[0] * factor, option.size1k[1] * factor]
}
