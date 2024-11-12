<script setup lang="ts">
import NavBar from './views/index/components/NavBar.vue'
</script>

<template>
  <div class="app-container">
    <nav-bar></nav-bar>
    <router-view></router-view>
    <div class="bg"></div>
  </div>
</template>

<style scoped>
.app-container {
  width: 100vw;
  min-height: 100vh;
  padding: 50px 10vw 0 10vw;
  position: relative;
}

.bg {
  width: 100vw;
  height: 100vh;
  position: fixed;
  left: 0;
  top: 0;
  background: url(@/assets/bgtiny.webp) no-repeat center center;
  z-index: -2;
}
</style>
