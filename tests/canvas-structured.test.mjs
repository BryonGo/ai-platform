import test from 'node:test'
import assert from 'node:assert/strict'
import { parseStructured, textCells, replaceText, streamCells, characterEntries, structuredTable } from '../app/data/canvas-structured.ts'

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

test('分镜清单按「一行一镜」成表，列名走契约中文名', () => {
  const split = {
    characters: [{ id: 'char_a', name: '甲', description: '冷静' }],
    shots: [
      { id: 's1', scene_id: 'sc1', characters: ['char_a'], shot_type: '近景', description: '她推门', action: '推门', dialogue: [{ speaker: '甲', line: '我来了' }] },
      { id: 's2', scene_id: 'sc1', characters: [], shot_type: '远景', description: '街道', action: '', dialogue: [] }
    ]
  }
  const table = structuredTable(split, 'shots')
  assert.equal(table.rows.length, 2, '两镜就是两行（而不是把每个字段摊成一行）')
  assert.deepEqual(table.headers, ['标识', '所属场景', '出场角色', '景别', '画面', '动作', '台词'])
  assert.equal(table.rows[0].cells[4].value, '她推门')
  assert.equal(table.rows[0].cells[6].value, '甲：我来了')
})

test('漏键的那一项落在正确的列上，不会整体左移', () => {
  const split = { shots: [
    { id: 's1', description: '有动作', action: '推门' },
    { id: 's2', description: '没写动作' } // 少了 action
  ] }
  const table = structuredTable(split, 'shots')
  assert.deepEqual(table.headers, ['标识', '画面', '动作'])
  assert.equal(table.rows[1].cells[2].value, '—', '第二行缺 action 时应显示占位，而不是把后面的值挪过来')
})

test('标识与数组字段只读，画面可编辑；非清单退回扁平表', () => {
  const table = structuredTable({ shots: [{ id: 's1', characters: ['char_a'], description: '她推门' }] }, 'shots')
  const [idCell, charsCell, descCell] = table.rows[0].cells
  assert.equal(idCell.readonly, true, '标识不可在正文编辑里改')
  assert.equal(charsCell.readonly, true, '引用（数组）不可改')
  assert.equal(descCell.readonly, false, '文本字段要能改')
  assert.equal(structuredTable({ characters: [] }, 'shots'), undefined, '这一口没有清单时不硬凑表')
  assert.equal(structuredTable({ name: '单个对象' }, 'shots'), undefined)
})
