import { defineStore } from 'pinia'
import initialTasks from '../data/tasks.js'
import { statusLabels, priorityLabels, validateTask } from '../utils/task-validation.js'
import { useProjectsStore } from './projects.js'

function normalizeTaskData(data, originalTask, tasks, projects) {
  if (!data || typeof data !== 'object') return null
  const requestedProject = data.projectId ?? originalTask?.projectId ?? 'general'
  const candidate = { ...data, dueDate: data.dueDate ?? '',
    category: data.category ?? originalTask?.category ?? 'study',
    projectId: projects.some(project => project.id === requestedProject) ? requestedProject : 'general',
  }
  if (Object.keys(validateTask(candidate, { originalTask, tasks })).length) return null
  return {
    title: candidate.title.trim(),
    description: typeof candidate.description === 'string' ? candidate.description.trim() : '',
    status: candidate.status,
    priority: candidate.priority,
    category: candidate.category,
    dueDate: candidate.dueDate,
    projectId: candidate.projectId,
  }
}

export const useTasksStore = defineStore('tasks', {
  state: () => ({
    tasks: initialTasks.map(task => ({ ...task, category: task.category ?? 'study', projectId: task.projectId ?? 'general' })),
    searchText: '', selectedStatus: 'all', selectedPriority: 'all', selectedProject: 'all',
    sortOrder: 'newest', onlyIncomplete: false, withoutDueDate: false,
  }),
  getters: {
    totalTasks: state => state.tasks.length,
    completedTasks: state => state.tasks.filter(task => task.status === 'done').length,
    progressTasks: state => state.tasks.filter(task => task.status === 'progress').length,
    plannedTasks: state => state.tasks.filter(task => task.status === 'todo').length,
    completionPercent() { return this.totalTasks ? Math.round(this.completedTasks / this.totalTasks * 100) : 0 },
    activeTasks: state => {
      const rank = { high: 0, medium: 1, low: 2 }
      return state.tasks.filter(task => task.status !== 'done')
        .sort((a, b) => rank[a.priority] - rank[b.priority] || b.id - a.id).slice(0, 3)
    },
    visibleTasks: state => {
      const term = state.searchText.trim().toLocaleLowerCase('uk-UA')
      const result = state.tasks.filter(task => (
        (state.selectedStatus === 'all' || task.status === state.selectedStatus) &&
        (state.selectedPriority === 'all' || task.priority === state.selectedPriority) &&
        (state.selectedProject === 'all' || task.projectId === state.selectedProject) &&
        (!state.withoutDueDate || !task.dueDate) &&
        (!state.onlyIncomplete || task.status !== 'done') &&
        `${task.title} ${task.description ?? ''}`.toLocaleLowerCase('uk-UA').includes(term)
      ))
      const priorities = { high: 0, medium: 1, low: 2 }
      const statuses = { progress: 0, todo: 1, done: 2 }
      // filter() повертає окремий масив; порядок у спільному сховищі не змінюється.
      return result.sort((a, b) => {
        if (state.sortOrder === 'title') return a.title.localeCompare(b.title, 'uk-UA') || a.id - b.id
        if (state.sortOrder === 'priority') return priorities[a.priority] - priorities[b.priority] || b.id - a.id
        if (state.sortOrder === 'priorityLow') return priorities[b.priority] - priorities[a.priority] || b.id - a.id
        if (state.sortOrder === 'status') return statuses[a.status] - statuses[b.status] || b.id - a.id
        if (state.sortOrder === 'oldest') return a.id - b.id
        if (state.sortOrder === 'dueDate' || state.sortOrder === 'dueDateDesc') {
          if (!a.dueDate && !b.dueDate) return b.id - a.id
          if (!a.dueDate) return 1
          if (!b.dueDate) return -1
          return a.dueDate.localeCompare(b.dueDate) * (state.sortOrder === 'dueDate' ? 1 : -1) || b.id - a.id
        }
        return b.id - a.id
      })
    },
    visibleCompletionPercent() {
      return this.visibleTasks.length
        ? Math.round(this.visibleTasks.filter(task => task.status === 'done').length / this.visibleTasks.length * 100) : 0
    },
  },
  actions: {
    addTask(data) {
      const normalized = normalizeTaskData(data, null, this.tasks, useProjectsStore().projects)
      if (!normalized) return null
      const nextId = this.tasks.reduce((maxId, task) => Math.max(maxId, task.id), 0) + 1
      const newTask = { id: nextId, ...normalized }
      this.tasks.push(newTask)
      return newTask
    },

    updateTask(data) {
      if (!data || typeof data !== 'object') return null
      const task = this.tasks.find(item => item.id === Number(data.id))
      if (!task) return null
      const normalized = normalizeTaskData(data, task, this.tasks, useProjectsStore().projects)
      if (!normalized) return null
      Object.assign(task, normalized)
      return task
    },

    setTaskStatus({ id, status }) {
      if (!Object.hasOwn(statusLabels, status)) return false
      const task = this.tasks.find(item => item.id === Number(id))
      if (!task) return false
      task.status = status
      return true
    },

    setTaskPriority({ id, priority }) {
      if (!Object.hasOwn(priorityLabels, priority)) return false
      const task = this.tasks.find(item => item.id === Number(id))
      if (!task) return false
      task.priority = priority
      return true
    },

    deleteTask(id) {
      const index = this.tasks.findIndex(task => task.id === Number(id))
      if (index === -1) return false
      this.tasks.splice(index, 1)
      return true
    },
    resetFilters() {
      this.searchText = ''
      this.selectedStatus = 'all'
      this.selectedPriority = 'all'
      this.selectedProject = 'all'
      this.sortOrder = 'newest'
      this.onlyIncomplete = false
      this.withoutDueDate = false
    },
    startCurrentProjectTasks() {
      if (this.selectedProject === 'all' || !useProjectsStore().projects.some(project => project.id === this.selectedProject)) return 0
      let changed = 0
      for (const task of this.tasks) {
        if (task.projectId === this.selectedProject && task.status !== 'progress') {
          task.status = 'progress'
          changed += 1
        }
      }
      return changed
    },
  },
})
