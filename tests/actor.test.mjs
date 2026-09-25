// 演员库纯逻辑：筛选序列化 + 后端原始数据归一化。
//
// 这些函数决定「发出去的查询参数对不对」与「后端各种形态的返回能不能被界面吃下」，
// 都是纯函数，直接用 node --test 覆盖即可，不必起 Nuxt / 连后端。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  serializeActorQuery,
  normalizeActorItem,
  normalizeActorFacets,
  normalizeActorMedia,
  normalizeActorDetail,
  normalizeActorTaxonomy,
  normalizeCharacterItem,
  normalizeCharacterVoices,
  buildFacetLabelMap,
  facetLabel,
  actorTaxonomyChips,
  actorCardMedia,
  ACTOR_CARD_ASPECT_RATIO,
  ACTOR_CHIP_LIMIT,
  ACTOR_TAXONOMY_FIELDS,
  actorGenerationLabel,
  actorShowsGeneration,
  ACTOR_GEN_ROLES,
  actorGenRoleLabel,
  actorGenUnsupportedReason,
  actorGenIsTerminal,
  actorGenStatusLabel,
  actorGenRoleNeedsRetry,
  actorGenSummary,
  normalizeActorGenRun,
  normalizeActorGenRole,
  shouldContinueActorGenPolling,
  ACTOR_GALLERY_BLOCKS,
  ACTOR_GALLERY_ASPECT,
  actorGalleryBlocks,
  actorMediaForOutfit,
  actorVoiceState,
  actorStripCandidates
} from '../app/utils/actor.ts'

test('serializeActorQuery：空值不发，只发有效筛选', () => {
  assert.equal(serializeActorQuery(), '')
  assert.equal(serializeActorQuery({ era: '', keyword: '   ' }), '')
})

test('serializeActorQuery：单值维度用 camelCase 键名', () => {
  const qs = serializeActorQuery({ keyword: '妲己', era: 'ancient', ageGroup: 'young', hairColor: 'black' })
  const params = new URLSearchParams(qs)
  assert.equal(params.get('keyword'), '妲己')
  assert.equal(params.get('era'), 'ancient')
  assert.equal(params.get('ageGroup'), 'young')
  assert.equal(params.get('hairColor'), 'black')
})

test('serializeActorQuery：eraCategory 与 era 是两个独立维度，都要下发', () => {
  const params = new URLSearchParams(serializeActorQuery({ eraCategory: 'primordial', era: 'ancient' }))
  assert.equal(params.get('eraCategory'), 'primordial')
  assert.equal(params.get('era'), 'ancient')
})

test('ACTOR_TAXONOMY_FIELDS：共 12 维（11 单值 + 气质多选），eraCategory 排在 era 前面', () => {
  assert.equal(ACTOR_TAXONOMY_FIELDS.length, 11)
  const keys = ACTOR_TAXONOMY_FIELDS.map(f => f.key)
  assert.deepEqual(keys, [
    'eraCategory', 'era', 'region', 'gender', 'ageGroup', 'species',
    'bodyType', 'height', 'skinTone', 'hairLength', 'hairColor'
  ])
  assert.ok(keys.indexOf('eraCategory') < keys.indexOf('era'), '时代大类必须排在具体时代之前')
  assert.equal(ACTOR_TAXONOMY_FIELDS.find(f => f.key === 'eraCategory').label, '时代大类')
})

test('serializeActorQuery：12 维全给时每一项都出现在查询串里（前后端键名一一对应）', () => {
  const params = new URLSearchParams(serializeActorQuery({
    eraCategory: 'primordial',
    era: 'ancient',
    region: 'east',
    gender: 'female',
    ageGroup: 'young',
    species: 'human',
    bodyType: 'slim',
    height: 'tall',
    skinTone: 'fair',
    hairLength: 'long',
    hairColor: 'black'
  }))
  for (const field of ACTOR_TAXONOMY_FIELDS) {
    assert.equal(params.get(field.key), {
      eraCategory: 'primordial', era: 'ancient', region: 'east', gender: 'female',
      ageGroup: 'young', species: 'human', bodyType: 'slim', height: 'tall',
      skinTone: 'fair', hairLength: 'long', hairColor: 'black'
    }[field.key], `维度 ${field.key} 未下发`)
  }
})

test('serializeActorQuery：气质多选用 `temperament[]` 重复键（GoFrame 只认这种切片形态），去重且保序', () => {
  const qs = serializeActorQuery({ temperament: ['cold', 'warm', 'cold', ''] })
  assert.deepEqual(new URLSearchParams(qs).getAll('temperament[]'), ['cold', 'warm'])
})

test('serializeActorQuery：收藏开关只在 true 时下发，排序非法值被忽略', () => {
  assert.equal(serializeActorQuery({ favorite: false }), '')
  assert.match(serializeActorQuery({ favorite: true }), /(^|&)favorite=1(&|$)/)
  assert.equal(serializeActorQuery({ sort: 'newest' }), 'sort=newest')
  assert.equal(serializeActorQuery({ sort: 'bogus' }), '')
})

test('serializeActorQuery：页码与页大小取整后下发', () => {
  const params = new URLSearchParams(serializeActorQuery({ page: 3, pageSize: 24 }))
  assert.equal(params.get('page'), '3')
  assert.equal(params.get('pageSize'), '24')
})

test('normalizeActorTaxonomy：未知键丢弃，气质转数组', () => {
  const tax = normalizeActorTaxonomy({ era: ' ancient ', gender: 'female', species: '', temperament: 'cold', junk: 'x' })
  assert.deepEqual(tax, { era: 'ancient', gender: 'female', temperament: ['cold'] })
})

