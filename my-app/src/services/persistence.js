import { reactive } from 'vue'
import { useTasksStore } from '../store/tasks.js'
import { useProjectsStore } from '../store/projects.js'
import * as database from './database.js'
import { validateSnapshot } from './snapshot.js'

export const persistenceState = reactive({ status: 'loading', error: '', canRetry: false, lastSavedAt: null })

// Окремий контролер на сеанс дозволяє ізолювати відновлення та чергу запису.
export function createPersistenceController(pinia, io = database, state = reactive({ status: 'loading', error: '', canRetry: false, lastSavedAt: null })) {
  const tasks = useTasksStore(pinia)
  const projects = useProjectsStore(pinia)
  let enabled = false
  let disposed = false
  let saving = null
  let scheduled = false
  let revision = 0
  let savedRevision = 0
  let fingerprint = ''
  const unsubscribe = []
  const snapshot = () => JSON.parse(JSON.stringify({ tasks: tasks.tasks, projects: projects.projects, nextProjectId: projects.nextProjectId }))

  async function flush() {
    if (!enabled || disposed) return false
    if (saving) return saving
    saving = (async () => {
      try {
        while (savedRevision < revision) {
          const targetRevision = revision
          const data = snapshot()
          state.lastSavedAt = await io.writeSnapshot(data)
          savedRevision = targetRevision
        }
        state.status = 'saved'; state.error = ''; state.canRetry = false
        return true
      } catch {
        state.status = 'error'
        state.error = 'Не вдалося зберегти зміни. Вони залишилися лише в пам’яті. Повторіть збереження.'
        state.canRetry = true
        return false
      } finally { saving = null }
    })()
    return saving
  }
  function requestSave(force = false) {
    if (!enabled || disposed) return
    const current = JSON.stringify(snapshot())
    if (!force && current === fingerprint) return
    fingerprint = current
    revision += 1
    state.status = 'saving'; state.error = ''; state.canRetry = false
    void flush()
  }
  function onChanged() {
    if (scheduled || disposed) return
    scheduled = true
    queueMicrotask(() => { scheduled = false; requestSave() })
  }
  async function initialize() {
    state.status = 'loading'; state.error = ''; state.canRetry = false
    try {
      const stored = await io.readSnapshot()
      if (stored.initialized) {
        // Перевіряємо весь знімок до обох patch: не відновлюємо лише половину даних.
        const data = validateSnapshot(stored)
        projects.$patch({ projects: data.projects, nextProjectId: data.nextProjectId })
        tasks.$patch({ tasks: data.tasks })
        state.lastSavedAt = stored.lastSavedAt ?? null
      } else {
        state.lastSavedAt = await io.writeSnapshot(snapshot())
      }
      fingerprint = JSON.stringify(snapshot())
      enabled = true
      unsubscribe.push(tasks.$subscribe(onChanged, { detached: true, flush: 'sync' }),
        projects.$subscribe(onChanged, { detached: true, flush: 'sync' }))
      state.status = 'saved'
      return true
    } catch {
      enabled = false
      state.status = 'error'; state.canRetry = false
      state.error = 'Не вдалося відкрити або відновити локальні дані. Працює тимчасовий стан; наявну базу не перезаписано.'
      return false
    }
  }
  function retry() {
    if (enabled && state.status === 'error') requestSave(true)
  }
  async function waitForIdle() {
    // Даємо підпискам об’єднати синхронні зміни в одну мікрозадачу.
    await Promise.resolve()
    if (saving) await saving
    return state.status === 'saved'
  }
  function replaceSnapshot(data) {
    if (!enabled || disposed) throw new Error('Імпорт недоступний, поки локальна база не відновлена.')
    const normalized = validateSnapshot(data)
    projects.$patch({ projects: normalized.projects, nextProjectId: normalized.nextProjectId })
    tasks.$patch({ tasks: normalized.tasks })
    tasks.resetFilters()
  }
  function dispose() { disposed = true; unsubscribe.forEach(stop => stop()) }
  return { state, initialize, retry, waitForIdle, snapshot, replaceSnapshot, dispose }
}

let controller = null
export async function initializePersistence(pinia) {
  controller?.dispose()
  controller = createPersistenceController(pinia, database, persistenceState)
  return controller.initialize()
}
export function retrySave() { controller?.retry() }
export function waitForPersistence() { return controller?.waitForIdle() ?? Promise.resolve(false) }
export function importSnapshot(data) {
  if (!controller) throw new Error('Локальне сховище ще не підключено.')
  controller.replaceSnapshot(data)
}
