<script setup lang="ts">
/**
 * 节点卡的端口：左入右出，标签与圆点对齐，颜色按数据类型。
 *
 * 端口圆点的纵坐标要跟标签行对齐，所以：
 *   第 i 行中心 = 标题栏高 + i * 行高 + 半个行高
 * 这几个常量跟样式表里的 .cg-node-head / .cg-port 高度是一套，改一处要一起改。
 */
import { Handle, Position } from '@vue-flow/core'
import type { CanvasNodeTypeSpec } from '~/data/canvas-nodes'
import { portMeta } from '~/data/canvas-nodes'

defineProps<{ spec: CanvasNodeTypeSpec }>()

const HEADER_H = 38
const PORT_H = 24

function portTop(index: number): string {
  return `${HEADER_H + index * PORT_H + PORT_H / 2}px`
}
</script>

<template>
  <div class="cg-node-ports">
    <div class="cg-port-col cg-port-col--in">
      <div
        v-for="(p, i) in spec.inputs"
        :key="`in-${p.slot}`"
        class="cg-port"
      >
        <Handle
          :id="p.slot"
          type="target"
          :position="Position.Left"
          :connectable="true"
          :style="{ top: portTop(i), background: portMeta(p.type).color }"
        />
        <span
          class="cg-port-dot"
          :style="{ background: portMeta(p.type).color }"
        />
        <span class="cg-port-label">{{ p.label }}</span>
      </div>
    </div>
    <div class="cg-port-col cg-port-col--out">
      <div
        v-for="(p, i) in spec.outputs"
        :key="`out-${p.slot}`"
        class="cg-port"
      >
        <span class="cg-port-label">{{ p.label }}</span>
        <span
          class="cg-port-dot"
          :style="{ background: portMeta(p.type).color }"
        />
        <Handle
          :id="p.slot"
          type="source"
          :position="Position.Right"
          :connectable="true"
          :style="{ top: portTop(i), background: portMeta(p.type).color }"
        />
      </div>
    </div>
  </div>
</template>
