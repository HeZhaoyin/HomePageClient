<template>
    <div class="card">
        <div class="banner" :class="{'banner-dragging': store.isCardEditStatus}">
            {{ props.markGroupName }}
        </div>
        <div class="card-content">
            <card-item v-for="mark in props.marks" :mark-icon="mark.markIcon" :mark-name="mark.markName"
                :mark-url="mark.markUrl"></card-item>
        </div>
    </div>
</template> 

<script lang="ts" setup>
import CardItem from './CardItem.vue';
import { MarkItem } from '../../../models/mark';
import { useStore } from '@/store/index'

const props = defineProps({
    marks: Array<MarkItem>,
    markGroupName: String
})

const store = useStore()

</script>

<style lang="less" scoped>
.card {
    min-width: 400px;
    height: 240px;
    background: radial-gradient(circle at 100% 0, hsla(0, 0%, 100%, .85) 0, hsla(0, 0%, 96.1%, .5) 183%);
    box-shadow: 17px 20px 40px rgb(0 0 0 / 21%);
    border-radius: 16px;
    margin: 14px;
    // transition: box-shadow .2s cubic-bezier(.32, .08, .24, 1), transform .2s cubic-bezier(.32, .08, .24, 1), -webkit-box-shadow .2s cubic-bezier(.32, .08, .24, 1), -webkit-transform .2s cubic-bezier(.32, .08, .24, 1);

    &:hover {
        -webkit-box-shadow: 20px 20px 41px rgb(10 10 10 / 32%);
        box-shadow: 20px 20px 41px rgb(10 10 10 / 32%);
        -webkit-transform: scale(1.019);
        transform: scale(1.019);
    }
}

.banner {
    border-radius: 16px 16px 0 0;
    height: 40px;
    background-color: rgba(248, 248, 252, .85);
    padding-left: 20px;
    font-size: 18px;
    font-weight: 600;
    line-height: 25px;
    display: flex;
    align-items: center;
    &.banner-dragging {
        cursor: move;
    }
}

.card-content {
    height: 200px;
    overflow-x: hidden;
    overflow-y: scroll;
    padding: 10px;
    display: grid;
    justify-content: space-between;
    grid-template-columns: repeat(auto-fill, 80px);
    // grid-gap: 10px;
    // flex-wrap: wrap;
    // justify-content: space-between;

    &::-webkit-scrollbar {
        display: none;
    }
}
</style>