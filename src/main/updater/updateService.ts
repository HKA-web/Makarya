import { app, shell, BrowserWindow } from 'electron'
import { join } from 'node:path'
import { createWriteStream, existsSync, unlinkSync } from 'node:fs'
import * as https from 'node:https'
import * as http from 'node:http'
import { spawn } from 'node:child_process'

export interface ReleaseAssetInfo {
  name: string
  browser_download_url: string
  size: number
  content_type: string
}

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

export interface DownloadProgressInfo {
  percent: number
  transferredBytes: number
  totalBytes: number
  speedMbps: number
}

export function parseVersionParts(versionStr: string): number[] {
  if (!versionStr) return []
  let clean = versionStr.replace(/^v\.?/i, '').trim()
  // Normalisasi format electron-builder prerelease hyphen pada tanggal, contoh: '2026.10.0-9.0.10' -> '2026.10.9.0.10'
  clean = clean.replace(/\.0-/, '.')
  const rawParts = clean.split(/[.\-_]/).filter(Boolean)
  return rawParts.map((p) => parseInt(p, 10) || 0)
}

export function isNewerVersion(remoteTag: string, localVersion: string): boolean {
  const cleanRemote = remoteTag.replace(/^v\.?/i, '').trim()
  const cleanLocal = localVersion.replace(/^v\.?/i, '').trim()
  if (!cleanRemote || !cleanLocal || cleanRemote === cleanLocal) return false

  const remoteParts = parseVersionParts(remoteTag)
  const localParts = parseVersionParts(localVersion)
  const len = Math.max(remoteParts.length, localParts.length)

  for (let i = 0; i < len; i++) {
    const r = remoteParts[i] ?? 0
    const l = localParts[i] ?? 0
    if (r > l) return true
    if (r < l) return false
  }
  return false
}

export class UpdateService {
  private owner: string = 'HKA-web'
  private repo: string = 'Makarya'
  private isDownloading: boolean = false
  private downloadAbortController: AbortController | null = null

  public getCurrentVersion(): string {
    try {
      if (app && app.isPackaged) {
        return app.getVersion()
      }
    } catch {}
    return typeof __APP_BUILD_DATE__ !== 'undefined' ? __APP_BUILD_DATE__ : 'v2026.10.08.23.25'
  }

  public async checkForUpdates(owner = this.owner, repo = this.repo): Promise<UpdateCheckResult> {
    const currentVer = this.getCurrentVersion()
    const latestUrl = `https://api.github.com/repos/${owner}/${repo}/releases/latest`
    const listUrl = `https://api.github.com/repos/${owner}/${repo}/releases`

    try {
      let releaseData: any = null

      // Coba endpoint /releases/latest terlebih dahulu
      const response = await fetch(latestUrl, {
        headers: {
          'User-Agent': 'Makarya-IDE-AutoUpdater',
          Accept: 'application/vnd.github.v3+json'
        }
      })

      if (response.ok) {
        releaseData = await response.json()
      } else {
        // Fallback: coba ambil daftar /releases jika /latest 404
        const fallbackRes = await fetch(listUrl, {
          headers: {
            'User-Agent': 'Makarya-IDE-AutoUpdater',
            Accept: 'application/vnd.github.v3+json'
          }
        })
        if (fallbackRes.ok) {
          const list = (await fallbackRes.json()) as any[]
          if (Array.isArray(list) && list.length > 0) {
            releaseData = list[0]
          }
        }
      }

      if (!releaseData) {
        return {
          success: true,
          hasUpdate: false,
          currentVersion: currentVer,
          latestVersion: currentVer,
          releaseTitle: 'Tidak ada rilis publik di repository',
          releaseNotes: '',
          publishedAt: new Date().toISOString()
        }
      }

      const remoteTag = releaseData.tag_name || releaseData.name || ''
      const hasUpdate = isNewerVersion(remoteTag, currentVer)

      // Cari asset installer .exe terbaik (misal NSIS installer Setup.exe atau standalone .exe)
      let matchedAsset: ReleaseAssetInfo | undefined
      if (Array.isArray(releaseData.assets) && releaseData.assets.length > 0) {
        matchedAsset =
          releaseData.assets.find((a: any) => a.name?.toLowerCase().endsWith('.exe') && !a.name?.toLowerCase().includes('portable')) ||
          releaseData.assets.find((a: any) => a.name?.toLowerCase().endsWith('.exe')) ||
          releaseData.assets[0]
      }

      return {
        success: true,
        hasUpdate,
        currentVersion: currentVer,
        latestVersion: remoteTag || currentVer,
        releaseTitle: releaseData.name || remoteTag || 'Pembaruan Makarya IDE',
        releaseNotes: releaseData.body || 'Tidak ada catatan rilis.',
        publishedAt: releaseData.published_at || new Date().toISOString(),
        downloadUrl: matchedAsset?.browser_download_url || releaseData.html_url,
        fileName: matchedAsset?.name || 'Makarya-IDE-Setup.exe',
        fileSizeBytes: matchedAsset?.size || 0,
        htmlUrl: releaseData.html_url
      }
    } catch (err: any) {
      console.warn('[UpdateService] Gagal memeriksa update dari GitHub:', err?.message || err)
      return {
        success: false,
        hasUpdate: false,
        currentVersion: currentVer,
        latestVersion: currentVer,
        releaseTitle: '',
        releaseNotes: '',
        publishedAt: '',
        errorMessage: err?.message || 'Gagal terhubung ke server pembaruan GitHub'
      }
    }
  }

