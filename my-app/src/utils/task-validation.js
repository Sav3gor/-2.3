export const statusLabels = {
  todo: 'Заплановано', progress: 'У роботі', done: 'Виконано',
}
export const priorityLabels = {
  low: 'Низький', medium: 'Середній', high: 'Високий',
}
export const categoryLabels = {
  study: 'Навчання', work: 'Робота', personal: 'Особисте',
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

export function isValidDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const date = new Date(`${value}T12:00:00`)
  return !Number.isNaN(date.getTime()) && localDate(date) === value
}

export function validateTask(data, { originalTask = null, tasks = [], today = localDate() } = {}) {
  const errors = {}
  const title = typeof data?.title === 'string' ? data.title.trim() : ''
  const description = typeof data?.description === 'string' ? data.description.trim() : ''
  if (!title) errors.title = 'Вкажіть назву завдання.'
  else if (title.length < 3) errors.title = 'Назва має містити щонайменше 3 символи.'
  else if (title.length > 80) errors.title = 'Максимальна довжина — 80 символів.'
  else if (!originalTask && tasks.some(task => task.title.trim().toLocaleLowerCase('uk-UA') === title.toLocaleLowerCase('uk-UA'))) {
    errors.title = 'Завдання з такою назвою вже існує.'
  }
  if (description.length > 500) errors.description = 'Опис не повинен перевищувати 500 символів.'
  if (!Object.hasOwn(statusLabels, data?.status)) errors.status = 'Оберіть коректний статус.'
  if (!Object.hasOwn(priorityLabels, data?.priority)) errors.priority = 'Оберіть коректний пріоритет.'
  if (!Object.hasOwn(categoryLabels, data?.category)) errors.category = 'Оберіть коректну категорію.'
  if (data?.dueDate !== '' && !isValidDate(data?.dueDate)) errors.dueDate = 'Укажіть коректну дату завершення.'
  else if (data.dueDate && data.dueDate < today && data.dueDate !== originalTask?.dueDate) {
    errors.dueDate = 'Оберіть сьогоднішню або майбутню дату. Попередній термін можна залишити без змін.'
  }
  return errors
}
