import { defineStore } from 'pinia'
import { ref } from 'vue'

export interface UpdateCheckResult {
  success: boolean
  hasUpdate: boolean
  currentVersion: string
  latestVersion: string
  releaseTitle: string
  releaseNotes: string
  publishedAt: string
  downloadUrl?: string
  fileName?: string
  fileSizeBytes?: number
  htmlUrl?: string
  errorMessage?: string
}

export interface DownloadProgress {
  percent: number
  transferredBytes: number
  totalBytes: number
  speedMbps: number
}

export const useUpdateStore = defineStore('updateStore', () => {
  const isChecking = ref(false)
  const hasUpdate = ref(false)
  const isMandatory = ref(true)
  const modalVisible = ref(false)
  const updateInfo = ref<UpdateCheckResult | null>(null)

  const isDownloading = ref(false)
  const isReadyToInstall = ref(false)
  const downloadProgress = ref<DownloadProgress>({
    percent: 0,
    transferredBytes: 0,
    totalBytes: 0,
    speedMbps: 0
  })
  const downloadedFilePath = ref<string | null>(null)
  const errorMessage = ref<string | null>(null)

  let cleanupProgress: (() => void) | null = null

  function formatBytes(bytes: number): string {
    if (!bytes || bytes <= 0) return '0 B'
    const k = 1024
    const sizes = ['B', 'KB', 'MB', 'GB']
    const i = Math.floor(Math.log(bytes) / Math.log(k))
    return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`
  }

  async function checkForUpdates(mandatory = true): Promise<UpdateCheckResult | null> {
    if (!window.makaryaAPI?.checkForUpdates) return null

    isChecking.value = true
    errorMessage.value = null

    try {
      const result = await window.makaryaAPI.checkForUpdates()
      updateInfo.value = result

      if (result.success && result.hasUpdate) {
        hasUpdate.value = true
        isMandatory.value = mandatory
        modalVisible.value = true
      } else {
        hasUpdate.value = false
      }

      return result
    } catch (err: any) {
      console.warn('[UpdateStore] Gagal mengecek pembaruan:', err)
      errorMessage.value = err?.message || 'Gagal mengecek pembaruan'
      return null
    } finally {
      isChecking.value = false
    }
  }

  async function initStartupCheck(): Promise<void> {
    // Jalankan inisialisasi pengecekan versi wajib saat startup
    await checkForUpdates(true)
  }

  async function checkManual(): Promise<UpdateCheckResult | null> {
    const res = await checkForUpdates(false)
    if (res && res.hasUpdate) {
      modalVisible.value = true
    }
    return res
  }

  async function startDownload(): Promise<void> {
    if (!window.makaryaAPI?.downloadUpdate || !updateInfo.value?.downloadUrl) return

    isDownloading.value = true
    errorMessage.value = null
    downloadProgress.value = {
      percent: 0,
      transferredBytes: 0,
      totalBytes: updateInfo.value.fileSizeBytes || 0,
      speedMbps: 0
    }

    if (!cleanupProgress && window.makaryaAPI.onUpdateDownloadProgress) {
      cleanupProgress = window.makaryaAPI.onUpdateDownloadProgress((progress) => {
        downloadProgress.value = progress
      })
    }

    try {
      const targetName = updateInfo.value.fileName || 'Makarya-IDE-Setup.exe'
      const res = await window.makaryaAPI.downloadUpdate(updateInfo.value.downloadUrl, targetName)

      if (res.success && res.filePath) {
        downloadedFilePath.value = res.filePath
        isReadyToInstall.value = true
        downloadProgress.value.percent = 100
      } else {
        errorMessage.value = res.error || 'Gagal mengunduh installer pembaruan'
      }
    } catch (err: any) {
      errorMessage.value = err?.message || 'Terjadi kesalahan saat mengunduh'
    } finally {
      isDownloading.value = false
    }
  }

  async function applyInstall(): Promise<void> {
    if (!downloadedFilePath.value || !window.makaryaAPI?.installUpdate) return

    try {
      await window.makaryaAPI.installUpdate(downloadedFilePath.value)
    } catch (err: any) {
      errorMessage.value = err?.message || 'Gagal mengeksekusi installer'
    }
  }

  function openInBrowser(): void {
    const url = updateInfo.value?.htmlUrl || updateInfo.value?.downloadUrl || 'https://github.com/HKA-web/Makarya/releases'
    if (window.open) {
      window.open(url, '_blank')
    }
  }

  return {
    isChecking,
    hasUpdate,
    isMandatory,
    modalVisible,
    updateInfo,
    isDownloading,
    isReadyToInstall,
    downloadProgress,
    downloadedFilePath,
    errorMessage,
    formatBytes,
    checkForUpdates,
    initStartupCheck,
    checkManual,
    startDownload,
    applyInstall,
    openInBrowser
  }
})
