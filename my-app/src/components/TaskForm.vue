<script setup>
import { computed, nextTick, reactive, ref } from 'vue'
import { categoryLabels, localDate, priorityLabels, statusLabels, validateTask } from '../utils/task-validation.js'

const props = defineProps({
  task: { type: Object, default: null },
  tasks: { type: Array, default: () => [] },
  projects: { type: Array, default: () => [{ id: 'general', title: 'Загальні' }] },
  defaultProjectId: { type: String, default: 'general' },
})
const emit = defineEmits(['save', 'cancel'])
const defaults = () => ({
  title: '', description: '', status: 'todo', priority: 'medium', category: 'study', dueDate: '', projectId: props.defaultProjectId,
})
// Локальна копія: введення та скасування не змінюють завдання у сховищі.
const form = reactive({ ...defaults(), ...Object.fromEntries(
  Object.keys(defaults()).map(key => [key, props.task?.[key] ?? defaults()[key]]),
) })
const formElement = ref(null)
const showErrors = ref(false)
const isEditing = computed(() => props.task !== null)
const errors = computed(() => {
  const result = validateTask(form, { originalTask: props.task, tasks: props.tasks })
  if (!props.projects.some(project => project.id === form.projectId)) result.projectId = 'Оберіть проєкт зі списку.'
  return result
})

async function submitForm() {
  showErrors.value = true
  if (Object.keys(errors.value).length) {
    await nextTick()
    formElement.value?.querySelector('[aria-invalid="true"]')?.focus()
    return
  }
  emit('save', { ...form, title: form.title.trim(), description: form.description.trim() })
}
function clearForm() {
  Object.assign(form, defaults())
  showErrors.value = false
}
</script>