test('normalizeActorItem：雪花 id 转字符串，封面从 media 兜底', () => {
  const item = normalizeActorItem({
    id: '1471022339713873920',
    name: '甲乙',
    media: { portrait: { assetId: 100, url: 'https://x/p.jpg' } },
    imageCount: 3,
    favorite: true
  })
  assert.equal(item.id, '1471022339713873920')
  assert.equal(item.coverUrl, 'https://x/p.jpg')
  assert.equal(item.imageCount, 3)
  assert.equal(item.favorite, true)
  // 后端把雪花 id 当数字下发时（JSON.parse reviver 之前）也要转成十进制字符串
  assert.equal(normalizeActorItem({ id: 123 }).id, '123')
})

test('normalizeActorItem：缺名兜底，0 计数不显示', () => {
  const item = normalizeActorItem({ id: '9', imageCount: 0 })
  assert.equal(item.name, '未命名演员')
  assert.equal(item.imageCount, undefined)
  assert.equal(item.coverUrl, undefined)
})

test('normalizeActorItem：imageCount/outfitCount 是后端真实计数，直接透传（不再退化"查看详情"）', () => {
  const item = normalizeActorItem({ id: '9', name: '甲', imageCount: 7, outfitCount: 3 })
  assert.equal(item.imageCount, 7)
  assert.equal(item.outfitCount, 3)
  // 卡片渲染条件：有计数就显示，两个都要能独立出现
  assert.ok(item.imageCount)
  assert.ok(item.outfitCount)
  const onlyImages = normalizeActorItem({ id: '9', imageCount: 2 })
  assert.equal(onlyImages.imageCount, 2)
  assert.equal(onlyImages.outfitCount, undefined)
})

test('normalizeCharacterVoices：数组与单对象两种形态都归一成数组', () => {
  const fromArray = normalizeCharacterVoices([
    { id: '1', kind: 'voice', url: 'a.mp3' },
    { id: '2', kind: 'voice', url: 'b.mp3' }
  ])
  assert.equal(fromArray.length, 2)
  assert.equal(fromArray[1].url, 'b.mp3')

  const fromObject = normalizeCharacterVoices({ id: '3', kind: 'voice', name: '清冷', url: 'c.mp3', durationSeconds: 4 })
  assert.equal(fromObject.length, 1)
  assert.equal(fromObject[0].name, '清冷')
  assert.equal(fromObject[0].durationSeconds, 4)

  assert.deepEqual(normalizeCharacterVoices(undefined), [])
  assert.deepEqual(normalizeCharacterVoices([]), [])
  // 无任何可用字段的行直接丢弃，不产生空音色
  assert.deepEqual(normalizeCharacterVoices({ kind: 'voice' }), [])
})

test('normalizeActorMedia：对象与数组两种形态都能吃', () => {
  const obj = normalizeActorMedia({ headshot: { assetId: '1', url: 'a' }, nope: { assetId: '2', url: 'b' } })
  assert.deepEqual(Object.keys(obj), ['headshot'])
  assert.equal(obj.headshot.assetId, '1')

  const arr = normalizeActorMedia([
    { slot: 'fullBody', asset_id: 7, image_url: 'c', width: 10, height: 20 },
    { slot: 'bogus', assetId: '9', url: 'd' }
  ])
  assert.deepEqual(Object.keys(arr), ['fullBody'])
  assert.equal(arr.fullBody.assetId, '7')
  assert.equal(arr.fullBody.url, 'c')
  assert.equal(arr.fullBody.width, 10)
})

test('normalizeActorMedia：后端 actor 媒体（kind snake_case、无 assetId）', () => {
  const media = normalizeActorMedia([
    { id: 9001, kind: 'portrait', sortOrder: 1, url: 'https://x/p.jpg' },
    { id: 9002, kind: 'three_view', sortOrder: 2, url: 'https://x/t.jpg' },
    { id: 9003, kind: 'voice', sortOrder: 3, url: 'https://x/v.mp3' }
  ])
  assert.deepEqual(Object.keys(media), ['portrait', 'threeView'])
  // 媒体行 id 不能被当成 assetId（资产 id 是另一回事）
  assert.equal(media.portrait.assetId, undefined)
  assert.equal(media.portrait.url, 'https://x/p.jpg')
})

test('normalizeActorFacets：对象形态', () => {
  const facets = normalizeActorFacets({ era: ['ancient', { value: 'modern', label: '现代', count: 5 }] })
  assert.deepEqual(facets.era, [
    { value: 'ancient' },
    { value: 'modern', label: '现代', count: 5 }
  ])
})

test('normalizeActorFacets：后端「值→数量」映射形态', () => {
  const facets = normalizeActorFacets({ era: { ancient: 2, modern: 1 }, temperament: {} })
  assert.deepEqual(facets.era, [{ value: 'ancient', count: 2 }, { value: 'modern', count: 1 }])
  assert.equal('temperament' in facets, false)
})

test('normalizeActorFacets：数组形态 + 空维度不出现', () => {
  const facets = normalizeActorFacets([{ key: 'gender', values: ['female'] }, { key: 'species', values: [] }])
  assert.deepEqual(facets.gender, [{ value: 'female' }])
  assert.equal('species' in facets, false)
})

