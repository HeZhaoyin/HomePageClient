<template>
  <div>
    <VueDraggable ref="el" :disabled="!store.isCardEditStatus" :animation="150" v-model="state.cacheMarkListData"
      @start="onStart" @update="onUpdate" @end="onEnd" @move="onMove" ghostClass="ghost" filter=".user-box" class="main-content-box" handle=".drag-area">
      <Card :class="[{'no-drag': card.id === 'avatar'}]" v-for="card in state.cacheMarkListData" :type="card.type" :card-data="card" :key="card.id"
        @show-or-hide-login="showOrHideLogin" :is-login-status="state.isLoginStatus"
        :login-animation-reverse="state.loginAnimationReverse" :is-login-input-show="state.isLoginInputShow"/>
    </VueDraggable>
  </div>
</template>

<script lang="ts" setup>
import { reactive, ref, toRefs, watch } from 'vue'
import Card from './components/Card.vue'
import { useStore } from '@/store/index'
import { MarkList } from '@/models/mark'
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
  cacheMarkListData: [] as MarkList[],
})

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

const onMove = (e: any) => {
  console.log('move', e)
  const target = e.related;
  if (target.classList.contains('no-drag')) {
    return false;
  }
}

const showOrHideLogin = (isShow: boolean) => {
  if (isShow) {
    if (state.isLoginStatus) {
      return;
    }
    state.isLoginStatus = true
    state.isLoginInputShow = true
  } else {
    if (!state.isLoginInputShow) {
      return;
    }
    state.loginAnimationReverse = true
    state.isLoginInputShow = false
    setTimeout(() => {
      state.isLoginStatus = false
      state.loginAnimationReverse = false
    }, 400);
  }
}

</script>

<style lang="less" scoped>
.main-content-box {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  position: relative;
}
</style>