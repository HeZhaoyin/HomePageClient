<template>
    <form class="form" @submit.prevent>
        <slot></slot>
    </form>
</template>
  
<script lang="ts" setup>

</script>
  
<style scoped>
.form {
    display: flex;
    flex-direction: column;
}
</style>