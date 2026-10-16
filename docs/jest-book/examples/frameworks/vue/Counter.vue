<template>
  <div>
    <p data-testid="count">Count: {{ count }}</p>
    <button @click="increment">Add</button>
    <p v-if="count >= max" role="alert">Max reached</p>
  </div>
</template>
<script setup>
import { ref } from 'vue';
const props = defineProps({ start: { type: Number, default: 0 }, max: { type: Number, default: 3 } });
const emit = defineEmits(['changed']);
const count = ref(props.start);
function increment() { if (count.value < props.max) { count.value++; emit('changed', count.value); } }
</script>
