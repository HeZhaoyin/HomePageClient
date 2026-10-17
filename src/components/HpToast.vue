<template>
  <transition-group name="toast" tag="div" class="toast-container">
    <div
      v-for="item in state.items"
      :key="item.id"
      class="toast-item"
      :class="`toast-item--${item.type}`"
    >
      <span class="toast-icon">{{ iconOf(item.type) }}</span>
      <span class="toast-text">{{ item.message }}</span>
    </div>
  </transition-group>
</template>

<script lang="ts" setup>
import { reactive, onUnmounted } from 'vue'

type ToastType = 'success' | 'error' | 'info'

interface ToastItem {
  id: number
  message: string
  type: ToastType
}

const state = reactive({
  items: [] as ToastItem[],
})

let seq = 0

const iconOf = (type: ToastType) => {
  switch (type) {
    case 'success':
      return '✓'
    case 'error':
      return '✕'
    default:
      return 'ℹ'
  }
}

const timers = new Map<number, ReturnType<typeof setTimeout>>()

const show = (message: string, type: ToastType = 'info', duration = 2000) => {
  const id = ++seq
  state.items.push({ id, message, type })
  timers.set(id, setTimeout(() => {
    const idx = state.items.findIndex((i) => i.id === id)
    if (idx !== -1) state.items.splice(idx, 1)
    timers.delete(id)
  }, duration))
  return id
}

const cancel = (id: number) => {
  const t = timers.get(id)
  if (t) clearTimeout(t)
  timers.delete(id)
  const idx = state.items.findIndex((i) => i.id === id)
  if (idx !== -1) state.items.splice(idx, 1)
}

// 模块级单例：把本实例接到全局，供任意模块 import toast 命令式调用
import { bind as bindToast } from '../utils/toast'
bindToast({ show, cancel })

onUnmounted(() => {
  timers.forEach((t) => clearTimeout(t))
  timers.clear()
})

defineExpose({ show, cancel })
</script>

<style scoped lang="less">
.toast-container {
  position: fixed;
  top: 60px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 9999;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: none;
}

.toast-item {
  min-width: 160px;
  max-width: 70vw;
  padding: 10px 16px;
  border-radius: 8px;
  color: #fff;
  font-size: 14px;
  display: flex;
  align-items: center;
  gap: 8px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.18);
  pointer-events: auto;

  &.toast-item--success {
    background-color: #67c23a;
  }
  &.toast-item--error {
    background-color: #f56c6c;
  }
  &.toast-item--info {
    background-color: #409eff;
  }
}

.toast-icon {
  font-size: 16px;
  font-weight: bold;
}

.toast-enter-active {
  transition: all 0.3s ease;
}
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(-12px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-12px);
}
.toast-move {
  transition: transform 0.3s ease;
}
</style>
