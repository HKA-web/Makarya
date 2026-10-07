import { app, shell, BrowserWindow, ipcMain, dialog } from 'electron'
import { join, basename, parse, relative, dirname } from 'node:path'
import { existsSync } from 'node:fs'
import { readdir, readFile, writeFile, stat, mkdir, rename, rm, cp } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import * as net from 'node:net'
import { electronApp, optimizer, is } from '@electron-toolkit/utils'
// Mesin AI Agent bertenaga Vercel AI SDK (Universal Provider, Auto Loop, Zod Validation)
import { VercelAiAgentService as AiAgentService } from './agent/vercelAiService'
import { OpenCodeCliService } from './agent/openCodeCliService'
import { ClaudeCliService } from './agent/claudeCliService'
import { uiBuilderService } from './agent/uiBuilderService'
import { databaseService } from './db/databaseService'
import { liveDatabaseDriverService } from './db/liveDbDriver'
import { terminalService } from './terminal/terminalService'
import { createSplashScreen } from './splash/splashService'

let primaryWindow: BrowserWindow | null = null
const activeBrowserWindows = new Set<BrowserWindow>()
const aiAgentService = new AiAgentService()
const openCodeCliService = new OpenCodeCliService(aiAgentService)
const claudeCliService = new ClaudeCliService(aiAgentService)

interface RunningProcessInfo {
  appId: string
  exePath: string
  pid: number
  childProcess: any
}

const runningAppProcesses = new Map<string, RunningProcessInfo>()

function broadcastRunningAppStatus(appId: string, isRunning: boolean): void {
  for (const win of activeBrowserWindows) {
    if (!win.isDestroyed()) {
      win.webContents.send('app:status-changed', { appId, isRunning })
    }
  }
}

export interface WorkspaceFileItem {
  name: string
  path: string
  relativePath: string
  rootPath: string
}

const IGNORED_INDEX_FOLDERS = new Set([
  '.git',
  '.svn',
  '.hg',
  'node_modules',
  'vendor',
  '.vscode',
  '.idea',
  'dist',
  'out',
  'build',
  '.next',
  '.nuxt',
  '.output',
  'coverage',
  '.cache',
  '.tmp',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  'venv',
  '.venv',
  'env',
  '.env',
  'site-packages',
  '.turbo',
  '.gradle',
  'bin',
  'obj'
])

async function collectWorkspaceFiles(
  directoryPath: string,
  rootPath: string,
  maxFiles = 50000,
  collected: WorkspaceFileItem[] = []
): Promise<WorkspaceFileItem[]> {
  if (collected.length >= maxFiles) return collected

  try {
    const rawEntries = await readdir(directoryPath, { withFileTypes: true })
    for (const entry of rawEntries) {
      if (collected.length >= maxFiles) break

      const name = entry.name
      // Ignore common noisy, cache, and huge directories
      if (IGNORED_INDEX_FOLDERS.has(name) || name.endsWith('.sqlite-journal') || name.endsWith('.pyc')) {
        continue
      }

      const fullPath = join(directoryPath, name)
      if (entry.isDirectory()) {
        await collectWorkspaceFiles(fullPath, rootPath, maxFiles, collected)
      } else {
        const rel = relative(rootPath, fullPath).replace(/\\/g, '/')
        collected.push({
          name,
          path: fullPath,
          relativePath: rel,
          rootPath
        })
      }
    }
  } catch {
    // Skip inaccessible folders safely
  }
  return collected
}

interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

function getPreloadPath(): string {
  const candidatePaths = [
    join(__dirname, '../preload/index.js'),
    join(__dirname, '../preload/index.mjs'),
    join(__dirname, '../preload/index.cjs')
  ]
  for (const candidate of candidatePaths) {
    if (existsSync(candidate)) {
      return candidate
    }
  }
  return join(__dirname, '../preload/index.js')
}

