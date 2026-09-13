// 成人内容合规的**唯一前端入口**：站点年龄门 + 账号成人模式。
//
// 为什么合成一个 composable：这两件事在前端总是一起用（要不要弹门、能不能显示成人内容、
// 要不要给成人 LoRA），而判定口径全部来自服务端 /platform/age/status ——
// 前端不自己与运算 siteAdultContent && verified && adultMode，
// 那种写法一旦服务端口径变化就会两边漂移（一边显示一边不显示，没人说得清谁对）。
//
// canUseAdult 直接取服务端算好的结果，页面只消费。

export interface AdultGateStatus {
  /** 本站是否提供成人内容（站点配置，与账号无关）。 */
  siteAdultContent: boolean
  /** 需要年龄门且本浏览器尚未通过。 */
  gateRequired: boolean
  /** 本浏览器已通过本站 18+ 年龄门。 */
  verified: boolean
  /** 年龄门要求的最低年龄。 */
  minAge: number
  /** 当前账号是否已开启成人模式（未登录恒 false）。 */
  adultMode: boolean
  /** 最终口径：本站提供 + 已过门 + 已开启成人模式。前端只看这一个字段。 */
  canUseAdult: boolean
}

const EMPTY: AdultGateStatus = {
  siteAdultContent: false,
  gateRequired: false,
  verified: false,
  minAge: 18,
  adultMode: false,
  canUseAdult: false
}

export function useAdultGate() {
  // useState：SSR 与客户端共享同一份状态，且页面间不重复请求。
  const status = useState<AdultGateStatus>('hg:adult-gate', () => ({ ...EMPTY }))
  const loaded = useState<boolean>('hg:adult-gate:loaded', () => false)
  const pending = useState<boolean>('hg:adult-gate:pending', () => false)
  const error = useState<string>('hg:adult-gate:error', () => '')

  /** 拉取服务端口径。失败不抛给页面：拿不到状态时按"不显示成人内容"处理。 */
  async function refresh() {
    try {
      status.value = await apiRequest<AdultGateStatus>('/platform/age/status')
      error.value = ''
    } catch {
      status.value = { ...EMPTY }
    } finally {
      loaded.value = true
    }
    return status.value
  }

  /** 提交出生日期完成年龄门确认。未满 18 岁由服务端拒绝，这里只负责把原因显示出来。 */
  async function confirmBirthDate(birthDate: string) {
    pending.value = true
    error.value = ''
    try {
      status.value = await apiRequest<AdultGateStatus>('/platform/age/confirm', {
        method: 'POST',
        body: { birthDate }
      })
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : '年龄确认失败'
      return false
    } finally {
      pending.value = false
    }
  }

  /** 开启/关闭账号成人模式。开启前置（已过年龄门）由服务端强制。 */
  async function setAdultMode(enabled: boolean) {
    pending.value = true
    error.value = ''
    try {
      await apiRequest('/account/adult-mode', { method: 'POST', body: { enabled } })
      // 该接口只回账号侧四个字段，门状态仍以 /platform/age/status 为准，故重拉一次。
      await refresh()
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : '设置失败'
      return false
    } finally {
      pending.value = false
    }
  }

  /** 清除本浏览器的年龄确认（换人使用 / 排查问题）。 */
  async function reset() {
    try {
      status.value = await apiRequest<AdultGateStatus>('/platform/age/reset', { method: 'POST' })
    } catch {
      /* 清除失败不影响使用，下次访问会重新问 */
    }
    return status.value
  }

  return { status, loaded, pending, error, refresh, confirmBirthDate, setAdultMode, reset }
}
