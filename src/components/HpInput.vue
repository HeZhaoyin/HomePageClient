<template>
    <div class="input-container">
        <label v-if="props.label">{{ props.label }}</label>
        <input :value="props.modelValue" :type="props.type == 'password' ? 'password' : 'text'" @input="onInput" />
    </div>
</template>

<script lang="ts" setup>
const props = defineProps({
    modelValue: [String, Number],
    label: String,
    type: String
})

const emit = defineEmits(['input', 'update:modelValue'])

const onInput = (event: any) => {
    emit('update:modelValue', event.target.value)
    emit('input', event.target.value);
}
</script>

<style scoped lang="less">
.input-container {
    display: flex;

    label {
        width: 60px;
        font-weight: bold;
        margin-bottom: 10px;
    }

    input {
        flex: 1;
        width: 100%;
        height: 32px;
        padding: 0 10px;
        box-sizing: border-box;
        border: 1px solid #dcdfe6;
        border-radius: 4px;
        outline: none;
    }
}
</style>