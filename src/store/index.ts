import { createStore } from "vuex";
import { MarkList } from '../models/mark'
import { getMarkWithoutLogin, getMark } from '../api/mark/mark';

interface State {
  token: string;
  markListData: Array<MarkList>;
  isCardEditStatus: boolean,
}

export const store = createStore<State>({
  state() {
    return {
      markListData: [] as Array<MarkList>,
      token: localStorage.getItem("token") || "",
      isCardEditStatus: false as boolean,
    };
  },
  mutations: {
    setToken(state, token: string) {
      state.token = token;
    },
    setMarkListData(state, data: Array<MarkList>) {
      state.markListData = data;
    },
    setEditStatus(state, status: boolean) {
      state.isCardEditStatus = status;
    }
  },
  actions: {
    initMarkListData({ commit, state }) {
      if (state.token) {
        getMark().then(res => {
          commit('setMarkListData', res.data)
        })
      } else {
        getMarkWithoutLogin().then(res => {
          commit('setMarkListData', res.data)
        })
      }
    }
  },
  getters: {},
});
