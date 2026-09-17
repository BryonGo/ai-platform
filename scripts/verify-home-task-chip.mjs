#!/usr/bin/env node
// ============================================================
// 首页「任务 (N)」角标的登录态验证（A9）
//
// 为什么需要它：这个角标坏过一次 —— 代码从**作品**里筛 `status === 'running'`，
// 而作品只在任务成功之后才入库（见 app/pages/index.vue 里 STATUS_TEXT 的说明），
// 于是它恒为 0、永远不显示。这类"结构上不可能成立"的缺陷，接口层面看不出来
// （接口 200、字段都在），只有真的在浏览器里登录看一眼才知道。
//
// 它做的事：用真浏览器登录（拿 HttpOnly cookie）→ 打开首页 →
// 断言「继续创作」右上角出现了 `任务 (N)`，且 N 与预期一致。
//
// 用法：
//   node scripts/verify-home-task-chip.mjs --expect 1        # 期望显示 任务 (1)
//   node scripts/verify-home-task-chip.mjs --expect 0        # 期望不显示角标
//   node scripts/verify-home-task-chip.mjs --expect 1 --shot /tmp/home.png
//
// 环境变量：
//   A9_BASE      首页地址，默认 http://localhost:3333（nuxt dev）
//   A9_EMAIL     / A9_PASSWORD   前台账号，默认 codgo@test.local / codgo123456
//   A9_CHROME    chromium 可执行文件路径（本机 playwright 版本与缓存不一致时用它绕开）
//
// 依赖 playwright。本仓库没把它列为依赖，按需安装或复用别的项目里那份：
//   node --experimental-default-type=module scripts/verify-home-task-chip.mjs
// 若报 "Executable doesn't exist"，用 A9_CHROME 指向已有浏览器，或跑 `npx playwright install chromium`。
// ============================================================

import { createRequire } from 'node:module'

const args = process.argv.slice(2)
function argOf(name, fallback) {
  const i = args.indexOf(name)
  return i >= 0 && args[i + 1] !== undefined ? args[i + 1] : fallback
}

const BASE = process.env.A9_BASE || 'http://localhost:3333'
const EMAIL = process.env.A9_EMAIL || 'codgo@test.local'
const PASSWORD = process.env.A9_PASSWORD || 'codgo123456'
const EXPECT = Number(argOf('--expect', '1'))
const SHOT = argOf('--shot', '')

// playwright 的解析顺序：显式路径 → 本仓 node_modules → 同工作区里的 go-sdk-vue。
function loadPlaywright() {
  const candidates = [
    process.env.PLAYWRIGHT_PATH,
    'playwright',
    '/Users/progogame/code/aiGOFisher/go-sdk-vue/'
  ].filter(Boolean)
  for (const c of candidates) {
    try {
      return createRequire(c.endsWith('/') ? c : c + '/').call(null, 'playwright')
    } catch { /* 换下一个 */ }
  }
  throw new Error('找不到 playwright：设 PLAYWRIGHT_PATH 指向它的安装目录')
}

const { chromium } = loadPlaywright()
const launchOpts = process.env.A9_CHROME ? { executablePath: process.env.A9_CHROME } : {}
const browser = await chromium.launch(launchOpts)
const context = await browser.newContext({ viewport: { width: 1440, height: 1200 } })
const page = await context.newPage()
let failed = false

try {
  // ① 登录：走首页自身的 API（nuxt 代理 → 后端），让浏览器拿到 HttpOnly cookie
  const login = await context.request.post(`${BASE}/api/v1/account/auth/login`, {
    data: { email: EMAIL, password: PASSWORD }
  })
  const body = await login.json()
  if (body.code !== 0) throw new Error(`登录失败: ${JSON.stringify(body).slice(0, 160)}`)
  const cookies = (await context.cookies()).map(c => c.name)
  console.log(`登录成功（cookie: ${cookies.join(',') || '无'}）`)

  // ② 打开首页，等客户端把「继续创作」渲染出来
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' })
  await page.waitForTimeout(1500)

  const chip = page.locator('.task-chip')
  const chipCount = await chip.count()
  const chipText = chipCount ? (await chip.first().innerText()).trim() : ''
  const headCount = await page.locator('#continue-title').count()

  console.log(`「继续创作」区块存在: ${headCount > 0}`)
  console.log(`「任务 (N)」角标: ${chipCount > 0 ? JSON.stringify(chipText) : '(未显示)'}`)
  if (SHOT) {
    await page.screenshot({ path: SHOT })
    console.log(`截图: ${SHOT}`)
  }

  // ③ 断言
  if (EXPECT === 0) {
    if (chipCount > 0) throw new Error(`期望不显示角标，实际显示 ${JSON.stringify(chipText)}`)
    console.log('✅ 符合预期：没有在飞任务，不显示角标')
  } else {
    const m = chipText.match(/任务\s*\(\s*(\d+)\s*\)/)
    if (!m) throw new Error('未看到「任务 (N)」角标')
    if (Number(m[1]) !== EXPECT) throw new Error(`角标数字应为 ${EXPECT}，实际 ${m[1]}`)
    console.log(`✅ 符合预期：角标显示「${chipText}」`)
  }
} catch (e) {
  failed = true
  console.error('❌ ' + (e instanceof Error ? e.message : String(e)))
} finally {
  await browser.close()
}
process.exit(failed ? 1 : 0)
