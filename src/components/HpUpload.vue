<template>
    <div class="upload-box" @drop.prevent="onDrop" @dragover.prevent @click="openFileInput">
        <input type="file" ref="fileInput" style="display:none" @change="onChange">
        <span class="plus"></span>
    </div>
</template>
  
<script setup lang="ts">
import { ref, onMounted, Ref } from 'vue';
import { uploadMarkIcon } from "../api/mark/mark"
import axios from 'axios';

const fileInput: Ref<HTMLInputElement | null> = ref(null);
const emit: { (event: "change", file: File | undefined): void } = defineEmits(["change"]);

const openFileInput = () => {
    console.log(fileInput)
    if (fileInput.value) {
        fileInput.value.click();
    }
}

const onChange = () => {
    console.log(fileInput.value?.files);
    if (fileInput.value?.files) {
        const file = fileInput.value?.files[0]
        emit('change', file)
    }
}

const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const files = e.dataTransfer?.files;
    if (files?.length) {
        const file = files[0];
        emit('change', file);
    }
}
</script>

<style lang="less" scoped>
.upload-box {
    cursor: pointer;
    width: 60px;
    height: 60px;
    background-color: #fafafa;
    border: 1px dashed #cdd0d6;
    border-radius: 6px;
    position: relative;

    &:hover {
        border-color: #409eff;
    }
}

.plus {
    display: inline-block;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
}

.plus::before,
.plus::after {
    content: "";
    display: block;
    position: absolute;
    top: 50%;
    left: 0;
    width: 100%;
    height: 2px;
    background-color: #afafaf;
    transform: translateY(-50%);
}

.plus::after {
    transform: translateY(-50%) rotate(90deg);
}
</style>