<script setup lang="ts">
import { useComposerDraft } from '~/composables/useComposerDraft'
import type { Catalog } from '~/composables/useHougongApi'

const hgApi = useHougongApi()

type Mode = 'video' | 'image'

const mode = ref<Mode>('image')
const prompt = ref('')
const ratio = ref('16:9')
const durationSeconds = ref(5)
const notice = ref('')
const uploadPreview = ref('')
const uploadName = ref('')
const uploadFile = ref<File | null>(null)

// 价格来自后端报价表（catalog.rates，billing_rate_version 最新 revision），
// 与创建任务时的实际预占一致；取不到时回退默认值。
const catalog = ref<Catalog | null>(null)
const cost = computed(() => {
  const rates = catalog.value?.rates
  if (mode.value === 'video') {
    // 与后端一致：后台配了 i2v:<画幅>:<秒> 则按时长计价，否则回落按画幅单档。
    const byDuration = rates?.videoByDuration?.[ratio.value]?.[String(durationSeconds.value)]
    if (typeof byDuration === 'number' && byDuration > 0) return byDuration
    const base = rates?.video?.[ratio.value]
    if (typeof base === 'number' && base > 0) return base
    return 24
  }
  const quoted = rates?.image?.[ratio.value]
  if (typeof quoted === 'number' && quoted > 0) return quoted
  return 8
})

onMounted(async () => {
  void loadShowcase()
  try {
    catalog.value = await hgApi.getCatalog()
  } catch {
    catalog.value = null
  }
})

const { setDraft } = useComposerDraft()
const session = useAuthSession()

// 「继续你的故事」= 真实作品（最近 6 部），不再用硬编码假数据。
interface ShowcaseWork { id: number, title: string, kind: string, image: string, character: string, recommended: boolean, tone: string }
const showcaseWorks = ref<ShowcaseWork[]>([])
const showcaseLoading = ref(true)
const myCharacters = ref<CharacterItem[]>([])
const activeCharacter = computed(() => myCharacters.value[0])
const characterCount = computed(() => myCharacters.value.length)

const TONES = ['cool', 'warm', 'jade', 'office', 'ivory']

async function loadShowcase() {
  showcaseLoading.value = true
  session.load()
  if (!session.token.value) {
    showcaseWorks.value = []
    myCharacters.value = []
    showcaseLoading.value = false
    return
  }
  try {
    const [works, chars] = await Promise.all([
      hgApi.listWorks(),
      hgApi.listCharacters().catch(() => [] as CharacterItem[])
    ])
    myCharacters.value = chars
    const nameOf = (id: number) => chars.find(c => c.id === id)?.name || ''
    showcaseWorks.value = works.slice(0, 6).map((w, i) => ({
      id: w.id,
      title: w.title || `作品 ${String(w.id).slice(-6)}`,
      kind: w.kind === 'video' ? '视频' : '图集',
      image: w.imageUrl || '',
      character: nameOf(w.characterId) || `角色 ${String(w.characterId).slice(-4)}`,
      recommended: !!w.favorite,
      tone: TONES[i % TONES.length] ?? 'cool'
    }))
  } catch {
    showcaseWorks.value = []
    myCharacters.value = []
  } finally {
    showcaseLoading.value = false
  }
}

function inspire() {
  prompt.value = '雨夜的落地窗前，妲己缓缓回眸，三条白色狐尾随风舒展，镜头从侧后方轻轻靠近。'
}

// 首页是导航入口：带着输入跳转到创作页，由创作页弹出确认对话框
function submit() {
  if (!prompt.value.trim()) {
    notice.value = '请先描述这一幕。'
    return
  }
  setDraft({
    prompt: prompt.value,
    mode: mode.value,
    ratio: ratio.value,
    durationSeconds: durationSeconds.value,
    uploadName: uploadName.value,
    file: uploadFile.value
  })
  navigateTo('/create')
}

function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return
  if (uploadPreview.value) URL.revokeObjectURL(uploadPreview.value)

  uploadPreview.value = URL.createObjectURL(file)
  uploadName.value = file.name
  uploadFile.value = file
}

onBeforeUnmount(() => {
  if (uploadPreview.value) URL.revokeObjectURL(uploadPreview.value)
})
</script>

