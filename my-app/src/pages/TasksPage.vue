<script setup>
import { ref, computed } from 'vue'
import AppTabbar from '../components/AppTabbar.vue'
import TaskCard from '../components/TaskCard.vue'
import TaskCounter from '../components/TaskCounter.vue'
import TaskSelection from '../components/TaskSelection.vue'
import { taskState, setTaskStatus, setTaskPriority } from '../store/tasks'
import '../css/task-components.css'
const sortOrder = ref('default')
const selectedStatus = ref('all')
const selectedPriority = ref('all')
const statusOptions = [
  { value: 'all', label: 'Усі' },
  { value: 'todo', label: 'Заплановано' },
  { value: 'progress', label: 'У роботі' },
  { value: 'done', label: 'Виконано' },
]
const priorityOptions = [
  { value: 'all', label: 'Усі' },
  { value: 'low', label: 'Низький' },
  { value: 'medium', label: 'Середній' },
  { value: 'high', label: 'Високий' },
]
const filteredTasks = computed(() => taskState.tasks.filter((task) => (
  (selectedStatus.value === 'all' || task.status === selectedStatus.value) &&
  (selectedPriority.value === 'all' || task.priority === selectedPriority.value)
 )).sort((a, b) => {
  const rank = { high: 0, medium: 1, low: 2 }
  return sortOrder.value === 'default' ? a.id - b.id :
    (rank[a.priority] - rank[b.priority]) * (sortOrder.value === 'high' ? 1 : -1)
}))
const selectedTaskId = ref(null)
const selectedTask = computed(() => taskState.tasks.find(task => task.id === selectedTaskId.value) ?? null)
function handleTaskSelect({ id }) { selectedTaskId.value = id }
function handleStatusChange(payload) { setTaskStatus(payload) }
function handlePriorityChange(payload) { setTaskPriority(payload) }
</script>
<template>
  <f7-page name="tasks" class="tf3-page">
    <f7-navbar title="Мої завдання" />
    <div class="tf3-container">
     <section class="tf3-hero">
      <div class="tf3-eyebrow">TASKFLOW / TASK MANAGER</div>
      <h1>Мої завдання</h1>
      <p>Керуйте завданнями, статусами та пріоритетами.</p>
     </section>
     <section class="tf3-filters">
      <div class="tf3-filter-group">
       <div class="tf3-filter-title">Фільтр за статусом</div>
       <div class="tf3-filter-buttons">
         <button v-for="option in statusOptions" :key="option.value"
          type="button" class="tf3-filter-button"
          :class="{ 'is-active': selectedStatus === option.value }"
          :aria-pressed="selectedStatus === option.value"
          @click="selectedStatus = option.value">{{ option.label }}</button>
       </div>
      </div>
      <div class="tf3-filter-group">
       <div class="tf3-filter-title">Фільтр за пріоритетом</div>
       <div class="tf3-filter-buttons">
         <button v-for="option in priorityOptions" :key="option.value"
          type="button" class="tf3-filter-button"
          :class="{ 'is-active': selectedPriority === option.value }"
          :aria-pressed="selectedPriority === option.value"
          @click="selectedPriority = option.value">{{ option.label }}</button>
       </div>
     </div>
      <label class="tf3-filter-group tf3-filter-title">Сортування за пріоритетом
        <select v-model="sortOrder" class="tf3-sort">
          <option value="default">Початковий порядок</option>
          <option value="high">Спочатку високий</option>
          <option value="low">Спочатку низький</option>
        </select>
      </label>
    </section>
    <TaskSelection :task="selectedTask" @close="selectedTaskId = null" />
    <section class="tf3-section">
     <div class="tf3-section-heading">
       <div><div class="tf3-eyebrow">TASK LIST</div><h2>Список завдань</h2></div>
       <TaskCounter :count="filteredTasks.length" />
     </div>
     <div v-if="filteredTasks.length" class="tf3-task-grid">
       <TaskCard v-for="task in filteredTasks" :key="task.id" :task="task"
        @task-select="handleTaskSelect"
         @status-change="handleStatusChange"
        @priority-change="handlePriorityChange" />
     </div>
     <div v-else class="tf3-empty">За обраними фільтрами завдань не знайдено.</div>
    </section>
   </div>
   <AppTabbar active="tasks" />
 </f7-page>
</template>
