<template>
    <div class="nav-bar">
        <div class="operate-container">
            <!-- <hp-button type="danger">我是按钮</hp-button> -->
            <hp-popover>
                <template #reference>
                    <!-- <span class="iconfont icon-tianjia add-btn" @click="handleShowAddBtnClick"></span> -->
                    <span class="iconfont icon-tianjia add-btn"></span>
                    <!-- <button @click="togglePopover">{{ state.visible ? 'Hide' : 'Show' }} Popover</button> -->
                </template>
                <div class="add-btn-list">
                    <div class="add-btn-item" @click="handleShowAddBtnClick">添加标签</div>
                    <div class="add-btn-item">添加标签组</div>
                </div>
            </hp-popover>
            <!-- <hp-upload @change="fileChange"></hp-upload> -->
        </div>
        <hp-dialog title="添加标签" v-model="state.isShowAddDialog" @cancel="handleAddDialogCancal"
            @confirm="handleSubmitAddMark">
            <hp-form>
                <hp-form-item label-width="70" label="标签名" :error="''">
                    <hp-input v-model="state.addMarkInfo.markName" />
                </hp-form-item>
                <hp-form-item label-width="70" label="标签URL" :error="''">
                    <hp-input v-model="state.addMarkInfo.markUrl" />
                </hp-form-item>
                <hp-form-item label-width="70" label="标签图标" :error="''">
                    <hp-upload v-if="state.addMarkInfo.markIcon == ''" @change="fileChange"></hp-upload>
                    <card-item v-else :mark-icon="state.addMarkInfo.markIcon"
                        :mark-name="state.addMarkInfo.markName"></card-item>
                </hp-form-item>
                <hp-form-item label-width="70" label="标签组" :error="''">
                    <hp-select v-model="state.addMarkInfo.markGroupId" :options="showGroupArr"></hp-select>
                </hp-form-item>
                <hp-form-item label-width="70" label="标签组名" :error="''" v-if="state.addMarkInfo.markGroupId == '0'">
                    <hp-input v-model="state.addMarkGroupName" />
                </hp-form-item>
            </hp-form>
        </hp-dialog>
    </div>
</template>

<script lang="ts" setup>
import { computed, reactive, watch } from "vue";
import { uploadMarkIcon } from "../../../api/mark/mark"
import CardItem from "./CardItem.vue";
import { MarkInfo, MarkGroupInfo } from "../../../models/mark"
import { addMark, getMarkGroupWithoutLogin, getMarkGroup } from "../../../api/mark/mark"
import { useStore } from 'vuex'

const state = reactive({
    isShowAddDialog: false,
    isAddBtnListVisible: false,
    addMarkInfo: {
        markName: "",
        markUrl: "",
        markIcon: "",
        markGroupId: '0',
    } as MarkInfo,
    addMarkGroupName: '',
    markGroupArr: [] as any[]
})

const showGroupArr = computed(() => {
    return [{ label: '新建标签组', value: '0' }, ...state.markGroupArr]
})

const handleShowAddBtnClick = () => {
    state.isShowAddDialog = true
}

const fileChange = (file: any) => {
    console.log(file)
    const formData = new FormData()
    formData.append('file', file)
    console.log(formData)
    uploadMarkIcon(formData).then(res => {
        console.log(res)
        state.addMarkInfo.markIcon = res.data.url
    })
}

const handleAddDialogCancal = () => {
    state.addMarkInfo = {
        markName: "",
        markUrl: "",
        markIcon: "",
        markGroupId: "0",
    }
}

const handleSubmitAddMark = () => {
    addMark({
        ...state.addMarkInfo,
        markGroupName: state.addMarkGroupName
    }).then(res => {
        console.log(res)
    })
}

const store = useStore()
watch(() => store.state.token, (val) => {
    if (val) {
        getMarkGroup().then(res => {
            console.log(res)
        })
    } else {
        getMarkGroupWithoutLogin().then(res => {
            console.log(res)
            state.markGroupArr = []
            res.data.forEach((item: MarkGroupInfo) => {
                state.markGroupArr.push({ label: item.markGroupName, value: item.id?.toString() })
            });
        })
    }
}, { immediate: true })

</script>

<style lang="less" scoped>
.nav-bar {
    position: fixed;
    left: 0;
    top: 0;
    width: 100vw;
    height: 44px;
    background-color: rgba(37, 38, 40, .21);
    background-image: radial-gradient(circle at 25%, hsla(0, 0%, 100%, .2), rgba(50, 50, 50, .2) 80%);
    -webkit-backdrop-filter: blur(14px);
    backdrop-filter: blur(14px);
    z-index: 3;

    .operate-container {
        position: absolute;
        top: 50%;
        right: 30px;
        transform: translate(0, -50%);
        height: 100%;

        .add-btn {
            cursor: pointer;
            font-size: 26px;
            color: #fff;
            transition: all .1s ease;

            &:hover {
                color: rgba(185, 185, 185, 0.774);
            }
        }
    }
}

.add-btn-list {
    width: 90px;

    .add-btn-item {
        padding: 5px;
        font-size: 14px;
        cursor: pointer;

        &:hover {
            background-color: rgba(170, 170, 174, .2);
            border-radius: 10px;
        }
    }
}
</style>