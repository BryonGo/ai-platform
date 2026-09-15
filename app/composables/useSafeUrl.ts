// 仅允许安全协议的 URL 用于 :href / window.open，阻断 javascript:/data: 等非安全协议
// （后端返回的 URL 若被污染为 javascript:alert(1)，点击即在前页执行脚本）。
// 允许的协议：http/https/blob/data（图片预览）/相对路径（以 / 开头）。
const SAFE_PROTOCOLS = ['http:', 'https:', 'blob:', 'data:']

export function safeHref(url: string | undefined | null): string | undefined {
  if (!url) return undefined
  try {
    const u = new URL(url, window.location.origin)
    if (SAFE_PROTOCOLS.includes(u.protocol)) return url
  } catch {
    // 解析失败多为相对路径（以 / 开头），按同源安全处理
    if (url.startsWith('/')) return url
  }
  return undefined
}