<template>
  <div class="tf4-form-panel">
    <div class="tf4-form-heading">
      <div>
        <div class="tf3-eyebrow">TASKFLOW / FORM</div>
        <h2>{{ isEditing ? 'Редагування завдання' : 'Нове завдання' }}</h2>
      </div>
      <button type="button" class="tf4-close" @click="emit('cancel')">Закрити</button>
    </div>
    <p class="tf4-hint">Поля із зірочкою (*) обов’язкові.</p>
    <form ref="formElement" class="tf4-form" novalidate @submit.prevent="submitForm">
      <div class="tf4-field tf4-field--wide">
        <label for="tf4-title">Назва завдання *</label>
        <input id="tf4-title" v-model.trim="form.title" type="text" required maxlength="80"
          placeholder="Наприклад: Підготувати звіт"
          :aria-invalid="showErrors && !!errors.title"
          :aria-describedby="`tf4-title-help${showErrors && errors.title ? ' tf4-title-error' : ''}`" />
        <small id="tf4-title-help">Від 3 до 80 символів. Залишилося: {{ 80 - form.title.length }}/80</small>
        <p v-if="showErrors && errors.title" id="tf4-title-error" class="tf4-error" role="alert">{{ errors.title }}</p>
      </div>
      <div class="tf4-field tf4-field--wide">
        <label for="tf4-description">Опис</label>
        <textarea id="tf4-description" v-model.trim="form.description" rows="3" maxlength="500"
          placeholder="Що потрібно зробити?"
          :aria-invalid="showErrors && !!errors.description"
          :aria-describedby="`tf4-description-help${showErrors && errors.description ? ' tf4-description-error' : ''}`"></textarea>
        <small id="tf4-description-help">Необов’язкове поле. Залишилося: {{ 500 - form.description.length }}/500</small>
        <p v-if="showErrors && errors.description" id="tf4-description-error" class="tf4-error" role="alert">{{ errors.description }}</p>
      </div>
      <div class="tf4-field">
        <label for="tf4-status">Статус *</label>
        <select id="tf4-status" v-model="form.status" required
          :aria-invalid="showErrors && !!errors.status"
          :aria-describedby="showErrors && errors.status ? 'tf4-status-error' : undefined">
          <option v-for="(label, value) in statusLabels" :key="value" :value="value">{{ label }}</option>
        </select>
        <p v-if="showErrors && errors.status" id="tf4-status-error" class="tf4-error" role="alert">{{ errors.status }}</p>
      </div>
      <div class="tf4-field">
        <label for="tf4-priority">Пріоритет *</label>
        <select id="tf4-priority" v-model="form.priority" required
          :aria-invalid="showErrors && !!errors.priority"
          :aria-describedby="showErrors && errors.priority ? 'tf4-priority-error' : undefined">
          <option v-for="(label, value) in priorityLabels" :key="value" :value="value">{{ label }}</option>
        </select>
        <p v-if="showErrors && errors.priority" id="tf4-priority-error" class="tf4-error" role="alert">{{ errors.priority }}</p>
      </div>
      <div class="tf4-field">
        <label for="tf4-category">Категорія *</label>
        <select id="tf4-category" v-model="form.category" required
          :aria-invalid="showErrors && !!errors.category"
          :aria-describedby="showErrors && errors.category ? 'tf4-category-error' : undefined">
          <option v-for="(label, value) in categoryLabels" :key="value" :value="value">{{ label }}</option>
        </select>
        <p v-if="showErrors && errors.category" id="tf4-category-error" class="tf4-error" role="alert">{{ errors.category }}</p>
      </div>
      <div class="tf4-field">
        <label for="tf4-date">Дата завершення</label>
        <input id="tf4-date" v-model="form.dueDate" type="date"
          :min="isEditing ? undefined : localDate()"
          :aria-invalid="showErrors && !!errors.dueDate"
          :aria-describedby="`tf4-date-help${showErrors && errors.dueDate ? ' tf4-date-error' : ''}`" />
        <small id="tf4-date-help">{{ isEditing ? 'Попередній термін можна залишити; новий має бути не раніше сьогодні.' : 'Необов’язково. Сьогоднішня або майбутня дата.' }}</small>
        <p v-if="showErrors && errors.dueDate" id="tf4-date-error" class="tf4-error" role="alert">{{ errors.dueDate }}</p>
      </div>
      <div class="tf4-field tf4-field--wide">
        <label for="tf6-task-project">Проєкт *</label>
        <select id="tf6-task-project" v-model="form.projectId" required
          :aria-invalid="showErrors && !!errors.projectId"
          :aria-describedby="showErrors && errors.projectId ? 'tf6-task-project-error' : undefined">
          <option v-for="project in projects" :key="project.id" :value="project.id">{{ project.title }}</option>
        </select>
        <p v-if="showErrors && errors.projectId" id="tf6-task-project-error" class="tf4-error" role="alert">{{ errors.projectId }}</p>
      </div>
      <div class="tf4-preview tf4-field--wide" aria-live="polite">
        <strong>Попередній перегляд</strong>
        <p>{{ form.title || 'Назва нового завдання' }}</p>
        <p class="tf4-preview-description">{{ form.description || 'Опис не додано' }}</p>
        <span>{{ statusLabels[form.status] }} · {{ priorityLabels[form.priority] }} · {{ categoryLabels[form.category] }}</span>
        <div class="tf4-hint">Проєкт: {{ projects.find(project => project.id === form.projectId)?.title ?? 'Не обрано' }}</div>
        <div class="tf4-hint">Термін: {{ form.dueDate || 'Не вказано' }}</div>
      </div>
      <div class="tf4-actions tf4-field--wide">
        <button type="submit" class="tf4-save">{{ isEditing ? 'Зберегти зміни' : 'Створити завдання' }}</button>
        <button v-if="!isEditing" type="button" class="tf4-cancel" @click="clearForm">Очистити форму</button>
        <button type="button" class="tf4-cancel" @click="emit('cancel')">Скасувати</button>
      </div>
    </form>
  </div>
</template>
