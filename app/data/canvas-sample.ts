/**
 * 画布示例图：照界面原型搭的一条最短生产线，用于前端先行开发（后端接口还没实现时）。
 *
 * 这份数据是**显式示例**：页面上必须挂「示例数据」标记，用户一眼能看出不是真的。
 * 后端接通后，overview 返回真实 graph / artifacts / runs，这份只留给「重置示例」用。
 *
 * 一集三镜，故意覆盖全部状态，方便评审时一次看清：
 *   已就绪 · 等待上游 · 运行中 · 失败 · 产物待审 · 一条被驳回的旧版本
 */

import type { CanvasArtifact, CanvasGraph, CanvasNode, CanvasRun, CanvasSample } from './canvas-graph'
import { createNode, makeEdge, paramsHash, selectArtifact, topoOrder } from './canvas-graph'
import { FRAME_GRID } from './canvas-nodes'

const IMG = [
  '/mock/home/explore-01.png',
  '/mock/home/explore-02.png',
  '/mock/home/explore-03.png',
  '/mock/home/explore-04.png'
]

function img(i: number): string {
  return IMG[i % IMG.length] ?? IMG[0]!
}

const SHOT_ROWS = [
  { idx: 1, shotSize: '远景', camera: '固定', frames: 124, scene: 'SC-破庙-夜', keyframePrompt: '破庙外景，暴雨，烛火从窗缝透出', line: '' },
  { idx: 2, shotSize: '中景', camera: '缓慢推近', frames: 158, scene: 'SC-破庙-内', keyframePrompt: '红衣女子缓缓回头，冷色调电影布光', line: '你不是已经死了吗？' },
  { idx: 3, shotSize: '特写', camera: '固定', frames: 141, scene: 'SC-破庙-内', keyframePrompt: '她瞳孔收缩，烛火在眼中晃动', line: '……七天。' }
]

