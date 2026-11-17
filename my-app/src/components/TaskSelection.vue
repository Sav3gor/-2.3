<script setup>
import StatusBadge from './StatusBadge.vue'
import PriorityBadge from './PriorityBadge.vue'
defineProps({ task: { type: Object, default: null } })
defineEmits(['close'])
</script>

<template>
  <section v-if="task" class="tf3-selection" role="status" aria-live="polite">
    <div><div class="tf3-eyebrow">Обране завдання № {{ task.id }}</div>
      <h2>{{ task.title }}</h2><p>{{ task.description }}</p>
      <StatusBadge :status="task.status" /> <PriorityBadge :priority="task.priority" />
    </div>
    <button class="tf3-action" type="button" @click="$emit('close')">Закрити</button>
  </section>
</template>
