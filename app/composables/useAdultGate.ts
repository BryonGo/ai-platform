// 成人内容口径的**唯一前端入口**：18+ 入口弹窗 + 账号成人偏好。
//
// 为什么合成一个 composable：这两件事在前端总是一起用（要不要弹窗、能不能显示成人内容、
// 要不要列成人 LoRA），而判定口径全部来自服务端 /platform/age/status ——
// 前端不自己与运算，那种写法一旦服务端口径变化就会两边漂移。
//
// 产品口径（后端定调，见 internal/platform/agegate）：
//   成人内容**默认可用**（这是成人产品，全站按 18+ 处理）；
//   入口弹窗**默认关闭**，站点开启时才弹一次一键确认；
//   账号可以主动关掉成人内容（个人偏好，不是门槛）。
//
// canUseAdult 与 gateRequired 都直接取服务端算好的结果，页面只消费。

export interface AdultGateStatus {
  /** 本站是否提供成人内容（站点配置，默认 true）。 */
  siteAdultContent: boolean
  /** 需要弹 18+ 确认弹窗且本浏览器尚未确认。 */
  gateRequired: boolean
  /** 本浏览器已确认过（弹窗不再出现）。 */
  verified: boolean
  /** 弹窗提到的最低年龄。 */
  minAge: number
  /** 账号是否显示成人内容（未登录按 true 处理）。 */
  adultMode: boolean
  /** 最终口径：本站提供 + 账号未主动关闭。前端只看这一个字段。 */
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

  /** 一键确认已满 18 岁。站点未开启弹窗时服务端幂等返回，不报错。 */
  async function confirm() {
    pending.value = true
    error.value = ''
    try {
      status.value = await apiRequest<AdultGateStatus>('/platform/age/confirm', { method: 'POST' })
      return true
    } catch (e) {
      error.value = e instanceof Error ? e.message : '确认失败'
      return false
    } finally {
      pending.value = false
    }
  }

  /** 开启/关闭成人内容显示。关闭是个人偏好，随时可以再打开。 */
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

  /** 清除本浏览器的入口确认（换人使用 / 排查问题）。 */
  async function reset() {
    try {
      status.value = await apiRequest<AdultGateStatus>('/platform/age/reset', { method: 'POST' })
    } catch {
      /* 清除失败不影响使用，下次访问会重新问 */
    }
    return status.value
  }

  return { status, loaded, pending, error, refresh, confirm, setAdultMode, reset }
}
