<template>
  <button
    class="hp-button"
    :class="[btnClass, { 'hp-button--loading': loading, 'hp-button--disabled': disabled }]"
    :disabled="disabled || loading"
    @click="handleClick"
  >
    <span v-if="loading" class="hp-button__spinner" aria-hidden="true"></span>
    <span v-if="$slots.default">
      <slot />
    </span>
  </button>
</template>

<script lang="ts" setup>
import { computed } from 'vue';
const emits = defineEmits(['click']);

// 定义组件 props
const props = defineProps({
  type: {
    type: String,
    default: 'default',
    validator: (val: string) => ['default', 'primary', 'success', 'warning', 'danger'].includes(val)
  },
  // 禁用：用于防止重复提交
  disabled: {
    type: Boolean,
    default: false
  },
  // 加载中：显示转圈并自动禁用点击（异步操作如抓图标、保存时使用）
  loading: {
    type: Boolean,
    default: false
  }
});

// 根据 props.type 计算按钮样式
const btnClass = computed(() => {
  return `hp-button--${props.type}`;
});

// 处理按钮点击事件
const handleClick = (event: Event) => {
  // 禁用/加载中不派发点击，避免重复请求
  if (props.disabled || props.loading) return;
  // 触发 click 事件，将事件参数传递给父组件
  emits('click', event);
}
</script>

<style scoped lang="less">
.hp-button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  padding: 8px 15px;
  font-size: 14px;
  border: 1px solid;
  border-radius: 4px;
  cursor: pointer;
  vertical-align: middle;
  outline: none;
  transition: all .1s ease;

  // 禁用态：降透明度 + 禁用指针，避免用户以为"没反应"
  &--disabled,
  &:disabled {
    opacity: .55;
    cursor: not-allowed;
  }
}

// 加载转圈：纯 CSS，不引入图标库
.hp-button__spinner {
  width: 12px;
  height: 12px;
  border: 2px solid currentColor;
  border-top-color: transparent;
  border-radius: 50%;
  animation: hp-button-spin .7s linear infinite;
}

@keyframes hp-button-spin {
  to { transform: rotate(360deg); }
}

.hp-button--default {
  background-color: #ffffff;
  border-color: #dcdfe6;
  color: #606266;

  &:hover {
    color: #409eff;
    background-color: #ecf5ff;
    border-color: #c6e2ff;
  }

  &:active {
    color: #409eff;
    background-color: #ecf5ff;
    border-color: #409eff;
  }
}

.hp-button--primary {
  background-color: #409eff;
  border-color: #409eff;
  color: #fff;

  &:hover {
    background-color: #79bbff;
    border-color: #79bbff;
  }

  &:active {
    background-color: #337ecc;
    border-color: #337ecc;
  }
}

.hp-button--success {
  background-color: #67c23a;
  border-color: #67c23a;
  color: #fff;

  &:hover {
    background-color: #95d475;
    border-color: #95d475;
  }

  &:active {
    background-color: #529b2e;
    border-color: #95d475;
  }
}

.hp-button--warning {
  background-color: #e6a23c;
  border-color: #e6a23c;
  color: #fff;

  &:hover {
    background-color: #eebe77;
    border-color: #eebe77;
  }

  &:active {
    background-color: #b88230;
    border-color: #b88230;
  }
}

.hp-button--danger {
  background-color: #f56c6c;
  border-color: #f56c6c;
  color: #fff;

  &:hover {
    background-color: #f89898;
    border-color: #f89898;
  }

  &:active {
    background-color: #c45656;
    border-color: #c45656;
  }
}
</style>