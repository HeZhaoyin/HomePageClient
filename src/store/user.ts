// store/user.ts
// 登录态相关状态统一收口到 Pinia，
// 避免各组件各自读写 localStorage / 手写 reactive。
import { defineStore } from 'pinia'
import { login } from '../api/user/user'
import { useStore } from './index'

export const useUserStore = defineStore('user', {
  state: () => {
    let userRealName = ''
    try {
      userRealName = JSON.parse(localStorage.getItem('userData') || '{}').userRealName || ''
    } catch {
      userRealName = ''
    }
    return {
      // 与主 store 的 token 保持一致（主 store 仍持有 token）
      userRealName,
      isLogin: !!localStorage.getItem('token'),
    }
  },
  getters: {
    loggedIn: (state) => !!state.isLogin,
  },
  actions: {
    setUser(name: string) {
      this.userRealName = name
      this.isLogin = true
      localStorage.setItem('userData', JSON.stringify({ userRealName: name, userName: name }))
    },
    clearUser() {
      this.userRealName = ''
      this.isLogin = false
      localStorage.removeItem('userData')
    },
    /**
     * 登录：调用接口，成功后写入 token + 用户信息，同步主 store。
     * @returns 是否登录成功
     */
    async login(userName: string, password: string): Promise<boolean> {
      const res = await login({ userName, password })
      if (res.code === 200 && res.data?.token) {
        localStorage.setItem('token', res.data.token)
        const mainStore = useStore()
        mainStore.token = res.data.token
        this.setUser(res.data.userData?.userRealName || userName)
        return true
      }
      return false
    },
    /** 登出 */
    logout() {
      localStorage.removeItem('token')
      const mainStore = useStore()
      mainStore.token = ''
      this.clearUser()
    },
  },
})
