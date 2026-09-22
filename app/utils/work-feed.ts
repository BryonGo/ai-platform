// 作品流（探索 / TV 频道）的**共用取数与映射**。
//
// 首页「探索灵感」和 TV 频道读的是同一个后端流（`listWorksFeed` + scope），只是排版不同。
// 映射逻辑（视频/图片分支、角标推导、封面取舍）只写一份 —— 两处各写一份的话，
// 「视频不给 cover」这种规则迟早只在一边生效，另一边又是坏图。
import type { PublicationWork } from '~/composables/useHougongApi'
import type { ExploreWork } from '~/data/hougong-home'
import { looksLikeVideoUrl } from '~/composables/useAutoPlayVideo'

/**
 * 后端作品 → 前台展示结构。
 *
 * 角标是**推导**出来的，不是后端字段：有互动量算「热门」，否则七天内的作品算「最新」，
 * 都没有就不打角标 —— 不打无意义的角标比硬凑一个诚实。
 */
export function toExploreWork(work: PublicationWork): ExploreWork {
  const likes = work.stats?.likes ?? 0
  const publishedMs = Number(work.publishedAt || 0) * 1000 // 后端是 Unix 秒
  const badge: ExploreWork['badge'] = likes >= 5
    ? '热门'
    : (publishedMs && Date.now() - publishedMs < 7 * 24 * 3600 * 1000 ? '最新' : undefined)
  // 视频作品的「封面」就是那段 mp4：后端现在会把 kind/videoUrl 一起下发，
  // 卡片据此走 <video>。老后端没有 kind 时退回嗅探扩展名，避免又出现坏图。
  const isVideo = work.kind === 'video'
    || (!work.kind && looksLikeVideoUrl(work.coverUrl || ''))
  const videoUrl = work.videoUrl || (isVideo ? (work.coverUrl || '') : '')
  return {
    id: String(work.id),
    title: work.title || '未命名作品',
    author: work.author?.displayName || '',
    avatar: work.author?.avatarUrl || undefined,
    // 视频不给 cover：让卡片专心走 videoUrl，免得 <img> 又拿到 mp4
    cover: isVideo ? '' : (work.coverUrl || ''),
    kind: isVideo ? 'video' : 'image',
    videoUrl: isVideo ? videoUrl : '',
    category: '推荐',
    tags: (work.tags || []).map(tag => tag.name),
    badge,
    badgeBaked: false,
    mock: false
  }
}
