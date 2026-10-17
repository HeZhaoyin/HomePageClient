// 命令式全局 toast 入口。
// HpToast.vue 挂载时会把自己（show/cancel）bind 到这里；
// 任意模块 `import toast from '@/utils/toast'` 即可调用 toast.success('保存成功')。
type ToastType = 'success' | 'error' | 'info'

interface BoundApi {
  show: (message: string, type?: ToastType, duration?: number) => number
  cancel: (id: number) => void
}

let bound: BoundApi | null = null

/** 由 HpToast.vue 在 setup 时调用，把自己的实现接入全局 */
export function bind(api: BoundApi) {
  bound = api
}

const toast = {
  success: (msg: string, duration = 2000) => bound?.show(msg, 'success', duration),
  error: (msg: string, duration = 3000) => bound?.show(msg, 'error', duration),
  info: (msg: string, duration = 2000) => bound?.show(msg, 'info', duration),
  cancel: (id: number) => bound?.cancel(id),
}

export default toast
