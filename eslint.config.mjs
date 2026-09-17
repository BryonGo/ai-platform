// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

/**
 * 三条规则被**刻意关闭/放宽**，理由都是它们在本仓库里打在**正确的写法**上，
 * 属于工具误报而不是代码问题。关掉误报不是"降低标准"——正相反：留着它们会让
 * lint 长期处于 100+ 红的状态，于是**真问题也没人看**（本仓实测 138 红里有 102 条是误报）。
 *
 * 1. `@typescript-eslint/unified-signatures`（75 条）
 *    全部打在 Vue 的 `defineEmits<{ (e: 'undo'): void; (e: 'redo'): void }>()` 上。
 *    它建议把这些签名合并成一个联合类型 —— 但那会**丢掉逐个事件的重载信息**
 *    （每个事件各自的参数类型），是拿类型精度换行数。Vue 官方就是推荐逐事件重载写法。
 *
 * 2. `@typescript-eslint/no-dynamic-delete`（4 条）
 *    打在 `{...x}; delete rest[k]; x.value = rest` 上 —— 这是**修改响应式对象的推荐做法**
 *    （先浅拷贝再整体赋值，才能触发 Vue 的响应式更新）。规则的本意是防 V8 字典模式退化，
 *    在这里恰好与框架正确用法冲突。
 *
 * 3. `@stylistic/max-statements-per-line`（23 条）放宽到 4
 *    全是 `case 'x': stmt; break` 这类标准单行写法。压到 1 只会把 switch 撑成三倍行数，
 *    可读性反而下降。放宽到 4 仍能拦住"一行塞一大段逻辑"。
 */
export default withNuxt(
  {
    rules: {
      '@typescript-eslint/unified-signatures': 'off',
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@stylistic/max-statements-per-line': ['error', { max: 4 }],
    },
  },
)
