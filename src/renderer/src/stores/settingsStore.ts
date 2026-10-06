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

export type AutoExecutionPolicy = 'always_proceed' | 'ask_before' | 'never'
export type ReviewPolicy = 'request_review' | 'auto_apply' | 'always_ask'

export interface AISettings {
  baseUrl: string
  apiKey: string
  defaultModel: string
  temperature: number
  autoIncludeActiveFile: boolean
  streamThoughts: boolean
  maxHistoryMessages: number
  autoExecution: AutoExecutionPolicy
  reviewPolicy: ReviewPolicy
}

export interface GeneralSettings {
  timezone: string // 'Asia/Jakarta' | 'Asia/Makassar' | 'Asia/Jayapura' | 'auto' | 'UTC' | etc.
  timeFormat: '24h' | '12h'
  dateFormat: 'DD/MM/YYYY' | 'YYYY-MM-DD' | 'MM/DD/YYYY'
}

export const TIMEZONE_OPTIONS = [
  { id: 'Asia/Jakarta', label: 'WIB - Waktu Indonesia Barat (Jakarta, UTC+7)', offset: 'UTC+7' },
  { id: 'Asia/Makassar', label: 'WITA - Waktu Indonesia Tengah (Makassar, Bali, UTC+8)', offset: 'UTC+8' },
  { id: 'Asia/Jayapura', label: 'WIT - Waktu Indonesia Timur (Jayapura, Maluku, UTC+9)', offset: 'UTC+9' },
  { id: 'auto', label: 'Otomatis (Sesuai Waktu Sistem Lokal)', offset: 'Auto' },
  { id: 'UTC', label: 'UTC - Coordinated Universal Time', offset: 'UTC+0' },
  { id: 'Asia/Singapore', label: 'SGT - Singapore / Kuala Lumpur (UTC+8)', offset: 'UTC+8' },
  { id: 'Asia/Bangkok', label: 'ICT - Bangkok / Hanoi (UTC+7)', offset: 'UTC+7' },
  { id: 'Asia/Tokyo', label: 'JST - Tokyo / Osaka (UTC+9)', offset: 'UTC+9' },
  { id: 'Europe/London', label: 'GMT/BST - London (UTC+0/+1)', offset: 'UTC+0' },
  { id: 'America/New_York', label: 'EST/EDT - New York (UTC-5/-4)', offset: 'UTC-5' },
  { id: 'America/Los_Angeles', label: 'PST/PDT - Los Angeles (UTC-8/-7)', offset: 'UTC-8' }
]

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
  maxHistoryMessages: 10,
  autoExecution: 'ask_before', // Safe default: selalu minta konfirmasi sebelum menjalankan perintah terminal
  reviewPolicy: 'request_review'
}

const DEFAULT_GENERAL_SETTINGS: GeneralSettings = {
  timezone: 'Asia/Jakarta', // Default WIB (Waktu Indonesia Barat UTC+7)
  timeFormat: '24h',
  dateFormat: 'DD/MM/YYYY'
}

/**
 * Parsing waktu aman yang menangani string SQLite (CURRENT_TIMESTAMP) UTC tanpa timezone
 */
export function parseDateSafe(dateInput: Date | string | number | null | undefined): Date | null {
  if (!dateInput) return null
  if (dateInput instanceof Date) return isNaN(dateInput.getTime()) ? null : dateInput
  if (typeof dateInput === 'number') {
    const d = new Date(dateInput)
    return isNaN(d.getTime()) ? null : d
  }
  if (typeof dateInput === 'string') {
    let s = dateInput.trim()
    if (!s) return null
    // Format SQLite CURRENT_TIMESTAMP: "YYYY-MM-DD HH:MM:SS" -> treat as UTC
    if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}/.test(s)) {
      s = s.replace(' ', 'T') + 'Z'
    }
    const d = new Date(s)
    return isNaN(d.getTime()) ? null : d
  }
  return null
}

/**
 * Format jam dan menit sesuai konfigurasi timezone dan format 24h/12h
 */
export function formatTimeWithConfig(
  dateInput: Date | string | number | null | undefined,
  timezone = 'Asia/Jakarta',
  timeFormat: '24h' | '12h' = '24h'
): string {
  const date = parseDateSafe(dateInput)
  if (!date) return ''
  try {
    const resolvedTz = timezone === 'auto' || !timezone ? undefined : timezone
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: resolvedTz,
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === '12h'
    }).format(date)
  } catch {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  }
}

/**
 * Format tanggal dan jam lengkap sesuai konfigurasi timezone
 */