test('normalizeActorDetail：actor/media/outfits/voice/favorited 一次收齐', () => {
  const detail = normalizeActorDetail({
    actor: { id: '1', name: '甲', taxonomy: { era: 'ancient' } },
    media: { headshot: { assetId: '2', url: 'a' } },
    outfits: [{ id: '10', name: '红衣', assetId: '3', url: 'b', current: true }],
    voice: { id: 'v1', name: '清冷', url: 'v.mp3', durationSeconds: 5 },
    favorited: true
  })
  assert.equal(detail.actor.id, '1')
  assert.equal(detail.actor.taxonomy.era, 'ancient')
  assert.equal(detail.media.headshot.url, 'a')
  assert.equal(detail.outfits[0].name, '红衣')
  assert.equal(detail.outfits[0].current, true)
  assert.equal(detail.voice.url, 'v.mp3')
  assert.equal(detail.favorited, true)
})

test('normalizeActorDetail：全局媒体只收无 outfitId 的行，带 outfitId 的归入对应造型', () => {
  const detail = normalizeActorDetail({
    id: '5',
    name: '狐妖',
    favorited: true,
    taxonomy: { eraCategory: 'primordial', era: 'ancient', temperament: ['gentle'] },
    media: [
      { id: '1', kind: 'portrait', url: 'base-portrait.jpg' },
      { id: '2', kind: 'headshot', url: 'base-headshot.jpg' },
      // 造型 10 自己的三张
      { id: '3', kind: 'portrait', outfitId: '10', url: 'o10-portrait.jpg' },
      { id: '4', kind: 'full_body', outfitId: '10', url: 'o10-full.jpg' },
      { id: '5', kind: 'three_view', outfitId: '10', url: 'o10-three.jpg' },
      // 造型 11 只有一张头像
      { id: '6', kind: 'headshot', outfitId: '11', url: 'o11-headshot.jpg' }
    ],
    outfits: [{ id: '10', outfitKey: 'red', label: '红衣', sortOrder: 1 }, { id: '11', outfitKey: 'blue', label: '蓝衣', sortOrder: 2 }],
    voice: [{ id: '7', kind: 'voice', url: 'v.mp3' }]
  })

  assert.equal(detail.actor.id, '5')
  assert.equal(detail.actor.taxonomy.eraCategory, 'primordial')

  // 关键：全局媒体不能被造型的图污染（否则选中造型后图不变）
  assert.deepEqual(Object.keys(detail.media).sort(), ['headshot', 'portrait'])
  assert.equal(detail.media.portrait.url, 'base-portrait.jpg')
  assert.equal(detail.media.headshot.url, 'base-headshot.jpg')

  // 造型 10 拿到自己的三个槽位
  const o10 = detail.outfits.find(o => o.id === '10')
  assert.deepEqual(Object.keys(o10.media).sort(), ['fullBody', 'portrait', 'threeView'])
  assert.equal(o10.media.portrait.url, 'o10-portrait.jpg')
  assert.equal(o10.media.fullBody.url, 'o10-full.jpg')
  assert.equal(o10.media.threeView.url, 'o10-three.jpg')
  // 造型预览取自己的立绘，不是全局的
  assert.equal(o10.url, 'o10-portrait.jpg')

  // 造型 11 只有头像：预览回落到它自己的那张，不借全局立绘
  const o11 = detail.outfits.find(o => o.id === '11')
  assert.deepEqual(Object.keys(o11.media), ['headshot'])
  assert.equal(o11.url, 'o11-headshot.jpg')

  assert.equal(detail.voice.url, 'v.mp3')
  assert.equal(detail.favorited, true)
})

test('normalizeActorDetail：造型没有自己的媒体时不挂 media（界面据此才敢回退全局）', () => {
  const detail = normalizeActorDetail({
    id: '6',
    name: '无图造型',
    media: [{ id: '1', kind: 'portrait', url: 'base.jpg' }],
    outfits: [{ id: '20', outfitKey: 'k', label: '某造型', sortOrder: 1 }]
  })
  assert.equal(detail.outfits[0].media, undefined)
  assert.equal(detail.outfits[0].url, undefined)
})

test('normalizeCharacterItem：角色 media 数组折成槽位、taxonomy 归一化，雪花 id 显式转字符串', () => {
  const ch = normalizeCharacterItem({
    id: '1471022339713873920',
    name: '甲',
    coverAssetId: '1471022339713873999',
    sourceActorId: '1471022339713873888',
    media: [{ id: '5', assetId: '88', kind: 'full_body', url: 'f.jpg' }],
    voice: [{ id: '6', kind: 'voice', url: 'v.mp3' }],
    taxonomy: { era: 'modern', temperament: 'bold' }
  })
  assert.equal(ch.id, '1471022339713873920')
  assert.equal(ch.coverAssetId, '1471022339713873999')
  assert.equal(ch.sourceActorId, '1471022339713873888')
  assert.equal(ch.media.fullBody.assetId, '88')
  assert.equal(ch.media.fullBody.url, 'f.jpg')
  assert.equal(ch.voice.length, 1)
  assert.equal(ch.voice[0].url, 'v.mp3')
  assert.deepEqual(ch.taxonomy.temperament, ['bold'])
})

test('normalizeCharacterItem：media 里的 voice 行不会混进图片槽位，也不会丢音色', () => {
  const ch = normalizeCharacterItem({
    id: '1',
    media: [
      { id: '1', assetId: 'a', kind: 'portrait', url: 'p.jpg' },
      { id: '2', assetId: 'b', kind: 'voice', url: 'v.mp3' }
    ],
    voice: [{ id: '2', assetId: 'b', kind: 'voice', url: 'v.mp3' }]
  })
  assert.deepEqual(Object.keys(ch.media), ['portrait'])
  assert.equal(ch.voice.length, 1)
})

