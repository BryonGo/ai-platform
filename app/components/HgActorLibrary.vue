<script setup lang="ts">
// 演员库 —— 挂在「资产」页里的一个页签（不单独占侧栏一项，与设计稿一致）。
//
// 数据分两个来源：
//   mine   = 本账号自建的演员，走**真实接口** `/hougong/characters`（就是原来的「角色资产」）
//   public = 运营维护的公共库
//
// ⚠️ 公共库、申请公开、配额这三件事目前**后端没有字段**，所以这里只如实呈现「还没有」，
//    不做假按钮撑门面（仓库约定：展示层缺数据时如实为空，运营才看得到）。
//    要落地它们，后端至少需要给 `hougong_character` 补：
//      scope(public|mine) · source_id(从公共库复制来的溯源) · status(private|reviewing|published)
//      · 以及一个「我的演员」配额口径。前端改动只在本文件 + 一个 fork 接口。
const api = useHougongApi()
const session = useAuthSession()

type Source = 'mine' | 'public'
const source = ref<Source>('mine')
const items = ref<CharacterItem[]>([])
const loading = ref(false)
const error = ref('')

const coverOf = (c: CharacterItem) => c.coverUrl || ''

async function load() {
  await session.load()
  if (!session.token.value) return
  loading.value = true
  error.value = ''
  try {
    items.value = await api.listCharacters()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载失败'
    items.value = []
  } finally {
    loading.value = false
  }
}

async function remove(c: CharacterItem) {
  if (!window.confirm(`删除演员「${c.name}」？`)) return
  try {
    await api.deleteCharacter(c.id)
    items.value = items.value.filter(x => x.id !== c.id)
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '删除失败'
  }
}

onMounted(load)
useMediaAutoRefresh(() => load())
</script>

<template>
  <section class="actor-lib">
    <div class="actor-bar">
      <!-- 来源分段控件：我的 / 公共。
           用分段而不是再加一层页签 —— 它们是同一件事的两个来源，不是两个功能。 -->
      <div
        class="actor-seg"
        role="tablist"
        aria-label="演员来源"
      >
        <button
          type="button"
          role="tab"
          :aria-selected="source === 'mine'"
          :class="{ active: source === 'mine' }"
          @click="source = 'mine'"
        >
          我的 <b>{{ items.length }}</b>
        </button>
        <button
          type="button"
          role="tab"
          :aria-selected="source === 'public'"
          :class="{ active: source === 'public' }"
          @click="source = 'public'"
        >
          公共
        </button>
      </div>
      <NuxtLink
        v-if="source === 'mine'"
        class="actor-new"
        to="/characters/new"
      >
        + 新建演员
      </NuxtLink>
    </div>

    <p class="actor-rule">
      <template v-if="source === 'mine'">
        自建演员默认<b>私有</b>，只有你自己能用。
      </template>
      <template v-else>
        公共演员由运营维护、只能看不能改。
      </template>
    </p>

    <p
      v-if="error"
      class="actor-state"
    >
      {{ error }}
      <button
        type="button"
        @click="load"
      >
        重试
      </button>
    </p>

    <!-- 公共库：后端还没有这个来源 -->
    <div
      v-else-if="source === 'public'"
      class="actor-empty"
    >
      <p>公共演员库还没开放</p>
      <small>后端还没有「公共/我的」这个来源字段，运营也还没有维护入口。先如实留空，不做样例数据。</small>
    </div>

    <p
      v-else-if="loading && !items.length"
      class="actor-state"
    >
      正在读取演员…
    </p>

    <div
      v-else-if="items.length"
      class="actor-grid"
    >
      <article
        v-for="item in items"
        :key="item.id"
        class="actor-card"
      >
        <NuxtLink
          class="actor-cover"
          :to="`/characters/${item.id}`"
          :aria-label="`查看演员 ${item.name}`"
        >
          <img
            v-if="coverOf(item)"
            :src="coverOf(item)"
            :alt="item.name"
            loading="lazy"
          >
          <span
            v-else
            class="actor-fallback"
            aria-hidden="true"
          >{{ item.name.slice(0, 1) }}</span>
          <span class="actor-badge">私有</span>
        </NuxtLink>
        <div class="actor-body">
          <strong>{{ item.name }}</strong>
          <small>{{ item.alias ? item.alias + ' · ' : '' }}{{ item.age || '—' }}</small>
          <p>{{ item.tagline || '还没写人设' }}</p>
        </div>
        <footer class="actor-foot">
          <span class="actor-works">{{ item.workCount }} 个作品</span>
          <NuxtLink
            class="actor-edit"
            :to="`/characters/${item.id}/edit`"
          >
            编辑
          </NuxtLink>
          <button
            type="button"
            class="actor-del"
            @click="remove(item)"
          >
            删除
          </button>
        </footer>
      </article>
    </div>

    <div
      v-else
      class="actor-empty"
    >
      <p>还没有自建演员</p>
      <small>演员是一张可复用的「脸和人设」：建好之后，每次创作都能直接引用，不用每次重描。</small>
      <NuxtLink
        class="actor-empty-cta"
        to="/characters/new"
      >
        新建演员
      </NuxtLink>
    </div>
  </section>
