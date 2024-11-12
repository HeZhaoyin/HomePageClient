<template>
    <transition name="fade">
        <div class="dialog-wrapper" v-show="props.modelValue">
            <div class="dialog-mask" @click="handleClose"></div>
            <div class="dialog-content">
                <div class="dialog-header">{{ props.title }}</div>
                <div class="dialog-body">
                    <slot />
                </div>
                <div class="dialog-footer">
                    <hp-button class="dialog-btn" @click="handleCancel">{{ props.cancelText }}</hp-button>
                    <hp-button type="primary" class="dialog-btn" @click="handleConfirm">{{ props.confirmText }}</hp-button>
                </div>
            </div>
        </div>
    </transition>
</template>
  
<script lang="ts" setup>
const props = defineProps({
    modelValue: {
        type: Boolean,
        required: true,
    },
    title: {
        type: String,
        default: '提示',
    },
    content: {
        type: String,
        default: '',
    },
    cancelText: {
        type: String,
        default: '取消',
    },
    confirmText: {
        type: String,
        default: '确定',
    },
});

const emit = defineEmits(['update:modelValue', 'cancel', 'confirm'])

const handleClose = () => {
    emit('cancel')
    emit('update:modelValue', false);
};

const handleCancel = () => {
    emit('cancel')
    emit('update:modelValue', false);
};

const handleConfirm = () => {
    emit('confirm')
    emit('update:modelValue', false);
};
</script>
  
<style scoped>
.dialog-wrapper {
    width: 100vw;
    height: 100vh;
    position: fixed;
    top: 0;
    left: 0;
    display: flex;
    justify-content: center;
    align-items: center;
    z-index: 999;
}

.dialog-mask {
    position: absolute;
    top: 0;
    left: 0;
    bottom: 0;
    right: 0;
    background-color: rgba(0, 0, 0, 0.5);
}

.dialog-content {
    position: relative;
    padding: 20px;
    width: 500px;
    background-color: #fff;
    border-radius: 4px;
}

.dialog-header {
    font-size: 16px;
    font-weight: bold;
    margin-bottom: 10px;
}

.dialog-body {
    font-size: 14px;
    margin-bottom: 20px;
    padding: 0 20px;
}

.dialog-footer {
    display: flex;
    justify-content: flex-end;
}

.dialog-btn {
    margin-left: 10px;
}

.fade-enter-active,
.fade-leave-active {
    transition: opacity .2s ease;
}

.fade-enter-from,
.fade-leave-to {
    opacity: 0;
}
</style>