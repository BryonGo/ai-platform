import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import { ref, computed, watch, nextTick, effectScope } from 'vue'
import { mergeCanvas, editableGraph, withServerOutputs } from '../app/data/canvas-sync.ts'
import { readCanvasEvents } from '../app/data/canvas-sse.ts'
import { structuredCells, validateStructuredEdit, streamCells, characterEntries } from '../app/data/canvas-structured.ts'

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('~/')) return nextResolve(new URL(`../app/${specifier.slice(2)}.ts`, import.meta.url).href, context)
  if (specifier.startsWith('./canvas-') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context)
  return nextResolve(specifier, context)
} })
const { nodeState } = await import('../app/data/canvas-graph.ts')
const { useCanvasHistory } = await import('../app/composables/useCanvasHistory.ts')
const { useCanvasRows } = await import('../app/composables/useCanvasRows.ts')
const cleanups = []
Object.assign(globalThis, { ref, computed, watch, nextTick, onBeforeUnmount: callback => cleanups.push(callback), window: { setTimeout, clearTimeout } })
const makeGraph = () => ({ version: 1, frameGrid: [], nodes: [
  { id: 'up', kind: 'script_split', title: '拆解', at: { x: 0, y: 0 }, params: {}, inputs: {}, outputs: { characters: { artifactId: 'a1', version: 1 } } },
  { id: 'down', kind: 'character', title: '角色', at: { x: 300, y: 0 }, params: { name: '甲' }, inputs: { characters: [{ from: 'up', slot: 'characters', artifactId: 'a1', version: 1 }] }, outputs: { image: { artifactId: 'old', version: 1 } } }
], edges: [{ id: 'e', from: { node: 'up', slot: 'characters' }, to: { node: 'down', slot: 'characters' } }] })

test('任务更新保留本地参数、拖动和删除，更新产物及衍生输入', () => {
  const base = makeGraph(), local = structuredClone(base), remote = structuredClone(base)
  local.nodes[1].params.name = '本地修改'
  local.nodes[1].at.x = 999
  remote.nodes[0].outputs.characters = { artifactId: 'a2', version: 2 }
  const merged = mergeCanvas(local, base, remote)
  assert.equal(merged.conflict, false)
  assert.equal(merged.graph.nodes[1].params.name, '本地修改')
  assert.equal(merged.graph.nodes[1].at.x, 999)
  assert.equal(merged.graph.nodes[1].inputs.characters[0].artifactId, 'a2')
  local.nodes.pop(); local.edges = []
  assert.equal(mergeCanvas(local, base, remote).graph.nodes.length, 1)
})

test('双方编辑时报告冲突；本地未编辑时接受服务端内容', () => {
  const base = makeGraph(), local = structuredClone(base), remote = structuredClone(base)
  local.nodes[1].params.name = '本地'
  remote.nodes[1].params.name = '远端'
  assert.equal(mergeCanvas(local, base, remote).conflict, true)
  assert.equal(mergeCanvas(local, base, remote).graph.nodes[1].params.name, '本地')
  assert.deepEqual(mergeCanvas(base, base, remote).graph, remote)
})

test('已有旧产物也不能绕过上游确认、缺失产物和运行中检查', () => {
  const graph = makeGraph(), node = graph.nodes[1]
  const pending = [{ id: 'a1', review: 'pending' }, { id: 'old', review: 'approved' }]
  assert.equal(nodeState(graph, node, [], pending), 'awaiting')
  assert.equal(nodeState(graph, node, [], [{ id: 'old', review: 'approved' }]), 'blocked')
  pending[0].review = 'approved'
  assert.equal(nodeState(graph, node, [], pending), 'ready')
  assert.equal(nodeState(graph, node, [{ nodeId: 'up', status: 'running' }], pending), 'blocked')
})

