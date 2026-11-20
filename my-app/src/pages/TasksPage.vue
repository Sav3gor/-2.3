<script setup>
import { ref, computed, nextTick } from 'vue'
import { storeToRefs } from 'pinia'
import AppTabbar from '../components/AppTabbar.vue'
import TaskListControls from '../components/TaskListControls.vue'
import TaskForm from '../components/TaskForm.vue'
import TaskCard from '../components/TaskCard.vue'
import TaskCounter from '../components/TaskCounter.vue'
import TaskSelection from '../components/TaskSelection.vue'
import { useTasksStore } from '../store/tasks.js'
import { useProjectsStore } from '../store/projects.js'
import { persistenceState, retrySave, importSnapshot, waitForPersistence } from '../services/persistence.js'
import { createExport, parseImport } from '../services/snapshot.js'
import '../css/persistence.css'
import '../css/task-components.css'
import '../css/task-form.css'
import '../css/task-list.css'
const importInput = ref(null)
const backupMessage = ref('')
const backupError = ref(false)
const saveMessage = computed(() => ({
  loading: 'Завантаження локальних даних…',
  saving: 'Збереження змін…',
  saved: 'Усі зміни збережено в цьому браузері.',
  error: persistenceState.error || 'Помилка локального збереження.',
})[persistenceState.status])
const savedTime = computed(() => persistenceState.lastSavedAt
  ? new Date(persistenceState.lastSavedAt).toLocaleString('uk-UA') : '')
const taskStore = useTasksStore()
const projectStore = useProjectsStore()
const { tasks, searchText: searchQuery, selectedStatus, selectedPriority, selectedProject,
  sortOrder, onlyIncomplete, withoutDueDate, visibleTasks: filteredTasks,
  visibleCompletionPercent: completedPercent } = storeToRefs(taskStore)
