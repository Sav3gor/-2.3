import { defineStore } from 'pinia'
import { useTasksStore } from './tasks.js'

export const useProjectsStore = defineStore('projects', {
  state: () => ({
    projects: [
      { id: 'general', title: 'Загальні' },
      { id: 'study', title: 'Навчання' },
      { id: 'personal', title: 'Особисті' },
    ],
    nextProjectId: 1,
  }),
  getters: {
    projectCount: state => state.projects.length,
    projectTitle: state => id => state.projects.find(project => project.id === id)?.title ?? 'Загальні',
    projectStats(state) {
      const tasks = useTasksStore().tasks
      return state.projects.map(project => {
        const projectTasks = tasks.filter(task => task.projectId === project.id)
        const completed = projectTasks.filter(task => task.status === 'done').length
        return { ...project, total: projectTasks.length, completed,
          incomplete: projectTasks.length - completed,
          completionPercent: projectTasks.length ? Math.round(completed / projectTasks.length * 100) : 0,
        }
      })
    },
  },
  actions: {
    addProject(rawTitle) {
      if (typeof rawTitle !== 'string') return null
      const title = rawTitle.trim()
      if (title.length < 3 || title.length > 40 || this.projects.some(project =>
        project.title.toLocaleLowerCase('uk-UA') === title.toLocaleLowerCase('uk-UA'))) return null
      const project = { id: `project-${this.nextProjectId++}`, title }
      this.projects.push(project)
      return project
    },
  },
})
