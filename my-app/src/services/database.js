import { openDB } from 'idb'

export const DB_NAME = 'taskflow-db'
export const DB_VERSION = 1
let databasePromise = null

export function getDatabase() {
  if (typeof indexedDB === 'undefined') return Promise.reject(new Error('Цей браузер не підтримує IndexedDB.'))
  if (!databasePromise) {
    databasePromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('tasks')) db.createObjectStore('tasks', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('projects')) db.createObjectStore('projects', { keyPath: 'id' })
        if (!db.objectStoreNames.contains('metadata')) db.createObjectStore('metadata')
      },
      blocking() { void closeDatabase() },
      terminated() { databasePromise = null },
    }).catch(error => { databasePromise = null; throw error })
  }
  return databasePromise
}

export async function closeDatabase() {
  const pending = databasePromise
  databasePromise = null
  if (pending) (await pending).close()
}

export async function readSnapshot() {
  const db = await getDatabase()
  const tx = db.transaction(['tasks', 'projects', 'metadata'], 'readonly')
  const [tasks, projects, initialized, nextProjectId, lastSavedAt] = await Promise.all([
    tx.objectStore('tasks').getAll(), tx.objectStore('projects').getAll(),
    tx.objectStore('metadata').get('initialized'), tx.objectStore('metadata').get('nextProjectId'),
    tx.objectStore('metadata').get('lastSavedAt'), tx.done,
  ])
  return { tasks, projects, initialized: initialized === true, nextProjectId, lastSavedAt: lastSavedAt ?? null }
}

export async function writeSnapshot(snapshot) {
  const db = await getDatabase()
  const tx = db.transaction(['tasks', 'projects', 'metadata'], 'readwrite')
  const lastSavedAt = new Date().toISOString()
  const requests = []
  try {
    const tasks = tx.objectStore('tasks')
    const projects = tx.objectStore('projects')
    const metadata = tx.objectStore('metadata')
    // Усі запити ставимо в одну транзакцію без сторонніх await.
    requests.push(tasks.clear(), projects.clear())
    for (const task of snapshot.tasks) requests.push(tasks.put(task))
    for (const project of snapshot.projects) requests.push(projects.put(project))
    requests.push(metadata.put(true, 'initialized'), metadata.put(snapshot.nextProjectId, 'nextProjectId'),
      metadata.put(lastSavedAt, 'lastSavedAt'))
    await Promise.all([...requests, tx.done])
    return lastSavedAt
  } catch (error) {
    try { tx.abort() } catch { /* Транзакція вже могла відкотитися. */ }
    await Promise.allSettled([...requests, tx.done])
    throw error
  }
}

export async function getDatabaseStats() {
  const db = await getDatabase()
  const tx = db.transaction(['tasks', 'projects', 'metadata'], 'readonly')
  const [taskCount, projectCount, lastSavedAt, initialized] = await Promise.all([
    tx.objectStore('tasks').count(), tx.objectStore('projects').count(),
    tx.objectStore('metadata').get('lastSavedAt'), tx.objectStore('metadata').get('initialized'), tx.done,
  ])
  return { taskCount, projectCount, lastSavedAt: lastSavedAt ?? null, initialized: initialized === true }
}

// Точкова операція для порівняння зі snapshot-підходом; CRUD у UI зберігає цілісний знімок.
export async function deleteRecord(storeName, id) {
  if (!['tasks', 'projects'].includes(storeName)) throw new Error('Неприпустиме сховище для видалення.')
  const db = await getDatabase()
  const tx = db.transaction(storeName, 'readwrite')
  await Promise.all([tx.store.delete(id), tx.done])
}
