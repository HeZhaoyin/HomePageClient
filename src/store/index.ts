import { createStore } from "vuex";

interface State {
  token: string;
}

export const store = createStore<State>({
  state() {
    return {
      token: localStorage.getItem("token") || "",
    };
  },
  mutations: {
    setToken(state, token: string) {
      state.token = token;
    },
  },
  actions: {},
  getters: {},
});
