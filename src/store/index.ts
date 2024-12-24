// store/index.ts
import { defineStore } from 'pinia'
import { MarkList } from '../models/mark'
import { getMarkWithoutLogin, getMark } from '../api/mark/mark';

export const useStore = defineStore('index', {
  state: () => {
    return {
      markListData: [] as Array<MarkList>,
      token: localStorage.getItem("token") || "",
      isCardEditStatus: false as boolean,
    }
  },
  actions: {
    initMarkListData() {
      if (this.token) {
        getMark().then(res => {
          this.markListData = res.data;
        })
      } else {
        getMarkWithoutLogin().then(res => {
          this.markListData = res.data;
        })
      }
    }
  },
})