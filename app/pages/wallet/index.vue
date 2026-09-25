<script setup lang="ts">
import { legacyRedirect, walletPath, walletSectionFromPath } from '~/utils/routes'
import type { WalletSection } from '~/utils/routes'

const api = useHougongApi()
const session = useAuthSession()
const route = useRoute()

// 旧 `?tab=ledger|recharge|orders` 入站重定向到 path 子路由（见 utils/routes 与设计文档 §5）。
const legacy = legacyRedirect(route.path, route.query)
if (legacy) await navigateTo(legacy, { redirectCode: 301 })

const loading = ref(true)
const error = ref('')

// 钱包。credits = 金币余额（coin_wallet.balance）。接口仍下发 balanceCents（旧「余额(分)」
// 契约字段，后端恒 0，仅为协议保留），UI 已不再展示，故这里不取。
const wallet = ref<{ credits: number, nextExpiry: string } | null>(null)
const claiming = ref(false)
const claimNotice = ref('')
// 邀请
const invite = ref<Invite | null>(null)
const copied = ref(false)
// 会员
const membership = ref<Membership | null>(null)
// 交易 / 流水
// key 仍叫 transactions（接口 listTransactions 与模板分支都按它走），只是对用户的叫法是「订单」。
// **页签即地址**：/wallet = 订单（交易），/wallet/ledger = 金币流水；刷新/分享/后退都停在同一页签。
const tab = computed<'transactions' | 'ledger'>(() =>
  walletSectionFromPath(route.path) === 'ledger' ? 'ledger' : 'transactions'
)
const transactions = ref<Transaction[]>([])
const ledger = ref<WalletLedgerItem[]>([])
// 充值（结算桩）
const rechargeAmt = ref(100)
const checkoutBusy = ref(false)
const checkoutRes = ref<Purchase | null>(null)
const checkoutErr = ref('')
// path 子路由的落地目标：/wallet/recharge、/wallet/orders、/wallet/membership 进来时
// 直接滚到对应区域，而不是只换 URL。用 ref 而不是纯 id + getElementById：和模板绑定在一起，
// 重命名/移除会被类型检查发现。
const rechargeRef = ref<HTMLElement | null>(null)
const ordersRef = ref<HTMLElement | null>(null)
const membershipRef = ref<HTMLElement | null>(null)
// 创作者认证
const creatorInfo = ref<Creator | null>(null)
const applyCreatorOpen = ref(false)
const mcInfo = ref<ModelCreator | null>(null)
const applyMcOpen = ref(false)
const applyErr = ref('')
const applyBusy = ref(false)
const creatorForm = ref({ direction: '', statement: '', workIds: [] as string[] })
const mcForm = ref({ platform: '', profileUrl: '', resourceUrls: [] as string[], resourceUrlInput: '' })

const amounts = [50, 100, 300, 500, 1000]

const tierLabel: Record<string, string> = {
  starter: '体验版', standard: '标准版', standardPlus: '标准+', pro: '专业版', proPlus: '专业+'
}
const kindText: Record<string, string> = {
  daily: '每日奖励', invite: '邀请奖励', generation: '生成消耗', refund: '退款', publish: '发布奖励',
  member: '会员赠送', topup: '充值', adjust: '运营调整'
}

function fmtCredits(n: number | undefined) {
  return (n ?? 0).toLocaleString()
}

/**
 * path 子路由的滚动落点。
 *
 * - /wallet/recharge   → 「充值金币」区；
 * - /wallet/orders     → 订单列表区（页签由地址决定，这里只滚动）；
 * - /wallet/membership → 会员区；
 * - /wallet、/wallet/ledger → 不滚动（页签已由地址决定）。
 */
function applySection(section: WalletSection) {
  if (section === 'recharge') void scrollToSection(rechargeRef.value)
  else if (section === 'orders') void scrollToSection(ordersRef.value)
  else if (section === 'membership') void scrollToSection(membershipRef.value)
}

