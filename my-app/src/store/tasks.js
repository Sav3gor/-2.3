import { reactive } from 'vue'
import initialTasks from '../data/tasks.js'
import { statusLabels, priorityLabels, validateTask } from '../utils/task-validation.js'

export const taskState = reactive({
  tasks: initialTasks.map(task => ({ ...task, category: task.category ?? 'study' })),
})

function normalizeTaskData(data, originalTask = null) {
  if (!data || typeof data !== 'object') return null
  const candidate = { ...data, category: data.category ?? originalTask?.category ?? 'study' }
  if (Object.keys(validateTask(candidate, { originalTask, tasks: taskState.tasks })).length) return null
  return {
    title: candidate.title.trim(),
    description: typeof candidate.description === 'string' ? candidate.description.trim() : '',
    status: candidate.status,
    priority: candidate.priority,
    category: candidate.category,
    dueDate: candidate.dueDate,
  }
}

export function addTask(data) {
  const normalized = normalizeTaskData(data)
  if (!normalized) return null
  const nextId = taskState.tasks.reduce((maxId, task) => Math.max(maxId, task.id), 0) + 1
  const newTask = { id: nextId, ...normalized }
  taskState.tasks.push(newTask)
  return newTask
}

export function updateTask(data) {
  if (!data || typeof data !== 'object') return null
  const task = taskState.tasks.find(item => item.id === data.id)
  if (!task) return null
  const normalized = normalizeTaskData(data, task)
  if (!normalized) return null
  Object.assign(task, normalized)
  return task
}

export function setTaskStatus({ id, status }) {
  if (!Object.hasOwn(statusLabels, status)) return
  const task = taskState.tasks.find(item => item.id === id)
  if (task) task.status = status
}

export function setTaskPriority({ id, priority }) {
  if (!Object.hasOwn(priorityLabels, priority)) return
  const task = taskState.tasks.find(item => item.id === id)
  if (task) task.priority = priority
}
