<script setup lang="ts">
import { reactive } from 'vue'
import NavBar from './views/index/components/NavBar.vue'
import EarthGlobe from './components/EarthGlobe.vue'
import HpContextMenu, { type ContextMenuItem } from './components/HpContextMenu.vue'
import { useStore } from '@/store/index'

const store = useStore()

// ---------------- 全局右键菜单 ----------------
// 监听挂在整个应用容器上（而不是 router-view 内部），
// 这样页面任意空白处都能响应，包括内容区外的留白。
// 上下文靠 closest('[data-group-id]') 判断：
//   命中   -> 某个标签组卡片 -> 「往[该组]添加标签」
//   未命中 -> 空白处         -> 「增加标签组」
const ctx = reactive({
  visible: false,
  x: 0,
  y: 0,
  key: 0,
  groupId: '',
  groupName: '',
  items: [] as ContextMenuItem[],
})

const buildItems = (groupId: string, groupName: string): ContextMenuItem[] =>
  groupId
    ? [
        {
          label: `往「${groupName}」添加标签`,
          icon: 'icon-tianjia',
          payload: { action: 'add-tag-to-group', groupId, groupName },
        },
      ]
    : [{ label: '增加标签组', icon: 'icon-tianjia', payload: { action: 'add-group' } }]

const handleContextMenu = (e: MouseEvent) => {
  // 编辑卡片位置（拖拽）模式下不弹，避免与拖拽手势冲突
  if (store.isCardEditStatus) return

  const tgt = e.target as HTMLElement | null
  // 在菜单自身上右键：不重开（菜单内部已 preventDefault）
  if (tgt?.closest?.('.hp-context-menu')) return
  // 输入类元素保留浏览器原生菜单（方便粘贴/剪切）
  if (tgt?.closest('input, textarea, [contenteditable="true"]')) return

  e.preventDefault()

  const groupEl = tgt?.closest?.('[data-group-id]') as HTMLElement | null
  ctx.groupId = groupEl?.dataset?.groupId || ''
  ctx.groupName = groupEl?.dataset?.groupName || ''
  ctx.items = buildItems(ctx.groupId, ctx.groupName)
  ctx.x = e.clientX
  ctx.y = e.clientY
  ctx.key += 1 // 强制重建组件，保证尺寸重新测量（翻转计算依赖真实尺寸）
  ctx.visible = true
}

const handleCtxSelect = (item: ContextMenuItem) => {
  const p = item.payload || {}
  if (p.action === 'add-group') {
    store.requestAddTag({ mode: 'new-group' })
  } else if (p.action === 'add-tag-to-group') {
    store.requestAddTag({ mode: 'existing-group', groupId: p.groupId, groupName: p.groupName })
  }
}

// 左键按下时关闭菜单（右键交给菜单自身的"点击外部"逻辑，避免刚开就关）
const handleMousedown = (e: MouseEvent) => {
  if (e.button === 0 && ctx.visible) ctx.visible = false
}
</script>

<template>
  <div class="app-container" @contextmenu="handleContextMenu" @mousedown="handleMousedown">
    <nav-bar></nav-bar>
    <router-view></router-view>
    <earth-globe></earth-globe>
    <hp-toast></hp-toast>

    <hp-context-menu
      :key="ctx.key"
      v-model:visible="ctx.visible"
      :x="ctx.x"
      :y="ctx.y"
      :items="ctx.items"
      @select="handleCtxSelect"
    />
  </div>
</template>

<style scoped>
.app-container {
  width: 100vw;
  min-height: 100vh;
  padding: 50px 10vw 0 10vw;
  position: relative;
}
</style>