/** 等 DOM 更新完再滚，否则刚切页签时目标区可能还没渲染出来。 */
async function scrollToSection(el: HTMLElement | null) {
  if (!el) return
  await nextTick()
  el.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

async function load() {
  loading.value = true
  error.value = ''
  try {
    const [w, inv, mem, tx, lg] = await Promise.all([
      api.walletBalance().catch(() => null),
      api.invite().catch(() => null),
      api.membership().catch(() => null),
      api.listTransactions(1, 20).catch(() => []),
      api.walletLedger(undefined, undefined, 1, 20).catch(() => [])
    ])
    wallet.value = w
    invite.value = inv
    membership.value = mem
    transactions.value = tx
    ledger.value = lg
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function claim() {
  claiming.value = true
  claimNotice.value = ''
  try {
    wallet.value = await api.claimDaily()
    claimNotice.value = '今日金币已到账'
  } catch (e: unknown) {
    claimNotice.value = e instanceof Error ? e.message : '领取失败'
  } finally {
    claiming.value = false
  }
}

async function copyInvite() {
  if (!invite.value) return
  try {
    await navigator.clipboard.writeText(invite.value.code)
    copied.value = true
    setTimeout(() => {
      copied.value = false
    }, 1500)
  } catch { /* 忽略剪贴板权限 */ }
}

async function doCheckout(kind: string, yuan?: number) {
  checkoutBusy.value = true
  checkoutErr.value = ''
  checkoutRes.value = null
  try {
    const purchase = kind === 'member'
      ? { kind, tier: 'standard', choice: 'moreCredits' }
      : { kind, yuan: yuan ?? rechargeAmt.value }
    checkoutRes.value = await api.checkoutCreate(purchase)
  } catch (e: unknown) {
    checkoutErr.value = e instanceof Error ? e.message : '下单失败'
  } finally {
    checkoutBusy.value = false
  }
}

async function loadCreator() {
  try {
    const [c, mc] = await Promise.all([api.creator().catch(() => null), api.modelCreator().catch(() => null)])
    creatorInfo.value = c
    mcInfo.value = mc
  } catch { /* 忽略 */ }
}

async function submitCreator() {
  applyBusy.value = true
  applyErr.value = ''
  try {
    creatorInfo.value = await api.submitCreator({ ...creatorForm.value, workIds: creatorForm.value.workIds.map(String), agreed: true })
    applyCreatorOpen.value = false
  } catch (e: unknown) {
    applyErr.value = e instanceof Error ? e.message : '提交失败'
  } finally {
    applyBusy.value = false
  }
}

async function submitModelCreator() {
  applyBusy.value = true
  applyErr.value = ''
  try {
    mcInfo.value = await api.submitModelCreator({ ...mcForm.value, resourceUrls: mcForm.value.resourceUrls, agreed: true })
    applyMcOpen.value = false
  } catch (e: unknown) {
    applyErr.value = e instanceof Error ? e.message : '提交失败'
  } finally {
    applyBusy.value = false
  }
}

function addResourceUrl() {
  const v = mcForm.value.resourceUrlInput.trim()
  if (v && !mcForm.value.resourceUrls.includes(v)) mcForm.value.resourceUrls.push(v)
  mcForm.value.resourceUrlInput = ''
}

onMounted(async () => {
  await session.load()
  if (!session.token.value) {
    goLogin()
    return
  }
  load()
  loadCreator()
  applySection(walletSectionFromPath(route.path))
})

// 已经在 /wallet 时再点头像菜单的「充值 / 订单」只换 path（组件复用），靠 watch 重新定位。
watch(() => route.path, () => applySection(walletSectionFromPath(route.path)))
</script>

<template>
  <div class="page-body wallet-page">
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          钱包 · 金币
        </p>
        <h1>金币与会员</h1>
        <p>每日签到领取金币，邀请好友得奖励；充值后金币实时到账。</p>
      </div>
      <button
        type="button"
        class="btn-primary"
        :disabled="claiming"
        @click="claim"
      >
        <UIcon
          name="i-lucide-calendar-check"
          aria-hidden="true"
        />
        {{ claiming ? '领取中…' : '每日领取' }}
      </button>
    </div>

    <p
      v-if="claimNotice"
      class="empty-tip"
    >
      {{ claimNotice }}
    </p>
    <p
      v-if="error"
      class="empty-tip"
    >
      加载失败：{{ error }}
    </p>

    <div class="wallet-cards">
      <div class="wallet-card wallet-credits">
        <div class="wallet-card-head">
          <span
            class="wallet-card-icon"
            aria-hidden="true"
          ><UIcon name="i-lucide-coins" /></span>
          <span class="wallet-label">可用金币</span>
        </div>
        <strong class="wallet-value">{{ fmtCredits(wallet?.credits) }}</strong>
        <small v-if="wallet?.nextExpiry">下次过期：{{ new Date(wallet.nextExpiry).toLocaleDateString() }}</small>
      </div>
      <div class="wallet-card wallet-invite">
        <div class="wallet-card-head">
          <span
            class="wallet-card-icon"
            aria-hidden="true"
          ><UIcon name="i-lucide-gift" /></span>
          <span class="wallet-label">邀请码</span>
        </div>
        <strong class="wallet-value">{{ invite?.code || '—' }}</strong>
        <div class="wallet-invite-meta">
          <span>已邀请 {{ invite?.invited ?? 0 }}</span>
          <button
            type="button"
            class="composer2-btn-sm wallet-copy-btn"
            @click="copyInvite"
          >
            {{ copied ? '已复制 ✓' : '复制' }}
          </button>
        </div>
        <small>每成功邀请一位好友，双方各得 {{ fmtCredits(invite?.rewardCredits) }} 金币</small>
      </div>
    </div>

    <div class="wallet-grid">
      <!-- 充值 -->
      <section
        id="wallet-recharge"
        ref="rechargeRef"
        class="panel-block"
      >
        <h3 class="section-title">
          <span
            class="section-icon"
            aria-hidden="true"
          ><UIcon name="i-lucide-credit-card" /></span>
          充值金币
        </h3>
        <p class="muted">
          10 元 = 10,000 金币（{{ fmtCredits(invite?.rewardCredits) }} 奖励另计）
        </p>
        <div class="amount-row">
          <button
            v-for="a in amounts"
            :key="a"
            type="button"
            class="filter-btn"
            :class="{ active: rechargeAmt === a }"
            @click="rechargeAmt = a"
          >
            {{ a }} 元
          </button>
        </div>
        <button
          type="button"
          class="btn-primary"
          :disabled="checkoutBusy"
          @click="doCheckout('credit')"
        >
          {{ checkoutBusy ? '下单中…' : `充值 ${rechargeAmt} 元` }}
        </button>
        <p
          v-if="checkoutErr"
          class="error-text"
        >
          {{ checkoutErr }}
        </p>
        <div
          v-if="checkoutRes"
          class="checkout-result"
        >
          <p>
            订单已创建（{{ checkoutRes.state }}）：{{ fmtCredits(checkoutRes.credits) }} 金币 ·
            ¥{{ (checkoutRes.priceCents / 100).toFixed(2) }}
          </p>
          <p class="muted">
            支付网关接入后即可完成付款，到账后流水可见。
          </p>
        </div>
      </section>

      <!-- 会员 -->
      <section
        id="wallet-membership"
        ref="membershipRef"
        class="panel-block"
      >
        <h3 class="section-title">
          <span
            class="section-icon"
            aria-hidden="true"
          ><UIcon name="i-lucide-crown" /></span>
          会员
        </h3>
        <template v-if="membership?.tier">
          <p class="member-tier">
            {{ tierLabel[membership.tier] || membership.tier }}
          </p>
          <p class="muted">
            生效至 {{ membership.expiresAt ? new Date(membership.expiresAt).toLocaleDateString() : '—' }}
          </p>
        </template>
        <p
          v-else
          class="muted"
        >
          当前未开通会员
        </p>
        <!-- 会员只有「按面值兑换金币」一种口径：1 元 = 1000 金币，无额外赠送、无余额奖励。
             不再展示"更多积分/更多余额"的二选一（后端两种 choice 新下单同额，二选一就是误导）。 -->
        <p class="member-offer-note">
          ¥69 → <strong>69,000 金币</strong> · 会员 1 个月
        </p>
        <div class="member-offers">
          <button
            type="button"
            class="btn-ghost"
            :disabled="checkoutBusy"
            @click="doCheckout('member')"
          >
            开通标准版（¥69）
          </button>
        </div>
      </section>
    </div>

    <!-- 创作者认证 -->
    <section class="panel-block creator-apply">
      <h3 class="section-title">
        创作者认证
      </h3>
      <div class="apply-cols">
        <div>
          <p class="apply-title">
            视觉创作者
          </p>
          <p class="muted">
            状态：{{ creatorInfo?.state ? creatorInfo.state : '未申请' }}
          </p>
          <p
            v-if="creatorInfo?.state"
            class="muted"
          >
            已发布 {{ creatorInfo.publishedImages }} / 需 {{ creatorInfo.requiredImages }} 张 ·
            奖励 {{ fmtCredits(creatorInfo.reward.credits) }} 金币（每张 {{ creatorInfo.reward.perImageCredits }}）
          </p>
          <button
            type="button"
            class="btn-ghost"
            @click="applyCreatorOpen = !applyCreatorOpen"
          >
            {{ applyCreatorOpen ? '收起' : '申请认证' }}
          </button>
          <div
            v-if="applyCreatorOpen"
            class="apply-form"
          >
            <input
              v-model="creatorForm.direction"
              type="text"
              class="composer2-input"
              placeholder="创作方向（如：角色插画 / 视觉小说）"
            >
            <textarea
              v-model="creatorForm.statement"
              class="composer2-input"
              rows="2"
              placeholder="创作说明"
            />
            <p class="muted">
              提交后由运营审核，审核通过后解锁发布奖励。
            </p>
            <button
              type="button"
              class="btn-primary"
              :disabled="applyBusy"
              @click="submitCreator"
            >
              提交申请
            </button>
          </div>
        </div>
        <div>
          <p class="apply-title">
            模型创作者
          </p>
          <p class="muted">
            状态：{{ mcInfo?.state ? mcInfo.state : '未申请' }}
          </p>
          <button
            type="button"
            class="btn-ghost"
            @click="applyMcOpen = !applyMcOpen"
          >
            {{ applyMcOpen ? '收起' : '申请认证' }}
          </button>
          <div
            v-if="applyMcOpen"
            class="apply-form"
          >
            <input
              v-model="mcForm.platform"
              type="text"
              class="composer2-input"
              placeholder="发布平台（如 Civitai）"
            >
            <input
              v-model="mcForm.profileUrl"
              type="text"
              class="composer2-input"
              placeholder="个人主页链接"
            >
            <div class="apply-url-row">
              <input
                v-model="mcForm.resourceUrlInput"
                type="text"
                class="composer2-input"
                placeholder="资源链接（模型/LoRA）"
                @keyup.enter="addResourceUrl"
              >
              <button
                type="button"
                class="composer2-btn-sm"
                @click="addResourceUrl"
              >
                添加
              </button>
            </div>
            <ul
              v-if="mcForm.resourceUrls.length"
              class="resource-list"
            >
              <li
                v-for="(u, i) in mcForm.resourceUrls"
                :key="u"
              >
                {{ u }}
                <button
                  type="button"
                  @click="mcForm.resourceUrls.splice(i, 1)"
                >
                  ×
                </button>
              </li>
            </ul>
            <button
              type="button"
              class="btn-primary"
              :disabled="applyBusy"
              @click="submitModelCreator"
            >
              提交申请
            </button>
          </div>
        </div>
      </div>
      <p
        v-if="applyErr"
        class="error-text"
      >
        {{ applyErr }}
      </p>
    </section>

    <!-- 订单（交易）/ 金币流水 -->
    <section
      id="wallet-orders"
      ref="ordersRef"
      class="panel-block"
    >
      <div class="filters">
        <NuxtLink
          class="filter-btn"
          :class="{ active: tab === 'transactions' }"
          :to="walletPath('transactions')"
        >
          <UIcon
            name="i-lucide-receipt"
            aria-hidden="true"
          />
          订单
        </NuxtLink>
        <NuxtLink
          class="filter-btn"
          :class="{ active: tab === 'ledger' }"
          :to="walletPath('ledger')"
        >
          <UIcon
            name="i-lucide-list"
            aria-hidden="true"
          />
          金币流水
        </NuxtLink>
      </div>

      <template v-if="tab === 'transactions'">
        <div
          v-for="t in transactions"
          :key="t.id"
          class="ledger-row"
          :class="(t.amount ?? (t.credits || 0)) >= 0 ? 'is-in' : 'is-out'"
        >
          <span
            class="ledger-icon"
            aria-hidden="true"
          ><UIcon :name="(t.amount ?? (t.credits || 0)) >= 0 ? 'i-lucide-arrow-down-left' : 'i-lucide-arrow-up-right'" /></span>
          <div class="ledger-main">
            <strong>{{ t.type === 'purchase' ? '充值订单' : kindText[t.kind || ''] || t.kind }}</strong>
            <small class="muted">{{ t.state || ((t.amount || 0) > 0 ? '入账' : '支出') }} · {{ new Date(t.createdAt).toLocaleString() }}</small>
          </div>
          <span
            class="ledger-amount"
            :class="(t.amount ?? (t.credits || 0)) >= 0 ? 'amount-plus' : 'amount-minus'"
          >
            {{ (t.amount ?? t.credits ?? 0) > 0 ? '+' : '' }}{{ fmtCredits(t.amount ?? t.credits ?? 0) }}
          </span>
        </div>
        <p
          v-if="!transactions.length"
          class="empty-tip"
        >
          暂无交易记录
        </p>
      </template>
      <template v-else>
        <div
          v-for="l in ledger"
          :key="l.id"
          class="ledger-row"
          :class="l.amount > 0 ? 'is-in' : 'is-out'"
        >
          <span
            class="ledger-icon"
            aria-hidden="true"
          ><UIcon :name="l.amount > 0 ? 'i-lucide-arrow-down-left' : 'i-lucide-arrow-up-right'" /></span>
          <div class="ledger-main">
            <strong>{{ kindText[l.kind] || l.kind }}</strong>
            <small class="muted">{{ l.asset }} · {{ new Date(l.createdAt).toLocaleString() }}</small>
          </div>
          <span
            class="ledger-amount"
            :class="l.amount > 0 ? 'amount-plus' : 'amount-minus'"
          >{{ l.amount > 0 ? '+' : '' }}{{ fmtCredits(l.amount) }}</span>
        </div>
        <p
          v-if="!ledger.length"
          class="empty-tip"
        >
          暂无金币流水
        </p>
      </template>
    </section>
  </div>
</template>

<style scoped>
/**
 * 钱包页的语义色收口在本页一层（不改全局 token）：
 * 深色卡片底 + **单一暖金主 accent**（金币），正负金额只在行内小面积用绿/红，
 * 邀请码用蓝紫做辅助。这样每张卡不再各自一种颜色，也不会再出现浅色米黄底。
 */
.wallet-page {
  --w-gold: #f5c451;
  --w-gold-strong: #ffd77a;
  --w-gold-soft: rgb(245 196 81 / 0.14);
  --w-gold-line: rgb(245 196 81 / 0.4);
  --w-gold-glow: rgb(245 196 81 / 0.2);
  --w-ok: #4ade80;
  --w-ok-soft: rgb(74 222 128 / 0.12);
  --w-bad: #f87171;
  --w-bad-soft: rgb(248 113 113 / 0.12);
  --w-invite: #a78bfa;
  --w-invite-soft: rgb(167 139 250 / 0.14);
  --w-invite-line: rgb(167 139 250 / 0.38);
  --w-line: var(--hg-line, #282828);
  --w-surface: var(--hg-card, #171717);
  /* 与全站 panel-block / entry-card 同款「大圆角 + 小圆角」签名 */
  --w-radius: 16px 4px 16px 4px;
  /* 语义色之外统一用中灰，避免第二套「看起来也像强调」的颜色 */
  --w-muted: var(--hg-muted, #949494);
}
.wallet-cards {
  display: grid;
  grid-template-columns: 1fr;
  gap: 1rem;
  margin: 1.25rem 0;
}
/* 宽屏让「可用金币」占更宽的一列，成为主视觉卡；邀请码作次列 */
@media (min-width: 880px) {
  .wallet-cards {
    grid-template-columns: 1.45fr 1fr;
  }
}
.wallet-card {
  --card-accent: var(--w-gold);
  --card-soft: var(--w-gold-soft);
  position: relative;
  display: grid;
  align-content: start;
  gap: 0.3rem;
  padding: 1.15rem 1.25rem;
  border: 1px solid var(--w-line);
  border-radius: var(--w-radius);
  background: var(--w-surface);
}
.wallet-card-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.15rem;
}
/* 小面积 accent：只有图标底色/描边跟着卡走 */
.wallet-card-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 30px;
  height: 30px;
  border-radius: 9px;
  background: var(--card-soft);
  color: var(--card-accent);
  font-size: 16px;
}
.wallet-label {
  font-size: 0.8rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: var(--w-muted);
}
/* 全站没有定义 .muted（历史页面靠继承拿到正文色），这里补上，让副文案真有层级 */
.muted {
  color: var(--w-muted);
}
.wallet-value {
  font-size: clamp(1.5rem, 2.4vw, 2rem);
  line-height: 1.15;
  color: var(--ink, #fafafa);
  font-variant-numeric: tabular-nums;
}
.wallet-card small {
  font-size: 0.74rem;
  line-height: 1.5;
  color: var(--w-muted);
}
/* 主视觉卡：暗色底 + 暖金描边 + 柔和光晕（不再是浅色米黄渐变） */
.wallet-credits {
  border-color: var(--w-gold-line);
  background:
    radial-gradient(130% 150% at 100% 0%, var(--w-gold-soft), transparent 58%),
    var(--w-surface);
  box-shadow: 0 18px 44px -28px var(--w-gold-glow);
}
.wallet-credits .wallet-card-icon {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  font-size: 19px;
  background: rgb(245 196 81 / 0.18);
}
.wallet-credits .wallet-label {
  color: var(--w-gold);
}
.wallet-credits .wallet-value {
  font-size: clamp(1.9rem, 3.2vw, 2.7rem);
  font-weight: 800;
  color: var(--w-gold-strong);
}
/* 邀请码：同一 card surface，只用图标那一点 accent 区分 */
.wallet-invite {
  --card-accent: var(--w-invite);
  --card-soft: var(--w-invite-soft);
}
.wallet-invite .wallet-value {
  font-size: clamp(1.3rem, 2vw, 1.6rem);
  letter-spacing: 0.06em;
  color: var(--w-invite);
}
.wallet-invite-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.8rem;
  color: var(--w-muted);
}
/* 带 .wallet-invite 前缀提高优先级：否则会被后面的 .composer2-btn-sm 同权重覆盖 */
.wallet-invite .wallet-copy-btn {
  min-height: 30px;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  border: 1px solid var(--w-invite-line);
  background: var(--w-invite-soft);
  color: var(--w-invite);
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  transition: filter 0.18s ease, border-color 0.18s ease;
}
.wallet-invite .wallet-copy-btn:hover {
  filter: brightness(1.12);
}
.wallet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}
.panel-block {
  border: 1px solid var(--w-line);
  border-radius: var(--w-radius);
  padding: 1.1rem 1.25rem;
  display: grid;
  gap: 0.7rem;
  background: var(--w-surface);
}
/* path 子路由（/wallet/recharge、/wallet/orders、/wallet/membership）的滚动落点：
   留一点上边距，标题不贴页面顶端。 */
#wallet-recharge,
#wallet-orders,
#wallet-membership {
  scroll-margin-top: 16px;
}
.section-title {
  margin: 0;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: 1rem;
}
.section-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--w-gold-soft);
  color: var(--w-gold);
  font-size: 15px;
}
.amount-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
/* 筛选 / 金额芯片：与全站一致的描边 + 胶囊，选中态用本页暖金，而不是全局粉色 */
.filter-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 0.4rem;
  min-height: 38px;
  padding: 0 0.95rem;
  border: 1px solid var(--w-line);
  border-radius: 999px;
  background: transparent;
  color: var(--w-muted);
  font-size: 0.8rem;
  font-weight: 600;
  text-decoration: none;
  transition: color 0.16s ease, border-color 0.16s ease, background 0.16s ease;
}
.filter-btn:hover {
  color: var(--ink, #fafafa);
  border-color: #3a3a3a;
}
.filter-btn.active {
  border-color: var(--w-gold-line);
  background: var(--w-gold-soft);
  color: var(--w-gold-strong);
}
/* panel-block 是 grid，主按钮会被拉满整块；收回内容宽度，和旁边的 ghost 按钮观感一致 */
.panel-block > .btn-primary {
  justify-self: start;
}
.checkout-result {
  border-top: 1px solid var(--w-line);
  padding-top: 0.6rem;
  font-size: 0.85rem;
}
.member-tier {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--w-gold-strong);
  margin: 0;
}
.member-offer-note {
  margin: 0.4rem 0 0.6rem;
  font-size: 0.9rem;
}
.member-offer-note strong {
  color: var(--w-gold-strong);
}
.member-offers {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.creator-apply {
  margin-bottom: 1rem;
}
.apply-cols {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 1rem;
}
@media (max-width: 720px) {
  .apply-cols {
    grid-template-columns: 1fr;
  }
}
.apply-title {
  font-weight: 800;
  margin: 0.2rem 0;
}
.apply-form {
  display: grid;
  gap: 0.5rem;
  margin-top: 0.6rem;
}
.apply-url-row {
  display: flex;
  gap: 0.4rem;
}
.resource-list {
  margin: 0;
  padding-left: 1rem;
  font-size: 0.8rem;
  color: var(--w-muted);
  display: grid;
  gap: 0.15rem;
}
.resource-list li {
  display: flex;
  justify-content: space-between;
  align-items: center;
  word-break: break-all;
}
.resource-list button {
  border: none;
  background: none;
  cursor: pointer;
  color: var(--w-muted);
}
.resource-list button:hover {
  color: var(--ink, #fafafa);
}
.ledger-row {
  display: flex;
  align-items: center;
  gap: 0.7rem;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--w-line);
}
/* 收支方向不只用颜色：左侧箭头图标 + 右侧正负号 + 「入账/支出」文案三重表达 */
.ledger-icon {
  display: grid;
  place-items: center;
  flex: none;
  width: 32px;
  height: 32px;
  border-radius: 10px;
  font-size: 15px;
  background: rgb(255 255 255 / 0.05);
  color: var(--w-muted);
}
.ledger-row.is-in .ledger-icon {
  background: var(--w-ok-soft);
  color: var(--w-ok);
}
.ledger-row.is-out .ledger-icon {
  background: var(--w-bad-soft);
  color: var(--w-bad);
}
.ledger-main {
  display: grid;
  gap: 0.1rem;
  flex: 1 1 auto;
  min-width: 0;
}
.ledger-main strong {
  font-size: 0.9rem;
  font-weight: 700;
}
.ledger-main small {
  font-size: 0.74rem;
  color: var(--w-muted);
  overflow-wrap: anywhere;
}
/* 金额列不参与压缩，避免被长文案挤变形 */
.ledger-amount {
  flex: none;
  white-space: nowrap;
  font-size: 0.95rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
}
.amount-plus {
  color: var(--w-ok);
}
.amount-minus {
  color: var(--w-bad);
}
.error-text {
  color: var(--w-bad);
  font-size: 0.82rem;
}
.composer2-input {
  width: 100%;
  min-width: 0;
  min-height: 40px;
  padding: 0.6rem 0.75rem;
  border-radius: 10px 3px 10px 3px;
  border: 1px solid var(--w-line);
  background: var(--hg-input, rgb(255 255 255 / 0.05));
  color: var(--ink, #fafafa);
  font-size: 0.86rem;
  outline: none;
  resize: vertical;
  transition: border-color 0.18s ease, box-shadow 0.18s ease;
}
.composer2-input::placeholder {
  color: var(--w-muted);
}
.composer2-input:focus {
  border-color: var(--w-gold-line);
  box-shadow: 0 0 0 3px var(--w-gold-soft);
}
.composer2-btn-sm {
  min-height: 32px;
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--w-line);
  background: transparent;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  color: var(--w-muted);
  transition: color 0.16s ease, border-color 0.16s ease;
}
.composer2-btn-sm:hover {
  color: var(--ink, #fafafa);
  border-color: #3a3a3a;
}
/* 窄屏：触控目标放宽到接近 44px，并让金额芯片均分一行，避免横向溢出 */
@media (max-width: 560px) {
  .filter-btn {
    min-height: 42px;
  }
  .amount-row .filter-btn {
    flex: 1 1 auto;
    min-width: 4.5rem;
  }
  .wallet-invite .wallet-copy-btn {
    min-height: 36px;
    padding: 0 0.9rem;
  }
  .page-head .btn-primary {
    width: 100%;
  }
  .panel-block > .btn-primary {
    justify-self: stretch;
  }
}
</style>
