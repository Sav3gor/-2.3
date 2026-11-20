import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPinia } from 'pinia'
import { useTasksStore } from '../src/store/tasks.js'
import { useProjectsStore } from '../src/store/projects.js'
import { createPersistenceController } from '../src/services/persistence.js'
import { createExport, parseImport, validateSnapshot } from '../src/services/snapshot.js'
import * as database from '../src/services/database.js'

const clone = value => JSON.parse(JSON.stringify(value))
const taskData = (overrides = {}) => ({ title: 'Постійне завдання', description: 'Перевірка збереження',
  status: 'todo', priority: 'high', category: 'study', dueDate: '', projectId: 'general', ...overrides })
function memoryDatabase(initial = { initialized: false }) {
  return {
    stored: clone(initial), writes: [], failRead: false, failWrite: false, holdWrite: null,
    async readSnapshot() { if (this.failRead) throw new Error('Read failed'); return clone(this.stored) },
    async writeSnapshot(data) {
      if (this.failWrite) throw new Error('Write failed')
      if (this.holdWrite) await this.holdWrite
      const lastSavedAt = new Date().toISOString()
      this.stored = { ...clone(data), initialized: true, lastSavedAt }
      this.writes.push(clone(this.stored))
      return lastSavedAt
    },
  }
}
function session(io) {
  const pinia = createPinia()
  const tasks = useTasksStore(pinia)
  const projects = useProjectsStore(pinia)
  const controller = createPersistenceController(pinia, io)
  return { pinia, tasks, projects, ...controller }
}

test('01–03: перший запуск створює лише один snapshot і metadata', async () => {
  const io = memoryDatabase(); const first = session(io)
  assert.equal(await first.initialize(), true)
  assert.equal(first.state.status, 'saved')
  assert.equal(io.stored.initialized, true)
  assert.equal(io.stored.tasks.length, 10)
  assert.equal(io.stored.projects.length, 3)
  assert.ok(first.state.lastSavedAt)
  first.dispose()
  const second = session(io); await second.initialize()
  assert.equal(io.writes.length, 1)
  assert.equal(second.state.lastSavedAt, io.stored.lastSavedAt)
  second.dispose()
})

test('04–13: створення, редагування, статус, пріоритет, видалення та проєкти відновлюються', async () => {
  const io = memoryDatabase(); const first = session(io); await first.initialize()
  const project = first.projects.addProject('Лабораторні')
  const task = first.tasks.addTask(taskData({ projectId: project.id }))
  first.tasks.updateTask({ ...task, title: 'Оновлена назва завдання', description: 'Новий опис' })
  first.tasks.setTaskStatus({ id: task.id, status: 'done' })
  first.tasks.setTaskPriority({ id: task.id, priority: 'low' })
  first.tasks.deleteTask(1)
  assert.equal(await first.waitForIdle(), true)
  first.dispose()
  const second = session(io); await second.initialize()
  const restored = second.tasks.tasks.find(item => item.id === task.id)
  assert.equal(restored.title, 'Оновлена назва завдання')
  assert.equal(restored.description, 'Новий опис')
  assert.equal(restored.status, 'done'); assert.equal(restored.priority, 'low')
  assert.equal(restored.projectId, project.id)
  assert.ok(!second.tasks.tasks.some(item => item.id === 1))
  assert.equal(second.projects.projectTitle(project.id), 'Лабораторні')
  const next = second.projects.addProject('Другий проєкт')
  assert.notEqual(next.id, project.id)
  assert.equal(second.tasks.totalTasks, 10); assert.equal(second.tasks.completedTasks, 4)
  await second.waitForIdle(); second.dispose()
})

test('14–16: фільтри не записуються; порожній список не відновлює демонстраційні записи', async () => {
  const io = memoryDatabase(); const first = session(io); await first.initialize()
  first.tasks.searchText = 'тест'; first.tasks.selectedProject = 'study'
  first.tasks.sortOrder = 'title'; first.tasks.onlyIncomplete = true
  first.tasks.withoutDueDate = true
  await first.waitForIdle()
  assert.equal(io.writes.length, 1); assert.equal(first.state.status, 'saved')
  for (const task of [...first.tasks.tasks]) first.tasks.deleteTask(task.id)
  await first.waitForIdle(); assert.equal(io.stored.tasks.length, 0)
  first.dispose()
  const second = session(io); await second.initialize()
  assert.equal(second.tasks.totalTasks, 0); assert.equal(io.writes.length, 2)
  assert.equal(second.tasks.searchText, ''); assert.equal(second.tasks.selectedProject, 'all')
  assert.equal(second.tasks.sortOrder, 'newest'); assert.equal(second.tasks.onlyIncomplete, false)
  assert.equal(second.tasks.withoutDueDate, false)
  second.dispose()
})

test('Помилка запису: зміни залишаються в пам’яті й повторна спроба їх зберігає', async () => {
  const io = memoryDatabase(); const current = session(io); await current.initialize()
  const lastSavedAt = current.state.lastSavedAt
  io.failWrite = true; current.tasks.addTask(taskData())
  assert.equal(await current.waitForIdle(), false)
  assert.equal(current.state.status, 'error'); assert.equal(current.state.canRetry, true)
  assert.equal(current.tasks.totalTasks, 11); assert.equal(io.stored.tasks.length, 10)
  assert.equal(current.state.lastSavedAt, lastSavedAt)
  io.failWrite = false; current.retry(); await current.waitForIdle()
  assert.equal(current.state.status, 'saved'); assert.equal(current.state.canRetry, false)
  assert.equal(io.stored.tasks.length, 11)
  current.dispose()
})

