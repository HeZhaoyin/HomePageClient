/**
 * 通用右键菜单组件。
 *
 * 设计要点：
 *  1) 用 fixed 定位，坐标直接来自鼠标 clientX/clientY，不受父级 transform 影响
 *  2) 自动翻转：靠近视口右/下边缘时向左/上弹出，避免菜单被裁掉
 *  3) 点击外部、按 Esc、滚动、窗口失焦都会关闭
 *  4) 菜单项支持 icon / disabled / danger / 分隔线
 *  5) 用 Teleport 挂到 body，避免被父元素的 overflow 或 z-index 层级困住
 *
 * 用法：
 *   <hp-context-menu v-model:visible="menu.visible" :x="menu.x" :y="menu.y" :items="items" @select="onSelect" />
 */
<template>
  <Teleport to="body">
    <Transition name="hp-ctx-fade">
      <div
        v-if="visible"
        ref="menuRef"
        class="hp-context-menu"
        :style="menuStyle"
        @contextmenu.prevent
      >
        <template v-for="(item, idx) in items" :key="idx">
          <div v-if="item.divider" class="hp-context-menu__divider"></div>
          <button
            v-else
            class="hp-context-menu__item"
            :class="{
              'is-disabled': item.disabled,
              'is-danger': item.danger,
            }"
            :disabled="item.disabled"
            @click="handleSelect(item)"
          >
            <!-- 图标需同时带 iconfont 基类与具体图标 class，否则字体不生效 -->
            <span v-if="item.icon" class="iconfont hp-context-menu__icon" :class="item.icon"></span>
            <span class="hp-context-menu__label">{{ item.label }}</span>
          </button>
        </template>
      </div>
    </Transition>
  </Teleport>
</template>

<script lang="ts" setup>
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'

export interface ContextMenuItem {
  /** 菜单项文字 */
  label?: string
  /** 图标名（iconfont class，可选） */
  icon?: string
  /** 是否禁用 */
  disabled?: boolean
  /** 危险操作（红色） */
  danger?: boolean
  /** 分隔线（设为 true 时忽略其它字段） */
  divider?: boolean
  /** 透传给业务侧的自定义数据 */
  payload?: any
}

const props = defineProps({
  visible: { type: Boolean, default: false },
  /** 鼠标位置（client 坐标） */
  x: { type: Number, default: 0 },
  y: { type: Number, default: 0 },
  items: { type: Array as () => ContextMenuItem[], default: () => [] },
})

const emit = defineEmits<{
  (e: 'update:visible', v: boolean): void
  (e: 'select', item: ContextMenuItem): void
}>()

const menuRef = ref<HTMLDivElement>()
const menuSize = ref({ w: 0, h: 0 })

// 弹出位置：默认跟随鼠标；贴边时向内翻转
const menuStyle = computed(() => {
  const gap = 6
  const vw = window.innerWidth
  const vh = window.innerHeight
  let left = props.x
  let top = props.y

  if (menuSize.value.w && left + menuSize.value.w + gap > vw) {
    left = Math.max(gap, props.x - menuSize.value.w)
  }
  if (menuSize.value.h && top + menuSize.value.h + gap > vh) {
    top = Math.max(gap, props.y - menuSize.value.h)
  }
  return { left: `${left}px`, top: `${top}px` }
})

const close = () => emit('update:visible', false)

const handleSelect = (item: ContextMenuItem) => {
  if (item.disabled) return
  emit('select', item)
  close()
}

// Esc 关闭
const onKeydown = (e: KeyboardEvent) => {
  if (e.key === 'Escape') close()
}

// 点击菜单外部关闭。用捕获阶段，保证在业务 click 之前处理
const onPointerDown = (e: PointerEvent) => {
  if (menuRef.value && !menuRef.value.contains(e.target as Node)) {
    close()
  }
}

// 菜单打开后测量真实尺寸，用于翻转计算。
// 注意：watch 带 immediate，会在组件初始化阶段执行，
// 所以它引用的 onKeydown / onPointerDown 必须【先定义】——
// 否则会踩 const 的 TDZ（Cannot access before initialization）。
watch(
  () => props.visible,
  async (v) => {
    if (v) {
      await nextTick()
      if (menuRef.value) {
        menuSize.value = {
          w: menuRef.value.offsetWidth,
          h: menuRef.value.offsetHeight,
        }
      }
      window.addEventListener('keydown', onKeydown)
      window.addEventListener('scroll', close, true)
      window.addEventListener('blur', close)
      document.addEventListener('pointerdown', onPointerDown, true)
    } else {
      window.removeEventListener('keydown', onKeydown)
      window.removeEventListener('scroll', close, true)
      window.removeEventListener('blur', close)
      document.removeEventListener('pointerdown', onPointerDown, true)
    }
  },
  { immediate: true },
)

onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('scroll', close, true)
  window.removeEventListener('blur', close)
  document.removeEventListener('pointerdown', onPointerDown, true)
})
</script>

<style scoped lang="less">
.hp-context-menu {
  position: fixed;
  z-index: 3000;
  min-width: 168px;
  max-width: 320px;
  padding: 6px;
  background: rgba(255, 255, 255, 0.98);
  border: 1px solid rgba(0, 0, 0, 0.08);
  border-radius: 10px;
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.16), 0 2px 6px rgba(0, 0, 0, 0.08);
  backdrop-filter: blur(12px);
  user-select: none;
}

.hp-context-menu__item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 9px 12px;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: #303133;
  font-size: 14px;
  line-height: 1.4;
  text-align: left;
  cursor: pointer;
  transition: background-color 0.12s ease, color 0.12s ease;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;

  &:hover:not(:disabled) {
    background: #f0f5ff;
    color: #1668dc;
  }

  &.is-danger {
    color: #e5484d;
    &:hover:not(:disabled) {
      background: #fff0f0;
      color: #cf2b30;
    }
  }

  &.is-disabled {
    color: #c0c4cc;
    cursor: not-allowed;
  }

  &__icon {
    font-size: 15px;
    flex-shrink: 0;
  }

  &__label {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
  }
}

.hp-context-menu__divider {
  height: 1px;
  margin: 5px 8px;
  background: rgba(0, 0, 0, 0.07);
}

.hp-ctx-fade-enter-active {
  transition: opacity 0.12s ease, transform 0.12s ease;
}
.hp-ctx-fade-leave-active {
  transition: opacity 0.1s ease;
}
.hp-ctx-fade-enter-from {
  opacity: 0;
  transform: scale(0.96);
}
.hp-ctx-fade-leave-to {
  opacity: 0;
}
</style>
