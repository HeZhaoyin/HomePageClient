<template>
  <div>
    <div class="avatar-box-mask" v-if="state.isLoginStatus" @click.self="showOrHideLogin(false)"></div>
    <VueDraggable ref="el" :disabled="!store.isCardEditStatus" :animation="150" v-model="state.cacheMarkListData"
      @start="onStart" @update="onUpdate" @end="onEnd" ghostClass="ghost" filter=".user-box" class="main-content-box">
      <!-- <VueDraggable
      ref="el"
      v-model="state.cacheMarkListData"
      :animation="150"
      ghostClass="ghost"
      @start="onStart"
      @update="onUpdate"
      @end="onEnd"
    > -->
      <Avatar class="user-box"
        :class="[{ 'show-login-box': state.isLoginStatus && !state.loginAnimationReverse }, { 'hide-login-box': state.loginAnimationReverse }]"
        :is-login-status="state.isLoginStatus" :is-login-input-show="state.isLoginInputShow"
        @show-or-hide-login="showOrHideLogin">
      </Avatar>
      <!-- <TransitionGroup name="fade"> -->
      <template v-if="!state.isLoginStatus">
        <Card v-for="markGroup in state.cacheMarkListData as Array<MarkList>" :marks="markGroup.marks"
          :mark-group-name="markGroup.markGroupName" class="main-container" :key="markGroup.id">
        </Card>
      </template>
      <!-- </TransitionGroup> -->
    </VueDraggable>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref, toRefs, watch } from 'vue'
import Avatar from './components/Avatar.vue'
import Card from './components/Card.vue'
import { useStore } from '@/store/index'
import { MarkList } from '../../models/mark'
import {
  type SortableEvent,
  type UseDraggableReturn,
  VueDraggable
} from 'vue-draggable-plus'
const store = useStore()

const state = reactive({
  isLoginStatus: false,
  loginAnimationReverse: false,
  isLoginInputShow: false,
  cacheMarkListData: [],
})

const showOrHideLogin = (isShow: boolean) => {
  if (isShow) {
    state.isLoginStatus = true
    state.isLoginInputShow = true
  } else {
    state.loginAnimationReverse = true
    state.isLoginInputShow = false
    setTimeout(() => {
      state.isLoginStatus = false
      state.loginAnimationReverse = false
    }, 400);
  }
}

watch(() => store.token, () => {
  store.initMarkListData();
}, { immediate: true })
watch(() => store.markListData, (val) => {
  console.log('数据更新')
  state.cacheMarkListData = JSON.parse(JSON.stringify(val))
}, { deep: true })

defineExpose({
  ...toRefs(state)
})

const el = ref<UseDraggableReturn>()

const onStart = (e: SortableEvent) => {
  console.log('start', e)
}

const onEnd = (e: SortableEvent) => {
  console.log('onEnd', e)
  console.log(state.cacheMarkListData)
}

const onUpdate = () => {
  console.log('update')
}

</script>

<style lang="less" scoped>
.avatar-box-mask {
  width: 100vw;
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 1;
  background: rgba(0, 0, 0, 0.5);
}

.main-content-box {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  position: relative;
}

.user-box {
  width: 250px;
  height: 240px;
  padding: 20px;
  min-width: 0;
  transition: top .2s cubic-bezier(.32, .08, .24, 1), transform .2s cubic-bezier(.32, .08, .24, 1), left .2s cubic-bezier(.32, .08, .24, 1), width .2s ease, height .2s ease;

  &.show-login-box {
    margin: 0;
    animation-name: loginShow;
    animation-duration: .4s;
    animation-fill-mode: forwards;
  }

  &.hide-login-box {
    animation-name: loginHide;
    animation-duration: .4s;
    animation-fill-mode: forwards;
  }
}

@keyframes loginShow {
  0% {
    width: 250px;
    height: 250px;
    position: absolute;
    left: 0;
    top: 0;
    transform: translate(0, 0);
  }

  // 80% {
  //     width: 250px;
  //     height: 400px;
  //     position: absolute;
  //     left: 50%;
  //     top: 50px;
  //     transform: translate(-50%, 0);
  // }

  100% {
    width: 300px;
    height: 400px;
    position: absolute;
    left: 50%;
    top: 50px;
    transform: translate(-50%, 0);
  }
}

@keyframes loginHide {
  0% {
    width: 300px;
    height: 400px;
    position: absolute;
    left: 50%;
    top: 50px;
    transform: translate(-50%, 0);
  }

  20% {
    width: 300px;
    height: 400px;
    position: absolute;
    left: 50%;
    top: 50px;
    transform: translate(-50%, -0);
  }

  100% {
    width: 250px;
    height: 250px;
    position: absolute;
    left: 0;
    top: 0;
    transform: translate(0, 0);
  }
}

.fade-enter-active {
  transition: opacity .2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}

.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}

.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}

.main-container {
  flex: 1;
}
</style>