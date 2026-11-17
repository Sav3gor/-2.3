<script setup>
import { statusLabels, priorityLabels } from '../utils/task-validation.js'
defineProps({
  search: { type: String, default: '' },
  status: { type: String, default: 'all' },
  priority: { type: String, default: 'all' },
  sort: { type: String, default: 'newest' },
  incomplete: { type: Boolean, default: false },
})
const emit = defineEmits(['update:search', 'update:status', 'update:priority', 'update:sort', 'update:incomplete', 'reset'])
</script>

<template>
  <section class="tf5-panel" aria-label="Пошук і фільтри">
    <h2>Пошук і впорядкування</h2>
    <div class="tf5-controls-grid">
      <label class="tf5-search" for="tf4-search">Пошук за назвою та описом
        <input id="tf4-search" type="search" :value="search" placeholder="Наприклад: інтерфейс"
          @input="emit('update:search', $event.target.value)" />
      </label>
      <label for="tf5-status">Статус
        <select id="tf5-status" :value="status" @change="emit('update:status', $event.target.value)">
          <option value="all">Усі статуси</option>
          <option v-for="(label, value) in statusLabels" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label for="tf5-priority">Пріоритет
        <select id="tf5-priority" :value="priority" @change="emit('update:priority', $event.target.value)">
          <option value="all">Усі пріоритети</option>
          <option v-for="(label, value) in priorityLabels" :key="value" :value="value">{{ label }}</option>
        </select>
      </label>
      <label for="tf5-sort">Сортування
        <select id="tf5-sort" :value="sort" @change="emit('update:sort', $event.target.value)">
          <option value="newest">Спочатку нові</option>
          <option value="title">За назвою (А–Я)</option>
          <option value="priority">За пріоритетом (високий перший)</option>
          <option value="priorityLow">За пріоритетом (низький перший)</option>
          <option value="dueDate">За терміном (найближчий перший)</option>
          <option value="dueDateDesc">За терміном (найдальший перший)</option>
          <option value="status">За статусом: у роботі → заплановано → виконано</option>
          <option value="oldest">Початковий порядок</option>
        </select>
      </label>
    </div>
    <div class="tf5-actions tf5-controls-actions">
      <button type="button" class="tf5-btn" :aria-pressed="incomplete"
        @click="emit('update:incomplete', !incomplete)">Тільки невиконані</button>
      <button v-if="search.length" type="button" class="tf5-btn"
        @click="emit('update:search', '')">Очистити пошук</button>
      <button type="button" class="tf5-btn" @click="emit('reset')">Скинути фільтри</button>
    </div>
  </section>
</template>