<template>
  <div class="home-page">
    <section
      id="create"
      class="cinema-hero"
      aria-labelledby="hero-title"
    >
      <div
        class="hero-lines"
        aria-hidden="true"
      >
        <i /><i /><i />
      </div>

      <div class="hero-copy">
        <p>你的私人 AI 影像宇宙</p>
        <h1 id="hero-title">
          让每个角色，<br>都有下一幕。
        </h1>
        <div class="hero-support">
          <span><i
            class="i-lucide-lock-keyhole"
            aria-hidden="true"
          />默认私密</span>
          <span><i
            class="i-lucide-layers-3"
            aria-hidden="true"
          />连续创作</span>
        </div>
      </div>

      <div class="daji-stage">
        <span
          class="daji-aura"
          aria-hidden="true"
        />
        <img
          class="support-character office-lady"
          src="/images/office-lady-gold-glasses-v1.webp"
          alt="21 岁成年 Office Lady，佩戴金丝眼镜"
        >
        <img
          class="support-character sweet-nurse"
          src="/images/nurse-sweet-adult25-v1.webp"
          alt="25 岁成年甜美护士"
        >
        <img
          class="daji-main"
          src="/images/daji-three-tail-cutout-v2.webp"
          alt="妲己，24 岁成年三尾狐灵"
        >
        <span class="universe-count">{{ characterCount > 0 ? `当前宇宙 · ${characterCount} 位角色` : '你的私人影像宇宙' }}</span>
        <div class="daji-label">
          <small>首位角色</small>
          <strong>妲己</strong>
          <span>24 岁 · 三尾狐灵</span>
        </div>
      </div>

      <div
        class="hero-inscription"
        aria-hidden="true"
      >
        <span>狐</span><small>三尾</small>
      </div>
    </section>

    <section
      id="studio"
      class="creator-deck"
      aria-label="快速创作"
    >
      <span
        id="characters"
        class="section-anchor"
        aria-hidden="true"
      />
      <div class="composer">
        <div
          class="mode-tabs"
          role="tablist"
          aria-label="选择创作类型"
        >
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'image'"
            :class="{ active: mode === 'image' }"
            @click="mode = 'image'"
          >
            <span
              class="i-lucide-image"
              aria-hidden="true"
            />图片创作
          </button>
          <button
            type="button"
            role="tab"
            :aria-selected="mode === 'video'"
            :class="{ active: mode === 'video' }"
            @click="mode = 'video'"
          >
            <span
              class="i-lucide-video"
              aria-hidden="true"
            />视频创作
          </button>
        </div>

        <div class="prompt-area">
          <label class="upload-box">
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              aria-label="上传参考图片"
              @change="handleUpload"
            >
            <img
              v-if="uploadPreview"
              :src="uploadPreview"
              :alt="uploadName"
            >
            <span
              v-else
              class="upload-placeholder"
            >
              <i
                class="i-lucide-plus"
                aria-hidden="true"
              />
              <strong>上传图片</strong>
              <small>用于画面对比</small>
            </span>
            <span
              v-if="uploadPreview"
              class="upload-replace"
            >更换图片</span>
          </label>

          <div class="prompt-copy">
            <textarea
              v-model="prompt"
              rows="3"
              aria-label="创作描述"
              placeholder="描述你想创作的下一幕……"
            />
            <button
              type="button"
              class="inspire"
              @click="inspire"
            >
              <span
                class="i-lucide-dices"
                aria-hidden="true"
              />给我灵感
            </button>
          </div>
        </div>

        <div class="composer-footer">
          <div class="parameters">
            <NuxtLink
              to="/characters"
              class="chip-link"
            >
              <span
                class="i-lucide-user-round"
                aria-hidden="true"
              />{{ activeCharacter?.name || '选择角色' }}
            </NuxtLink>
            <NuxtLink
              to="/assets"
              class="chip-link"
            >
              <span
                class="i-lucide-image-plus"
                aria-hidden="true"
              />素材库
            </NuxtLink>
            <button
              type="button"
              @click="ratio = ratio === '16:9' ? '9:16' : '16:9'"
            >
              <span
                class="i-lucide-monitor"
                aria-hidden="true"
              />{{ ratio }}
            </button>
            <button
              v-if="mode === 'video'"
              type="button"
              @click="durationSeconds = durationSeconds === 5 ? 10 : 5"
            >
              <span
                class="i-lucide-clock-3"
                aria-hidden="true"
              />{{ durationSeconds }} 秒
            </button>
          </div>
          <button
            type="button"
            class="generate"
            @click="submit"
          >
            <span
              class="i-lucide-sparkles"
              aria-hidden="true"
            />
            生成{{ mode === 'video' ? '视频' : '图片' }}
            <small>{{ cost }} 积分</small>
          </button>
        </div>
        <p
          v-if="notice"
          class="composer-notice"
          role="status"
        >
          {{ notice }}
        </p>
      </div>

      <!-- 本次出演模块暂时隐藏，保留完整结构用于后续角色编排功能。 -->
      <!-- <aside
        id="characters"
        class="cast"
        aria-label="本次出演角色"
      >
        <div class="cast-header">
          <div><strong>本次出演</strong><small>已选 3 / 3</small></div>
          <button type="button">
            编辑阵容
          </button>
        </div>
        <article class="cast-character">
          <img
            src="/images/daji-three-tail-front-v1.webp"
            alt="妲己"
          >
          <span
            class="cast-mask"
            aria-hidden="true"
          />
          <span class="selected"><i
            class="i-lucide-check"
            aria-hidden="true"
          /></span>
          <div><strong>妲己</strong><small>默认造型 · 三尾</small></div>
        </article>
        <div class="cast-support-row">
          <article class="cast-support">
            <img
              src="/images/office-lady-gold-glasses-v1.webp"
              alt="Office Lady"
            >
            <div><strong>Office Lady</strong><small>21 岁 · 金丝眼镜</small></div>
          </article>
          <article class="cast-support">
            <img
              src="/images/nurse-sweet-adult25-v1.webp"
              alt="甜美护士"
            >
            <div><strong>甜美护士</strong><small>25 岁 · 盘发</small></div>
          </article>
        </div>
      </aside> -->
    </section>

    <section
      id="stories"
      class="stories-section"
      aria-labelledby="stories-title"
    >
      <header class="section-title">
        <div>
          <h2 id="stories-title">
            继续你的故事
          </h2>
          <p>角色、场景与影像设定都已为你保留。</p>
        </div>
        <NuxtLink to="/works">查看全部 <span
          class="i-lucide-chevron-right"
          aria-hidden="true"
        /></NuxtLink>
      </header>

      <p
        v-if="showcaseLoading"
        class="empty-tip"
      >
        正在加载你的作品…
      </p>
      <p
        v-else-if="!showcaseWorks.length"
        class="empty-tip"
      >
        <template v-if="session.token.value">
          还没有作品。在上面写下第一幕，生成完成后会出现在这里。
        </template>
        <template v-else>
          <NuxtLink to="/auth/login">
            登录
          </NuxtLink> 后这里会列出你的作品。
        </template>
      </p>
      <div
        v-else
        id="works"
        class="story-grid"
      >
        <NuxtLink
          v-for="(work, index) in showcaseWorks"
          :key="work.id"
          :to="`/works/${work.id}`"
          class="story-card"
          :class="[work.tone, { recommended: work.recommended }]"
        >
          <img
            v-if="work.image"
            :src="work.image"
            :alt="work.title"
          >
          <div
            v-else
            class="work-placeholder"
            aria-hidden="true"
          >
            <span>{{ work.title.slice(0, 1) }}</span>
          </div>
          <span
            class="story-wash"
            aria-hidden="true"
          />
          <span class="story-index">0{{ index + 1 }}</span>
          <span
            v-if="work.recommended"
            class="story-recommended"
          >收藏</span>
          <div class="story-info">
            <small>{{ work.kind }}</small>
            <h3>{{ work.title }}</h3>
            <div><span>{{ work.character }}</span></div>
          </div>
        </NuxtLink>
      </div>
    </section>
  </div>
</template>

<style scoped>
.chip-link {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  text-decoration: none;
  color: inherit;
  cursor: pointer;
}
.chip-link:hover {
  color: var(--amber-soft, #e0b070);
}
.work-placeholder {
  display: grid;
  place-items: center;
  width: 100%;
  aspect-ratio: 4 / 3;
  background: linear-gradient(160deg, #26272c, #17181b);
  color: var(--amber-soft, #e0b070);
  font-size: clamp(36px, 5vw, 64px);
  font-weight: 800;
}
</style>
