<template>
  <div class="nav-bar">
    <div class="operate-container">
      <hp-popover>
        <template #reference>
          <!-- <span class="iconfont icon-tianjia add-btn" @click="handleShowAddBtnClick"></span> -->
          <span class="iconfont icon-tianjia add-btn"></span>
          <!-- <button @click="togglePopover">{{ state.visible ? 'Hide' : 'Show' }} Popover</button> -->
        </template>
        <div class="add-btn-list">
          <div class="add-btn-item" @click="handleShowAddBtnClick">添加标签</div>
          <div class="add-btn-item" @click="handleChangeEditStatus">编辑卡片位置</div>
        </div>
      </hp-popover>
      <!-- <hp-upload @change="fileChange"></hp-upload> -->
    </div>
    <div class="editing-btn-container" v-if="store.isCardEditStatus">
      <hp-button class="editing-btn" type="success" @click="handleConfirmEditing">保存位置</hp-button>
      <hp-button class="editing-btn" type="danger" @click="handleCancelEditing">取消编辑</hp-button>
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
        <hp-form-item label-width="70" label="" :error="''">
          <hp-button type="primary" :loading="iconLoading" @click="handleGetIconByURL">
            {{ iconLoading ? '获取中…' : '根据URL获取标签图标' }}
          </hp-button>
        </hp-form-item>
        <hp-form-item label-width="70" label="标签图标" :error="''">
          <hp-upload v-if="state.addMarkInfo.markIcon == ''" @change="fileChange"></hp-upload>
          <mark-item v-else :mark-icon="state.addMarkInfo.markIcon" :mark-name="state.addMarkInfo.markName"></mark-item>
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
import { computed, reactive, ref, watch } from "vue";
import { uploadMarkIcon, getMarkIconByURL, updateSort, addMark, getMarkGroupWithoutLogin, getMarkGroup } from "../../../api/mark/mark"
import MarkItem from "../cardType/MarkItem.vue";
import { MarkInfo, MarkGroupInfo } from "../../../models/mark"
import { useStore } from '@/store/index'
import toast from '@/utils/toast'
const store = useStore();

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
    if (res?.code === 200) {
      store.initMarkListData();
      toast.success('已添加标签')
    } else {
      toast.error('添加失败，请重试')
    }
  })
}

watch(() => store.token, (val) => {
  if (val) {
    getMarkGroup().then(res => {
      console.log(res)
      res.data.forEach((item: MarkGroupInfo) => {
        state.markGroupArr.push({ label: item.markGroupName, value: item.id?.toString() })
      });
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

// 根据 URL 抓取标签图标。
// 注意三个易被忽略的体验点：
//  1) 抓取要 1~8 秒，必须有 loading 态且防重复点击（按钮禁用它自然就防住了）
//  2) 任何一路失败都要给明确提示，否则用户以为"没点到"
//  3) 服务端拿不到图标时返回 null，此时保留原来的图标不要清空
const iconLoading = ref(false)

const getIconFromUrl = async () => {
  if (iconLoading.value) return

  const rawUrl = (state.addMarkInfo.markUrl || '').trim()
  if (!rawUrl) {
    toast.error('请先填写标签 URL')
    return
  }

  iconLoading.value = true
  try {
    const res = await getMarkIconByURL(rawUrl)
    if (res?.code === 200 && res.data) {
      state.addMarkInfo.markIcon = res.data
      toast.success('已获取图标')
    } else {
      // 没有图标很正常（站点没声明、被墙、防盗链），提示用户可手动上传
      toast.error('没能获取到该站点的图标，可以手动上传一张')
    }
  } catch (e) {
    toast.error('获取图标失败，请稍后重试或手动上传')
  } finally {
    iconLoading.value = false
  }
}

// 保留原函数名，避免模板里的 @click 失效
const handleGetIconByURL = getIconFromUrl

const handleChangeEditStatus = () => {
  store.isCardEditStatus = true;
}

const handleConfirmEditing = async () => {
  // 未登录无法保存（保存接口需 JWT）
  if (!store.token) {
    toast.error('保存卡片位置需要登录，请先在头像卡片登录')
    return
  }
  const payload = store.buildSortPayload()
  const res = await updateSort(payload)
  if (res?.code === 200) {
    // 保存成功：提示 + 用服务端顺序回拉 + 退出编辑态
    store.initMarkListData()
    store.isCardEditStatus = false
    toast.success('保存成功')
  } else {
    toast.error('保存失败，请重试')
  }
}

const handleCancelEditing = () => {
  store.isCardEditStatus = false;
}

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

  .editing-btn-container {
    position: absolute;
    left: 50%;
    top: 50%;
    transform: translate(-50%, -50%);
    display: flex;
    .editing-btn {
      height: 34px;
      margin: 0 10px;
    }
  }
}

.add-btn-list {
  width: 100px;
  text-align: right;

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