test('normalizeCharacterItem：>2^53 的 id 不丢末位（数字进来也转成十进制字符串）', () => {
  // 这是本仓库最容易踩的精度坑：JSON 里 >2^53 的整数被当 number 会变 …874000。
  // 归一化必须显式字符串化，且要跑在"已经是字符串"的真实路径上不变形。
  const ch = normalizeCharacterItem({
    id: '1471022339713873920',
    coverAssetId: '1471022339713873921',
    sourceActorId: '1471022339713873922'
  })
  assert.equal(ch.id, '1471022339713873920')
  assert.equal(ch.coverAssetId, '1471022339713873921')
  assert.equal(ch.sourceActorId, '1471022339713873922')
  // 反例：如果中间走过 Number，末位就会变成 …74000/…73921；
  // 断言字符串逐字相等，正是为了钉住"没有走 number"。
  assert.notEqual(ch.id, String(Number('1471022339713873920')))
})

test('normalizeCharacterItem：缺省 id/coverAssetId/sourceActorId 归一成空串或 undefined（不残留数字/对象）', () => {
  const ch = normalizeCharacterItem({ name: '无 id' })
  assert.equal(ch.id, '')
  assert.equal(ch.coverAssetId, undefined)
  assert.equal(ch.sourceActorId, undefined)
  // coverAssetId=0 在后端表示"未指定"，不该当成有效素材 id 展示
  assert.equal(normalizeCharacterItem({ id: '1', coverAssetId: '0' }).coverAssetId, undefined)
})

test('actorGenerationLabel：空/未知状态返回空串（不假装有状态）', () => {
  assert.equal(actorGenerationLabel(undefined), '')
  assert.equal(actorGenerationLabel(''), '')
  assert.equal(actorGenerationLabel('bogus'), '')
  assert.equal(actorGenerationLabel('pending'), '待生成')
  assert.equal(actorGenerationLabel('ready'), '已就绪')
  assert.equal(actorGenerationLabel('generating'), '生成中')
  assert.equal(actorGenerationLabel('failed'), '生成失败')
})

test('actorShowsGeneration：只认后端明确给的状态，别的不许推导', () => {
  assert.equal(actorShowsGeneration({}), false)
  assert.equal(actorShowsGeneration({ generationStatus: '' }), false)
  assert.equal(actorShowsGeneration({ generationStatus: 'bogus' }), true)
  assert.equal(actorShowsGeneration({ generationStatus: 'generating' }), true)
  // 关键回归点：以前"有 media 没封面"也会显示「待生成」，等于给正常演员编了个状态
  assert.equal(actorShowsGeneration({ media: { portrait: { assetId: '1', url: 'u' } } }), false)
  assert.equal(actorShowsGeneration({ coverUrl: '' }), false)
})

/* ────────── taxonomy code → 中文展示名（facets 映射） ────────── */

// 与后端实测一致的字典片段（GET /actors 的 facets）。
const FACETS = {
  eraCategory: [{ value: 'modern', label: '现代' }, { value: 'ancient', label: '古代' }],
  era: [{ value: 'early_21st', label: '21世纪初' }],
  region: [{ value: 'east_asia', label: '东亚' }],
  gender: [{ value: 'female', label: '女' }],
  ageGroup: [{ value: 'young_adult', label: '青年' }],
  species: [{ value: 'human', label: '人类' }],
  bodyType: [{ value: 'slim', label: '偏瘦' }],
  height: [{ value: 'medium_160_170', label: '中等(160-170cm)' }],
  temperament: [{ value: 'gentle', label: '温柔' }]
}

test('buildFacetLabelMap：建 value→label，忽略 label===value 的项（回退即等价）', () => {
  const labels = buildFacetLabelMap({
    eraCategory: [{ value: 'modern', label: '现代' }, { value: 'opt_buh4v', label: 'opt_buh4v' }],
    era: []
  })
  assert.equal(labels.get('eraCategory').get('modern'), '现代')
  // label 与 value 相同 = 后端字典缺失时的兜底，进表没有意义
  assert.equal(labels.get('eraCategory').has('opt_buh4v'), false)
  assert.equal(labels.has('era'), false)
})

test('buildFacetLabelMap：null / 空 facets 返回空表，不抛', () => {
  assert.equal(buildFacetLabelMap(null).size, 0)
  assert.equal(buildFacetLabelMap(undefined).size, 0)
  assert.equal(buildFacetLabelMap({}).size, 0)
})

test('facetLabel：命中返回中文，未命中回退原 code，空值给空串', () => {
  const labels = buildFacetLabelMap(FACETS)
  assert.equal(facetLabel(labels, 'eraCategory', 'modern'), '现代')
  assert.equal(facetLabel(labels, 'height', 'medium_160_170'), '中等(160-170cm)')
  // 字典里没有的值（导入器写进来的自定义 code）必须原样显示，不能空白
  assert.equal(facetLabel(labels, 'eraCategory', 'opt_buh4v'), 'opt_buh4v')
  assert.equal(facetLabel(labels, 'unknownDimension', 'x'), 'x')
  assert.equal(facetLabel(null, 'eraCategory', 'modern'), 'modern')
  assert.equal(facetLabel(labels, 'eraCategory', ''), '')
})

test('actorTaxonomyChips：最多 4 个、顺序由 ACTOR_TAXONOMY_FIELDS 决定、值为中文 label', () => {
  const labels = buildFacetLabelMap(FACETS)
  const chips = actorTaxonomyChips({
    eraCategory: 'modern',
    era: 'early_21st',
    region: 'east_asia',
    gender: 'female',
    ageGroup: 'young_adult',
    species: 'human',
    bodyType: 'slim',
    height: 'medium_160_170'
  }, labels)
  // 8 个维度都在，但卡片只显示前 4 个主维度
  assert.equal(chips.length, ACTOR_CHIP_LIMIT)
  assert.deepEqual(chips, ['现代', '21世纪初', '东亚', '女'])
})

