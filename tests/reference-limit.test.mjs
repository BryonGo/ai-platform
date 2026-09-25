import test from 'node:test'
import assert from 'node:assert/strict'
import { referenceLimitReason } from '../app/data/reference-limit.ts'

test('上限 0（本地底模）：说清是文生图，并给两条出路，不能提示"删到 0 张"', () => {
  const text = referenceLimitReason({ max: 0, modelName: 'Krea 2 Turbo' })
  assert.match(text, /Krea 2 Turbo/)
  assert.match(text, /文生图/)
  assert.match(text, /支持参考图的模型/)
  assert.match(text, /技能/)
  // 关键回归点：0 张上限时旧文案让用户"先删到 0 张"，等于让他把想改的图删掉
  assert.doesNotMatch(text, /删到 0 张/)
})

test('上限 0 且是云端模型：不谎称文生图', () => {
  const text = referenceLimitReason({ max: 0, modelName: '某云端模型', cloud: true })
  assert.doesNotMatch(text, /文生图/)
  assert.match(text, /不接受参考图/)
})

test('真超限（上限 > 0）：保留张数口径', () => {
  const text = referenceLimitReason({ max: 2, modelName: 'X' })
  assert.match(text, /最多接受 2 张/)
  assert.match(text, /先删到 2 张/)
})

test('没给模型名时兜底为「当前底模」', () => {
  assert.match(referenceLimitReason({ max: 0 }), /^当前底模/)
})
