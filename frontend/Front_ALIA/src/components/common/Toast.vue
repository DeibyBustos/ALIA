<template>
  <div class="toast-wrap">
    <div class="toast">
      <div class="toast-msg">{{ msg }}</div>
      <button class="btn secondary" @click="$emit('done')">OK</button>
    </div>
  </div>
</template>

<script setup>
defineProps({ msg: { type: String, required: true } });
defineEmits(["done"]);
</script>