test('actorTaxonomyChips：缺主维度时依次补位，未命中 label 的 value 原样显示', () => {
  const labels = buildFacetLabelMap(FACETS)
  // eraCategory/era/region 都空 → 顺延到 gender/ageGroup/species/bodyType
  const chips = actorTaxonomyChips({
    gender: 'female',
    ageGroup: 'young_adult',
    species: 'human',
    bodyType: 'slim',
    height: 'medium_160_170',
    hairColor: 'opt_buh4v'
  }, labels)
  assert.deepEqual(chips, ['女', '青年', '人类', '偏瘦'])
})

test('actorTaxonomyChips：气质只有在主维度凑不满 4 个时才补进来', () => {
  const labels = buildFacetLabelMap(FACETS)
  // 只剩 1 个主维度 → 用气质补到 2 个
  assert.deepEqual(actorTaxonomyChips({ gender: 'female', temperament: ['gentle'] }, labels), ['女', '温柔'])
  // 已有 4 个主维度 → 气质不展示（名额用完了）
  const full = actorTaxonomyChips({
    eraCategory: 'modern', era: 'early_21st', region: 'east_asia', gender: 'female',
    temperament: ['gentle']
  }, labels)
  assert.deepEqual(full, ['现代', '21世纪初', '东亚', '女'])
})

test('actorTaxonomyChips：无 taxonomy / 无 facets 都不崩，回退原 code', () => {
  assert.deepEqual(actorTaxonomyChips(null, null), [])
  assert.deepEqual(actorTaxonomyChips(undefined, null), [])
  // 没有字典时把 code 原样显示（比空白好）
  assert.deepEqual(actorTaxonomyChips({ eraCategory: 'modern', gender: 'female' }, null), ['modern', 'female'])
})

/* ────────── 卡片媒体：肖像 + 全身双图块 ────────── */

test('actorCardMedia：肖像 + 全身都有 → pair，左右两格分别是两张', () => {
  const m = actorCardMedia({
    portrait: { url: 'p.jpg' },
    fullBody: { url: 'f.jpg' }
  }, 'cover.jpg')
  assert.equal(m.mode, 'pair')
  assert.equal(m.portrait, 'p.jpg')
  assert.equal(m.fullBody, 'f.jpg')
  // pair 时不该再塞 fallback（否则界面可能多渲染一张）
  assert.equal(m.fallback, '')
})

test('actorCardMedia：没有 portrait 时用 headshot 顶左格', () => {
  const m = actorCardMedia({
    headshot: { url: 'h.jpg' },
    fullBody: { url: 'f.jpg' }
  })
  assert.equal(m.mode, 'pair')
  assert.equal(m.portrait, 'h.jpg')
  assert.equal(m.fullBody, 'f.jpg')
})

test('actorCardMedia：只有肖像（无全身）→ single，肖像居中铺满，不借封面', () => {
  const m = actorCardMedia({ portrait: { url: 'p.jpg' } }, 'cover.jpg')
  assert.equal(m.mode, 'single')
  assert.equal(m.portrait, 'p.jpg')
  assert.equal(m.fullBody, '')
  assert.equal(m.fallback, '')
})

test('actorCardMedia：只有全身 → 也按 single（全身即唯一可用图），不硬裁', () => {
  const m = actorCardMedia({ fullBody: { url: 'f.jpg' } }, 'cover.jpg')
  assert.equal(m.mode, 'single')
  // 肖像格为空、封面不顶替：界面会用 fallback 走单图分支
  assert.equal(m.portrait, '')
  assert.equal(m.fallback, 'cover.jpg')
})

test('actorCardMedia：两个图位都缺 → 退回 coverUrl（单图，不是 pair）', () => {
  const m = actorCardMedia({}, 'cover.jpg')
  assert.equal(m.mode, 'single')
  assert.equal(m.portrait, '')
  assert.equal(m.fullBody, '')
  assert.equal(m.fallback, 'cover.jpg')
})

test('actorCardMedia：连封面都没有 → empty（界面显示首字占位）', () => {
  assert.deepEqual(actorCardMedia({}, ''), { mode: 'empty', portrait: '', fullBody: '', fallback: '' })
  assert.deepEqual(actorCardMedia(null, undefined), { mode: 'empty', portrait: '', fullBody: '', fallback: '' })
  assert.deepEqual(actorCardMedia(undefined, '  '), { mode: 'empty', portrait: '', fullBody: '', fallback: '' })
})

test('actorCardMedia：空 url 不算有图（不能把空串当 src 塞给 img）', () => {
  const m = actorCardMedia({
    portrait: { url: '' },
    headshot: { url: 'h.jpg' },
    fullBody: { url: '' }
  }, 'cover.jpg')
  // 全身空串 → 不算 pair；头像有值 → single
  assert.equal(m.mode, 'single')
  assert.equal(m.portrait, 'h.jpg')
})

test('ACTOR_CARD_ASPECT_RATIO：卡片是 4:3（= 参考站 420×315），不是 3:4', () => {
  assert.equal(ACTOR_CARD_ASPECT_RATIO, '4 / 3')
})

/* ────────── 演员资产生成（run 状态归一化 / 终态 / 轮询 / role 中文名） ────────── */

test('ACTOR_GEN_ROLES：4 个 role 且顺序与后端一致，中文名正确', () => {
  assert.deepEqual(ACTOR_GEN_ROLES.map(r => r.role), ['headshot', 'full_body', 'expression_sheet', 'three_view'])
  assert.deepEqual(ACTOR_GEN_ROLES.map(r => r.label), ['头像', '全身', '表情集', '三视图'])
})

