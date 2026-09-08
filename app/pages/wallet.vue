<script setup lang="ts">
const api = useHougongApi()
const session = useAuthSession()

const loading = ref(true)
const error = ref('')

// 钱包
const wallet = ref<{ credits: number, balanceCents: number, nextExpiry: string } | null>(null)
const claiming = ref(false)
const claimNotice = ref('')
// 邀请
const invite = ref<Invite | null>(null)
const copied = ref(false)
// 会员
const membership = ref<Membership | null>(null)
// 交易 / 流水
const tab = ref<'transactions' | 'ledger'>('transactions')
const transactions = ref<Transaction[]>([])
const ledger = ref<WalletLedgerItem[]>([])
// 充值（结算桩）
const rechargeAmt = ref(100)
const checkoutBusy = ref(false)
const checkoutRes = ref<Purchase | null>(null)
const checkoutErr = ref('')
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
    claimNotice.value = '今日积分已到账'
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
    setTimeout(() => { copied.value = false }, 1500)
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

onMounted(() => {
  session.load()
  if (!session.token.value) {
    navigateTo('/auth/login')
    return
  }
  load()
  loadCreator()
})
</script>

<template>
  <div class="page-body">
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          钱包 · 积分
        </p>
        <h1>积分、余额与会员</h1>
        <p>每日签到领取积分，邀请好友得奖励；充值后积分实时到账。</p>
      </div>
      <button
        type="button"
        class="btn-primary"
        :disabled="claiming"
        @click="claim"
      >{{ claiming ? '领取中…' : '每日领取' }}</button>
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
        <span class="wallet-label">可用积分</span>
        <strong>{{ fmtCredits(wallet?.credits) }}</strong>
        <small v-if="wallet?.nextExpiry">下次过期：{{ new Date(wallet.nextExpiry).toLocaleDateString() }}</small>
      </div>
      <div class="wallet-card">
        <span class="wallet-label">余额（元）</span>
        <strong>{{ ((wallet?.balanceCents ?? 0) / 100).toFixed(2) }}</strong>
        <small>用于会员订阅等消费</small>
      </div>
      <div class="wallet-card wallet-invite">
        <span class="wallet-label">邀请码</span>
        <strong>{{ invite?.code || '—' }}</strong>
        <div class="wallet-invite-meta">
          <span>已邀请 {{ invite?.invited ?? 0 }}</span>
          <button
            type="button"
            class="composer2-btn-sm"
            @click="copyInvite"
          >{{ copied ? '已复制 ✓' : '复制' }}</button>
        </div>
        <small>每成功邀请一位好友，双方各得 {{ fmtCredits(invite?.rewardCredits) }} 积分</small>
      </div>
    </div>

    <div class="wallet-grid">
      <!-- 充值 -->
      <section class="panel-block">
        <h3 class="section-title">充值积分</h3>
        <p class="muted">
          10 元 = 100,000 积分（{{ fmtCredits(invite?.rewardCredits) }} 奖励另计）
        </p>
        <div class="amount-row">
          <button
            v-for="a in amounts"
            :key="a"
            type="button"
            class="filter-btn"
            :class="{ active: rechargeAmt === a }"
            @click="rechargeAmt = a"
          >{{ a }} 元</button>
        </div>
        <button
          type="button"
          class="btn-primary"
          :disabled="checkoutBusy"
          @click="doCheckout('credit')"
        >{{ checkoutBusy ? '下单中…' : `充值 ${rechargeAmt} 元` }}</button>
        <p
          v-if="checkoutErr"
          class="error-text"
        >{{ checkoutErr }}</p>
        <div
          v-if="checkoutRes"
          class="checkout-result"
        >
          <p>
            订单已创建（{{ checkoutRes.state }}）：{{ fmtCredits(checkoutRes.credits) }} 积分 ·
            ¥{{ (checkoutRes.priceCents / 100).toFixed(2) }}
          </p>
          <p class="muted">
            支付网关接入后即可完成付款，到账后流水可见。
          </p>
        </div>
      </section>

      <!-- 会员 -->
      <section class="panel-block">
        <h3 class="section-title">会员</h3>
        <template v-if="membership?.tier">
          <p class="member-tier">{{ tierLabel[membership.tier] || membership.tier }}</p>
          <p class="muted">
            生效至 {{ membership.expiresAt ? new Date(membership.expiresAt).toLocaleDateString() : '—' }}
          </p>
        </template>
        <p
          v-else
          class="muted"
        >当前未开通会员</p>
        <div class="member-offers">
          <button
            type="button"
            class="btn-ghost"
            :disabled="checkoutBusy"
            @click="doCheckout('member')"
          >开通标准版（¥69）</button>
        </div>
      </section>
    </div>

    <!-- 创作者认证 -->
    <section class="panel-block creator-apply">
      <h3 class="section-title">创作者认证</h3>
      <div class="apply-cols">
        <div>
          <p class="apply-title">视觉创作者</p>
          <p class="muted">
            状态：{{ creatorInfo?.state ? creatorInfo.state : '未申请' }}
          </p>
          <p
            v-if="creatorInfo?.state"
            class="muted"
          >
            已发布 {{ creatorInfo.publishedImages }} / 需 {{ creatorInfo.requiredImages }} 张 ·
            奖励 {{ fmtCredits(creatorInfo.reward.credits) }} 积分（每张 {{ creatorInfo.reward.perImageCredits }}）
          </p>
          <button
            type="button"
            class="btn-ghost"
            @click="applyCreatorOpen = !applyCreatorOpen"
          >{{ applyCreatorOpen ? '收起' : '申请认证' }}</button>
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
            <p class="muted">提交后由运营审核，审核通过后解锁发布奖励。</p>
            <button
              type="button"
              class="btn-primary"
              :disabled="applyBusy"
              @click="submitCreator"
            >提交申请</button>
          </div>
        </div>
        <div>
          <p class="apply-title">模型创作者</p>
          <p class="muted">
            状态：{{ mcInfo?.state ? mcInfo.state : '未申请' }}
          </p>
          <button
            type="button"
            class="btn-ghost"
            @click="applyMcOpen = !applyMcOpen"
          >{{ applyMcOpen ? '收起' : '申请认证' }}</button>
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
              >添加</button>
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
                >×</button>
              </li>
            </ul>
            <button
              type="button"
              class="btn-primary"
              :disabled="applyBusy"
              @click="submitModelCreator"
            >提交申请</button>
          </div>
        </div>
      </div>
      <p
        v-if="applyErr"
        class="error-text"
      >{{ applyErr }}</p>
    </section>

    <!-- 流水 -->
    <section class="panel-block">
      <div class="filters">
        <button
          v-for="t in ([{ key: 'transactions', label: '交易' }, { key: 'ledger', label: '积分流水' }] as const)"
          :key="t.key"
          type="button"
          class="filter-btn"
          :class="{ active: tab === t.key }"
          @click="tab = t.key"
        >{{ t.label }}</button>
      </div>

      <template v-if="tab === 'transactions'">
        <div
          v-for="t in transactions"
          :key="t.id"
          class="ledger-row"
        >
          <div>
            <strong>{{ t.type === 'purchase' ? '充值订单' : kindText[t.kind || ''] || t.kind }}</strong>
            <small class="muted">{{ t.state || (t.amount || 0) > 0 ? '入账' : '支出' }} · {{ new Date(t.createdAt).toLocaleString() }}</small>
          </div>
          <span :class="(t.amount ?? (t.credits || 0)) >= 0 ? 'amount-plus' : 'amount-minus'">
            {{ (t.amount ?? t.credits ?? 0) > 0 ? '+' : '' }}{{ fmtCredits(t.amount ?? t.credits ?? 0) }}
          </span>
        </div>
        <p
          v-if="!transactions.length"
          class="empty-tip"
        >暂无交易记录</p>
      </template>
      <template v-else>
        <div
          v-for="l in ledger"
          :key="l.id"
          class="ledger-row"
        >
          <div>
            <strong>{{ kindText[l.kind] || l.kind }}</strong>
            <small class="muted">{{ l.asset }} · {{ new Date(l.createdAt).toLocaleString() }}</small>
          </div>
          <span :class="l.amount > 0 ? 'amount-plus' : 'amount-minus'">{{ l.amount > 0 ? '+' : '' }}{{ fmtCredits(l.amount) }}</span>
        </div>
        <p
          v-if="!ledger.length"
          class="empty-tip"
        >暂无积分流水</p>
      </template>
    </section>
  </div>
