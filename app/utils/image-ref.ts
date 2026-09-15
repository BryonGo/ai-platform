// 参考图在提示词里的引用：`@` 插入一个原子 chip，提交时序列化成给上游看的措辞。
//
// 背景（用户需求）：草稿里要能写「参考 @图1 的光线，@图2 的构图」。
// 上游只按**顺序**收到几张图，看不到我们的编号，所以 `@图N` 最终必须变成一句
// 上游读得懂的话。措辞是真实调用实测过的（2026-09-15，8/8 通过）：中文「参考图N」在
// Seedream 5.0 Pro / GPT Image 2 / Nano Banana 2 上都准确对号，2 图与 3 图场景均成立，
// 英文 "the Nth reference image" 同样成立 —— 因此**不按模型分化**，统一「参考图N」。
// 实测方法与结论见 docs/REFERENCE-IMAGE-MENTION.md，复现命令见 aicodcms/hack/aiword。
//
// 为什么复用 snippet 原子节点：编辑器的超级标签节点已经具备「原子 chip + 序列化 +
// 外部回填」的全部能力（见 enhancement-mark.ts），换的只是数据来源（参考图而不是
// 角色/服装那些远端标签），编辑器本身不用改。
import type { SnippetSnapshot } from '~/components/prompt/enhancement-mark'

/** 给上游看的措辞。集中在这里，改动时同步下面的引用正则（已实测，见文件头）。 */
export function imageRefWording(index: number): string {
  return `参考图${index}`
}

/** 提示词里识别「参考图N」用的正则（与 imageRefWording 必须同步）。 */
export const IMAGE_REF_RE = /参考图(\d+)/g

/**
 * 构造一个代表「第 index 张参考图」的快照（index 从 1 开始）。
 *
 * category.key 用 'image'：chip 上只显示「图N」（见 enhancement-mark.ts 的 image 分支），
 * 序列化进提示词时取 prompt.chinese/english。
 */
export function imageRefSnapshot(index: number): SnippetSnapshot {
  return {
    id: `imageref:${index}`,
    category: { key: 'image', labels: { chinese: '参考图', english: 'Reference' } },
    labels: { chinese: `图${index}`, english: `Image ${index}` },
    prompt: { chinese: imageRefWording(index), english: imageRefWording(index) },
    preview: null
  }
}

/**
 * 提示词里引用了、但当前已不存在的参考图编号（按用户要求：不重编号、保留文字，
 * 提交前提示「@图N 已不存在」）。
 */
export function missingImageRefs(text: string, available: number): number[] {
  const missing = new Set<number>()
  for (const m of (text || '').matchAll(IMAGE_REF_RE)) {
    const n = Number(m[1])
    if (Number.isFinite(n) && n > available) missing.add(n)
  }
  return [...missing].sort((a, b) => a - b)
}