test('actorGenRoleLabel：已知 role 给中文，未知 role 原样显示（不隐藏后端新增项）', () => {
  assert.equal(actorGenRoleLabel('headshot'), '头像')
  assert.equal(actorGenRoleLabel('three_view'), '三视图')
  assert.equal(actorGenRoleLabel('new_role_x'), 'new_role_x')
  assert.equal(actorGenRoleLabel(''), '')
})

test('actorGenUnsupportedReason：voice 有稳定文案，其它 role 不复用它的说法', () => {
  assert.equal(actorGenUnsupportedReason('voice'), '暂不支持：无法从静态图片推导音色')
  assert.equal(actorGenUnsupportedReason('headshot'), '')
})

test('actorGenIsTerminal：只有 succeeded/partial/failed 是终态', () => {
  for (const s of ['succeeded', 'partial', 'failed']) assert.equal(actorGenIsTerminal(s), true, s)
  // pending/running/未知都不能当终态，否则轮询会提前停在一个还在跑的运行上
  for (const s of ['pending', 'running', '', 'bogus']) assert.equal(actorGenIsTerminal(s), false, JSON.stringify(s))
})

test('shouldContinueActorGenPolling：终态/已停止/超次数都要停', () => {
  const base = { status: 'running', attempts: 1, maxAttempts: 10 }
  assert.equal(shouldContinueActorGenPolling(base), true)
  assert.equal(shouldContinueActorGenPolling({ ...base, status: 'succeeded' }), false)
  assert.equal(shouldContinueActorGenPolling({ ...base, status: 'failed' }), false)
  assert.equal(shouldContinueActorGenPolling({ ...base, stopped: true }), false)
  assert.equal(shouldContinueActorGenPolling({ ...base, attempts: 10 }), false)
  // 未知状态继续轮询（不能当作跑完了）
  assert.equal(shouldContinueActorGenPolling({ ...base, status: 'weird' }), true)
})

test('actorGenStatusLabel：状态中文名，未知状态原样返回', () => {
  assert.equal(actorGenStatusLabel('pending'), '排队中')
  assert.equal(actorGenStatusLabel('running'), '生成中')
  assert.equal(actorGenStatusLabel('succeeded'), '已完成')
  assert.equal(actorGenStatusLabel('partial'), '部分完成')
  assert.equal(actorGenStatusLabel('failed'), '失败')
  assert.equal(actorGenStatusLabel('skipped'), '已跳过')
  assert.equal(actorGenStatusLabel('mystery'), 'mystery')
})

test('actorGenRoleNeedsRetry：只有 failed 才显示重试', () => {
  assert.equal(actorGenRoleNeedsRetry('failed'), true)
  assert.equal(actorGenRoleNeedsRetry('succeeded'), false)
  assert.equal(actorGenRoleNeedsRetry('running'), false)
  assert.equal(actorGenRoleNeedsRetry(''), false)
})

test('actorGenSummary：数字全部来自后端字段，不预估', () => {
  const text = actorGenSummary({
    status: 'partial',
    roles: [{ status: 'succeeded' }, { status: 'succeeded' }, { status: 'failed' }, { status: 'failed' }],
    successAssetCount: 6
  })
  assert.match(text, /部分完成/)
  assert.match(text, /2\/4 个资产已产出/)
  assert.match(text, /共 6 张/)
  // 没有任何产物时不编造"0 张"以外的内容
  assert.equal(actorGenSummary({ status: 'running', roles: [], successAssetCount: 0 }), '生成中')
})

test('normalizeActorGenRun：ID 全字符串、roles/unsupportedRoles 必为数组', () => {
  const run = normalizeActorGenRun({
    // 真实路径下 JSON reviver 已把它们变成字符串；这里同时验证函数不会二次损坏
    id: '1471022339713873920',
    characterId: '1471022339713873921',
    sourceAssetId: '1471022339713873922',
    modelId: 'seedream-5',
    status: 'running',
    roles: [{
      role: 'headshot', kind: 'headshot', status: 'succeeded',
      taskId: '1471022339713873923', assetIds: ['1471022339713873924', '1471022339713873925'], assetCount: 2
    }],
    unsupportedRoles: [{ role: 'voice', reason: 'cannot infer voice from image' }],
    successAssetCount: 2,
    createdAt: 1790331503,
    updatedAt: 1790331600
  })
  assert.equal(run.id, '1471022339713873920')
  assert.equal(run.characterId, '1471022339713873921')
  assert.equal(run.sourceAssetId, '1471022339713873922')
  assert.equal(run.roles.length, 1)
  assert.equal(run.roles[0].taskId, '1471022339713873923')
  assert.deepEqual(run.roles[0].assetIds, ['1471022339713873924', '1471022339713873925'])
  assert.equal(run.roles[0].assetCount, 2)
  assert.deepEqual(run.unsupportedRoles, [{ role: 'voice', reason: 'cannot infer voice from image' }])
  assert.equal(run.successAssetCount, 2)
  assert.equal(run.updatedAt, 1790331600)
  // 数字形态进来也要转成十进制字符串（>2^53 的数值本身已丢精度，但字符串不得再变形）
  assert.equal(normalizeActorGenRun({ id: 123 }).id, '123')
})

test('normalizeActorGenRun：缺 id 返回 null（调用方据此抛错，不静默当成功）', () => {
  assert.equal(normalizeActorGenRun(null), null)
  assert.equal(normalizeActorGenRun({}), null)
  assert.equal(normalizeActorGenRun({ id: '' }), null)
})