</template>

<style scoped>
.wallet-cards {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
  gap: 1rem;
  margin: 1.25rem 0;
}
.wallet-card {
  border: 1px solid var(--hg-line, #e2e4ea);
  border-radius: 1.25rem;
  padding: 1.1rem 1.25rem;
  display: grid;
  gap: 0.2rem;
  background: #fff;
}
.wallet-card strong {
  font-size: clamp(1.5rem, 2.4vw, 2rem);
}
.wallet-credits {
  background: linear-gradient(135deg, #f7ecd8, #f3e3c0);
  border-color: var(--hg-accent, #b08a4f);
}
.wallet-label {
  font-size: 0.8rem;
  font-weight: 700;
  color: var(--hg-muted, #666);
}
.wallet-invite-meta {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  font-size: 0.8rem;
  color: var(--hg-muted, #777);
}
.wallet-invite small,
.wallet-card small {
  font-size: 0.74rem;
  color: var(--hg-muted, #999);
}
.wallet-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
  gap: 1rem;
  margin-bottom: 1rem;
}
.panel-block {
  border: 1px solid var(--hg-line, #e2e4ea);
  border-radius: 1.25rem;
  padding: 1.1rem 1.25rem;
  display: grid;
  gap: 0.7rem;
  background: #fff;
}
.section-title {
  margin: 0;
  font-size: 1rem;
}
.amount-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.4rem;
}
.checkout-result {
  border-top: 1px solid var(--hg-line, #eee);
  padding-top: 0.6rem;
  font-size: 0.85rem;
}
.member-tier {
  font-size: 1.4rem;
  font-weight: 800;
  color: var(--hg-accent, #b08a4f);
  margin: 0;
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
  color: var(--hg-muted, #666);
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
  color: var(--hg-muted, #999);
}
.ledger-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.55rem 0;
  border-bottom: 1px solid var(--hg-line, #f2f2f4);
}
.ledger-row > div {
  display: grid;
  gap: 0.1rem;
}
.amount-plus {
  color: #15803d;
  font-weight: 800;
}
.amount-minus {
  color: #b91c1c;
  font-weight: 800;
}
.error-text {
  color: #dc2626;
  font-size: 0.82rem;
}
.composer2-input {
  width: 100%;
  padding: 0.6rem 0.75rem;
  border-radius: 0.7rem;
  border: 1px solid var(--hg-line, #e2e4ea);
  font-size: 0.86rem;
  outline: none;
  background: #faf9f7;
  resize: vertical;
}
.composer2-btn-sm {
  padding: 0.3rem 0.7rem;
  border-radius: 999px;
  border: 1px solid var(--hg-line, #e2e4ea);
  background: transparent;
  font-size: 0.75rem;
  font-weight: 700;
  cursor: pointer;
  color: var(--hg-muted, #666);
}
</style>
