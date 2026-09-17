/**
 * 画布示例图：照最短闭环搭的一条产线，用于前端先行开发（后端接口还没实现时）。
 *
 * 这份数据是**显式示例**：页面上必须挂「示例数据」标记，用户一眼能看出不是真的。
 * 后端接通后，overview 返回真实 graph / artifacts / runs，这份只留给「重置示例」用。
 *
 * 链路（就是产品逻辑本身，改图之前先读一遍）：
 *
 *   剧本输入 ─运行→ 剧本拆解 ─运行→ 人物列表 ┐
 *                                   场景列表 ┤
 *                                   分镜大纲 ┘
 *   人物1 + 场景2 + 分镜1 ─→ 首帧图 ─(+ 该镜关键词)─→ 视频 ─(按镜号排序)─→ 成片 ─→ 导出
 *
 * 一集三镜、两个人物、两个场景；故意覆盖全部状态，方便评审时一次看清：
 *   已就绪 · 等待上游（三样没凑齐）· 运行中 · 失败 · 产物待审 · 一条被驳回的旧版本
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
  { idx: 1, shotSize: '远景', camera: '固定', frames: 124, scene: '破庙 · 夜', keyframePrompt: '破庙外景，暴雨，烛火从窗缝透出', line: '' },
  { idx: 2, shotSize: '中景', camera: '缓慢推近', frames: 158, scene: '灵堂 · 夜', keyframePrompt: '红衣女子缓缓回头，冷色调电影布光', line: '你不是已经死了吗？' },
  { idx: 3, shotSize: '特写', camera: '固定', frames: 141, scene: '灵堂 · 夜', keyframePrompt: '她瞳孔收缩，烛火在眼中晃动', line: '……七天。' }
]

/** 建一份示例图（每次调用都是全新一份，避免「重置示例」把上一次的对象改脏）。 */
export function buildCanvasSample(): CanvasSample {
  const nodes: CanvasNode[] = []
  const edges: CanvasGraph['edges'] = []
  const artifacts: CanvasArtifact[] = []
  const runs: CanvasRun[] = []

  const script = createNode('script_in', { x: 40, y: 300 }, '剧本输入')
  const write = createNode('script_gen', { x: 320, y: 300 }, '剧本生成')
  const split = createNode('script_split', { x: 600, y: 300 }, '剧本拆解')
  const castA = createNode('character', { x: 880, y: 20 }, '角色设定 · 林知遥')
  const castB = createNode('character', { x: 880, y: 230 }, '角色设定 · 陆青')
  const sceneA = createNode('scene', { x: 880, y: 440 }, '场景设定 · 破庙')
  const sceneB = createNode('scene', { x: 880, y: 650 }, '场景设定 · 灵堂')
  const board = createNode('shotlist', { x: 1200, y: 330 }, '分镜生成')
  const kf1 = createNode('keyframe', { x: 1520, y: 40 }, 'S01 首帧', 1)
  const kf2 = createNode('keyframe', { x: 1520, y: 300 }, 'S02 首帧', 2)
  const kf3 = createNode('keyframe', { x: 1520, y: 560 }, 'S03 首帧', 3)
  const vd1 = createNode('i2v', { x: 1840, y: 40 }, 'S01 视频', 1)
  const vd2 = createNode('i2v', { x: 1840, y: 300 }, 'S02 视频', 2)
  const vd3 = createNode('i2v', { x: 1840, y: 560 }, 'S03 视频', 3)
  const audio = createNode('audio', { x: 1520, y: 830 }, '配音配乐')
  const compose = createNode('compose', { x: 2160, y: 300 }, '剪辑合成 · 按镜号')
  const exp = createNode('export', { x: 2480, y: 300 }, '成片导出')

  script.params.text = '一句话梗概：她在自己婚礼的夜里死去，七天后又在同一座破庙里醒来。\n要求：民国悬疑、竖屏、少对白。'
  write.params.prompt = '破庙里一个少年的奇遇，民国悬疑，竖屏'
  write.params.tone = '民国悬疑、冷冽、少对白'
  write.params.length = '180'
  split.params.instruction = '人物只留两个；第 2 场不要拖，压到 20 秒内'
  castA.params.name = '林知遥'
  castA.params.appearance = '红衣、长发、左眉一道旧疤；眼神克制，笑的时候只看嘴角'
  castB.params.name = '陆青'
  castB.params.appearance = '青衫、束发、指节有旧伤；站着的时候重心偏左'
  sceneA.params.name = '破庙 · 夜'
  sceneA.params.appearance = '塌了半边的屋脊、神像倒伏、烛火是唯一光源'
  sceneB.params.name = '灵堂 · 夜'
  sceneB.params.appearance = '白幡低垂、棺木半开、香灰积了七天'
  kf1.params.count = '3'
  kf2.params.count = '3'
  vd2.params.tier = 'preview'
  vd3.params.tier = 'final'
  compose.params.order = 'idx'
  compose.params.merge = 'list'
  exp.params.nameRule = 'E01-S{镜号}.mp4'

  nodes.push(script, write, split, castA, castB, sceneA, sceneB, board, kf1, kf2, kf3, vd1, vd2, vd3, audio, compose, exp)
  edges.push(
    // 素材 → 生成剧本（调文本模型）→ 拆解（换另一个文本模型）
    makeEdge(script.id, 'text', write.id, 'material'),
    makeEdge(write.id, 'text', split.id, 'text'),
    // 拆解一次拆出三样：人物 / 场景 / 分镜
    makeEdge(split.id, 'characters', castA.id, 'characters'),
    makeEdge(split.id, 'characters', castB.id, 'characters'),
    makeEdge(split.id, 'scenes', sceneA.id, 'scenes'),
    makeEdge(split.id, 'scenes', sceneB.id, 'scenes'),
    makeEdge(split.id, 'shots', board.id, 'shots'),
    // 首帧 = 人物 + 场景 + 这一镜的分镜（三样缺一不出图）
    makeEdge(castA.id, 'image', kf1.id, 'person'),
    makeEdge(sceneA.id, 'image', kf1.id, 'scene'),
    makeEdge(castA.id, 'image', kf2.id, 'person'),
    makeEdge(sceneB.id, 'image', kf2.id, 'scene'),
    makeEdge(castB.id, 'image', kf3.id, 'person'),
    makeEdge(sceneB.id, 'image', kf3.id, 'scene'),
    makeEdge(board.id, 'table', kf1.id, 'shot'),
    makeEdge(board.id, 'table', kf2.id, 'shot'),
    makeEdge(board.id, 'table', kf3.id, 'shot'),
    // 视频 = 首帧 + 这一镜的关键词
    makeEdge(kf1.id, 'image', vd1.id, 'firstFrame'),
    makeEdge(kf2.id, 'image', vd2.id, 'firstFrame'),
    makeEdge(kf3.id, 'image', vd3.id, 'firstFrame'),
    makeEdge(board.id, 'table', vd1.id, 'shot'),
    makeEdge(board.id, 'table', vd2.id, 'shot'),
    makeEdge(board.id, 'table', vd3.id, 'shot'),
    // 成片 = N 条视频按镜号排序（配音配乐可选）
    makeEdge(vd1.id, 'video', compose.id, 'video'),
    makeEdge(vd2.id, 'video', compose.id, 'video'),
    makeEdge(vd3.id, 'video', compose.id, 'video'),
    makeEdge(board.id, 'table', audio.id, 'table'),
    makeEdge(audio.id, 'audio', compose.id, 'audio'),
    makeEdge(compose.id, 'cut', exp.id, 'cut')
  )

  const graph: CanvasGraph = { version: 1, frameGrid: [...FRAME_GRID], nodes, edges }

  const at = (n: number) => `2026-09-17 14:${String(n).padStart(2, '0')}`
  const push = (a: Omit<CanvasArtifact, 'createdAt'> & { createdAt?: string }) => {
    const artifact: CanvasArtifact = { createdAt: at(artifacts.length + 2), ...a } as CanvasArtifact
    artifacts.push(artifact)
    selectArtifact(graph, artifact)
    return artifact
  }

  push({ id: 'a_script', nodeId: script.id, slot: 'text', type: 'text', version: 1, review: 'approved', note: '原始素材 · 1 段梗概', text: String(script.params.text) })
  push({ id: 'a_draft', nodeId: write.id, slot: 'text', type: 'text', version: 1, review: 'approved', note: '剧本定稿 · 1.2k 字', text: '第 1 集 · 回魂夜\n\n破庙。暴雨敲着残破的屋脊。她睁开眼，坐在自己的灵堂里——七天了，没有人来收尸。' })
  push({ id: 'a_chars', nodeId: split.id, slot: 'characters', type: 'outline', version: 1, review: 'approved', note: '2 个人物', text: '林知遥（女主）· 陆青（男主）' })
  push({ id: 'a_scenes', nodeId: split.id, slot: 'scenes', type: 'outline', version: 1, review: 'approved', note: '2 个场景', text: '破庙 · 夜（暴雨）· 灵堂 · 夜（白幡）' })
  push({ id: 'a_shots', nodeId: split.id, slot: 'shots', type: 'outline', version: 1, review: 'approved', note: '3 镜大纲', text: '场 1 破庙外 / 暴雨 · 场 2 灵堂 / 回头 · 场 3 特写 / 七日' })
  push({ id: 'a_cast_a', nodeId: castA.id, slot: 'image', type: 'image', version: 1, url: img(1), review: 'approved', note: '三视图 3 张' })
  push({ id: 'a_cast_b', nodeId: castB.id, slot: 'image', type: 'image', version: 1, url: img(3), review: 'approved', note: '三视图 3 张' })
  push({ id: 'a_scene_a', nodeId: sceneA.id, slot: 'image', type: 'image', version: 1, url: img(0), review: 'approved', note: '环境参考 1 张' })
  push({ id: 'a_scene_b', nodeId: sceneB.id, slot: 'image', type: 'image', version: 1, url: img(2), review: 'approved', note: '环境参考 1 张' })
  push({ id: 'a_board', nodeId: board.id, slot: 'table', type: 'table', version: 1, review: 'approved', note: `${SHOT_ROWS.length} 镜`, rows: SHOT_ROWS })
  push({ id: 'a_kf1', nodeId: kf1.id, slot: 'image', type: 'image', version: 1, url: img(2), review: 'pending', note: '3 张 · 768x1344' })
  push({ id: 'a_kf2_v1', nodeId: kf2.id, slot: 'image', type: 'image', version: 1, url: img(0), review: 'rejected', note: '3 张 · 被驳回' })
  push({ id: 'a_kf2_v2', nodeId: kf2.id, slot: 'image', type: 'image', version: 2, url: img(3), review: 'approved', note: '3 张 · 这张过' })
  push({ id: 'a_vd2', nodeId: vd2.id, slot: 'video', type: 'video', version: 1, url: img(1), review: 'approved', note: '432x768 · 6.6s' })

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
  done(write, 15, 3)
  done(split, 5, 4)
  done(castA, 24, 5)
  done(castB, 22, 6)
  done(sceneA, 18, 7)
  done(sceneB, 17, 8)
  done(board, 8, 9)
  done(kf2, 36, 11)
  done(vd2, 96, 13)

  runs.push({ id: `r_${kf1.id}`, nodeId: kf1.id, paramsHash: paramsHash(kf1), status: 'running', startedAt: at(13) })
  runs.push({
    id: `r_${vd3.id}`,
    nodeId: vd3.id,
    paramsHash: paramsHash(vd3),
    status: 'failed',
    error: 'comfy85 未就绪：连接被拒绝（127.0.0.1:8188）',
    startedAt: at(15),
    finishedAt: at(16)
  })

  // 拓扑序排一遍，保证示例图本身是合法的（有环会被下面的断言在开发期抓出来）
  const order = topoOrder(graph)
  if (order.length !== nodes.length) throw new Error('示例图数据有问题：节点数与拓扑序不一致')

  return { graph, artifacts, runs }
}
