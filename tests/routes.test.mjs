// 全站路由纯逻辑：path 子路由、query 互转、旧链接重定向。
//
// 这些规则决定「切视图会不会换 URL」「旧链接会不会变死链」，直接在 node --test 里钉住，
// 不必起 Nuxt / 连后端。函数都从 app/utils/routes.ts 导出（纯函数，无 Vue/Nuxt 依赖）。
import test from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizePath,
  queryValue,
  cleanQuery,
  effectTabFromPath,
  effectPath,
  walletSectionFromPath,
  walletPath,
  assetPaneFromPath,
  assetPath,
  actorSourceFromPath,
  actorSourcePath,
  myActorPath,
  myActorEditPath,
  myActorGenerationPath,
  exploreSlugOf,
  exploreLabelOf,
  isExploreSlug,
  DEFAULT_EXPLORE_SLUG,
  EXPLORE_CATEGORY_SLUGS,
  searchPath,
  legacyRedirect
} from '../app/utils/routes.ts'

/* ───────────── path / query 基础 ───────────── */

test('normalizePath：剥 query/hash、去尾斜杠、保根路径', () => {
  assert.equal(normalizePath(''), '/')
  assert.equal(normalizePath('/'), '/')
  assert.equal(normalizePath('/assets/temp/'), '/assets/temp')
  assert.equal(normalizePath('/wallet?tab=ledger'), '/wallet')
  assert.equal(normalizePath('/a/b#c'), '/a/b')
})

test('queryValue / cleanQuery：数组取首个、空值丢弃', () => {
  assert.equal(queryValue(['mine', 'platform']), 'mine')
  assert.equal(queryValue(undefined), '')
  assert.equal(queryValue(0), '0')
  assert.deepEqual(cleanQuery({ a: '1', b: '', c: null, d: ['x', 'y'] }), { a: '1', d: 'x' })
})

/* ───────────── 效果页：全部 / 图片 / 视频 ───────────── */

test('effectTabFromPath：/effects 默认全部，image/video 各归其位（含尾斜杠）', () => {
  assert.equal(effectTabFromPath('/effects'), 'all')
  assert.equal(effectTabFromPath('/effects/'), 'all')
  assert.equal(effectTabFromPath('/effects/image'), 'image')
  assert.equal(effectTabFromPath('/effects/video'), 'video')
  // 未知子路径回退全部，不产生空分组
  assert.equal(effectTabFromPath('/effects/bogus'), 'all')
})

test('effectPath：页签 → 地址，往返一致', () => {
  assert.equal(effectPath('all'), '/effects')
  assert.equal(effectPath('image'), '/effects/image')
  assert.equal(effectPath('video'), '/effects/video')
  for (const tab of ['all', 'image', 'video']) {
    assert.equal(effectTabFromPath(effectPath(tab)), tab)
  }
})

/* ───────────── 钱包：交易 / 流水 / 充值 / 订单 / 会员 ───────────── */

test('walletSectionFromPath：/wallet 默认交易，子路径各有区块', () => {
  assert.equal(walletSectionFromPath('/wallet'), 'transactions')
  assert.equal(walletSectionFromPath('/wallet/'), 'transactions')
  assert.equal(walletSectionFromPath('/wallet/ledger'), 'ledger')
  assert.equal(walletSectionFromPath('/wallet/recharge'), 'recharge')
  assert.equal(walletSectionFromPath('/wallet/orders'), 'orders')
  assert.equal(walletSectionFromPath('/wallet/membership'), 'membership')
})

test('walletPath：区块 → 地址，往返一致', () => {
  for (const section of ['transactions', 'ledger', 'recharge', 'orders', 'membership']) {
    assert.equal(walletSectionFromPath(walletPath(section)), section)
  }
  assert.equal(walletPath('transactions'), '/wallet')
})

/* ───────────── 资产：我的 / 临时 / 回收站 ───────────── */

test('assetPaneFromPath：三页签各有地址，演员不再是资产页签', () => {
  assert.equal(assetPaneFromPath('/assets'), 'library')
  assert.equal(assetPaneFromPath('/assets/'), 'library')
  assert.equal(assetPaneFromPath('/assets/temp'), 'temp')
  assert.equal(assetPaneFromPath('/assets/trash'), 'trash')
  assert.equal(assetPath('library'), '/assets')
  assert.equal(assetPath('temp'), '/assets/temp')
  assert.equal(assetPath('trash'), '/assets/trash')
  for (const pane of ['library', 'temp', 'trash']) {
    assert.equal(assetPaneFromPath(assetPath(pane)), pane)
  }
})

/* ───────────── 演员命名空间 ───────────── */

test('actorSourceFromPath：/actors 平台、/actors/mine* 我的（静态段优先）', () => {
  assert.equal(actorSourceFromPath('/actors'), 'platform')
  assert.equal(actorSourceFromPath('/actors/147'), 'platform')
  assert.equal(actorSourceFromPath('/actors/mine'), 'mine')
  assert.equal(actorSourceFromPath('/actors/mine/147'), 'mine')
  assert.equal(actorSourcePath('platform'), '/actors')
  assert.equal(actorSourcePath('mine'), '/actors/mine')
})

