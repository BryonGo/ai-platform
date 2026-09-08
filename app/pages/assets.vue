<script setup lang="ts">
const api = useHougongApi()
const session = useAuthSession()

const items = ref<AssetItem[]>([])
const loading = ref(true)
const error = ref('')
const showHidden = ref(false)
const busy = ref('')

async function load() {
  loading.value = true
  error.value = ''
  try {
    const list = await api.listAssets(showHidden.value, 1, 100)
    items.value = list
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '加载失败'
  } finally {
    loading.value = false
  }
}

async function toggleHidden(a: AssetItem) {
  busy.value = a.id
  try {
    await api.setAssetHidden(a.id, !a.hidden)
    await load()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '操作失败'
  } finally {
    busy.value = ''
  }
}

async function remove(a: AssetItem) {
  if (!window.confirm('删除该素材？删除后引用它的作品可能失效。')) return
  busy.value = a.id
  try {
    await api.removeAsset(a.id)
    await load()
  } catch (e: unknown) {
    error.value = e instanceof Error ? e.message : '删除失败'
  } finally {
    busy.value = ''
  }
}

function originLabel(o: string) {
  return o === 'generated' ? '生成' : '上传'
}

function sizeText(b: number) {
  return b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`
}

onMounted(() => {
  session.load()
  if (!session.token.value) {
    navigateTo('/auth/login')
    return
  }
  load()
})
</script>

<template>
  <div class="page-body">
    <div class="page-head">
      <div>
        <p class="detail-kicker">
          素材库
        </p>
        <h1>我的素材</h1>
        <p>上传的参考图与生成产物都在这里；隐藏后可避免出现在创作台素材选择器中。</p>
      </div>
      <button
        type="button"
        class="btn-ghost"
        @click="showHidden = !showHidden; load()"
      >{{ showHidden ? '查看可用素材' : '查看已隐藏' }}</button>
    </div>

    <p
      v-if="error"
      class="empty-tip"
    >
      加载失败：{{ error }}
    </p>

    <div class="asset-grid">
      <div
        v-for="a in items"
        :key="a.id"
        class="asset-cell"
        :class="{ dim: a.hidden }"
      >
        <img
          :src="a.url"
          :alt="a.id"
          loading="lazy"
        >
        <div class="asset-cell-meta">
          <span>{{ originLabel(a.origin) }} · {{ a.width }}×{{ a.height }}</span>
          <small class="muted">{{ sizeText(a.bytes) }} · {{ new Date(a.createdAt * 1000).toLocaleDateString() }}</small>
        </div>
        <div class="asset-cell-actions">
          <button
            type="button"
            class="composer2-btn-sm"
            :disabled="busy === a.id"
            @click="toggleHidden(a)"
          >{{ a.hidden ? '取消隐藏' : '隐藏' }}</button>
          <button
            type="button"
            class="composer2-btn-sm danger"
            :disabled="busy === a.id"
            @click="remove(a)"
          >删除</button>
        </div>
      </div>
    </div>
    <p
      v-if="!loading && !items.length"
      class="empty-tip"
    >{{ showHidden ? '没有已隐藏的素材' : '还没有素材。去创作页上传参考图或生成作品吧。' }}</p>
    <p
      v-if="loading"
      class="empty-tip"
    >加载中…</p>
  </div>
</template>

<style scoped>
.asset-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 0.9rem;
  margin-top: 1rem;
}
.asset-cell {
  border: 1px solid var(--hg-line, #e2e4ea);
  border-radius: 1rem;
  overflow: hidden;
  background: var(--hg-card);
  display: grid;
  gap: 0;
}
.asset-cell.dim {
  opacity: 0.65;
}
.asset-cell img {
  width: 100%;
  aspect-ratio: 1;
  object-fit: cover;
  display: block;
}
.asset-cell-meta {
  display: grid;
  gap: 0.1rem;
  padding: 0.5rem 0.6rem 0.2rem;
  font-size: 0.76rem;
  color: var(--ink);
  font-weight: 600;
}
.asset-cell-meta small {
  font-weight: 400;
}
.asset-cell-actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.3rem;
  padding: 0.4rem 0.6rem 0.6rem;
}
.composer2-btn-sm {
  padding: 0.25rem 0.6rem;
  border-radius: 999px;
  border: 1px solid var(--hg-line, #e2e4ea);
  background: transparent;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
  color: var(--hg-muted, #666);
}
.composer2-btn-sm:hover {
  border-color: var(--hg-accent, #b08a4f);
  color: var(--hg-accent, #b08a4f);
}
.composer2-btn-sm:disabled {
  opacity: 0.5;
  cursor: default;
}
.danger {
  color: #b91c1c;
}
.danger:hover {
  border-color: #b91c1c;
  color: #b91c1c;
}
</style>
