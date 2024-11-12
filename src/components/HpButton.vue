<template>
  <button class="hp-button" :class="[btnClass]" @click="handleClick">
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
  }
});

// 根据 props.type 计算按钮样式
const btnClass = computed(() => {
  return `hp-button--${props.type}`;
});

// 处理按钮点击事件
const handleClick = (event: Event) => {
  // 触发 click 事件，将事件参数传递给父组件
  emits('click', event);
}
</script>

<style scoped lang="less">
.hp-button {
  display: inline-block;
  padding: 8px 15px;
  font-size: 14px;
  border: 1px solid;
  border-radius: 4px;
  cursor: pointer;
  vertical-align: middle;
  outline: none;
  transition: all .1s ease;
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