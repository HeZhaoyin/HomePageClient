<template>
    <div class="form-item" :class="{ 'form-item--error': error }">
        <label class="form-item__label" :style="`width:${labelWidth}px`">{{ label }}</label>
        <div class="form-item__content">
            <slot></slot>
            <div class="form-item__error" v-if="error">{{ error }}</div>
        </div>
    </div>
</template>
  
<script lang="ts" setup>
const Props = defineProps({
    labelWidth: { type: String || Number },
    label: { type: String, required: true },
    error: { type: String }
});
const { label, error } = Props;
</script>
  
<style scoped>
.form-item {
    display: flex;
    flex-direction: row;
    margin-bottom: 20px;
}

.form-item__label {
    font-weight: bold;
    display: flex;
    align-items: center;
}

.form-item__content {
    flex: 1;
}

.form-item--error .form-item__label {
    color: red;
}

.form-item__error {
    color: red;
    margin-top: 5px;
}
</style>