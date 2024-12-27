<template>
  <div class="card">
    <div class="banner">
      {{ props.markGroupName }}
    </div>
    <VueDraggable group="card" ref="el" :disabled="!store.isCardEditStatus" :animation="150" v-model="marksList"
      @start="onStart" @update="onUpdate" @end="onEnd" ghostClass="ghost" class="card-content">
      <mark-item :class="{ 'cursor-move': store.isCardEditStatus }" v-for="mark in marksList" :mark-icon="mark.markIcon"
        :mark-name="mark.markName" :mark-url="mark.markUrl"></mark-item>
    </VueDraggable>
  </div>
</template>

<script lang="ts" setup>
import { ref, computed } from 'vue'
import MarkItem from './MarkItem.vue';
import { IMarkItem } from '@/models/mark';
import { useStore } from '@/store/index'
import {
  type SortableEvent,
  type UseDraggableReturn,
  VueDraggable
} from 'vue-draggable-plus'

const props = defineProps({
  marks: Array<IMarkItem>,
  markGroupName: String
})

const marksList = computed(() => props.marks || [])

const store = useStore()

const el = ref<UseDraggableReturn>()
const onStart = (e: SortableEvent) => {
  console.log('start', e)
}

const onEnd = (e: SortableEvent) => {
  console.log('onEnd', e)
}

const onUpdate = () => {
  console.log('update')
}

</script>

<style lang="less" scoped>
.card {
  position: relative;
  min-width: 400px;
  height: 240px;
}

.banner {
  border-radius: 16px 16px 0 0;
  height: 40px;
  background-color: rgba(248, 248, 252, .85);
  padding-left: 20px;
  font-size: 18px;
  font-weight: 600;
  line-height: 25px;
  display: flex;
  align-items: center;
  position: relative;
}

.cursor-move {
  cursor: move;
}

.card-content {
  height: 200px;
  overflow-x: hidden;
  overflow-y: scroll;
  padding: 10px;
  display: grid;
  justify-content: space-between;
  grid-template-columns: repeat(auto-fill, 80px);
  // grid-gap: 10px;
  // flex-wrap: wrap;
  // justify-content: space-between;

  &::-webkit-scrollbar {
    display: none;
  }
}
</style>