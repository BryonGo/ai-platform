// HEAD /api/version —— 只为探活/监控存在，回答"这个端点在不在这里"。
//
// 正文由 version.get.ts 提供；HEAD 按 HTTP 语义不带正文，所以这里只落头部。
// 两个文件必须同时存在，缺一个就会出现"GET 200 但 HEAD 404"的误导性结果。
export default defineEventHandler((event) => {
  setVersionCacheHeaders(event)
  setHeader(event, 'Content-Type', 'application/json')
  // 返回空串而不是 null：h3 对 null 会走 sendNoContent 把状态码改成 204，
  // 而 HEAD 按语义应当与 GET 同码（200）—— 只探状态的监控才不会被 204 搞糊涂。
  return ''
})
