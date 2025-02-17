<template>
    <div class="item" @click="handleCardItemClick">
        <img class="item-icon" :src="props.markIcon" alt="">
        <span class="item-name">{{ props.markName }}</span>
    </div>
</template>

<script lang="ts" setup>
const props = defineProps({
    markIcon: { type: String },
    markName: { type: String, required: true },
    markUrl: { type: String }
})

const handleCardItemClick = () => {
    if (props.markUrl) {
        window.location.href = props.markUrl;
    }
}
</script>

<style lang="less" scoped>
.item {
    margin: 5px;
    width: 80px;
    height: 80px;
    display: flex;
    justify-content: center;
    align-items: center;
    flex-direction: column;
    // transition: all linear .1s;
    cursor: pointer;

    &:hover {
        transform: scale(1.05);
    }
}

.item-icon {
    height: 60px;
    border-radius: 15px;
}

.item-name {
    text-align: center;
    display: block;
    width: 80px;
    font-family: SF Pro SC, SF Pro Text, Helvetica Neue, sans-serif;
    font-size: 12px;
    color: #1d1d1f;
    white-space: nowrap;
    text-overflow: ellipsis;
    overflow: hidden;
}
</style>