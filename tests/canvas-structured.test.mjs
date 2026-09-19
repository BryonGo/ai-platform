import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStructured, textCells, replaceText, streamCells, characterEntries } from '../app/data/canvas-structured.ts'

test('编辑嵌套文本保留数字、布尔值、空值及原对象', () => {
  const original = { characters: [{ name: '甲', age: 20, active: true, alias: null, traits: ['谨慎'] }] }
  const cells = textCells(original)
  assert.equal(cells.length, 2)
  const result = replaceText(original, ['characters', 0, 'traits', 0], '果断')
  assert.equal(result.characters[0].traits[0], '果断')
  assert.equal(original.characters[0].traits[0], '谨慎')
  assert.equal(result.characters[0].age, 20)
  assert.equal(result.characters[0].active, true)
  assert.equal(result.characters[0].alias, null)
})

test('兼容 JSON 代码围栏，非法 JSON 不伪造结果', () => {
  assert.deepEqual(parseStructured('```json\n[{"name":"甲"}]\n```'), [{ name: '甲' }])
  assert.equal(parseStructured('{"name":'), undefined)
  assert.deepEqual(textCells(null), [])
})

test('分片输出保留已完成字段，正确处理转义引号', () => {
  const text = '{"characters":[{"name":"甲","description":"他说\\"你好\\"","age":'
  assert.deepEqual(streamCells(text).map(c => c.value), ['甲', '他说"你好"'])
})

test('人物候选支持分槽数组、完整对象、中文姓名和同名不同记录', () => {
  const entries = characterEntries('{"characters":[{"name":"甲","age":20},{"姓名":"甲","外观":"红衣"},"乙"]}')
  assert.deepEqual(entries.map(c => [c.name, c.index]), [['甲', 0], ['甲', 1], ['乙', 2]])
  assert.match(entries[1].description, /红衣/)
  assert.deepEqual(characterEntries('尚未完成的输出'), [])
  assert.deepEqual(characterEntries('[{"description":"没有姓名"}]'), [])
})
