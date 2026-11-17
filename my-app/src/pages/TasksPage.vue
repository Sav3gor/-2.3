<script setup>
import { ref, computed, nextTick } from 'vue'
import AppTabbar from '../components/AppTabbar.vue'
import TaskForm from '../components/TaskForm.vue'
import TaskCard from '../components/TaskCard.vue'
import TaskCounter from '../components/TaskCounter.vue'
import TaskSelection from '../components/TaskSelection.vue'
import { taskState, addTask, updateTask, setTaskStatus, setTaskPriority } from '../store/tasks'
import '../css/task-components.css'
import '../css/task-form.css'
const searchQuery = ref('')
const formVisible = ref(false)
const editingId = ref(null)
const formAnchor = ref(null)
const feedback = ref('')
const saveFailed = ref(false)
const editingTask = computed(() => taskState.tasks.find(task => task.id === editingId.value) ?? null)
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
  (selectedPriority.value === 'all' || task.priority === selectedPriority.value) &&
  task.title.toLocaleLowerCase('uk-UA').includes(searchQuery.value.trim().toLocaleLowerCase('uk-UA'))
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
  selectedStatus.value = 'all'
  selectedPriority.value = 'all'
  searchQuery.value = ''
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
     <section class="tf3-filters">
      <label for="tf4-search" class="tf3-filter-group tf3-filter-title">Пошук за назвою
        <input id="tf4-search" v-model="searchQuery" class="tf3-sort" type="search"
          placeholder="Введіть назву завдання" />
      </label>
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
       <TaskCard v-for="task in filteredTasks" :key="task.id" :task="task" :editable="true" @edit="openForm"
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