test('normalizeActorGenRun：字段缺失时给安全兜底（空串/空数组/0），不产生 undefined 数组', () => {
  const run = normalizeActorGenRun({ id: '1' })
  assert.equal(run.status, 'pending')
  assert.deepEqual(run.roles, [])
  assert.deepEqual(run.unsupportedRoles, [])
  assert.equal(run.successAssetCount, 0)
  assert.equal(run.error, '')
  assert.equal(run.modelId, '')
})

test('normalizeActorGenRole：assetCount 缺失时由 assetIds 长度兜底；负数当 0', () => {
  const r1 = normalizeActorGenRole({ role: 'full_body', status: 'succeeded', assetIds: ['a', 'b'] })
  assert.equal(r1.assetCount, 2)
  assert.equal(r1.taskId, '')
  const r2 = normalizeActorGenRole({ role: 'three_view', assetCount: -5 })
  assert.equal(r2.assetCount, 0)
  assert.equal(r2.status, 'pending')
})

test('normalizeActorGenRun：unsupportedRoles 里没有 role 的条目被丢弃', () => {
  const run = normalizeActorGenRun({ id: '1', unsupportedRoles: [{ role: 'voice', reason: 'x' }, { reason: 'y' }] })
  assert.deepEqual(run.unsupportedRoles, [{ role: 'voice', reason: 'x' }])
})

/* ────────── 详情画廊：三块选择/回退、造型切换、音色、切换条 ────────── */

test('ACTOR_GALLERY_BLOCKS：三块 116:66:158（+2×8 gap = 356），标签为肖像/表情/转身', () => {
  assert.deepEqual(ACTOR_GALLERY_BLOCKS.map(b => b.key), ['portrait', 'emotive', 'turnaround'])
  assert.deepEqual(ACTOR_GALLERY_BLOCKS.map(b => b.label), ['肖像', '表情', '转身'])
  assert.deepEqual(ACTOR_GALLERY_BLOCKS.map(b => b.grow), [116, 66, 158])
  const sum = ACTOR_GALLERY_BLOCKS.reduce((n, b) => n + b.grow, 0)
  assert.equal(sum + 2 * 8, 356, '三块宽 + 2 个 gap 应等于内容宽 356')
  assert.equal(ACTOR_GALLERY_ASPECT, '356 / 302')
})

test('actorGalleryBlocks：三块各取自己的槽位', () => {
  const blocks = actorGalleryBlocks({
    portrait: { url: 'p.jpg' },
    expressionSheet: { url: 'e.jpg' },
    threeView: { url: 't.jpg' }
  })
  assert.deepEqual(blocks.map(b => b.url), ['p.jpg', 'e.jpg', 't.jpg'])
  assert.deepEqual(blocks.map(b => b.slot), ['portrait', 'expressionSheet', 'threeView'])
  assert.deepEqual(blocks.map(b => b.slotLabel), ['立绘', '表情集', '三视图'])
})

test('actorGalleryBlocks：肖像块优先横向 portrait 合成图（PC 宽屏第一块），headshot 只作回退', () => {
  const blocks = actorGalleryBlocks({
    portrait: { url: 'p.jpg' },
    headshot: { url: 'h.jpg' }
  })
  assert.equal(blocks[0].url, 'p.jpg')
  assert.equal(blocks[0].slot, 'portrait')
})

test('actorGalleryBlocks：各自回退链（肖像→头像/全身；表情→全身/头像；转身→全身）', () => {
  const blocks = actorGalleryBlocks({
    headshot: { url: 'h.jpg' },
    fullBody: { url: 'f.jpg' }
  })
  assert.deepEqual(blocks.map(b => b.url), ['h.jpg', 'f.jpg', 'f.jpg'])
  assert.deepEqual(blocks.map(b => b.slot), ['headshot', 'fullBody', 'fullBody'])
})

test('actorGalleryBlocks：一块有图不会顶替另一块（互不冒充）', () => {
  // 只有 portrait：表情/转身必须为空，不能拿 portrait 冒充
  const blocks = actorGalleryBlocks({ portrait: { url: 'p.jpg' } })
  assert.equal(blocks[0].url, 'p.jpg')
  assert.equal(blocks[1].url, '')
  assert.equal(blocks[2].url, '')
  assert.equal(blocks[1].slot, '')
})

test('actorGalleryBlocks：空 url 不算有图；空/undefined 媒体不崩', () => {
  const blocks = actorGalleryBlocks({ portrait: { url: '' }, headshot: { url: 'h.jpg' } })
  assert.equal(blocks[0].url, 'h.jpg', 'portrait 空串应回退到 headshot')
  assert.equal(actorGalleryBlocks(null)[0].url, '')
  assert.equal(actorGalleryBlocks(undefined).length, 3)
})

test('ACTOR_GALLERY_BLOCKS：候选顺序固定（肖像用 portrait 合成图，表情/转身用各自表）', () => {
  // 真实源图横竖比：headshot 0.75、expression_sheet 0.75、full_body 0.563、
  // portrait 1.333（横向双图合成）、three_view 1.778（横向表）。所以：
  //   · 肖像块优先 portrait 合成图（PC 第一块按原比例铺满，移动端 cover 裁成肖像）；
  //   · 表情块优先 expression_sheet，而不是 full_body/headshot；
  //   · 转身块只认 three_view / full_body —— 横向 portrait 绝不能冒充转身。
  const candidates = Object.fromEntries(ACTOR_GALLERY_BLOCKS.map(b => [b.key, [...b.candidates]]))
  assert.deepEqual(candidates.portrait, ['portrait', 'headshot', 'fullBody'])
  assert.deepEqual(candidates.emotive, ['expressionSheet', 'fullBody', 'headshot'])
  assert.deepEqual(candidates.turnaround, ['threeView', 'fullBody'])
  assert.equal(candidates.turnaround.includes('portrait'), false, '转身块不得拿 portrait 合成图顶替')
})

