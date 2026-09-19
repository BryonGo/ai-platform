import test from 'node:test'
import assert from 'node:assert/strict'
import { layoutCanvas } from '../app/data/canvas-layout.ts'
import { createHistory } from '../app/data/canvas-history.ts'

const node = (id, kind, shot, height = 320) => ({ id, kind, shot, width: 268, height })
const edge = (from, to) => ({ from: { node: from }, to: { node: to } })
const nodes = [node('script', 'script_in'), node('split', 'script_split'), node('cast-b', 'character'), node('cast-a', 'character'), node('scene', 'scene'), node('board', 'shotlist'), node('key2', 'keyframe', 2, 620), node('key1', 'keyframe', 1), node('video2', 'i2v', 2), node('video1', 'i2v', 1), node('out', 'compose'), node('draft', 'character')]
const edges = [edge('script', 'split'), ...['cast-a', 'cast-b', 'scene', 'board'].map(id => edge('split', id)), edge('board', 'key1'), edge('board', 'key2'), edge('cast-a', 'key1'), edge('cast-b', 'key2'), edge('key1', 'video1'), edge('key2', 'video2'), edge('video1', 'out'), edge('video2', 'out')]

test('阶段分列、镜号分行、草稿放在主流程下方；不改变输入', () => {
  const before = JSON.stringify({ nodes, edges })
  const positions = layoutCanvas(nodes, edges)
  for (const e of edges) assert.ok(positions[e.from.node].x < positions[e.to.node].x)
  assert.equal(positions['cast-a'].x, positions.scene.x)
  assert.ok(positions['cast-b'].y < positions.scene.y)
  assert.equal(positions.key1.y, positions.video1.y)
  assert.equal(positions.key2.y, positions.video2.y)
  assert.ok(positions.key1.y < positions.key2.y)
  assert.ok(positions.draft.y > positions.key2.y + 620)
  assert.equal(JSON.stringify({ nodes, edges }), before)
})

test('实际尺寸不同、同镜多节点也不重叠；输入顺序不影响结果', () => {
  const list = [...nodes, node('key1-alt', 'keyframe', 1, 750)]
  const links = [...edges, edge('board', 'key1-alt'), edge('key1-alt', 'video1')]
  const positions = layoutCanvas(list, links)
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j], p = positions[a.id], q = positions[b.id]
      assert.ok(p.x + a.width <= q.x || q.x + b.width <= p.x || p.y + a.height <= q.y || q.y + b.height <= p.y, `${a.id} overlaps ${b.id}`)
    }
  }
  assert.deepEqual(layoutCanvas([...list].reverse(), [...links].reverse()), positions)
})

test('空图、独立节点、缺失节点边、重复边与循环图', () => {
  assert.deepEqual(layoutCanvas([], []), {})
  assert.deepEqual(layoutCanvas([node('x', 'character')], [edge('missing', 'x')]), { x: { x: 48, y: 48 } })
  assert.deepEqual(layoutCanvas(nodes, [...edges, edges[0]]), layoutCanvas(nodes, edges))
  assert.throws(() => layoutCanvas(nodes, [...edges, edge('out', 'script')]), /循环/)
  assert.throws(() => layoutCanvas([node('x', 'character')], [edge('x', 'x')]), /循环/)
})

test('整理保存位置快照后，一步撤销精确恢复、重做恢复整理', () => {
  const history = createHistory(50, (a, b) => JSON.stringify(a) === JSON.stringify(b))
  history.reset({ script: { x: 5, y: 6 } })
  const pendingEdit = { script: { x: 100, y: -10 } }
  history.push(pendingEdit)
  const arranged = layoutCanvas([node('script', 'script_in')], [])
  history.push(arranged)
  history.push(structuredClone(arranged))
  assert.deepEqual(history.undo(), pendingEdit)
  assert.deepEqual(history.redo(), arranged)
})

test('同组角色按下游镜号排序，减少跨镜连线交叉', () => {
  const list = [node('cast-a', 'character'), node('cast-z', 'character'), node('k1', 'keyframe', 1), node('k2', 'keyframe', 2)]
  const positions = layoutCanvas(list, [edge('cast-a', 'k2'), edge('cast-z', 'k1')])
  assert.ok(positions['cast-z'].y < positions['cast-a'].y)
})