test('Невдале читання або некоректна база ніколи не перезаписуються початковими даними', async () => {
  for (const corrupt of [false, true]) {
    const io = memoryDatabase(corrupt ? { initialized: true, tasks: [], projects: [] } : { initialized: true })
    io.failRead = !corrupt
    const current = session(io)
    assert.equal(await current.initialize(), false)
    assert.equal(current.state.status, 'error'); assert.equal(current.state.canRetry, false)
    current.tasks.addTask(taskData()); current.retry(); await current.waitForIdle()
    assert.equal(io.writes.length, 0)
    current.dispose()
  }
})

test('Черга: синхронні зміни об’єднуються, а зміни під час запису виконуються послідовно', async () => {
  const io = memoryDatabase(); const current = session(io); await current.initialize()
  let release
  io.holdWrite = new Promise(resolve => { release = resolve })
  current.tasks.addTask(taskData())
  current.projects.addProject('Проєкт для черги')
  await Promise.resolve()
  assert.equal(current.state.status, 'saving')
  const task = current.tasks.tasks.at(-1)
  current.tasks.setTaskStatus({ id: task.id, status: 'done' })
  await Promise.resolve()
  release(); await current.waitForIdle()
  assert.equal(io.writes.length, 3)
  assert.equal(io.stored.tasks.at(-1).status, 'done')
  assert.equal(io.stored.projects.length, 4)
  assert.equal(current.state.status, 'saved')
  current.dispose()
})

test('Лічильник project-N відновлюється навіть за пошкодженої metadata.nextProjectId', async () => {
  const io = memoryDatabase(); const first = session(io); await first.initialize()
  first.projects.addProject('Лабораторні'); await first.waitForIdle(); first.dispose()
  io.stored.nextProjectId = -100
  const second = session(io); await second.initialize()
  assert.equal(second.projects.addProject('Інший проєкт').id, 'project-2')
  await second.waitForIdle(); second.dispose()
})

test('JSON: експорт, валідація всіх полів, унікальні IDs, історичні дати та імпорт', async () => {
  const io = memoryDatabase(); const current = session(io); await current.initialize()
  const data = current.snapshot()
  const exported = JSON.parse(createExport(data))
  assert.ok(exported.exportedAt); assert.equal(exported.tasks.length, 10)
  for (const invalid of [null, {}, { ...data, tasks: [...data.tasks, data.tasks[0]] },
    { ...data, projects: [...data.projects, data.projects[0]] },
    { ...data, tasks: [{ ...data.tasks[0], id: '1' }] },
    { ...data, tasks: [{ ...data.tasks[0], projectId: 'missing' }] },
    { ...data, tasks: [{ ...data.tasks[0], status: 'invalid' }] },
    { ...data, tasks: [{ ...data.tasks[0], dueDate: '2026-02-30' }] },
    { ...data, tasks: [{ ...data.tasks[0], description: 15 }] }]) {
    assert.throws(() => validateSnapshot(invalid))
  }
  assert.throws(() => parseImport('{'))
  assert.throws(() => parseImport(JSON.stringify({ ...data, version: 999 })))
  assert.equal(parseImport(JSON.stringify(data)).tasks[0].dueDate, data.tasks[0].dueDate)
  current.replaceSnapshot({ ...data, tasks: [] })
  await current.waitForIdle(); assert.equal(io.stored.tasks.length, 0)
  current.replaceSnapshot(parseImport(JSON.stringify(exported)))
  await current.waitForIdle(); assert.equal(io.stored.tasks.length, 10)
  current.dispose()
})

let nativeEmulator = false
try { await import('fake-indexeddb/auto'); nativeEmulator = true } catch (error) {
  if (error.code !== 'ERR_MODULE_NOT_FOUND') throw error
}

test('IndexedDB: справжній idb, схема, атомарність, delete, counts і metadata', { skip: nativeEmulator ? false : 'Встановіть fake-indexeddb для інтеграційної перевірки IndexedDB.' }, async () => {
  await database.closeDatabase()
  const io = memoryDatabase(); const current = session(io); await current.initialize()
  const data = current.snapshot()
  await database.writeSnapshot(data)
  const db = await database.getDatabase()
  assert.deepEqual([...db.objectStoreNames], ['metadata','projects','tasks'])
  let restored = await database.readSnapshot()
  assert.equal(restored.initialized, true); assert.equal(restored.tasks.length, 10)
  assert.ok(restored.lastSavedAt)
  const stats = await database.getDatabaseStats()
  assert.equal(stats.taskCount, 10); assert.equal(stats.projectCount, 3)
  await assert.rejects(database.writeSnapshot({ ...data, tasks: [{...data.tasks[0], id: undefined }] }))
  restored = await database.readSnapshot()
  assert.equal(restored.tasks.length, 10)
  await database.deleteRecord('tasks',1)
  assert.equal((await database.getDatabaseStats()).taskCount, 9)
  await database.writeSnapshot({...data,tasks:[]})
  restored = await database.readSnapshot()
  assert.equal(restored.tasks.length,0);assert.equal(restored.initialized,true)
  await database.closeDatabase();current.dispose()
})