export function formatDateTimeWithConfig(
  dateInput: Date | string | number | null | undefined,
  timezone = 'Asia/Jakarta',
  timeFormat: '24h' | '12h' = '24h'
): string {
  const date = parseDateSafe(dateInput)
  if (!date) return ''
  try {
    const resolvedTz = timezone === 'auto' || !timezone ? undefined : timezone
    return new Intl.DateTimeFormat('id-ID', {
      timeZone: resolvedTz,
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: timeFormat === '12h'
    }).format(date)
  } catch {
    return date.toLocaleString()
  }
}

export const useSettingsStore = defineStore('settingsStore', () => {
  // Load saved general settings or fallback
  const savedGeneral = localStorage.getItem('makarya_general_settings')
  const general = ref<GeneralSettings>(
    savedGeneral ? { ...DEFAULT_GENERAL_SETTINGS, ...JSON.parse(savedGeneral) } : { ...DEFAULT_GENERAL_SETTINGS }
  )

  // Load saved editor settings or fallback
  const savedEditor = localStorage.getItem('makarya_editor_settings')
  const editor = ref<EditorSettings>(
    savedEditor ? { ...DEFAULT_EDITOR_SETTINGS, ...JSON.parse(savedEditor) } : { ...DEFAULT_EDITOR_SETTINGS }
  )

  // Load saved AI settings or fallback
  const savedAI = localStorage.getItem('makarya_ai_settings')
  const savedAutoExecution = (localStorage.getItem('makarya_auto_execution') as AutoExecutionPolicy) || 'ask_before'
  const parsedAI = savedAI ? JSON.parse(savedAI) : {}
  const ai = ref<AISettings>({
    ...DEFAULT_AI_SETTINGS,
    ...parsedAI,
    autoExecution: parsedAI.autoExecution || savedAutoExecution || 'ask_before'
  })

  const isSettingsModalOpen = ref<boolean>(false)
  const activeTab = ref<'appearance' | 'general' | 'ai'>('appearance')

  // Helper untuk memformat timestamp menggunakan preferensi saat ini
  function formatTimestamp(dateInput?: Date | string | number | null): string {
    if (!dateInput) return ''
    return formatTimeWithConfig(dateInput, general.value.timezone, general.value.timeFormat)
  }

  function formatDateTime(dateInput?: Date | string | number | null): string {
    if (!dateInput) return ''
    return formatDateTimeWithConfig(dateInput, general.value.timezone, general.value.timeFormat)
  }

  // Auto-persist general settings
  watch(
    general,
    (val) => {
      const str = JSON.stringify(val)
      try {
        localStorage.setItem('makarya_general_settings', str)
      } catch (err) {
        console.warn('Gagal menyimpan general settings ke localStorage:', err)
      }
      if (window.makaryaAPI?.dbSetSetting) {
        window.makaryaAPI.dbSetSetting('makarya_general_settings', str).catch?.((err) => {
          console.warn('Gagal menyimpan general settings ke SQLite:', err)
        })
      }
    },
    { deep: true }
  )

  // Auto-persist editor settings
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

  // Auto-persist AI settings
  watch(
    ai,
    (val) => {
      const str = JSON.stringify(val)
      try {
        localStorage.setItem('makarya_ai_settings', str)
        if (val.autoExecution) {
          localStorage.setItem('makarya_auto_execution', val.autoExecution)
        }
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
      const generalStr = await window.makaryaAPI.dbGetSetting('makarya_general_settings')
      if (generalStr) {
        try {
          const parsed = JSON.parse(generalStr)
          general.value = { ...DEFAULT_GENERAL_SETTINGS, ...parsed }
          localStorage.setItem('makarya_general_settings', JSON.stringify(general.value))
        } catch {}
      }

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
          const savedAutoExecution = (localStorage.getItem('makarya_auto_execution') as AutoExecutionPolicy) || 'ask_before'
          ai.value = {
            ...DEFAULT_AI_SETTINGS,
            ...parsed,
            autoExecution: parsed.autoExecution || savedAutoExecution || 'ask_before'
          }
          localStorage.setItem('makarya_ai_settings', JSON.stringify(ai.value))
          localStorage.setItem('makarya_auto_execution', ai.value.autoExecution)
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

  function openSettings(tab: 'appearance' | 'general' | 'ai' = 'appearance'): void {
    loadSettingsFromDb().catch?.(() => {})
    activeTab.value = tab
    isSettingsModalOpen.value = true
  }

  function closeSettings(): void {
    isSettingsModalOpen.value = false
  }

  function resetToDefaults(): void {
    general.value = { ...DEFAULT_GENERAL_SETTINGS }
    editor.value = { ...DEFAULT_EDITOR_SETTINGS }
    ai.value = { ...DEFAULT_AI_SETTINGS }
  }

  return {
    general,
    editor,
    ai,
    isSettingsModalOpen,
    activeTab,
    formatTimestamp,
    formatDateTime,
    loadSettingsFromDb,
    openSettings,
    closeSettings,
    resetToDefaults
  }
})
