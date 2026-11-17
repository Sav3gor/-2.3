<script setup>
import { ref, computed, nextTick } from 'vue'
import AppTabbar from '../components/AppTabbar.vue'
import TaskListControls from '../components/TaskListControls.vue'
import TaskForm from '../components/TaskForm.vue'
import TaskCard from '../components/TaskCard.vue'
import TaskCounter from '../components/TaskCounter.vue'
import TaskSelection from '../components/TaskSelection.vue'
import { taskState, addTask, updateTask, deleteTask, setTaskStatus, setTaskPriority } from '../store/tasks'
import '../css/task-components.css'
import '../css/task-form.css'
import '../css/task-list.css'
const searchQuery = ref('')
const formVisible = ref(false)
const editingId = ref(null)
const formAnchor = ref(null)
const feedback = ref('')
const saveFailed = ref(false)
const editingTask = computed(() => taskState.tasks.find(task => task.id === editingId.value) ?? null)
const sortOrder = ref('newest')
const selectedStatus = ref('all')
const selectedPriority = ref('all')
const onlyIncomplete = ref(false)
const filteredTasks = computed(() => {
  const term = searchQuery.value.trim().toLocaleLowerCase('uk-UA')
  const result = taskState.tasks.filter(task => (
    (selectedStatus.value === 'all' || task.status === selectedStatus.value) &&
    (selectedPriority.value === 'all' || task.priority === selectedPriority.value) &&
    (!onlyIncomplete.value || task.status !== 'done') &&
    `${task.title} ${task.description ?? ''}`.toLocaleLowerCase('uk-UA').includes(term)
  ))
  const priorities = { high: 0, medium: 1, low: 2 }
  const statuses = { progress: 0, todo: 1, done: 2 }
  // filter() повертає окремий масив; порядок у спільному сховищі не змінюється.
  return result.sort((a, b) => {
    if (sortOrder.value === 'title') return a.title.localeCompare(b.title, 'uk-UA') || a.id - b.id
    if (sortOrder.value === 'priority') return priorities[a.priority] - priorities[b.priority] || b.id - a.id
    if (sortOrder.value === 'priorityLow') return priorities[b.priority] - priorities[a.priority] || b.id - a.id
    if (sortOrder.value === 'status') return statuses[a.status] - statuses[b.status] || b.id - a.id
    if (sortOrder.value === 'oldest') return a.id - b.id
    if (sortOrder.value === 'dueDate' || sortOrder.value === 'dueDateDesc') {
      if (!a.dueDate && !b.dueDate) return b.id - a.id
      if (!a.dueDate) return 1
      if (!b.dueDate) return -1
      return a.dueDate.localeCompare(b.dueDate) * (sortOrder.value === 'dueDate' ? 1 : -1) || b.id - a.id
    }
    return b.id - a.id
  })
})
const completedPercent = computed(() => filteredTasks.value.length
  ? Math.round(filteredTasks.value.filter(task => task.status === 'done').length / filteredTasks.value.length * 100)
  : 0)
function resetFilters() {
  searchQuery.value = ''
  selectedStatus.value = 'all'
  selectedPriority.value = 'all'
  sortOrder.value = 'newest'
  onlyIncomplete.value = false
}
const selectedTaskId = ref(null)
const selectedTask = computed(() => taskState.tasks.find(task => task.id === selectedTaskId.value) ?? null)
function handleTaskSelect({ id }) { selectedTaskId.value = id }
function handleStatusChange(payload) { setTaskStatus(payload) }
function handlePriorityChange(payload) { setTaskPriority(payload) }
async function openForm(id = null) {
  editingId.value = id
  formVisible.value = true
  feedback.value = ''
  await nextTick()
  formAnchor.value?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  formAnchor.value?.querySelector('input')?.focus({ preventScroll: true })
}
function cancelForm() {
  formVisible.value = false
  editingId.value = null
}
function saveTask(data) {
  const isEditing = editingId.value !== null
  const saved = isEditing ? updateTask({ ...data, id: editingId.value }) : addTask(data)
  saveFailed.value = !saved
  if (!saved) {
    feedback.value = 'Не вдалося зберегти завдання. Перевірте дані форми.'
    return
  }
  feedback.value = isEditing ? `Завдання «${saved.title}» оновлено.` : `Завдання «${saved.title}» створено.`
  cancelForm()
  resetFilters()
}
function handleDelete(id) {
  const task = taskState.tasks.find(item => item.id === id)
  if (!task || !window.confirm(`Видалити завдання «${task.title}»?`)) return
  if (!deleteTask(id)) return
  if (editingId.value === id) cancelForm()
  if (selectedTaskId.value === id) selectedTaskId.value = null
  saveFailed.value = false
  feedback.value = `Завдання «${task.title}» видалено.`
}
</script>
<template>
  <f7-page name="tasks" class="tf3-page">
    <f7-navbar title="Мої завдання" />
    <div class="tf3-container">
     <section class="tf3-hero">
      <div class="tf3-eyebrow">TASKFLOW / TASK MANAGER</div>
      <h1>Мої завдання</h1>
      <p>Створюйте, редагуйте та впорядковуйте свої завдання.</p>
      <button type="button" class="tf4-new-task" @click="openForm()">+ Додати завдання</button>
     </section>
     <p v-if="feedback" class="tf4-feedback" :class="{ 'tf4-feedback--error': saveFailed }" role="status">{{ feedback }}</p>
     <section v-if="formVisible" ref="formAnchor" class="tf4-form-section" aria-label="Форма завдання">
       <TaskForm :key="editingId ?? 'new'" :task="editingTask" :tasks="taskState.tasks"
         @save="saveTask" @cancel="cancelForm" />
     </section>
     <TaskListControls v-model:search="searchQuery" v-model:status="selectedStatus"
       v-model:priority="selectedPriority" v-model:sort="sortOrder"
       v-model:incomplete="onlyIncomplete" @reset="resetFilters" />
    <TaskSelection :task="selectedTask" @close="selectedTaskId = null" />
    <section class="tf3-section">
     <div class="tf3-section-heading">
       <div><div class="tf3-eyebrow">TASK LIST</div><h2>Список завдань</h2></div>
       <div class="tf5-summary" role="status" aria-live="polite">
         <TaskCounter :count="filteredTasks.length" />
         <span>із {{ taskState.tasks.length }} · Виконано у вибірці: {{ completedPercent }}%</span>
       </div>
     </div>
     <div v-if="filteredTasks.length" class="tf3-task-grid">
       <TaskCard v-for="task in filteredTasks" :key="task.id" :task="task" :editable="true" @edit="openForm" @delete="handleDelete"
        @task-select="handleTaskSelect"
         @status-change="handleStatusChange"
        @priority-change="handlePriorityChange" />
     </div>
     <div v-else-if="!taskState.tasks.length" class="tf5-empty" role="status">
       <h3>Список завдань порожній</h3>
       <p>Усі завдання видалено. Створіть нове завдання, щоб продовжити.</p>
       <button type="button" class="tf5-btn tf5-btn--primary" @click="openForm()">Створити перше завдання</button>
     </div>
     <div v-else class="tf5-empty" role="status">
       <p>За обраними фільтрами завдань не знайдено.</p>
       <button type="button" class="tf5-btn" @click="resetFilters">Показати всі завдання</button>
     </div>
    </section>
   </div>
   <AppTabbar active="tasks" />
 </f7-page>
</template>
