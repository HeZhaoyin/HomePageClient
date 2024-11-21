<template>
    <div class="main-content-box">
        <div class="avatar-box-mask" v-if="state.isLoginStatus" @click.self="showOrHideLogin(false)"></div>
        <Avatar class="user-box"
            :class="[{ 'show-login-box': state.isLoginStatus && !state.loginAnimationReverse }, { 'hide-login-box': state.loginAnimationReverse }]"
            :is-login-status="state.isLoginStatus" :is-login-input-show="state.isLoginInputShow"
            @show-or-hide-login="showOrHideLogin">
        </Avatar>
        <TransitionGroup name="fade">
            <template v-if="!state.isLoginStatus">
                <Card v-for="(markGroup, index) in store.state.markListData as Array<MarkList>" :marks="markGroup.marks"
                    :mark-group-name="markGroup.markGroupName" class="main-container">
                </Card>
            </template>
        </TransitionGroup>
    </div>
</template>

<script lang="ts" setup>
import { computed, reactive, ref, toRefs, watch } from 'vue'
import Avatar from './components/Avatar.vue'
import Card from './components/Card.vue'
import { useStore } from 'vuex'
import { MarkList } from '../../models/mark'
const state = reactive({
    isLoginStatus: false,
    loginAnimationReverse: false,
    isLoginInputShow: false,
})

const showOrHideLogin = (isShow: boolean) => {
    if (isShow) {
        state.isLoginStatus = true
        state.isLoginInputShow = true
    } else {
        state.loginAnimationReverse = true
        state.isLoginInputShow = false
        setTimeout(() => {
            state.isLoginStatus = false
            state.loginAnimationReverse = false
        }, 400);
    }
}

const store = useStore()
watch(() => store.state.token, (val) => {
    store.dispatch('initMarkListData')
}, { immediate: true })

defineExpose({
    ...toRefs(state)
})

</script>

<style lang="less" scoped>
.avatar-box-mask {
    width: 100vw;
    height: 100vh;
    position: fixed;
    top: 0;
    left: 0;
    z-index: 1;
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
</style>