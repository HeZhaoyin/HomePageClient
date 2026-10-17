<template>
    <div class="avatar-box" @click="showLogin">
        <span class="iconfont icon-yonghu avatar-icon" :class="{ 'avatar-login': props.isLoginStatus }"></span>
        <div class="login-content-container">
            <transition name="bounce" mode="out-in">
                <!-- <div v-if="state.isUnLogin || !props.isLoginStatus" class="login-content login-result-info"> -->
                <div v-if="!props.isLoginInputShow || userStore.isLogin" class="login-content login-result-info">
                    <template v-if="!userStore.isLogin">
                        <span class="user-name">未登录</span>
                        <span class="user-desc">点我登录</span>
                    </template>
                    <template v-else-if="userStore.isLogin">
                        <div :style="props.isLoginInputShow ? 'text-align: center' : ''" class="user-name">{{ userStore.userRealName }}</div>
                        <div :style="props.isLoginInputShow ? 'text-align: center' : ''" class="user-desc">欢迎您</div>
                    </template>
                </div>
                <div v-else class="login-content login-input-container">
                    <hp-input class="login-input" label="用户名" v-model="state.userName"
                        @input="handleInputChange"></hp-input>
                    <hp-input class="login-input" label="密码" type="password" v-model="state.userPassword"
                        @input="handleInputChange"></hp-input>
                    <div class="login-btn-container">
                        <login-button :status="state.loginStatus" @click="handleLogin" :text="state.loginText"
                            :success-text="'登录成功'" :fail-text="'登录失败'"></login-button>
                        <!-- <login-button :text="'注册'" @click="handleRegister"></login-button> -->
                    </div>
                </div>
            </transition>
        </div>
        <login-button class="logout-btn" v-if="userStore.isLogin && props.isLoginInputShow" :text="'注销'"
            @click="handleLogout"></login-button>
    </div>
</template>

<script lang="ts" setup>
import LoginButton from './LoginButton.vue';
import { reactive } from 'vue';
import { trim } from '@/utils/utils'
import { useStore } from '@/store/index'
import { useUserStore } from '@/store/user'
const emit = defineEmits(['show-or-hide-login'])
const store = useStore()
const userStore = useUserStore()

const props = defineProps({
    isLoginStatus: Boolean,
    isLoginInputShow: Boolean
})

const state = reactive({
    isLoginLoading: false,
    loginText: '登录',
    loginStatus: 'normal',
    userName: '',
    userPassword: '',
    // isLogin / userRealName 由 userStore 提供，模板用 userStore.xxx 绑定
})

const showLogin = () => {
    // 如果已经登录或者正在编辑卡片，不显示登录框
    if (props.isLoginStatus || store.isCardEditStatus) {
        return;
    }
    emit('show-or-hide-login', true)
}

const checkUserNameOrPassword = () => {
    if (state.userName == '' || trim(state.userName) == '') {
        return false
    }
    if (state.userPassword == '' || trim(state.userPassword) == '') {
        return false
    }
    return true
}

const handleLogin = async () => {
    if (!checkUserNameOrPassword()) {
        return
    }
    state.loginStatus = 'loading'
    try {
        const ok = await userStore.login(state.userName, state.userPassword)
        if (ok) {
            setTimeout(() => {
                state.loginStatus = 'success'
                setTimeout(() => {
                    userStore.isLogin = true
                    setTimeout(() => {
                        emit('show-or-hide-login', false)
                    }, 1000);
                }, 1000);
            }, 500);
        } else {
            setTimeout(() => {
                state.loginStatus = 'fail'
            }, 500);
        }
    } catch (error) {
        console.log('登录失败', error)
        state.loginStatus = 'fail'
    }
}

const handleInputChange = () => {
    state.loginStatus = "normal"
}

const handleLogout = () => {
    state.loginStatus = 'normal';
    userStore.logout()
}
</script>

<style scoped lang="less">
.avatar-box {
    display: flex;
    flex-direction: column;
    background: radial-gradient(circle at 100% 0, hsla(0, 0%, 100%, .85) 0, hsla(0, 0%, 96.1%, .5) 183%);
    box-shadow: 17px 20px 40px rgb(0 0 0 / 21%);
    border-radius: 16px;
    margin: 14px;
    cursor: pointer;
    z-index: 2;

    &:hover {
        -webkit-box-shadow: 20px 20px 41px rgb(10 10 10 / 32%);
        box-shadow: 20px 20px 41px rgb(10 10 10 / 32%);
        -webkit-transform: scale(1.019);
        transform: scale(1.019);
    }

    .avatar-icon {
        width: 100px;
        height: 100px;
        font-size: 100px;
        line-height: 100px;
        color: rgb(84, 106, 127);
        position: relative;
        left: 0;
        transition: left .2s cubic-bezier(.32, .08, .24, 1), transform .2s cubic-bezier(.32, .08, .24, 1);

        &.avatar-login {
            transition-delay: .2s;
            position: relative;
            left: 50%;
            transform: translate(-50%, 0);
        }
    }

    .login-result-info {
        display: flex;
        flex-direction: column;

        .user-name {
            font-size: 30px;
            color: #1d1d1f;
            font-weight: 600;
        }
    }
}

.login-content-container {
    margin-top: 10px;
    position: relative;

    .login-content {
        // position: absolute;

        .login-btn-container {
            margin-top: 40px;
            width: 100%;
            display: flex;
            flex-direction: column;
            align-items: center;
        }
    }

    .login-input-container {
        margin-top: 20px;

        .login-input {
            margin-bottom: 20px;
        }
    }
}

.bounce-enter-active {
    animation: bounce-in 0.3s;
}

.bounce-leave-active {
    animation: bounce-in 0.15s reverse;
}

@keyframes bounce-in {
    0% {
        transform: scale(0);
    }

    50% {
        transform: scale(1.1);
    }

    100% {
        transform: scale(1);
    }
}

.logout-btn {
    position: absolute;
    left: 50%;
    bottom: 20px;
    transform: translate(-50%, 0)
}
</style>