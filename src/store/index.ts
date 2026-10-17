// store/index.ts
import { defineStore } from 'pinia'
import { MarkList } from '../models/mark'
import { getMarkWithoutLogin, getMark } from '../api/mark/mark';

export const useStore = defineStore('index', {
  state: () => {
    return {
      markListData: [] as Array<MarkList>,
      // 编辑卡片位置时的拖拽后顺序（头像卡 id='avatar' 始终固定第一，不计入持久化）
      cacheMarkListData: [] as Array<MarkList>,
      token: localStorage.getItem("token") || "",
      isCardEditStatus: false as boolean,
    }
  },
  actions: {
    initMarkListData() {
      const avatarCardItem = {
        id: 'avatar',
        markGroupName: '头像',
        sort: 0,
        type: 'Avatar',
      }

      if (this.token) {
        getMark().then(res => {
          this.markListData = [avatarCardItem, ...res.data];
        })
      } else {
        getMarkWithoutLogin().then(res => {
          this.markListData = [avatarCardItem, ...res.data];
        })
      }
    },

    // 由拖拽视图写入：每次拖拽结束后把当前显示顺序同步进来
    setCacheMarkListData(list: Array<MarkList>) {
      this.cacheMarkListData = list
    },

    // 把当前显示顺序交给 NavBar 用于持久化：
    // - 过滤掉头像卡（id === 'avatar'）
    // - 标签组顺序 = 展示顺序（不含头像）
    // - 每个标签组内标签顺序 = 该组 marks 的当前顺序
    buildSortPayload() {
      const displayList = this.cacheMarkListData.filter(c => c.id !== 'avatar')
      const markGroupOrder = displayList.map(c => Number(c.id))
      const markOrder: Record<string, number[]> = {}
      displayList.forEach(c => {
        if (Array.isArray(c.marks)) {
          markOrder[String(c.id)] = c.marks.map(m => Number(m.id))
        }
      })
      return { markGroupOrder, markOrder }
    }
  },
})