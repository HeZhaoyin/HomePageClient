<script setup lang="ts">
import NavBar from './views/index/components/NavBar.vue'
import EarthGlobe from './components/EarthGlobe.vue'
</script>

<template>
  <div class="app-container">
    <nav-bar></nav-bar>
    <router-view></router-view>
    <earth-globe></earth-globe>
    <hp-toast></hp-toast>
  </div>
</template>

<style scoped>
.app-container {
  width: 100vw;
  min-height: 100vh;
  padding: 50px 10vw 0 10vw;
  position: relative;
}
</style>