const { projects, projectStats } = storeToRefs(projectStore)
const newProjectTitle = ref('')
const newProjectError = ref('')
const formVisible = ref(false)
const editingId = ref(null)
const formAnchor = ref(null)
const feedback = ref('')
const saveFailed = ref(false)
const editingTask = computed(() => tasks.value.find(task => task.id === editingId.value) ?? null)
const selectedTaskId = ref(null)
const selectedTask = computed(() => tasks.value.find(task => task.id === selectedTaskId.value) ?? null)
function handleTaskSelect({ id }) { selectedTaskId.value = id }
function handleStatusChange(payload) { taskStore.setTaskStatus(payload) }
function handlePriorityChange(payload) { taskStore.setTaskPriority(payload) }
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
  const saved = isEditing ? taskStore.updateTask({ ...data, id: editingId.value }) : taskStore.addTask(data)
  saveFailed.value = !saved
  if (!saved) {
    feedback.value = 'Не вдалося зберегти завдання. Перевірте дані форми.'
    return
  }
  feedback.value = isEditing ? `Завдання «${saved.title}» оновлено.` : `Завдання «${saved.title}» створено.`
  cancelForm()
  taskStore.resetFilters()
}
function handleDelete(id) {
  const task = tasks.value.find(item => item.id === id)
  if (!task || !window.confirm(`Видалити завдання «${task.title}»?`)) return
  if (!taskStore.deleteTask(id)) return
  if (editingId.value === id) cancelForm()
  if (selectedTaskId.value === id) selectedTaskId.value = null
  saveFailed.value = false
  feedback.value = `Завдання «${task.title}» видалено.`
}
function createProject() {
  const project = projectStore.addProject(newProjectTitle.value)
  if (!project) {
    newProjectError.value = 'Назва має містити 3–40 символів і бути унікальною без урахування регістру.'
    return
  }
  newProjectTitle.value = ''
  newProjectError.value = ''
  selectedProject.value = project.id
}
function startProjectTasks() {
  if (selectedProject.value === 'all') return
  const title = projectStore.projectTitle(selectedProject.value)
  if (!window.confirm(`Перевести всі завдання проєкту «${title}» до статусу «У роботі»? Поточні фільтри списку не обмежують цю дію.`)) return
  const count = taskStore.startCurrentProjectTasks()
  saveFailed.value = false
  feedback.value = `Оновлено завдань у проєкті «${title}»: ${count}.`
}
function exportJson() {
  try {
    const text = createExport({ tasks: taskStore.tasks, projects: projectStore.projects, nextProjectId: projectStore.nextProjectId })
    const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
    const link = document.createElement('a')
    link.href = url; link.download = `taskflow-${new Date().toISOString().slice(0, 10)}.json`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    backupError.value = false; backupMessage.value = 'JSON із поточними завданнями та проєктами підготовлено для завантаження.'
  } catch (error) { backupError.value = true; backupMessage.value = error.message }
}
async function importJson(event) {
  const file = event.target.files?.[0]
  event.target.value = ''
  if (!file) return
  try {
    if (file.size > 5 * 1024 * 1024) throw new Error('Файл завеликий. Максимальний розмір — 5 МБ.')
    const data = parseImport(await file.text())
    if (!window.confirm(`Замінити всі поточні завдання (${taskStore.tasks.length}) і проєкти (${projectStore.projects.length}) даними з JSON?`)) return
    importSnapshot(data)
    cancelForm(); selectedTaskId.value = null
    const saved = await waitForPersistence()
    backupError.value = !saved
    backupMessage.value = saved ? 'Дані імпортовано й збережено в цьому браузері.' : 'Дані імпортовано в пам’ять, але запис не завершено. Повторіть збереження.'
  } catch (error) { backupError.value = true; backupMessage.value = error.message }
}
</script>
<template>
  <f7-page name="tasks" class="tf3-page">
    <f7-navbar title="Мої завдання"><f7-nav-right><f7-link href="/settings/">Налаштування</f7-link></f7-nav-right></f7-navbar>
    <div class="tf3-container">
     <section class="tf3-hero">
      <div class="tf3-eyebrow">TASKFLOW / TASK MANAGER</div>
      <h1>Керування завданнями і проєктами</h1>
      <p>Створюйте, редагуйте та впорядковуйте свої завдання.</p>
      <button type="button" class="tf4-new-task" @click="openForm()">+ Додати завдання</button>
     </section>
     <section class="tf7-persistence" :class="`tf7-persistence--${persistenceState.status}`" role="status" aria-live="polite">
       <strong>Локальне збереження</strong><span>{{ saveMessage }}</span>
       <span v-if="savedTime" class="tf7-time">Останній успішний запис: {{ savedTime }}</span>
       <button v-if="persistenceState.canRetry" type="button" class="tf5-btn" @click="retrySave">Повторити збереження</button>
     </section>
     <div class="tf7-backup-actions">
       <button class="tf5-btn" type="button" @click="exportJson">Експорт JSON</button>
       <button class="tf5-btn" type="button" :disabled="persistenceState.status === 'loading' || (persistenceState.status === 'error' && !persistenceState.canRetry)"
         @click="importInput.click()">Імпорт JSON</button>
       <input ref="importInput" class="tf7-file-input" type="file" accept="application/json,.json" aria-label="Файл резервної копії" @change="importJson" />
     </div>
     <p v-if="backupMessage" :class="backupError ? 'tf5-error' : 'tf4-feedback'" role="status">{{ backupMessage }}</p>
     <section class="tf5-panel" aria-label="Проєкти">
       <h2>Мої проєкти</h2>
       <div class="tf6-project-list">
         <span v-for="project in projectStats" :key="project.id" class="tf6-project-pill">
           {{ project.title }} <span>Завдань: {{ project.total }} · Виконано: {{ project.completionPercent }}%</span>
         </span>
       </div>
       <form class="tf6-project-form" novalidate @submit.prevent="createProject">
         <label for="tf6-project-title">Назва нового проєкту
           <input id="tf6-project-title" v-model.trim="newProjectTitle" type="text" maxlength="40"
             placeholder="Наприклад: Лабораторні" :aria-invalid="!!newProjectError"
             :aria-describedby="newProjectError ? 'tf6-project-error' : undefined" @input="newProjectError = ''" />
         </label>
         <button type="submit" class="tf5-btn tf5-btn--primary">Створити проєкт</button>
       </form>
       <p v-if="newProjectError" id="tf6-project-error" class="tf5-error" role="alert">{{ newProjectError }}</p>
     </section>
     <p v-if="feedback" class="tf4-feedback" :class="{ 'tf4-feedback--error': saveFailed }" role="status">{{ feedback }}</p>
     <section v-if="formVisible" ref="formAnchor" class="tf4-form-section" aria-label="Форма завдання">
       <TaskForm :key="editingId ?? 'new'" :task="editingTask" :tasks="tasks" :projects="projects" :default-project-id="selectedProject === 'all' ? 'general' : selectedProject"
         @save="saveTask" @cancel="cancelForm" />
     </section>
     <TaskListControls v-model:search="searchQuery" v-model:status="selectedStatus"
       v-model:priority="selectedPriority" v-model:sort="sortOrder"
       v-model:incomplete="onlyIncomplete" v-model:project="selectedProject" :projects="projects"
       v-model:without-due-date="withoutDueDate" @reset="taskStore.resetFilters" />
    <div class="tf6-bulk-action">
      <button type="button" class="tf5-btn" :disabled="selectedProject === 'all'" @click="startProjectTasks">Усі завдання проєкту — у роботу</button>
      <p class="tf4-hint">Оберіть конкретний проєкт у фільтрі. Дія охоплює всі його завдання й потребує підтвердження.</p>
    </div>
    <TaskSelection :task="selectedTask" @close="selectedTaskId = null" />
    <section class="tf3-section">
     <div class="tf3-section-heading">
       <div><div class="tf3-eyebrow">TASK LIST</div><h2>Список завдань</h2></div>
       <div class="tf5-summary" role="status" aria-live="polite">
         <TaskCounter :count="filteredTasks.length" />
         <span>із {{ tasks.length }} · Виконано у вибірці: {{ completedPercent }}%</span>
       </div>
     </div>
     <div v-if="filteredTasks.length" class="tf3-task-grid">
       <TaskCard v-for="task in filteredTasks" :key="task.id" :task="task" :project-title="projectStore.projectTitle(task.projectId)" :editable="true" @edit="openForm" @delete="handleDelete"
        @task-select="handleTaskSelect"
         @status-change="handleStatusChange"
        @priority-change="handlePriorityChange" />
     </div>
     <div v-else-if="!tasks.length" class="tf5-empty" role="status">
       <h3>Список завдань порожній</h3>
       <p>Усі завдання видалено. Створіть нове завдання, щоб продовжити.</p>
       <button type="button" class="tf5-btn tf5-btn--primary" @click="openForm()">Створити перше завдання</button>
     </div>
     <div v-else class="tf5-empty" role="status">
       <p>За обраними фільтрами завдань не знайдено.</p>
       <button type="button" class="tf5-btn" @click="taskStore.resetFilters">Показати всі завдання</button>
     </div>
    </section>
   </div>
   <AppTabbar active="tasks" />
 </f7-page>
</template>