test('我的演员地址：详情 / 编辑 / 生成 run，id 一律字符串且编码', () => {
  assert.equal(myActorPath('1471022339713873920'), '/actors/mine/1471022339713873920')
  assert.equal(myActorEditPath('1471022339713873920'), '/actors/mine/1471022339713873920/edit')
  assert.equal(
    myActorGenerationPath('1471022339713873920', 'run-9'),
    '/actors/mine/1471022339713873920/generation/run-9'
  )
})

/* ───────────── 探索分类 ───────────── */

test('探索 slug：合法 slug 与中文标签双向映射，非法回退推荐', () => {
  assert.deepEqual(EXPLORE_CATEGORY_SLUGS.map(c => c.slug), ['recommend', 'anime', 'film', 'product'])
  assert.equal(exploreSlugOf('动画动漫'), 'anime')
  assert.equal(exploreSlugOf('推荐'), 'recommend')
  assert.equal(exploreSlugOf('不存在'), '')
  assert.equal(exploreLabelOf('anime'), '动画动漫')
  assert.equal(exploreLabelOf('电影'), '推荐')
  assert.equal(DEFAULT_EXPLORE_SLUG, 'recommend')
  assert.equal(isExploreSlug('film'), true)
  assert.equal(isExploreSlug('bogus'), false)
})

/* ───────────── 搜索 ───────────── */

test('searchPath：词写进 ?q=，空词不写空参数', () => {
  assert.equal(searchPath(''), '/search')
  assert.equal(searchPath('   '), '/search')
  assert.equal(searchPath('旗袍'), '/search?q=%E6%97%97%E8%A2%8D')
  assert.equal(searchPath('  da ji  '), '/search?q=da%20ji')
})

/* ───────────── 旧链接重定向 ───────────── */

test('旧 /characters* → /actors/mine*（new 与 :id/edit 优先于 :id）', () => {
  assert.deepEqual(legacyRedirect('/characters'), { path: '/actors/mine' })
  assert.deepEqual(legacyRedirect('/characters/'), { path: '/actors/mine' })
  assert.deepEqual(legacyRedirect('/characters/new'), { path: '/actors/new' })
  assert.deepEqual(legacyRedirect('/characters/1471022339713873920'), { path: '/actors/mine/1471022339713873920' })
  assert.deepEqual(
    legacyRedirect('/characters/1471022339713873920/edit'),
    { path: '/actors/mine/1471022339713873920/edit' }
  )
})

test('旧 /assets?pane=* → path 子路由；演员不再属于资产', () => {
  assert.deepEqual(legacyRedirect('/assets', { pane: 'library' }), { path: '/assets', query: {} })
  assert.deepEqual(legacyRedirect('/assets', { pane: 'temp' }), { path: '/assets/temp', query: {} })
  assert.deepEqual(legacyRedirect('/assets', { pane: 'trash' }), { path: '/assets/trash', query: {} })
  assert.deepEqual(legacyRedirect('/assets', { pane: 'actors' }), { path: '/actors', query: {} })
  // source=mine 时不落到平台演员库，而是「我的演员」
  assert.deepEqual(
    legacyRedirect('/assets', { pane: 'actors', source: 'mine' }),
    { path: '/actors/mine', query: {} }
  )
  // 没有 pane 不是旧链，交给页面自己
  assert.equal(legacyRedirect('/assets', {}), null)
  assert.equal(legacyRedirect('/assets'), null)
  // 非法 pane 不重定向（用户手改坏了只看到默认页）
  assert.equal(legacyRedirect('/assets', { pane: 'bogus' }), null)
})

test('旧 /wallet?tab=* → path 子路由', () => {
  assert.deepEqual(legacyRedirect('/wallet', { tab: 'ledger' }), { path: '/wallet/ledger' })
  assert.deepEqual(legacyRedirect('/wallet', { tab: 'recharge' }), { path: '/wallet/recharge' })
  assert.deepEqual(legacyRedirect('/wallet', { tab: 'orders' }), { path: '/wallet/orders' })
  assert.equal(legacyRedirect('/wallet', { tab: 'bogus' }), null)
  assert.equal(legacyRedirect('/wallet'), null)
})

test('旧 /effects?tab=* → path 子路由（未雨绸缪，旧页签从没写过 URL）', () => {
  assert.deepEqual(legacyRedirect('/effects', { tab: 'image' }), { path: '/effects/image' })
  assert.deepEqual(legacyRedirect('/effects', { tab: 'video' }), { path: '/effects/video' })
  assert.equal(legacyRedirect('/effects', { tab: 'all' }), null)
})

test('旧 /canvas?id=* → /canvas/:id，ownerType/ownerId 原样保留', () => {
  assert.deepEqual(
    legacyRedirect('/canvas', { id: 'abc', ownerType: 'project', ownerId: '9' }),
    { path: '/canvas/abc', query: { ownerType: 'project', ownerId: '9' } }
  )
  assert.equal(legacyRedirect('/canvas', {}), null)
  assert.equal(legacyRedirect('/canvas'), null)
})

test('新地址一律不重定向（幂等，不会自跳死循环）', () => {
  for (const target of [
    '/actors/mine', '/actors/new', '/actors/mine/147', '/actors/mine/147/edit',
    '/assets', '/assets/temp', '/assets/trash',
    '/wallet', '/wallet/ledger', '/wallet/recharge', '/wallet/orders',
    '/effects', '/effects/image', '/effects/video',
    '/canvas/abc', '/search', '/explore/anime'
  ]) {
    assert.equal(legacyRedirect(target, {}), null, `${target} 不该被重定向`)
  }
})