/** 建一份示例图（每次调用都是全新一份，避免「重置示例」把上一次的对象改脏）。 */
export function buildCanvasSample(): CanvasSample {
  const nodes: CanvasNode[] = []
  const edges: CanvasGraph['edges'] = []
  const artifacts: CanvasArtifact[] = []
  const runs: CanvasRun[] = []

  const script = createNode('script_in', { x: 60, y: 250 }, '剧本输入')
  const split = createNode('script_split', { x: 360, y: 250 }, '剧本拆解')
  const cast = createNode('character', { x: 660, y: 40 }, '角色设定 · 林知遥')
  const board = createNode('shotlist', { x: 660, y: 400 }, '分镜生成')
  const kf1 = createNode('keyframe', { x: 1000, y: 90 }, 'S01 关键帧', 1)
  const kf2 = createNode('keyframe', { x: 1000, y: 300 }, 'S02 关键帧', 2)
  const kf3 = createNode('keyframe', { x: 1000, y: 510 }, 'S03 关键帧', 3)
  const vd1 = createNode('i2v', { x: 1320, y: 90 }, 'S01 视频', 1)
  const vd2 = createNode('i2v', { x: 1320, y: 300 }, 'S02 视频', 2)
  const vd3 = createNode('i2v', { x: 1320, y: 510 }, 'S03 视频', 3)
  const audio = createNode('audio', { x: 1000, y: 740 }, '配音配乐')
  const compose = createNode('compose', { x: 1320, y: 740 }, '剪辑合成')
  const exp = createNode('export', { x: 1660, y: 300 }, '成片导出')

  script.params.text = '第 1 集 · 回魂夜\n\n破庙。暴雨敲着残破的屋脊。她睁开眼，坐在自己的灵堂里——七天了，没有人来收尸。'
  cast.params.name = '林知遥'
  cast.params.appearance = '红衣、长发、左眉一道旧疤；眼神克制，笑的时候只看嘴角'
  kf1.params.count = '3'
  kf2.params.count = '3'
  vd2.params.tier = 'preview'
  vd3.params.tier = 'final'
  exp.params.nameRule = 'E01-S{镜号}.mp4'

  nodes.push(script, split, cast, board, kf1, kf2, kf3, vd1, vd2, vd3, audio, compose, exp)
  edges.push(
    makeEdge(script.id, 'text', split.id, 'text'),
    makeEdge(split.id, 'outline', cast.id, 'outline'),
    makeEdge(split.id, 'outline', board.id, 'outline'),
    makeEdge(board.id, 'table', kf1.id, 'shot'),
    makeEdge(board.id, 'table', kf2.id, 'shot'),
    makeEdge(board.id, 'table', kf3.id, 'shot'),
    makeEdge(cast.id, 'image', kf1.id, 'ref'),
    makeEdge(cast.id, 'image', kf2.id, 'ref'),
    makeEdge(cast.id, 'image', kf3.id, 'ref'),
    makeEdge(kf1.id, 'image', vd1.id, 'firstFrame'),
    makeEdge(kf2.id, 'image', vd2.id, 'firstFrame'),
    makeEdge(kf3.id, 'image', vd3.id, 'firstFrame'),
    makeEdge(vd2.id, 'video', exp.id, 'video')
  )

  const graph: CanvasGraph = { version: 1, frameGrid: [...FRAME_GRID], nodes, edges }

  const at = (n: number) => `2026-09-17 14:${String(n).padStart(2, '0')}`
  const push = (a: Omit<CanvasArtifact, 'createdAt'> & { createdAt?: string }) => {
    const artifact: CanvasArtifact = { createdAt: at(artifacts.length + 2), ...a } as CanvasArtifact
    artifacts.push(artifact)
    selectArtifact(graph, artifact)
    return artifact
  }

  push({ id: 'a_script', nodeId: script.id, slot: 'text', type: 'text', version: 1, review: 'approved', note: '剧本 · 118 字', text: String(script.params.text) })
  push({ id: 'a_split', nodeId: split.id, slot: 'outline', type: 'outline', version: 1, review: 'approved', note: '3 场 · 3 镜', text: '场 1 破庙外 / 暴雨 · 场 2 灵堂 / 回头 · 场 3 特写 / 七日' })
  push({ id: 'a_cast', nodeId: cast.id, slot: 'image', type: 'image', version: 1, url: img(1), review: 'approved', note: '三视图 3 张' })
  push({ id: 'a_board', nodeId: board.id, slot: 'table', type: 'table', version: 1, review: 'approved', note: `${SHOT_ROWS.length} 镜`, rows: SHOT_ROWS })
  push({ id: 'a_kf1', nodeId: kf1.id, slot: 'image', type: 'image', version: 1, url: img(2), review: 'pending', note: '3 张 · 768x1344' })
  push({ id: 'a_kf2_v1', nodeId: kf2.id, slot: 'image', type: 'image', version: 1, url: img(0), review: 'rejected', note: '3 张 · 被驳回' })
  push({ id: 'a_kf2_v2', nodeId: kf2.id, slot: 'image', type: 'image', version: 2, url: img(3), review: 'approved', note: '3 张 · 这张过' })
  push({ id: 'a_vd2', nodeId: vd2.id, slot: 'video', type: 'video', version: 1, url: img(2), review: 'approved', note: '432x768 · 6.6s' })

  // 已跑过的节点补一条成功的 run，指纹按当前参数算 —— 于是它们不会出现在「运行全部」里
  const done = (node: CanvasNode, cost: number, minute: number) => {
    runs.push({
      id: `r_${node.id}`,
      nodeId: node.id,
      paramsHash: paramsHash(node),
      status: 'done',
      costCredits: cost,
      startedAt: at(minute),
      finishedAt: at(minute + 1)
    })
  }
  done(script, 0, 2)
  done(split, 5, 3)
  done(cast, 24, 4)
  done(board, 8, 5)
  done(kf1, 12, 6)
  done(kf2, 36, 8)
  done(vd2, 96, 10)

  runs.push({ id: `r_${kf3.id}`, nodeId: kf3.id, paramsHash: paramsHash(kf3), status: 'running', startedAt: at(12) })
  runs.push({
    id: `r_${vd3.id}`,
    nodeId: vd3.id,
    paramsHash: paramsHash(vd3),
    status: 'failed',
    error: 'comfy85 未就绪：连接被拒绝（127.0.0.1:8188）',
    startedAt: at(13),
    finishedAt: at(14)
  })

  // 拓扑序排一遍，保证示例图本身是合法的（有环会被下面的断言在开发期抓出来）
  const order = topoOrder(graph)
  if (order.length !== nodes.length) throw new Error('示例图数据有问题：节点数与拓扑序不一致')

  return { graph, artifacts, runs }
}
