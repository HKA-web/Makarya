import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'

import './assets/main.css'
import 'primeicons/primeicons.css'
import App from './App.vue'

// Setup Monaco Editor Web Workers per monaco.md guide
import editorWorker from 'monaco-editor/esm/vs/editor/editor.worker?worker'
import jsonWorker from 'monaco-editor/esm/vs/language/json/json.worker?worker'
import cssWorker from 'monaco-editor/esm/vs/language/css/css.worker?worker'
import htmlWorker from 'monaco-editor/esm/vs/language/html/html.worker?worker'
import tsWorker from 'monaco-editor/esm/vs/language/typescript/ts.worker?worker'

self.MonacoEnvironment = {
  getWorker(_: unknown, workerLabel: string): Worker {
    if (workerLabel === 'json') return new jsonWorker()
    if (workerLabel === 'css' || workerLabel === 'scss' || workerLabel === 'less') return new cssWorker()
    if (workerLabel === 'html' || workerLabel === 'handlebars' || workerLabel === 'razor') return new htmlWorker()
    if (workerLabel === 'typescript' || workerLabel === 'javascript') return new tsWorker()
    return new editorWorker()
  }
}

const application = createApp(App)

application.use(createPinia())
application.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.dark-mode'
    }
  }
})
application.use(ToastService)
application.use(ConfirmationService)

application.mount('#app')
