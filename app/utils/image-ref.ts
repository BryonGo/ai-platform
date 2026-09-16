// 参考图在提示词里的引用：`@` 插入一个原子 chip，提交时序列化成给上游看的措辞。
//
// 背景（用户需求）：草稿里要能写「参考 @图1 的光线，@图2 的构图」。
// 上游只按**顺序**收到几张图，看不到我们的编号，所以 `@图N` 最终必须变成一句
// 上游读得懂的话。措辞是真实调用实测过的（2026-09-15，8/8 通过）：中文「参考图N」在
// Seedream 5.0 Pro / GPT Image 2 / Nano Banana 2 上都准确对号，2 图与 3 图场景均成立，
// 英文 "the Nth reference image" 同样成立 —— 因此**不按模型分化**，统一「参考图N」。
// 实测方法与结论见 docs/REFERENCE-IMAGE-MENTION.md，复现命令见 aicodcms/hack/aiword。
//
// 视频（本地 comfy i2v，MiniMax H3）是**另一套编号**，必须分开算：
// 第 1 张是首帧（工作流里的 first_frame 输入），第 2 张起才是参考图，且从 0 开始
// 对应 ref_images.ref_image_0/1/2…（见 aicodcms internal/platform/task/workflow/i2v.go）。
// 所以视频里「第 2 张图」上游看到的是**参考图第 1 张**：若还按「参考图2」写进提示词，
// 用户说的编号与模型实际的图位就错开一位 —— 表现是"照着参考图改了，但改的是另一张"。
//
// 为什么复用 snippet 原子节点：编辑器的超级标签节点已经具备「原子 chip + 序列化 +
// 外部回填」的全部能力（见 enhancement-mark.ts），换的只是数据来源（参考图而不是
// 角色/服装那些远端标签），编辑器本身不用改。
import type { Prompt, SnippetSnapshot } from '~/components/prompt/enhancement-mark'

/** chip 快照 id 前缀：`imageref:<index>`（index 从 1 开始，与图条顺序一致）。 */
export const IMAGEREF_ID_PREFIX = 'imageref:'

/**
 * 给上游看的措辞（集中在这里，改动时同步下面的引用正则）。
 *
 * @param firstFrameRole 第 1 张是不是首帧（本地/云端视频都是）：是则 1 → 首帧、N≥2 → 参考图N-1。
 */
export function imageRefWording(index: number, firstFrameRole = false): string {
  if (firstFrameRole) return index === 1 ? '首帧' : `参考图${index - 1}`
  return `参考图${index}`
}

/** chip 与图条上的短标签（首帧 / 参考1 / 图1）。 */
export function imageRefLabel(index: number, firstFrameRole = false): string {
  if (firstFrameRole) return index === 1 ? '首帧' : `参考${index - 1}`
  return `图${index}`
}

/** 提示词里识别引用措辞用的正则源（与 imageRefWording 必须同步）。 */
export const IMAGE_REF_PATTERN = '参考图(\\d+)|首帧'
/** 提示词里识别「参考图N」用的正则（图片模式；视频模式另加 首帧，见 missingImageRefs）。 */
export const IMAGE_REF_RE = /参考图(\d+)/g

/** 从 chip 快照 id 解析出图片序号（不是本模块的 chip 返回 0）。 */
export function imageRefIndexOf(sourceId: string | undefined | null): number {
  if (!sourceId?.startsWith(IMAGEREF_ID_PREFIX)) return 0
  const n = Number(sourceId.slice(IMAGEREF_ID_PREFIX.length))
  return Number.isFinite(n) && n >= 1 ? n : 0
}

/**
 * 构造一个代表「第 index 张图」的快照（index 从 1 开始）。
 *
 * category.key 用 'image'：chip 上只显示短标签（见 enhancement-mark.ts 的 image 分支），
 * 序列化进提示词时取 prompt.chinese/english（两处同值，与既有「参考图N」口径一致）。
 */
export function imageRefSnapshot(index: number, firstFrameRole = false): SnippetSnapshot {
  const wording = imageRefWording(index, firstFrameRole)
  const label = imageRefLabel(index, firstFrameRole)
  return {
    id: `${IMAGEREF_ID_PREFIX}${index}`,
    category: { key: 'image', labels: { chinese: firstFrameRole && index === 1 ? '首帧' : '参考图', english: 'Reference' } },
    labels: { chinese: label, english: label },
    prompt: { chinese: wording, english: wording },
    preview: null
  }
}

/**
 * 按当前模式重写提示词里所有 `@` 图 chip 的措辞。
 *
 * 为什么不在插入时就定死：图片 ↔ 视频可以来回切（切模式不清空已加的图），而第 1 张在
 * 视频里是首帧、在图片里只是参考图。措辞按**提交时的模式**算，模型侧永远不会错位。
 */
export function applyImageRefRoles(prompt: Prompt, firstFrameRole: boolean): Prompt {
  let changed = false
  const parts = prompt.parts.map((part) => {
    if (part.kind !== 'snippet') return part
    const index = imageRefIndexOf(part.source.id)
    if (!index) return part
    const next = imageRefSnapshot(index, firstFrameRole)
    if (next.prompt.english === part.source.prompt.english) return part
    changed = true
    return { ...part, source: next }
  })
  return changed ? { ...prompt, parts } : prompt
}

/**
 * 提示词里引用了、但当前已不存在的图片序号（按用户要求：不重编号、保留文字，
 * 提交前提示「@图N 已不存在」）。
 *
 * 视频模式第 1 张是首帧、其余是参考图：`首帧` 需要 ≥1 张；`参考图N` 需要 ≥N+1 张。
 */
export function missingImageRefs(text: string, available: number, firstFrameRole = false): number[] {
  const missing = new Set<number>()
  for (const m of (text || '').matchAll(/参考图(\d+)|首帧/g)) {
    if (m[0] === '首帧') {
      if (firstFrameRole && available < 1) missing.add(1)
      continue
    }
    const n = Number(m[1])
    if (!Number.isFinite(n)) continue
    // 视频里「参考图N」指的是第 N+1 张（第 1 张是首帧）；图片里就是第 N 张。
    const need = firstFrameRole ? n + 1 : n
    if (need > available) missing.add(need)
  }
  return [...missing].sort((a, b) => a - b)
}
