/** Streaming SSE decoder supporting LF/CRLF, arbitrary chunks and multiline data. */
export async function readCanvasEvents(
  body: ReadableStream<Uint8Array>,
  onEvent: (event: string, data: Record<string, unknown>) => void
): Promise<void> {
  const reader = body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  const dispatch = (frame: string) => {
    let event = 'message'
    const data: string[] = []
    for (const line of frame.split(/\r?\n/)) {
      if (line.startsWith(':')) continue
      const separator = line.indexOf(':')
      const field = separator < 0 ? line : line.slice(0, separator)
      const value = separator < 0 ? '' : line.slice(separator + 1).replace(/^ /, '')
      if (field === 'event') event = value
      if (field === 'data') data.push(value)
    }
    if (!data.length) return
    const parsed: unknown = JSON.parse(data.join('\n'))
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('事件数据格式无效')
    onEvent(event, parsed as Record<string, unknown>)
  }
  try {
    for (;;) {
      const { value, done } = await reader.read()
      buffer += done ? decoder.decode() : decoder.decode(value, { stream: true })
      let match = /\r?\n\r?\n/.exec(buffer)
      while (match) {
        dispatch(buffer.slice(0, match.index))
        buffer = buffer.slice(match.index + match[0].length)
        match = /\r?\n\r?\n/.exec(buffer)
      }
      if (done) break
    }
    if (buffer.trim()) throw new Error('事件流意外中断，请同步服务端状态后再试')
  } finally {
    await reader.cancel().catch(() => {})
    reader.releaseLock()
  }
}
