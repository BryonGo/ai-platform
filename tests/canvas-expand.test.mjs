// 「生成节点」必须**幂等**：按镜复用、只补缺的。
//
// 用户 2026-09-19 报的 bug：分镜表有 4 镜，点一次「生成节点」建了一套；
// 再点一次不是"补齐/不动"，而是**又叠一套**（旧的没删），图上一片重复节点。
// 根因是按 `kind` 数已有几个、从下一个编号接着排 —— 编号不代表镜头。
import test from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

registerHooks({ resolve(specifier, context, nextResolve) {
  if (specifier.startsWith('~/')) return nextResolve(new URL(`../app/${specifier.slice(2)}.ts`, import.meta.url).href, context)
  if (specifier.startsWith('./canvas-') && !specifier.endsWith('.ts')) return nextResolve(`${specifier}.ts`, context)
  return nextResolve(specifier, context)
} })

const { expandShotlist, createNode } = await import('../app/data/canvas-graph.ts')

function baseGraph() {
  const shotlist = createNode('shotlist', { x: 0, y: 0 }, '分镜生成')
  return { version: 1, frameGrid: [124, 158], nodes: [shotlist], edges: [] }
}

test('第二次点「生成节点」不再叠一套，而是复用 + 只补缺的', () => {
  const graph = baseGraph()
  const first = expandShotlist(graph, graph.nodes[0].id, 4)
  graph.nodes.push(...first.nodes)
  graph.edges.push(...first.edges)
  const afterFirst = graph.nodes.length
  assert.equal(first.nodes.length, 8, '4 镜应建 首帧+视频 各 4 个')
  assert.equal(afterFirst, 9) // 分镜表 + 8

  const second = expandShotlist(graph, graph.nodes[0].id, 4)
  assert.equal(second.nodes.length, 0, '同一批镜头第二次不该新建任何节点')
  assert.equal(second.reused.length, 8, '8 个节点应被复用')
  assert.equal(second.edges.length, 0, '连线已存在，也不该再加')

  graph.nodes.push(...second.nodes)
  graph.edges.push(...second.edges)
  assert.equal(graph.nodes.length, afterFirst, '节点总数不变（不叠加）')
})

test('只缺一镜时补那一镜，且编号/连线按镜号来', () => {
  const graph = baseGraph()
  const first = expandShotlist(graph, graph.nodes[0].id, 3)
  graph.nodes.push(...first.nodes)
  graph.edges.push(...first.edges)

  // 手工删掉第 2 镜的首帧与视频（模拟"少建了一镜"）
  graph.nodes = graph.nodes.filter(n => n.ref?.shotIdx !== 2)
  const before = graph.nodes.length
  const again = expandShotlist(graph, graph.nodes[0].id, 3)
  graph.nodes.push(...again.nodes)
  const idx2 = graph.nodes.filter(n => n.ref?.shotIdx === 2)
  assert.equal(again.nodes.length, 2, '只该补第 2 镜的首帧+视频')
  assert.equal(idx2.length, 2)
  assert.equal(graph.nodes.length, before + 2)
  // 补出来的节点标题仍按镜号（不是"接着编号"）
  assert.ok(idx2.every(n => n.title.startsWith('S02')), idx2.map(n => n.title).join(','))
})