test('actorGalleryBlocks：多张候选并存时按候选优先级取第一张（不是按槽位/媒体顺序）', () => {
  const blocks = actorGalleryBlocks({
    portrait: { url: 'p.jpg' },
    headshot: { url: 'h.jpg' },
    fullBody: { url: 'f.jpg' },
    expressionSheet: { url: 'e.jpg' },
    threeView: { url: 't.jpg' }
  })
  assert.deepEqual(blocks.map(b => b.slot), ['portrait', 'expressionSheet', 'threeView'])
  assert.deepEqual(blocks.map(b => b.url), ['p.jpg', 'e.jpg', 't.jpg'])
})

test('actorGalleryBlocks：表情块 expression_sheet 缺失时才退 full_body，再退 headshot（不借 portrait）', () => {
  assert.equal(actorGalleryBlocks({ fullBody: { url: 'f' }, headshot: { url: 'h' } })[1].slot, 'fullBody')
  assert.equal(actorGalleryBlocks({ headshot: { url: 'h' } })[1].slot, 'headshot')
  // 只有 portrait：表情块必须为空，不能拿横向合成图顶替
  assert.equal(actorGalleryBlocks({ portrait: { url: 'p' } })[1].slot, '')
})

test('actorGalleryBlocks：只有横向 portrait 时，仅肖像块用它兜底（slot=portrait），另两块为空', () => {
  const blocks = actorGalleryBlocks({ portrait: { url: 'p.jpg' } })
  assert.equal(blocks[0].slot, 'portrait')
  assert.equal(blocks[0].slotLabel, '立绘')
  assert.deepEqual(blocks.slice(1).map(b => b.slot), ['', ''])
})

test('actorMediaForOutfit：选中造型只用该造型自己的 media；未选中用全局', () => {
  const detail = {
    media: { portrait: { url: 'global.jpg' } },
    outfits: [
      { id: 'o1', name: '服装1', media: { portrait: { url: 'o1.jpg' } } },
      { id: 'o2', name: '服装2' }
    ]
  }
  assert.equal(actorMediaForOutfit(detail, '').portrait.url, 'global.jpg')
  assert.equal(actorMediaForOutfit(detail, 'o1').portrait.url, 'o1.jpg')
  // o2 没有自己的图 → 空集合（不回落全局，不拿 o1 冒充）
  assert.deepEqual(actorMediaForOutfit(detail, 'o2'), {})
  // 未知 id 同样不回落
  assert.deepEqual(actorMediaForOutfit(detail, 'nope'), {})
  assert.deepEqual(actorMediaForOutfit(null, 'x'), {})
})

test('造型切换：gallery 必须跟着切到该造型的图，且不串味', () => {
  const detail = {
    media: {},
    outfits: [
      { id: 'o1', name: 'A', media: { portrait: { url: 'a.jpg' }, threeView: { url: 'a3.jpg' } } },
      { id: 'o2', name: 'B', media: { portrait: { url: 'b.jpg' } } }
    ]
  }
  const a = actorGalleryBlocks(actorMediaForOutfit(detail, 'o1'))
  assert.deepEqual(a.map(b => b.url), ['a.jpg', '', 'a3.jpg']) // 表情块缺 → 空，不借别块
  const b = actorGalleryBlocks(actorMediaForOutfit(detail, 'o2'))
  assert.deepEqual(b.map(x => x.url), ['b.jpg', '', ''])
  assert.notEqual(a[0].url, b[0].url)
})

test('actorVoiceState：有 url 才可播；没有 url 如实计数，不做假播放器', () => {
  const ok = actorVoiceState({ id: 'v1', name: '清冷', url: 'v.mp3' })
  assert.equal(ok.hasPlayable, true)
  assert.equal(ok.url, 'v.mp3')
  assert.equal(ok.missingUrl, 0)

  const none = actorVoiceState(null)
  assert.equal(none.hasPlayable, false)
  assert.equal(none.url, '')
  assert.equal(none.missingUrl, 0)

  const noUrl = actorVoiceState({ id: 'v2' })
  assert.equal(noUrl.hasPlayable, false)
  assert.equal(noUrl.missingUrl, 1)

  // 数组形态（角色侧）
  const arr = actorVoiceState([{ id: 'a' }, { id: 'b', url: 'b.mp3' }])
  assert.equal(arr.hasPlayable, true)
  assert.equal(arr.url, 'b.mp3')
  assert.equal(arr.missingUrl, 1)
})

test('actorStripCandidates：排除当前演员并截断到 limit', () => {
  const items = [
    { id: 'me', name: '当前' },
    { id: 'a', name: 'A' },
    { id: 'me', name: '重复' },
    { id: 'b', name: 'B' }
  ]
  assert.deepEqual(actorStripCandidates(items, 'me').map(x => x.id), ['a', 'b'])
  assert.deepEqual(actorStripCandidates(items, 'me', 1).map(x => x.id), ['a'])
  assert.deepEqual(actorStripCandidates(null, 'me'), [])
  assert.deepEqual(actorStripCandidates([{ id: '', name: 'x' }], 'me'), [])
  // 只有自己 → 空（整条不渲染）
  assert.deepEqual(actorStripCandidates([{ id: 'me', name: '当前' }], 'me'), [])
})
