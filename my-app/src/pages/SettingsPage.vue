<script setup>
import { onMounted, ref } from 'vue'
import AppTabbar from '../components/AppTabbar.vue'
import { getDatabaseStats } from '../services/database.js'
import { waitForPersistence } from '../services/persistence.js'
import '../css/task-components.css'
import '../css/task-list.css'
import '../css/persistence.css'

const stats = ref(null)
const loading = ref(false)
const error = ref('')
async function refresh() {
  loading.value = true; error.value = ''
  try {
    await waitForPersistence()
    stats.value = await getDatabaseStats()
  } catch { error.value = 'Не вдалося прочитати локальну базу. Перевірте доступ до сховища браузера.' }
  finally { loading.value = false }
}
onMounted(refresh)
</script>
<template>
  <f7-page name="settings" class="tf3-page">
    <f7-navbar title="Налаштування" back-link="Назад" />
    <div class="tf3-container">
      <section class="tf3-hero"><h1>Локальні дані</h1>
        <p>Дані зберігаються в цьому браузері для поточної адреси сайту.</p>
      </section>
      <p v-if="error" class="tf5-error" role="alert">{{ error }}</p>
      <p v-if="loading" role="status">Читання бази даних…</p>
      <div v-if="stats" class="tf7-settings-grid">
        <div class="tf7-settings-item"><span>Збережено завдань</span><strong>{{ stats.taskCount }}</strong></div>
        <div class="tf7-settings-item"><span>Збережено проєктів</span><strong>{{ stats.projectCount }}</strong></div>
      </div>
      <p v-if="stats" class="tf4-hint">Останній запис: {{ stats.lastSavedAt ? new Date(stats.lastSavedAt).toLocaleString('uk-UA') : 'Ще не записано' }}.</p>
      <button class="tf5-btn" type="button" :disabled="loading" @click="refresh">Оновити дані</button>
      <section class="tf5-panel"><h2>Резервні копії</h2>
        <p>Експортуйте JSON у вкладці «Завдання», щоб мати копію поза цим браузером.</p>
        <p>Очищення даних сайту видаляє локальну базу. Інший браузер або адреса сайту мають окреме сховище.</p>
        <f7-link href="/tasks/">До завдань</f7-link>
      </section>
    </div>
    <AppTabbar active="settings" />
  </f7-page>
</template>
