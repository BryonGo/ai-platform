<script setup lang="ts">
import { parseStructured, replaceText, streamCells, structuredCells, validateStructuredEdit } from '~/data/canvas-structured'

const props = defineProps<{ text: string, draft?: string, outputSlot: string, streaming?: boolean, disabled?: boolean }>()
const emit = defineEmits<{ (e: 'save', text: string): void, (e: 'draft', text?: string): void }>()
const draft = computed({ get: () => props.draft ?? props.text, set: (value: string) => emit('draft', value) })
const parsed = computed(() => parseStructured(draft.value))
const cells = computed(() => props.streaming ? streamCells(props.text).map(c => ({ ...c, readonly: true })) : parsed.value === undefined ? [] : structuredCells(parsed.value))
const dirty = computed(() => draft.value !== props.text)
const validationError = computed(() => validateStructuredEdit(props.text, draft.value, props.outputSlot))
function update(path: (string | number)[], value: string): void {
  if (parsed.value === undefined) return
  draft.value = JSON.stringify(replaceText(parsed.value, path, value), null, 2)
}
</script>

<template>
  <div class="cg-structured">
    <p
      v-if="streaming"
      class="cg-output-status"
      role="status"
    >
      <i class="i-lucide-loader-circle cg-spin" /> 正在整理拆解结果 · {{ text.length }} 字符
    </p>
    <table
      v-if="cells.length"
      class="cg-text-table"
    >
      <thead><tr><th>字段</th><th>内容</th></tr></thead>
      <tbody>
        <tr
          v-for="(cell, index) in cells"
          :key="JSON.stringify(cell.path) + index"
        >
          <th scope="row">
            {{ cell.label }}
          </th>
          <td>
            <textarea
              :aria-label="cell.label"
              :value="cell.value"
              :readonly="streaming || disabled || cell.readonly"
              rows="3"
              @input="update(cell.path, ($event.target as HTMLTextAreaElement).value)"
            />
          </td>
        </tr>
      </tbody>
    </table>
    <p
      v-else-if="streaming"
      class="cg-empty-line"
    >
      正在接收内容，完整字段返回后逐项展示…
    </p>
    <template v-else-if="parsed === undefined">
      <p class="cg-empty-line">
        当前结果不是可解析的 JSON，请编辑原文后保存。
      </p>
      <textarea
        v-model="draft"
        class="cg-input cg-fulltext-edit"
        :disabled="disabled"
        aria-label="拆解原文"
      />
    </template>
    <p
      v-else-if="!cells.length"
      class="cg-empty-line"
    >
      当前结果没有可编辑的文本字段。
    </p>
    <p
      v-if="!streaming && validationError"
      class="cg-run-error"
    >
      {{ validationError }}
    </p>
    <div
      v-if="!streaming"
      class="cg-row-actions"
    >
      <button
        class="cg-mini cg-mini--accent"
        type="button"
        :disabled="!dirty || disabled || !!validationError"
        @click="emit('save', draft)"
      >
        保存修改为新版本
      </button>
      <button
        class="cg-mini"
        type="button"
        :disabled="!dirty || disabled"
        @click="emit('draft', undefined)"
      >
        放弃修改
      </button>
      <span
        v-if="dirty"
        class="cg-empty-line"
      >修改尚未保存，请保存后再确认。</span>
    </div>
  </div>
</template>