test('撤销编辑不回退产物审核及最新选择，删除节点也能撤销', async () => {
  const scope = effectScope(), graph = ref(makeGraph()), artifacts = ref([{ id: 'a1', review: 'pending' }])
  const history = scope.run(() => useCanvasHistory({ graph, artifacts, selectedId: ref('down'), toast() {}, remeasure() {} }))
  await history.transaction(() => { graph.value.nodes[1].at.x = 700 })
  artifacts.value[0].review = 'approved'
  graph.value.nodes[0].outputs.characters = { artifactId: 'a2', version: 2 }
  await nextTick()
  history.undo()
  await nextTick()
  assert.equal(graph.value.nodes[1].at.x, 300)
  assert.equal(artifacts.value[0].review, 'approved')
  assert.equal(graph.value.nodes[1].inputs.characters[0].artifactId, 'a2')
  await history.transaction(() => { graph.value.nodes = graph.value.nodes.filter(n => n.id !== 'up'); graph.value.edges = [] })
  history.undo(); await nextTick()
  assert.equal(graph.value.nodes.find(n => n.id === 'up').outputs.characters.artifactId, 'a2')
  scope.stop(); cleanups.splice(0).forEach(fn => fn())
})

test('分镜草稿按产物版本隔离，切换回来仍保留草稿', () => {
  const graph = ref({ ...makeGraph(), nodes: [{ ...makeGraph().nodes[0], kind: 'shotlist', outputs: { table: { artifactId: 'a1', version: 1 } } }] })
  const artifacts = ref([{ id: 'a1', rows: [{ idx: 1, line: '第一版' }] }, { id: 'a2', rows: [{ idx: 1, line: '第二版' }] }])
  const rows = useCanvasRows({ graph, artifacts, toast() {} })
  rows.updateRow('up', 0, 'line', '草稿')
  graph.value.nodes[0].outputs.table = { artifactId: 'a2', version: 2 }
  assert.equal(rows.tableRowsOf(graph.value.nodes[0])[0].line, '第二版')
  assert.equal(rows.rowsDirty('up'), false)
  graph.value.nodes[0].outputs.table = { artifactId: 'a1', version: 1 }
  assert.equal(rows.tableRowsOf(graph.value.nodes[0])[0].line, '草稿')
})

const stream = text => new ReadableStream({ start(controller) {
  for (const byte of new TextEncoder().encode(text)) controller.enqueue(new Uint8Array([byte]))
  controller.close()
} })
test('SSE 支持逐字节 UTF8、CRLF、无空格字段及多行 data', async () => {
  const events = []
  await readCanvasEvents(stream(': ping\r\nevent:delta\r\ndata:{"text":\r\ndata:"你好"}\r\n\r\nevent:done\r\ndata:{}\r\n\r\n'), (event, data) => events.push({ event, data }))
  assert.deepEqual(events, [{ event: 'delta', data: { text: '你好' } }, { event: 'done', data: {} }])
})
test('截断帧和无效数据不能被默默当作成功', async () => {
  await assert.rejects(readCanvasEvents(stream('event:delta\ndata:{"text":"断开"}'), () => {}), /中断/)
  await assert.rejects(readCanvasEvents(stream('event:artifact\ndata:not-json\n\n'), () => {}))
})

test('标识和引用只读，文本仍能编辑，年龄保留在角色上下文中', () => {
  const original = '[{"id":"char_1","name":"甲","age":20}]'
  const cells = structuredCells(JSON.parse(original))
  assert.equal(cells.find(c => c.label.endsWith('id')).readonly, true)
  assert.equal(cells.find(c => c.label.endsWith('name')).readonly, false)
  assert.equal(validateStructuredEdit(original, original.replace('char_1', 'char_2'), 'characters'), '标识、引用与非文本字段不可在正文编辑中修改')
  assert.equal(validateStructuredEdit(original, original.replace('甲', '乙'), 'characters'), undefined)
  assert.match(characterEntries(original)[0].description, /20/)
  assert.ok(validateStructuredEdit('', '42', 'characters'))
  assert.deepEqual(streamCells('{"characters":["甲","乙').map(c => c.value), ['甲', '乙'])
})