  public async downloadUpdate(
    downloadUrl: string,
    targetFileName = 'Makarya-IDE-Setup.exe',
    targetWindow?: BrowserWindow | null
  ): Promise<{ success: boolean; filePath?: string; error?: string }> {
    if (this.isDownloading) {
      return { success: false, error: 'Proses pengunduhan sedang berjalan.' }
    }

    this.isDownloading = true
    const destinationPath = join(app.getPath('temp'), targetFileName)

    try {
      if (existsSync(destinationPath)) {
        try {
          unlinkSync(destinationPath)
        } catch {
          // Abaikan jika tidak bisa dihapus langsung
        }
      }

      await this.downloadFileWithProgress(downloadUrl, destinationPath, (progress) => {
        if (targetWindow && !targetWindow.isDestroyed()) {
          targetWindow.webContents.send('updater:download-progress', progress)
        }
      })

      this.isDownloading = false
      return { success: true, filePath: destinationPath }
    } catch (err: any) {
      this.isDownloading = false
      return { success: false, error: err?.message || 'Gagal mengunduh file pembaruan' }
    }
  }

  private downloadFileWithProgress(
    url: string,
    destinationPath: string,
    onProgress: (progress: DownloadProgressInfo) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const parsedUrl = new URL(url)
      const client = parsedUrl.protocol === 'https:' ? https : http

      const request = client.get(
        url,
        {
          headers: {
            'User-Agent': 'Makarya-IDE-AutoUpdater',
            Accept: '*/*'
          }
        },
        (res) => {
          // Tangani redirect (GitHub Release mengarahkan ke AWS S3)
          if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
            this.downloadFileWithProgress(res.headers.location, destinationPath, onProgress)
              .then(resolve)
              .catch(reject)
            return
          }

          if (res.statusCode !== 200) {
            reject(new Error(`Server mengembalikan status HTTP ${res.statusCode}`))
            return
          }

          const totalBytes = parseInt(res.headers['content-length'] || '0', 10)
          let transferredBytes = 0
          let lastTime = Date.now()
          let lastTransferred = 0

          const fileStream = createWriteStream(destinationPath)

          res.on('data', (chunk) => {
            transferredBytes += chunk.length
            const now = Date.now()
            const timeDelta = (now - lastTime) / 1000

            if (timeDelta >= 0.25 || transferredBytes === totalBytes) {
              const bytesDelta = transferredBytes - lastTransferred
              const speedBytesPerSec = timeDelta > 0 ? bytesDelta / timeDelta : 0
              const speedMbps = parseFloat(((speedBytesPerSec * 8) / (1024 * 1024)).toFixed(2))
              const percent = totalBytes > 0 ? Math.min(100, Math.round((transferredBytes / totalBytes) * 100)) : 0

              onProgress({
                percent,
                transferredBytes,
                totalBytes,
                speedMbps
              })

              lastTime = now
              lastTransferred = transferredBytes
            }
          })

          res.pipe(fileStream)

          fileStream.on('finish', () => {
            fileStream.close()
            resolve()
          })

          fileStream.on('error', (err) => {
            fileStream.close()
            reject(err)
          })
        }
      )

      request.on('error', (err) => {
        reject(err)
      })
    })
  }

  public async installAndRestart(installerPath: string): Promise<{ success: boolean; error?: string }> {
    try {
      if (!existsSync(installerPath)) {
        throw new Error(`File installer tidak ditemukan di: ${installerPath}`)
      }

      // Jalankan installer setup executable di proses terpisah
      if (process.platform === 'win32') {
        const child = spawn(installerPath, ['--updated'], {
          detached: true,
          stdio: 'ignore'
        })
        child.unref()
      } else {
        await shell.openPath(installerPath)
      }

      // Berikan jeda 1 detik lalu tutup aplikasi agar installer bisa menimpa file tanpa lock error
      setTimeout(() => {
        app.quit()
      }, 1000)

      return { success: true }
    } catch (err: any) {
      console.error('[UpdateService] Gagal mengeksekusi installer:', err)
      return { success: false, error: err?.message || 'Gagal menjalankan installer' }
    }
  }
}

export const updateService = new UpdateService()