function createPrimaryWindow(
  optionsOrShowImmediately: boolean | { showImmediately?: boolean; mode?: 'editor' | 'blank-app' } = true
): BrowserWindow {
  const showImmediately =
    typeof optionsOrShowImmediately === 'boolean'
      ? optionsOrShowImmediately
      : optionsOrShowImmediately.showImmediately ?? true
  const mode =
    typeof optionsOrShowImmediately === 'object' && optionsOrShowImmediately.mode
      ? optionsOrShowImmediately.mode
      : 'editor'

  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    show: false,
    frame: false,
    autoHideMenuBar: true,
    title: mode === 'blank-app' ? 'Makarya App Workspace' : 'Makarya Code Editor',
    icon: existsSync(join(__dirname, '../../build/icon.png'))
      ? join(__dirname, '../../build/icon.png')
      : join(__dirname, '../../build/icon.ico'),
    backgroundColor: '#090d14',
    webPreferences: {
      preload: getPreloadPath(),
      sandbox: false,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  activeBrowserWindows.add(win)
  if (!primaryWindow) {
    primaryWindow = win
  }

  win.on('ready-to-show', () => {
    if (showImmediately) {
      win.show()
    }
  })

  win.on('closed', () => {
    activeBrowserWindows.delete(win)
    if (primaryWindow === win) {
      primaryWindow = activeBrowserWindows.values().next().value || null
    }
  })

  win.on('maximize', () => {
    win.webContents.send('window:state-changed', { isMaximized: true })
  })

  win.on('unmaximize', () => {
    win.webContents.send('window:state-changed', { isMaximized: false })
  })

  win.webContents.setWindowOpenHandler((details) => {
    shell.openExternal(details.url)
    return { action: 'deny' }
  })

  win.webContents.on('console-message', (_event, _level, message, line, sourceId) => {
    console.log(`[Renderer] ${message} (${sourceId}:${line})`)
  })

  const queryParams = mode === 'blank-app' ? '?mode=blank-app' : ''
  if (is.dev && process.env['ELECTRON_RENDERER_URL']) {
    win.loadURL(`${process.env['ELECTRON_RENDERER_URL']}${queryParams}`)
  } else {
    win.loadFile(join(__dirname, '../renderer/index.html'), {
      query: mode === 'blank-app' ? { mode: 'blank-app' } : undefined
    })
  }

  return win
}

async function scanDirectoryEntries(directoryPath: string): Promise<FileEntry[]> {
  try {
    const rawFileNames = await readdir(directoryPath)
    const resultEntries: FileEntry[] = []

    for (const fileName of rawFileNames) {
      // Ignore noisy or huge directories by default for performance
      if (fileName === '.git' || fileName === 'node_modules' || fileName === '.vscode' || fileName === 'dist' || fileName === 'out') {
        continue
      }

      const fullFilePath = join(directoryPath, fileName)
      try {
        const fileStat = await stat(fullFilePath)
        resultEntries.push({
          name: fileName,
          path: fullFilePath,
          isDirectory: fileStat.isDirectory()
        })
      } catch {
        // Skip inaccessible entries safely
      }
    }

    // Sort folders first, then alphabetical by name
    return resultEntries.sort((itemA, itemB) => {
      if (itemA.isDirectory === itemB.isDirectory) {
        return itemA.name.localeCompare(itemB.name)
      }
      return itemA.isDirectory ? -1 : 1
    })
  } catch (error) {
    console.error(`Failed to scan directory ${directoryPath}:`, error)
    return []
  }
}

function registerIpcHandlers(): void {
  ipcMain.handle('system:ping', () => 'pong')

  ipcMain.handle('system:info', () => ({
    platform: process.platform,
    arch: process.arch,
    nodeVersion: process.version
  }))

  // Window Controls (Frameless Title Bar Actions)
  ipcMain.handle('window:minimize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || primaryWindow
    win?.minimize()
  })

  ipcMain.handle('window:maximize', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || primaryWindow
    if (win) {
      if (win.isMaximized()) {
        win.unmaximize()
      } else {
        win.maximize()
      }
      return win.isMaximized()
    }
    return false
  })

  ipcMain.handle('window:close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || primaryWindow
    win?.close()
  })

  ipcMain.handle('window:is-maximized', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender) || primaryWindow
    return win ? win.isMaximized() : false
  })

  // Multi-Window & Process Management (Task View)
  ipcMain.handle('window:open-new-window', async () => {
    const newWin = createPrimaryWindow()
    return { success: true, windowId: newWin.id }
  })

  ipcMain.handle('window:open-blank-app', async (event, destroyCurrent = true) => {
    const currentWin = BrowserWindow.fromWebContents(event.sender)
    const newWin = createPrimaryWindow({ showImmediately: true, mode: 'blank-app' })
    if (destroyCurrent && currentWin && !currentWin.isDestroyed()) {
      currentWin.close()
    }
    return { success: true, windowId: newWin.id }
  })

  ipcMain.handle('window:open-editor-mode', async (event, destroyCurrent = false) => {
    const currentWin = BrowserWindow.fromWebContents(event.sender)
    const newWin = createPrimaryWindow({ showImmediately: true, mode: 'editor' })
    if (destroyCurrent && currentWin && !currentWin.isDestroyed()) {
      currentWin.close()
    }
    return { success: true, windowId: newWin.id }
  })

  ipcMain.handle('window:list-all', async () => {
    return Array.from(activeBrowserWindows).map((w, idx) => ({
      id: w.id,
      title: w.getTitle() || `Makarya Window ${idx + 1}`,
      isFocused: w.isFocused()
    }))
  })

  ipcMain.handle('window:focus-window', async (_event, windowId: number) => {
    for (const w of activeBrowserWindows) {
      if (w.id === windowId) {
        if (w.isMinimized()) w.restore()
        w.focus()
        return { success: true }
      }
    }
    return { success: false }
  })

  // Pick .exe application file dialog
  ipcMain.handle('app:pick-exe', async (event) => {
    try {
      const win = BrowserWindow.fromWebContents(event.sender) || primaryWindow
      const result = win
        ? await dialog.showOpenDialog(win, {
            title: 'Pilih File Aplikasi Executable (.exe)',
            filters: [
              { name: 'Aplikasi Windows (*.exe)', extensions: ['exe'] },
              { name: 'Semua Berkas (*.*)', extensions: ['*'] }
            ],
            properties: ['openFile']
          })
        : await dialog.showOpenDialog({
            title: 'Pilih File Aplikasi Executable (.exe)',
            filters: [
              { name: 'Aplikasi Windows (*.exe)', extensions: ['exe'] },
              { name: 'Semua Berkas (*.*)', extensions: ['*'] }
            ],
            properties: ['openFile']
          })

      if (result.canceled || result.filePaths.length === 0) {
        return { canceled: true }
      }

      const exePath = result.filePaths[0]
      const exeFileName = basename(exePath)
      return { canceled: false, filePath: exePath, fileName: exeFileName }
    } catch (err: any) {
      return { canceled: true, error: err?.message }
    }
  })

  // Launch .exe application safely and track process
  ipcMain.handle('app:launch-exe', async (_event, exePath: string, appId?: string) => {
    try {
      if (!existsSync(exePath)) {
        return { success: false, error: 'File aplikasi .exe tidak ditemukan di lokasi tersebut.' }
      }

      const key = appId || exePath
      if (runningAppProcesses.has(key)) {
        return { success: false, error: 'Program ini sudah sedang berjalan.' }
      }

      const child = spawn(exePath, [], {
        windowsHide: false,
        stdio: 'ignore'
      })

      if (!child.pid) {
        return { success: false, error: 'Gagal mendapatkan Process ID aplikasi.' }
      }

      const procInfo: RunningProcessInfo = {
        appId: key,
        exePath,
        pid: child.pid,
        childProcess: child
      }

      runningAppProcesses.set(key, procInfo)
      broadcastRunningAppStatus(key, true)

      child.on('exit', () => {
        runningAppProcesses.delete(key)
        broadcastRunningAppStatus(key, false)
      })

      child.on('error', (err) => {
        console.warn(`Aplikasi ${key} error:`, err)
        runningAppProcesses.delete(key)
        broadcastRunningAppStatus(key, false)
      })

      return { success: true, pid: child.pid }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Gagal meluncurkan aplikasi.' }
    }
  })

  // Stop .exe application by PID using taskkill on Windows
  ipcMain.handle('app:stop-exe', async (_event, appId: string) => {
    try {
      let keyToStop = appId
      let procInfo = runningAppProcesses.get(appId)

      if (!procInfo) {
        // Fallback: search by exePath
        for (const [k, v] of runningAppProcesses.entries()) {
          if (v.exePath === appId) {
            keyToStop = k
            procInfo = v
            break
          }
        }
      }

      if (!procInfo) {
        return { success: true, message: 'Program sudah tidak berjalan.' }
      }

      const pid = procInfo.pid
      if (process.platform === 'win32') {
        spawn('taskkill', ['/PID', pid.toString(), '/T', '/F'])
      } else {
        try {
          procInfo.childProcess.kill('SIGKILL')
        } catch {}
      }

      runningAppProcesses.delete(keyToStop)
      broadcastRunningAppStatus(keyToStop, false)
      return { success: true }
    } catch (err: any) {
      return { success: false, error: err?.message || 'Gagal menghentikan program.' }
    }
  })

  // Get all currently running appIds
  ipcMain.handle('app:get-running', async () => {
    return Array.from(runningAppProcesses.keys())
  })

  // Native Folder Picker
  ipcMain.handle('fs:open-folder-dialog', async (event) => {
    try {
      const windowTarget = BrowserWindow.fromWebContents(event.sender) || primaryWindow
      const openResult = windowTarget
        ? await dialog.showOpenDialog(windowTarget, {
            title: 'Buka Folder Project',
            properties: ['openDirectory']
          })
        : await dialog.showOpenDialog({
            title: 'Buka Folder Project',
            properties: ['openDirectory']
          })

      if (openResult.canceled || openResult.filePaths.length === 0) {
        return { canceled: true }
      }

      const selectedFolderPath = openResult.filePaths[0]
      const rootEntries = await scanDirectoryEntries(selectedFolderPath)

      return {
        canceled: false,
        folderPath: selectedFolderPath,
        entries: rootEntries
      }
    } catch (dialogError: any) {
      console.error('Error in fs:open-folder-dialog:', dialogError)
      return { canceled: true, error: dialogError?.message }
    }
  })

  // Read subfolder on demand (lazy tree expansion)
  ipcMain.handle('fs:read-directory', async (_event, targetDirectoryPath: string) => {
    return scanDirectoryEntries(targetDirectoryPath)
  })

  // Read real file from disk
  ipcMain.handle('fs:read-file', async (_event, targetFilePath: string) => {
    try {
      const fileContent = await readFile(targetFilePath, 'utf-8')
      return { content: fileContent }
    } catch (readError: any) {
      return { content: '', error: readError?.message || 'Gagal membaca file' }
    }
  })

  // Write file to disk (Save)
  ipcMain.handle('fs:write-file', async (_event, targetFilePath: string, fileContent: string) => {
    try {
      const parentDir = dirname(targetFilePath)
      if (!existsSync(parentDir)) {
        await mkdir(parentDir, { recursive: true })
      }
      await writeFile(targetFilePath, fileContent, 'utf-8')
      return { success: true }
    } catch (writeError: any) {
      console.error('Error writing file:', writeError)
      return { success: false, error: writeError?.message || 'Gagal menyimpan file' }
    }
  })

  // Save uploaded image to project .makarya/images folder
  ipcMain.handle('fs:save-image-to-project', async (_event, projectRoot: string, fileName: string, base64Data: string) => {
    try {
      if (!projectRoot || !existsSync(projectRoot)) {
        return { success: false, error: 'Project root tidak ditemukan' }
      }
      const makaryaDir = join(projectRoot, '.makarya', 'images')
      if (!existsSync(makaryaDir)) {
        await mkdir(makaryaDir, { recursive: true })
      }
      const cleanBase64 = base64Data.replace(/^data:image\/\w+;base64,/, '')
      const buffer = Buffer.from(cleanBase64, 'base64')
      
      const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, '_')
      let targetPath = join(makaryaDir, safeName)
      
      if (existsSync(targetPath)) {
        const parsed = parse(safeName)
        let idx = 1
        while (existsSync(join(makaryaDir, `${parsed.name}_${idx}${parsed.ext}`))) {
          idx++
        }
        targetPath = join(makaryaDir, `${parsed.name}_${idx}${parsed.ext}`)
      }

      await writeFile(targetPath, buffer)
      const relativePath = relative(projectRoot, targetPath).replace(/\\/g, '/')
      return { success: true, absolutePath: targetPath, relativePath, fileName: basename(targetPath) }
    } catch (err: any) {
      console.error('Error saving image to project:', err)
      return { success: false, error: err?.message || 'Gagal menyimpan gambar ke folder .makarya' }
    }
  })

  // Create new empty file
  ipcMain.handle('fs:create-file', async (_event, targetFilePath: string) => {
    try {
      if (existsSync(targetFilePath)) {
        return { success: false, error: 'File dengan nama tersebut sudah ada' }
      }
      await writeFile(targetFilePath, '', 'utf-8')
      return { success: true }
    } catch (createError: any) {
      return { success: false, error: createError?.message || 'Gagal membuat file baru' }
    }
  })

  // Create new directory
  ipcMain.handle('fs:create-directory', async (_event, targetDirectoryPath: string) => {
    try {
      if (existsSync(targetDirectoryPath)) {
        return { success: false, error: 'Folder dengan nama tersebut sudah ada' }
      }
      await mkdir(targetDirectoryPath, { recursive: true })
      return { success: true }
    } catch (createError: any) {
      return { success: false, error: createError?.message || 'Gagal membuat folder baru' }
    }
  })

  // Rename file or folder
  ipcMain.handle('fs:rename-entry', async (_event, oldPath: string, newPath: string) => {
    try {
      if (existsSync(newPath)) {
        return { success: false, error: 'Nama tujuan sudah digunakan' }
      }
      await rename(oldPath, newPath)
      return { success: true }
    } catch (renameError: any) {
      return { success: false, error: renameError?.message || 'Gagal mengubah nama' }
    }
  })

  // Delete file or folder
  ipcMain.handle('fs:delete-entry', async (_event, targetPath: string) => {
    try {
      await rm(targetPath, { recursive: true, force: true })
      return { success: true }
    } catch (deleteError: any) {
      return { success: false, error: deleteError?.message || 'Gagal menghapus' }
    }
  })

  // Copy file or folder recursively with automatic collision resolution
  ipcMain.handle('fs:copy-entry', async (_event, sourcePath: string, destinationDirectory: string, customNewName?: string) => {
    try {
      if (!existsSync(sourcePath)) {
        return { success: false, error: 'Sumber berkas tidak ditemukan' }
      }
      if (!destinationDirectory || !existsSync(destinationDirectory)) {
        return { success: false, error: 'Direktori tujuan tidak valid' }
      }

      const sourceBaseName = basename(sourcePath)
      const targetName = customNewName || sourceBaseName
      let finalDestinationPath = join(destinationDirectory, targetName)

      // Automatically generate unique suffix if destination file or directory exists
      if (existsSync(finalDestinationPath)) {
        const parsedPath = parse(targetName)
        let duplicateIndex = 1
        let candidateName = parsedPath.ext
          ? `${parsedPath.name} copy${parsedPath.ext}`
          : `${parsedPath.name} copy`

        while (existsSync(join(destinationDirectory, candidateName))) {
          duplicateIndex++
          candidateName = parsedPath.ext
            ? `${parsedPath.name} copy ${duplicateIndex}${parsedPath.ext}`
            : `${parsedPath.name} copy ${duplicateIndex}`
        }
        finalDestinationPath = join(destinationDirectory, candidateName)
      }

      await cp(sourcePath, finalDestinationPath, { recursive: true })
      return { success: true, destinationPath: finalDestinationPath }
    } catch (copyError: any) {
      console.error('Error in fs:copy-entry:', copyError)
      return { success: false, error: copyError?.message || 'Gagal menyalin berkas' }
    }
  })

  // Fast Workspace Files Indexer for Quick Open (Ctrl+E)
  ipcMain.handle('fs:search-workspace-files', async (_event, rootPaths: string[]) => {
    try {
      const allFiles: WorkspaceFileItem[] = []
      for (const root of rootPaths) {
        if (existsSync(root)) {
          const files = await collectWorkspaceFiles(root, root, 50000)
          allFiles.push(...files)
        }
      }
      return allFiles
    } catch (err: any) {
      console.error('Error in fs:search-workspace-files:', err)
      return []
    }
  })

  // Shell Command Execution with streaming to renderer
  ipcMain.handle('agent:execute-command', async (_event, commandString: string) => {
    return new Promise((resolve) => {
      let stdoutAccumulator = ''
      let stderrAccumulator = ''

      const childProcess = spawn(commandString, { shell: true })

      childProcess.stdout.on('data', (chunk) => {
        const textChunk = chunk.toString()
        stdoutAccumulator += textChunk
        if (primaryWindow && !primaryWindow.isDestroyed()) {
          primaryWindow.webContents.send('agent:command-output', textChunk)
        }
      })

      childProcess.stderr.on('data', (chunk) => {
        const textChunk = chunk.toString()
        stderrAccumulator += textChunk
        if (primaryWindow && !primaryWindow.isDestroyed()) {
          primaryWindow.webContents.send('agent:command-output', textChunk)
        }
      })

      childProcess.on('close', (exitCode) => {
        resolve({
          exitCode: exitCode ?? 0,
          stdout: stdoutAccumulator,
          stderr: stderrAccumulator
        })
      })

      childProcess.on('error', (processError) => {
        resolve({
          exitCode: 1,
          stdout: stdoutAccumulator,
          stderr: stderrAccumulator + '\n' + processError.message
        })
      })
    })
  })

  // AI Agent Streaming Chat
  ipcMain.handle('agent:chat-stream', async (event, requestPayload) => {
    const windowTarget = BrowserWindow.fromWebContents(event.sender) || primaryWindow
    aiAgentService.streamChat(requestPayload, windowTarget).catch((streamError) => {
      console.error('[Main] Stream chat unhandled error:', streamError)
    })
    return { accepted: true }
  })

  // OpenCode CLI Agent Streaming
  ipcMain.handle('opencode:chat-stream', async (event, requestPayload) => {
    const windowTarget = BrowserWindow.fromWebContents(event.sender) || primaryWindow
    openCodeCliService.streamOpenCode(requestPayload, windowTarget).catch((streamError) => {
      console.error('[Main] OpenCode stream error:', streamError)
    })
    return { accepted: true }
  })

  // OpenCode CLI Agent Abort
  ipcMain.handle('opencode:chat-abort', async (_event, requestId: string) => {
    const isAborted = openCodeCliService.abortStream(requestId)
    return { aborted: isAborted }
  })

  // OpenCode CLI Discovered Models (Config + CLI + 9Router)
  ipcMain.handle('opencode:get-models', async () => {
    return openCodeCliService.getDiscoveredModels()
  })

  // OpenCode CLI Sessions (List, Load, Delete)
  ipcMain.handle('opencode:session-list', async () => {
    return openCodeCliService.listSessions()
  })

  ipcMain.handle('opencode:session-load', async (_event, sessionId: string) => {
    return openCodeCliService.loadSession(sessionId)
  })

  ipcMain.handle('opencode:session-delete', async (_event, sessionId: string) => {
    return openCodeCliService.deleteSession(sessionId)
  })

  // Claude CLI / Autonomous Agent Streaming
  ipcMain.handle('claude:chat-stream', async (event, requestPayload) => {
    const windowTarget = BrowserWindow.fromWebContents(event.sender) || primaryWindow
    claudeCliService.streamClaude(requestPayload, windowTarget).catch((streamError) => {
      console.error('[Main] Claude stream error:', streamError)
    })
    return { accepted: true }
  })

  // Claude CLI Agent Abort
  ipcMain.handle('claude:chat-abort', async (_event, requestId: string) => {
    const isAborted = claudeCliService.abortStream(requestId)
    return { aborted: isAborted }
  })

  // Claude CLI Discovered Models (Config + CLI + 9Router)
  ipcMain.handle('claude:get-models', async () => {
    return claudeCliService.getDiscoveredModels()
  })

  // Claude CLI Sessions (List, Load, Delete)
  ipcMain.handle('claude:session-list', async () => {
    return claudeCliService.listSessions()
  })

  ipcMain.handle('claude:session-load', async (_event, sessionId: string) => {
    return claudeCliService.loadSession(sessionId)
  })

  ipcMain.handle('claude:session-delete', async (_event, sessionId: string) => {
    return claudeCliService.deleteSession(sessionId)
  })

  // UI Builder Streaming Generation (9router & Multimodal)
  ipcMain.handle('ui-builder:chat-stream', async (event, requestPayload) => {
    const windowTarget = BrowserWindow.fromWebContents(event.sender) || primaryWindow
    uiBuilderService
      .streamGeneration(requestPayload, aiAgentService.getConfiguration(), windowTarget)
      .catch((err) => {
        console.error('[Main] UI Builder stream error:', err)
      })
    return { accepted: true }
  })

  // UI Builder Abort
  ipcMain.handle('ui-builder:chat-abort', async (_event, requestId: string) => {
    const isAborted = uiBuilderService.abortStream(requestId)
    return { aborted: isAborted }
  })

  // AI Agent Abort
  ipcMain.handle('agent:chat-abort', async (_event, requestId: string) => {
    const isAborted = aiAgentService.abortStream(requestId)
    return { aborted: isAborted }
  })

  // AI Agent Respond to Tool Execution Approval (Ask Before Execution)
  ipcMain.handle('agent:respond-tool-approval', async (_event, toolCallId: string, approved: boolean) => {
    return aiAgentService.respondToolApproval(toolCallId, approved)
  })

  // AI Agent Respond to Custom Plugin Tool Execution
  ipcMain.handle('agent:respond-custom-tool', async (_event, toolCallId: string, result: any) => {
    return aiAgentService.respondCustomTool(toolCallId, result)
  })

  // Live Database Operations Handlers (PostgreSQL, MySQL, SQLite, SQL Server)
  ipcMain.handle('db:test-connection', async (_event, config: any) => {
    return liveDatabaseDriverService.testConnection(config)
  })

  ipcMain.handle('db:inspect-schema', async (_event, config: any) => {
    return liveDatabaseDriverService.inspectSchema(config)
  })

  ipcMain.handle('db:execute-live-query', async (_event, payload: { config: any; sql: string; limit?: number }) => {
    return liveDatabaseDriverService.executeQuery(payload.config, payload.sql, payload.limit)
  })

  // AI Agent Fetch Models
  ipcMain.handle('agent:get-models', async () => {
    return aiAgentService.fetchAvailableModels()
  })

  // AI Agent Configuration
  ipcMain.handle('agent:update-config', async (_event, config: { baseUrl?: string; apiKey?: string }) => {
    aiAgentService.updateConfiguration(config)
    return { success: true }
  })

  ipcMain.handle('agent:get-config', async () => {
    return aiAgentService.getConfiguration()
  })

  // --- SQLite Database IPC Handlers ---
  ipcMain.handle('db:get-info', async () => {
    return databaseService.getDbInfo()
  })

  ipcMain.handle('db:get-setting', async (_event, key: string) => {
    return databaseService.getSetting(key)
  })

  ipcMain.handle('db:set-setting', async (_event, key: string, value: string) => {
    return databaseService.setSetting(key, value)
  })

  ipcMain.handle('db:get-workspaces', async () => {
    return databaseService.getWorkspaces()
  })

  ipcMain.handle('db:save-workspace', async (_event, folderPath: string, folderName: string) => {
    return databaseService.saveWorkspace(folderPath, folderName)
  })

  ipcMain.handle('db:delete-workspace', async (_event, folderPath: string) => {
    return databaseService.deleteWorkspace(folderPath)
  })

  ipcMain.handle('db:get-chat-sessions', async () => {
    return databaseService.getChatSessions()
  })

  ipcMain.handle('db:create-session', async (_event, session: any) => {
    return databaseService.createOrUpdateSession(session)
  })

  ipcMain.handle('db:delete-session', async (_event, sessionId: string) => {
    return databaseService.deleteSession(sessionId)
  })

  ipcMain.handle('db:save-chat-message', async (_event, messagePayload: any) => {
    return databaseService.saveChatMessage(messagePayload)
  })

  ipcMain.handle('db:get-chat-history', async (_event, sessionId?: string, limit?: number) => {
    return databaseService.getChatHistory(sessionId, limit)
  })

  ipcMain.handle('db:clear-chat-history', async (_event, sessionId?: string) => {
    return databaseService.clearChatHistory(sessionId)
  })

  ipcMain.handle('db:execute-query', async (_event, sql: string, params?: any[]) => {
    return databaseService.executeQuery(sql, params)
  })

}

