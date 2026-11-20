import { categoryLabels, isValidDate, priorityLabels, statusLabels } from '../utils/task-validation.js'

const fail = message => { throw new Error(message) }
export function validateSnapshot(value) {
  if (!value || typeof value !== 'object' || !Array.isArray(value.tasks) || !Array.isArray(value.projects)) {
    fail('Файл має містити масиви tasks і projects.')
  }
  const ids = new Set()
  const names = new Set()
  const projects = value.projects.map(project => {
    if (!project || typeof project.id !== 'string' || !project.id.trim() || project.id.length > 80 ||
      typeof project.title !== 'string' || project.title.trim().length < 3 || project.title.trim().length > 40) {
      fail('Некоректні поля проєкту.')
    }
    const name = project.title.trim().toLocaleLowerCase('uk-UA')
    if (ids.has(project.id) || names.has(name)) fail('Ідентифікатори й назви проєктів мають бути унікальними.')
    ids.add(project.id); names.add(name)
    return { id: project.id, title: project.title.trim() }
  })
  if (!ids.has('general')) fail('Потрібен базовий проєкт general.')
  const taskIds = new Set()
  const tasks = value.tasks.map(task => {
    if (!task || !Number.isSafeInteger(task.id) || task.id < 1 || taskIds.has(task.id)) fail('ID завдань мають бути унікальними додатними цілими числами.')
    if (typeof task.title !== 'string' || task.title.trim().length < 3 || task.title.trim().length > 80 ||
      typeof task.description !== 'string' || task.description.length > 500 ||
      !Object.hasOwn(statusLabels, task.status) || !Object.hasOwn(priorityLabels, task.priority) ||
      typeof task.dueDate !== 'string' || (task.dueDate !== '' && !isValidDate(task.dueDate)) ||
      typeof task.projectId !== 'string' || !ids.has(task.projectId) ||
      (task.category !== undefined && !Object.hasOwn(categoryLabels, task.category))) {
      fail('Некоректні поля завдання або посилання projectId.')
    }
    taskIds.add(task.id)
    return { id: task.id, title: task.title.trim(), description: task.description,
      status: task.status, priority: task.priority, dueDate: task.dueDate,
      projectId: task.projectId, category: task.category ?? 'study' }
  })
  const calculatedNextId = projects.reduce((max, project) => {
    const match = /^project-(\d+)$/.exec(project.id)
    const id = match ? Number(match[1]) : 0
    if (!Number.isSafeInteger(id) || id >= Number.MAX_SAFE_INTEGER) fail('Завеликий ID проєкту.')
    return Math.max(max, id)
  }, 0) + 1
  const nextProjectId = Number.isSafeInteger(value.nextProjectId) && value.nextProjectId >= calculatedNextId
    ? value.nextProjectId : calculatedNextId
  return { tasks, projects, nextProjectId }
}

export function createExport(snapshot) {
  return JSON.stringify({ format: 'taskflow-backup', version: 1,
    exportedAt: new Date().toISOString(), ...validateSnapshot(snapshot) }, null, 2)
}

export function parseImport(text) {
  let value
  try { value = JSON.parse(text) } catch { fail('Файл не містить коректного JSON.') }
  if (value?.version !== undefined && value.version !== 1) fail('Непідтримувана версія резервної копії.')
  return validateSnapshot(value)
}
