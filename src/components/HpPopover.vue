<template>
    <div class="popover-wrapper" @click="togglePopover">
        <slot name="reference"></slot>
        <transition name="popover-fade">
            <div class="popover" v-show="visible">
                <div class="popover-content">
                    <slot></slot>
                </div>
            </div>
        </transition>
    </div>
</template>
  
<script lang="ts" setup>
import { ref, onMounted, onUnmounted } from 'vue'

const visible = ref(false)

const togglePopover = (event: MouseEvent) => {
    visible.value = !visible.value
    event.stopPropagation();
}

const handleClickOutside = (event: MouseEvent) => {
    if (!visible.value) return

    const popover = document.querySelector('.popover') as HTMLElement
    if (popover && !popover.contains(event.target as Node)) {
        visible.value = false
    }
}

onMounted(() => {
    document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
})
</script>
  
<style scoped>
.popover-wrapper {
    position: relative;
    display: inline-block;
}

.popover {
    position: absolute;
    z-index: 999;
    right: 0;
    box-shadow: 0 2px 12px 0 rgba(0, 0, 0, 0.1);
    background-color: #fff;
    border-radius: 4px;
    border-radius: 10.5px;
}

.popover-content {
    padding: 10px;
}

.popover-fade-enter-active,
.popover-fade-leave-active {
    transition: opacity 0.3s;
}

.popover-fade-enter,
.popover-fade-leave-to {
    opacity: 0;
}
</style>