app.whenReady().then(async () => {
  electronApp.setAppUserModelId('com.makarya.workspace')

  // Inisialisasi Database SQLite Utama Makarya IDE
  try {
    await databaseService.initialize()

    // Restore saved AI Configuration from SQLite if available
    const savedAiConfig = databaseService.getSetting('makarya_ai_settings')
    if (savedAiConfig) {
      try {
        const parsed = JSON.parse(savedAiConfig)
        if (parsed.baseUrl !== undefined || parsed.apiKey !== undefined) {
          aiAgentService.updateConfiguration({
            baseUrl: parsed.baseUrl || '',
            apiKey: parsed.apiKey || ''
          })
        }
      } catch (err) {
        console.warn('[Main] Gagal memuat AI config dari SQLite:', err)
      }
    }
  } catch (dbInitErr) {
    console.error('[Main] Gagal menginisialisasi SQLite database:', dbInitErr)
  }

  app.on('browser-window-created', (_, window) => {
    optimizer.watchWindowShortcuts(window)
  })

  registerIpcHandlers()
  terminalService.init()

  // Buka Splash Screen berdurasi 10 detik saat pertama kali aplikasi dibuka
  let isSplashDone = false
  const mainWin = createPrimaryWindow(false)

  createSplashScreen(10000, () => {
    isSplashDone = true
    if (mainWin && !mainWin.isDestroyed()) {
      mainWin.show()
      mainWin.focus()
    }
  })

  mainWin.once('ready-to-show', () => {
    if (isSplashDone) {
      mainWin.show()
      mainWin.focus()
    }
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createPrimaryWindow(true)
    }
  })
})

app.on('before-quit', async () => {
  terminalService.destroyAll()
  await databaseService.saveToDiskImmediately()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
