<script setup lang="ts">
type Mode = 'video' | 'image'

const mode = ref<Mode>('image')
const prompt = ref('')
const ratio = ref('16:9')
const duration = ref('5 秒')
const notice = ref('')
const uploadPreview = ref('')
const uploadName = ref('')

const cost = computed(() => (mode.value === 'video' ? 24 : 8))

const stories = [
  { title: '夜色来信', type: '视频', meta: '00:12', image: '/images/daji-three-tail-front-v1.webp', tone: 'cool', character: '妲己 · 狐影朱门', recommended: true },
  { title: '第二次相遇', type: '图集', meta: '6 张', image: '/images/daji-approved-direction-v1.webp', tone: 'warm', character: '妲己 · 狐影朱门' },
  { title: '未完的对白', type: '视频', meta: '00:08', image: '/images/daji-three-tail-front-v1.webp', tone: 'jade', character: '妲己 · 狐影朱门' },
  { title: '午夜加班', type: '图集', meta: '8 张', image: '/images/office-lady-gold-glasses-v1.webp', tone: 'office', character: 'Office Lady · 深夜来函' },
  { title: '晨间问候', type: '视频', meta: '00:10', image: '/images/nurse-sweet-adult25-v1.webp', tone: 'ivory', character: '甜美护士 · 晨光值班' }
]

function inspire() {
  prompt.value = '雨夜的落地窗前，妲己缓缓回眸，三条白色狐尾随风舒展，镜头从侧后方轻轻靠近。'
}

function submit() {
  notice.value = prompt.value.trim()
    ? `已保存${mode.value === 'video' ? '视频' : '图片'}任务草稿，生成接口接入后即可提交。`
    : '请先描述这一幕。'
}

function handleUpload(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]

  if (!file) return
  if (uploadPreview.value) URL.revokeObjectURL(uploadPreview.value)

  uploadPreview.value = URL.createObjectURL(file)
  uploadName.value = file.name
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
        <span class="universe-count">当前宇宙 · 3 位角色</span>
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
            <button type="button">
              <span
                class="i-lucide-user-round"
                aria-hidden="true"
              />妲己
            </button>
            <button type="button">
              <span
                class="i-lucide-image-plus"
                aria-hidden="true"
              />参考素材
            </button>
            <button type="button">
              <span
                class="i-lucide-box"
                aria-hidden="true"
              />智能匹配
            </button>
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
              @click="duration = duration === '5 秒' ? '10 秒' : '5 秒'"
            >
              <span
                class="i-lucide-clock-3"
                aria-hidden="true"
              />{{ duration }}
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
        <a href="#works">查看全部 <span
          class="i-lucide-chevron-right"
          aria-hidden="true"
        /></a>
      </header>

      <div
        id="works"
        class="story-grid"
      >
        <article
          v-for="(story, index) in stories"
          :key="story.title"
          class="story-card"
          :class="[story.tone, { recommended: story.recommended }]"
        >
          <img
            :src="story.image"
            :alt="story.title"
          >
          <span
            class="story-wash"
            aria-hidden="true"
          />
          <span class="story-index">0{{ index + 1 }}</span>
          <span
            v-if="story.recommended"
            class="story-recommended"
          >推荐</span>
          <div class="story-info">
            <small>{{ story.type }} · {{ story.meta }}</small>
            <h3>{{ story.title }}</h3>
            <div>
              <img
                src="/images/daji-three-tail-front-v1.webp"
                alt=""
              ><span>{{ story.character }}</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