</template>

<style scoped>
.actor-lib { display: flex; flex-direction: column; }
.actor-bar { display: flex; align-items: center; gap: 14px; }
.actor-seg { display: inline-flex; padding: 3px; border: 1px solid var(--line); border-radius: 999px; background: rgb(255 255 255 / 3%); }
.actor-seg button { display: flex; align-items: center; gap: 6px; height: 28px; padding: 0 14px; border: 0; border-radius: 999px; background: transparent; color: var(--muted); font-family: inherit; font-size: 12px; cursor: pointer; }
.actor-seg button.active { background: rgb(255 255 255 / 10%); color: var(--ink); }
.actor-seg b { font-variant-numeric: tabular-nums; font-weight: 500; }
.actor-new { margin-left: auto; padding: 8px 16px; border-radius: 999px; background: var(--hg-accent); color: var(--hg-accent-ink); font-size: 13px; font-weight: 600; text-decoration: none; }
.actor-rule { margin: 12px 0 16px; color: var(--faint); font-size: 12px; }
.actor-rule b { color: var(--muted); font-weight: 600; }
.actor-state { margin: 40px 0; text-align: center; color: var(--muted); font-size: 13px; }
.actor-state button { margin-left: 8px; color: var(--hg-accent); }

/* 演员封面沿用原版竖屏立绘，名称与操作仍在卡片下方。 */
.actor-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 16px; }
.actor-card { display: flex; flex-direction: column; overflow: hidden; border: 1px solid var(--line); border-radius: 14px; background: rgb(255 255 255 / 2%); }
.actor-card:hover { border-color: rgb(255 255 255 / 18%); }
.actor-cover { position: relative; display: block; aspect-ratio: 3 / 4; overflow: hidden; background: #141416; }
.actor-cover img { display: block; width: 100%; height: 100%; object-fit: cover; }
.actor-fallback { display: grid; place-items: center; width: 100%; height: 100%; background: radial-gradient(circle at 50% 30%, #26262c 0%, #141416 70%); color: var(--muted); font-size: 28px; }
.actor-badge { position: absolute; top: 8px; right: 8px; padding: 2px 8px; border-radius: 6px; background: rgb(0 0 0 / 65%); color: #f0c9e4; font-size: 10px; line-height: 16px; }
.actor-body { display: flex; flex-direction: column; gap: 3px; padding: 10px 12px 6px; }
.actor-body strong { font-size: 13.5px; }
.actor-body small { color: var(--faint); font-size: 11px; }
.actor-body p { display: -webkit-box; overflow: hidden; margin: 2px 0 0; color: var(--muted); font-size: 11.5px; line-height: 17px; -webkit-box-orient: vertical; -webkit-line-clamp: 2; }
.actor-foot { display: flex; align-items: center; gap: 10px; padding: 6px 12px 11px; }
.actor-works { color: var(--faint); font-size: 11px; }
.actor-edit { margin-left: auto; color: var(--muted); font-size: 12px; text-decoration: none; }
.actor-edit:hover { color: var(--ink); }
.actor-del { border: 0; background: transparent; color: var(--faint); font-family: inherit; font-size: 12px; cursor: pointer; }
.actor-del:hover { color: #ff707a; }
.actor-empty { display: flex; flex-direction: column; align-items: center; gap: 10px; padding: 44px 24px; border: 1px dashed var(--line); border-radius: 14px; text-align: center; }
.actor-empty p { margin: 0; color: var(--muted); font-size: 13px; }
.actor-empty small { max-width: 380px; color: var(--faint); font-size: 11.5px; line-height: 18px; }
.actor-empty-cta { margin-top: 4px; padding: 8px 18px; border-radius: 999px; background: var(--hg-accent); color: var(--hg-accent-ink); font-size: 13px; font-weight: 600; text-decoration: none; }
</style>
