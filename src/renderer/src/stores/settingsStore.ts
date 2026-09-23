import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export interface EditorSettings {
  theme: string
  fontSize: number
  fontFamily: string
  tabSize: number
  wordWrap: 'on' | 'off'
  minimap: boolean
  lineNumbers: 'on' | 'off' | 'relative'
  cursorBlinking: 'blink' | 'smooth' | 'phase' | 'solid'
}

export interface AISettings {
  baseUrl: string
  apiKey: string
  defaultModel: string
  temperature: number
  autoIncludeActiveFile: boolean
  streamThoughts: boolean
  maxHistoryMessages: number
}

const DEFAULT_EDITOR_SETTINGS: EditorSettings = {
  theme: 'makarya-dark',
  fontSize: 13,
  fontFamily: "'Fira Code', 'JetBrains Mono', Consolas, 'Courier New', monospace",
  tabSize: 2,
  wordWrap: 'on',
  minimap: true,
  lineNumbers: 'on',
  cursorBlinking: 'smooth'
}

const DEFAULT_AI_SETTINGS: AISettings = {
  baseUrl: '',
  apiKey: '',
  defaultModel: '',
  temperature: 0.4,
  autoIncludeActiveFile: true,
  streamThoughts: true,
  maxHistoryMessages: 10
}

export const useSettingsStore = defineStore('settingsStore', () => {
  // Load saved editor settings or fallback
  const savedEditor = localStorage.getItem('makarya_editor_settings')
  const editor = ref<EditorSettings>(
    savedEditor ? { ...DEFAULT_EDITOR_SETTINGS, ...JSON.parse(savedEditor) } : { ...DEFAULT_EDITOR_SETTINGS }
  )

  // Load saved AI settings or fallback
  const savedAI = localStorage.getItem('makarya_ai_settings')
  const ai = ref<AISettings>(
    savedAI ? { ...DEFAULT_AI_SETTINGS, ...JSON.parse(savedAI) } : { ...DEFAULT_AI_SETTINGS }
  )

  const isSettingsModalOpen = ref<boolean>(false)
  const activeTab = ref<'appearance' | 'ai'>('appearance')

  // Auto-persist on change to both localStorage (for instant boot) and SQLite (permanent)
  watch(
    editor,
    (val) => {
      const str = JSON.stringify(val)
      try {
        localStorage.setItem('makarya_editor_settings', str)
      } catch (err) {
        console.warn('Gagal menyimpan editor settings ke localStorage:', err)
      }
      if (window.makaryaAPI?.dbSetSetting) {
        window.makaryaAPI.dbSetSetting('makarya_editor_settings', str).catch?.((err) => {
          console.warn('Gagal menyimpan editor settings ke SQLite:', err)
        })
      }
    },
    { deep: true }
  )

  watch(
    ai,
    (val) => {
      const str = JSON.stringify(val)
      try {
        localStorage.setItem('makarya_ai_settings', str)
      } catch (err) {
        console.warn('Gagal menyimpan AI settings ke localStorage:', err)
      }
      if (window.makaryaAPI?.dbSetSetting) {
        window.makaryaAPI.dbSetSetting('makarya_ai_settings', str).catch?.((err) => {
          console.warn('Gagal menyimpan AI settings ke SQLite:', err)
        })
      }
      if (window.makaryaAPI?.updateAiConfig) {
        window.makaryaAPI.updateAiConfig({
          baseUrl: val.baseUrl,
          apiKey: val.apiKey
        }).catch?.((err) => {
          console.warn('Gagal mengupdate konfigurasi AI ke backend:', err)
        })
      }
    },
    { deep: true }
  )

  async function loadSettingsFromDb(): Promise<void> {
    if (!window.makaryaAPI?.dbGetSetting) return
    try {
      const editorStr = await window.makaryaAPI.dbGetSetting('makarya_editor_settings')
      if (editorStr) {
        try {
          const parsed = JSON.parse(editorStr)
          editor.value = { ...DEFAULT_EDITOR_SETTINGS, ...parsed }
          localStorage.setItem('makarya_editor_settings', JSON.stringify(editor.value))
        } catch {}
      }

      const aiStr = await window.makaryaAPI.dbGetSetting('makarya_ai_settings')
      if (aiStr) {
        try {
          const parsed = JSON.parse(aiStr)
          ai.value = { ...DEFAULT_AI_SETTINGS, ...parsed }
          localStorage.setItem('makarya_ai_settings', JSON.stringify(ai.value))
        } catch {}
      } else {
        // Auto-seed untuk instance lokal saat ini jika belum ada data di database
        if (!ai.value.baseUrl && !ai.value.apiKey) {
          ai.value.baseUrl = 'http://127.0.0.1:20128/v1'
          ai.value.apiKey = 'sk-45b3e552022dad0c-2i6fs2-08e23a79'
        }
      }

      // Sync ke backend main process
      if (window.makaryaAPI?.updateAiConfig) {
        await window.makaryaAPI.updateAiConfig({
          baseUrl: ai.value.baseUrl,
          apiKey: ai.value.apiKey
        }).catch?.(() => {})
      }
    } catch (err) {
      console.warn('Gagal memuat pengaturan dari database SQLite:', err)
    }
  }

  // Load from SQLite on store creation if makaryaAPI is ready
  if (typeof window !== 'undefined' && window.makaryaAPI?.dbGetSetting) {
    loadSettingsFromDb().catch?.(() => {})
  }

  function openSettings(tab: 'appearance' | 'ai' = 'appearance'): void {
    loadSettingsFromDb().catch?.(() => {})
    activeTab.value = tab
    isSettingsModalOpen.value = true
  }

  function closeSettings(): void {
    isSettingsModalOpen.value = false
  }

  function resetToDefaults(): void {
    editor.value = { ...DEFAULT_EDITOR_SETTINGS }
    ai.value = { ...DEFAULT_AI_SETTINGS }
  }

  return {
    editor,
    ai,
    isSettingsModalOpen,
    activeTab,
    loadSettingsFromDb,
    openSettings,
    closeSettings,
    resetToDefaults
  }
})
