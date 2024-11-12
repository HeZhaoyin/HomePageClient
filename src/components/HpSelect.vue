<template>
    <div class="select">
        <div class="select__input" :class="[isOpen ? 'select__input-active' : '']" @click="isOpen = !isOpen">
            <div class="select__input-value">{{ currentLabel }}</div>
            <div class="select__input-arrow"></div>
        </div>
        <transition name="zoom-in-top">
            <div class="select__popper" v-show="isOpen">
                <span class="select__dropdown-arrow"></span>
                <ul class="select__dropdown">
                    <li style="list-style:none;" v-for="(option, index) in options" :key="index"
                        @click="handleOptionClick(option)">
                        <div class="select__option">{{ option.label }}</div>
                    </li>
                </ul>
            </div>
        </transition>
    </div>
</template>
  
<script setup lang="ts">
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'

interface Option {
    value: string | number;
    label: string;
}

const props = defineProps({
    options: {
        type: Array as () => Array<Option>,
        required: true
    },
    modelValue: {
        type: [String, Number],
        default: ''
    }
})

const emit = defineEmits(['update:modelValue'])

const isOpen = ref(false)

const handleOptionClick = (option: Option) => {
    emit('update:modelValue', option.value)
    isOpen.value = false
}

const currentLabel = computed(() => {
    const option = props.options.find(option => option.value === props.modelValue)
    return option ? option.label : ''
})

watch(
    () => props.modelValue,
    value => {
        if (!props.options.some(option => option.value === value)) {
            emit('update:modelValue', '')
        }
    }
)


const handleClickOutside = (event: MouseEvent) => {
    if (!isOpen.value) return
    const popover = document.querySelector('.select') as HTMLElement
    if (popover && !popover.contains(event.target as Node)) {
        isOpen.value = false
    }
}

onMounted(() => {
    document.addEventListener('click', handleClickOutside)
})

onUnmounted(() => {
    document.removeEventListener('click', handleClickOutside)
})

</script>
  
<style lang="less">
.select {
    position: relative;
    width: 200px;
}

.select__input {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    height: 32px;
    padding: 0 12px;
    border: 1px solid #ccc;
    border-radius: 4px;
    cursor: pointer;

    &.select__input-active {
        box-shadow: 0 0 0 1px #409eff inset !important;
    }
}

.select__input-value {
    color: #333;
}

.select__input-arrow {
    width: 0;
    height: 0;
    margin-left: 6px;
    border-width: 6px 4px 0 4px;
    border-style: solid;
    border-color: #666 transparent transparent transparent;
}

.select__popper {
    position: absolute;
    top: 100%;
    left: 0;
    z-index: 999;
    width: 100%;
    max-height: 200px;
}

.select__dropdown {
    overflow-y: auto;
    background-color: #fff;
    border: 1px solid #ccc;
    border-radius: 4px;
    margin: 10px 0 0 0;
    padding: 0;
    box-shadow: 0 0 12px rgba(0, 0, 0, .12);
}


.select__dropdown-arrow {
    position: absolute;
    width: 10px;
    height: 10px;
    z-index: 2;
    left: 50%;
    top: 6px;
    transform: translate(-50%, 0);

    &::before {
        position: absolute;
        width: 10px;
        height: 10px;
        z-index: -1;
        content: "";
        transform: rotate(45deg);
        box-sizing: border-box;
        border: 1px solid #ccc;
        background: #ffffff;
        right: 0;
        border-bottom-color: transparent !important;
        border-right-color: transparent !important;
        border-top-left-radius: 2px;
    }
}


.select__dropdown.show {
    display: block;
}

.select__option {
    height: 32px;
    line-height: 32px;
    padding: 0 12px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
}

.select__option:hover {
    background-color: #eee;
}

.zoom-in-top-enter-active,
.zoom-in-top-leave-active {
    opacity: 1;
    transform: scaleY(1);
    transition: transform .3s cubic-bezier(0.23, 1, 0.32, 1), opacity .3s cubic-bezier(0.23, 1, 0.32, 1);
    transform-origin: center top;
}

.zoom-in-top-enter,
.zoom-in-top-leave-to {
    opacity: 0;
    transform: scaleY(0);
}
</style>