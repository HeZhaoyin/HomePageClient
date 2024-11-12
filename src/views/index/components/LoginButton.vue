<template>
    <button class="login-btn" :class="[btnClass]" @click="onClick">
        <span class="login-spinner" v-show="props.status == 'loading'"></span>
        <Transition name="slide-up" v-show="props.status != 'loading'">
            <span class="login-status-text" v-if="props.status == 'success'">{{ props.successText }}</span>
            <span class="login-status-text" v-else-if="props.status == 'fail'">{{ props.failText }}</span>
            <span class="login-status-text" v-else="props.status == 'normal'">{{ props.text }}</span>
        </Transition>
    </button>
</template>

<script lang="ts" setup>
import { computed, defineComponent, PropType, ref } from 'vue';

const props = withDefaults(defineProps<{
    text?: string,
    status?: string,
    successText?: string,
    failText?: string
}>(), {
    text: 'Button',
    status: 'normal',
    successText: 'success',
    failText: 'fail'
})

const btnClass = computed(() => {
    switch (props.status) {
        case 'loading':
            return 'btn-loading'
        case 'success':
            return 'btn-success'
        case 'fail':
            return 'btn-fail'
        default:
            return ''
    }
})

const emit = defineEmits(['click'])
const onClick = () => emit('click')
</script>

<style scoped lang="less">
.login-btn {
    width: 150px;
    height: 40px;
    border-radius: 20px;
    transition: all .3s cubic-bezier(0.6, 0, 0.74, 0.05);
    position: relative;

    &.btn-loading {
        width: 40px;
        position: relative;
        cursor: not-allowed;
        display: flex;
        justify-content: center;
        align-items: center;
    }

    &.btn-success {
        background-color: #67c23a;
    }

    &.btn-fail {
        background-color: #f56c6c;
    }
}

button {
    background-color: #409eff;
    color: #fff;
    border: none;
    font-size: 14px;
    outline: none;
    cursor: pointer;
    padding: 0;
}

.login-status-text {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
}

@property --per {
    syntax: "<percentage>";
    inherits: false;
    initial-value: 10%;
}

.login-spinner {
    display: inline-block;
    position: relative;
    margin: auto;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    animation: rotate 11s infinite ease-in-out;

    &::before {
        content: "";
        position: absolute;
        top: 0;
        left: 0;
        right: 0;
        bottom: 0;
        border-radius: 50%;
        background: conic-gradient(transparent, transparent var(--per), rgb(255, 255, 255) var(--per), rgb(255, 255, 255));
        -webkit-mask: radial-gradient(transparent, transparent 13.5px, #000 14px, #000);
        mask: radial-gradient(transparent, transparent 13.5px, #000 14px, #000);
        animation: change 3s infinite cubic-bezier(0.57, 0.29, 0.49, 0.76);
    }
}

@keyframes change {
    50% {
        transform: rotate(270deg);
        --per: 98%;
    }

    100% {
        transform: rotate(720deg);
    }
}

@keyframes rotate {
    100% {
        transform: rotate(360deg);
        filter: hue-rotate(360deg);
    }
}

.slide-up-enter-active {
    transition: all 0.25s ease-out;
    transition-delay: .2s;
}

.slide-up-enter-from {
    opacity: 0;
    transform: translate(-50%, -30px);
}
</style>