/**
 * 画布（/canvas）屏蔽闸门。
 *
 * 为什么需要它：侧栏入口在 app.vue 里已经按开关隐藏，但入口隐藏挡不住手敲 URL、
 * 搜索结果里的旧链接、以及别人转发过来的直达地址 —— 那些路径下用户仍会看到一个
 * 还在开发中的半成品页面。屏蔽必须是「入口 + 直连」两处同时生效。
 *
 * 开关来源见 config/features.ts 的 canvasFeatureEnabled()（runtimeConfig.public.canvasEnabled，
 * 生产由 compose 传 NUXT_PUBLIC_CANVAS_ENABLED=false）。默认开启，本地/dev 不受影响；
 * 画布做完后把环境变量去掉或改成 true 即恢复，不需要回滚代码，也不需要改这个文件。
 */
import { canvasFeatureEnabled } from '~/config/features'

export default defineNuxtRouteMiddleware((to) => {
  if (to.path.startsWith('/canvas') && !canvasFeatureEnabled()) {
    return navigateTo('/')
  }
})
