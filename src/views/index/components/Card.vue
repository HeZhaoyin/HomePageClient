<template>
  <div class="card-container" :class="[{ 'main-container': props.type !== 'Avatar' }]">
    <div class="avatar-box-mask" v-if="props.type === 'Avatar' && props.isLoginStatus"
      @click.self="showOrHideLogin(false)"></div>
    <!-- 头像 -->
    <Avatar v-if="props.type === 'Avatar'" class="user-box"
      :class="[{ 'show-login-box': props.isLoginStatus && !props.loginAnimationReverse }, { 'hide-login-box': props.loginAnimationReverse }]"
      :is-login-status="props.isLoginStatus" :is-login-input-show="props.isLoginInputShow"
      @show-or-hide-login="showOrHideLogin">
    </Avatar>
    <!-- 除头像外的其他类型 -->
    <div class="hover-container" v-if="props.type !== 'Avatar'">
      <!-- 拖拽区域 -->
      <div class="drag-area" v-if="store.isCardEditStatus">
        <div class="drag-tips-container">
          <span class="drag-tips-text">拖拽此处更改位置</span>
        </div>
        <span class="iconfont icon-tianjia del-btn" v-if="store.isCardEditStatus" @click="handleDelMarkGroup"></span>
      </div>
      <!-- 标签类型 -->
      <TransitionGroup name="fade">
        <mark-group v-if="!props.isLoginStatus && props.type === 'MarkGroup'" :marks="cardData.marks"
          :mark-group-name="cardData.markGroupName" :key="cardData.id"></mark-group>
      </TransitionGroup>
    </div>
  </div>
</template>

<script lang="ts" setup>
import { PropType } from 'vue'
import Avatar from './Avatar.vue'
import MarkGroup from '../cardType/MarkGroup.vue';
import { MarkList } from '@/models/mark'
import { useStore } from '@/store/index'
const store = useStore()

const emit = defineEmits(['show-or-hide-login'])
const showOrHideLogin = (isShow: boolean) => {
  emit('show-or-hide-login', isShow)
}

const props = defineProps({
  isLoginStatus: Boolean,
  loginAnimationReverse: Boolean,
  isLoginInputShow: Boolean,
  cardData: {
    type: Object as PropType<MarkList>,
    required: true,
  },
  type: {
    type: String,
    default: 'MarkGroup',
    validator: (val: string) => ['Avatar', 'MarkGroup'].includes(val)
  }
});

const handleDelMarkGroup = () => {
  console.log(props.cardData.id)
}

</script>

<style scoped lang="less">
.card-container {
  // position: relative;

  .hover-container {
    position: relative;
    background: radial-gradient(circle at 100% 0, hsla(0, 0%, 100%, .85) 0, hsla(0, 0%, 96.1%, .5) 183%);
    box-shadow: 17px 20px 40px rgb(0 0 0 / 21%);
    border-radius: 16px;
    margin: 14px;
    transition: box-shadow .2s cubic-bezier(.32, .08, .24, 1), transform .2s cubic-bezier(.32, .08, .24, 1), -webkit-box-shadow .2s cubic-bezier(.32, .08, .24, 1), -webkit-transform .2s cubic-bezier(.32, .08, .24, 1);

    &:hover {
      -webkit-box-shadow: 20px 20px 41px rgb(10 10 10 / 32%);
      box-shadow: 20px 20px 41px rgb(10 10 10 / 32%);
      -webkit-transform: scale(1.019);
      transform: scale(1.019);
    }
  }
}

.avatar-box-mask {
  width: 100vw;
  height: 100vh;
  position: fixed;
  top: 0;
  left: 0;
  z-index: 0;
  background: rgba(0, 0, 0, 0.5);
}

.main-content-box {
  width: 100%;
  display: flex;
  flex-wrap: wrap;
  position: relative;
}

.user-box {
  width: 250px;
  height: 240px;
  padding: 20px;
  min-width: 0;
  transition: top .2s cubic-bezier(.32, .08, .24, 1), transform .2s cubic-bezier(.32, .08, .24, 1), left .2s cubic-bezier(.32, .08, .24, 1), width .2s ease, height .2s ease;

  &.show-login-box {
    margin: 0;
    animation-name: loginShow;
    animation-duration: .4s;
    animation-fill-mode: forwards;
  }

  &.hide-login-box {
    animation-name: loginHide;
    animation-duration: .4s;
    animation-fill-mode: forwards;
  }
}

@keyframes loginShow {
  0% {
    width: 250px;
    height: 250px;
    position: absolute;
    left: 0;
    top: 0;
    transform: translate(0, 0);
  }

  // 80% {
  //     width: 250px;
  //     height: 400px;
  //     position: absolute;
  //     left: 50%;
  //     top: 50px;
  //     transform: translate(-50%, 0);
  // }

  100% {
    width: 300px;
    height: 400px;
    position: absolute;
    left: 50%;
    top: 50px;
    transform: translate(-50%, 0);
  }
}

@keyframes loginHide {
  0% {
    width: 300px;
    height: 400px;
    position: absolute;
    left: 50%;
    top: 50px;
    transform: translate(-50%, 0);
  }

  20% {
    width: 300px;
    height: 400px;
    position: absolute;
    left: 50%;
    top: 50px;
    transform: translate(-50%, -0);
  }

  100% {
    width: 250px;
    height: 250px;
    position: absolute;
    left: 0;
    top: 0;
    transform: translate(0, 0);
  }
}

.fade-enter-active {
  transition: opacity .2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.logo {
  height: 6em;
  padding: 1.5em;
  will-change: filter;
  transition: filter 300ms;
}

.logo:hover {
  filter: drop-shadow(0 0 2em #646cffaa);
}

.logo.vue:hover {
  filter: drop-shadow(0 0 2em #42b883aa);
}

.main-container {
  flex: 1;
}

.drag-area {
  height: 40px;
  position: absolute;
  left: 0;
  right: 0;
  top: 0;
  cursor: move;
  z-index: 1;

  .drag-tips-container {
    width: 100%;
    height: 100%;
    border-radius: 16px 16px 0 0;
    background-color: rgba(0, 0, 0, 0.1);
    text-align: center;
    display: flex;
    align-items: center;
    justify-content: center;
    color: gray;
    border: 1px dashed rgba(0, 0, 0, 0.1);
    font-size: 12px;
  }

  .del-btn {
    position: absolute;
    top: 50%;
    right: 10px;
    font-size: 20px;
    color: #f03d3d;
    cursor: pointer;
    transform: translateY(-50%) rotate(45deg);
  }
}
</style>