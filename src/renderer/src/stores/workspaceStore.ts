import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { FileEntry } from '../../../preload/index'
import { detectMonacoLanguage, getFileIconClass } from '../utils/languageDetector'
import { resolveHunk } from '../utils/diffEngine'
import { useAgentStore } from './agentStore'

export type WorkspaceTabType = 'editor' | 'welcome'

export interface RegisteredApp {
  id: string
  name: string
  exePath: string
  icon?: string
  addedAt: number
}

export interface WorkspaceRoot {
  id: string
  path: string
  name: string
  entries: FileEntry[]
  isExpanded: boolean
}

export interface TabEditorViewState {
  cursorPosition?: { lineNumber: number; column: number }
  scrollTop?: number
  scrollLeft?: number
  monacoViewState?: any
}

export interface WorkspaceTab {
  id: string
  title: string
  icon: string
  tabType: WorkspaceTabType
  filePath?: string
  content: string
  savedContent: string
  isDirty: boolean
  language: string
  viewState?: TabEditorViewState
}

export interface PendingDiffState {
  filePath: string
  originalContent: string
  newContent: string
  timestamp: number
}

export const useWorkspaceStore = defineStore('workspace', () => {
  const workspaceRoots = ref<WorkspaceRoot[]>([])
  const activeRootPath = ref<string | null>(null)

  function saveWorkspaceRootsToStorage(): void {
    try {
      const paths = workspaceRoots.value.map((r) => r.path)
      localStorage.setItem('makarya_workspace_roots', JSON.stringify(paths))
    } catch (e) {
      console.warn('Gagal menyimpan riwayat workspace:', e)
    }
  }

  async function loadWorkspaceRootsFromStorage(): Promise<void> {
    loadRecentFilesFromStorage()
    loadRegisteredAppsFromDb()
    try {
      const saved = localStorage.getItem('makarya_workspace_roots')
      if (!saved) return
      const paths = JSON.parse(saved) as string[]
      if (Array.isArray(paths) && paths.length > 0 && window.makaryaAPI) {
        for (const p of paths) {
          try {
            const entries = await window.makaryaAPI.readDirectory(p)
            await addWorkspaceRoot(p, entries, false)
          } catch {
            // Folder may no longer exist or be accessible
          }
        }
      }
      if (workspaceRoots.value.length > 0) {
        const agentStore = useAgentStore()
        if (!agentStore.connectedWorkspacePath) {
          agentStore.setConnectedWorkspacePath(workspaceRoots.value[0].path)
        }
      }
    } catch (e) {
      console.warn('Gagal memuat riwayat workspace:', e)
    }
  }

  async function addWorkspaceRoot(folderPath: string, initialEntries?: FileEntry[], autoSave = true): Promise<boolean> {
    const normalized = normalizePath(folderPath)
    const exists = workspaceRoots.value.some((r) => normalizePath(r.path) === normalized)
    if (exists) {
      activeRootPath.value = folderPath
      const agentStore = useAgentStore()
      if (!agentStore.connectedWorkspacePath) {
        agentStore.setConnectedWorkspacePath(folderPath)
      }
      return false
    }

    let entries = initialEntries
    if ((!entries || entries.length === 0) && window.makaryaAPI) {
      try {
        entries = await window.makaryaAPI.readDirectory(folderPath)
      } catch (err) {
        console.error('Failed to read directory:', err)
        entries = []
      }
    }

    const cleanPath = folderPath.replace(/[\\/]+$/, '')
    const segments = cleanPath.split(/[\\/]/)
    const name = segments[segments.length - 1] || folderPath

    workspaceRoots.value.push({
      id: `root-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      path: folderPath,
      name,
      entries: entries || [],
      isExpanded: true
    })

    activeRootPath.value = folderPath
    if (autoSave) {
      saveWorkspaceRootsToStorage()
    }
    const agentStore = useAgentStore()
    if (!agentStore.connectedWorkspacePath) {
      agentStore.setConnectedWorkspacePath(folderPath)
    }
    return true
  }

  function removeWorkspaceRoot(rootPath: string): void {
    const normalized = normalizePath(rootPath)
    workspaceRoots.value = workspaceRoots.value.filter((r) => normalizePath(r.path) !== normalized)
    if (activeRootPath.value && normalizePath(activeRootPath.value) === normalized) {
      activeRootPath.value = workspaceRoots.value[0]?.path || null
    }
    const agentStore = useAgentStore()
    if (agentStore.connectedWorkspacePath && normalizePath(agentStore.connectedWorkspacePath) === normalized) {
      agentStore.setConnectedWorkspacePath(workspaceRoots.value[0]?.path || null)
    }
    saveWorkspaceRootsToStorage()
  }

  async function setSingleWorkspaceRoot(folderPath: string, initialEntries?: FileEntry[]): Promise<void> {
    const cleanPath = folderPath.replace(/[\\/]+$/, '')
    const segments = cleanPath.split(/[\\/]/)
    const name = segments[segments.length - 1] || folderPath

    let entries = initialEntries
    if ((!entries || entries.length === 0) && window.makaryaAPI) {
      try {
        entries = await window.makaryaAPI.readDirectory(folderPath)
      } catch {
        entries = []
      }
    }

    workspaceRoots.value = [
      {
        id: `root-${Date.now()}`,
        path: folderPath,
        name,
        entries: entries || [],
        isExpanded: true
      }
    ]
    activeRootPath.value = folderPath
    saveWorkspaceRootsToStorage()
    const agentStore = useAgentStore()
    agentStore.setConnectedWorkspacePath(folderPath)
  }

  function toggleRootExpanded(rootPath: string): void {
    const normalized = normalizePath(rootPath)
    const root = workspaceRoots.value.find((r) => normalizePath(r.path) === normalized)
    if (root) {
      root.isExpanded = !root.isExpanded
    }
  }

  // Backward compatible rootFolderPath
  const rootFolderPath = computed({
    get: () => {
      if (activeRootPath.value) {
        const found = workspaceRoots.value.find((r) => normalizePath(r.path) === normalizePath(activeRootPath.value!))
        if (found) return found.path
      }
      return workspaceRoots.value.length > 0 ? workspaceRoots.value[0].path : null
    },
    set: (val: string | null) => {
      if (!val) {
        workspaceRoots.value = []
        activeRootPath.value = null
        saveWorkspaceRootsToStorage()
      } else {
        const normalized = normalizePath(val)
        const found = workspaceRoots.value.find((r) => normalizePath(r.path) === normalized)
        if (found) {
          activeRootPath.value = found.path
        } else {
          addWorkspaceRoot(val)
        }
      }
    }
  })

  // Backward compatible fileTreeEntries
  const fileTreeEntries = computed({
    get: () => {
      if (activeRootPath.value) {
        const found = workspaceRoots.value.find((r) => normalizePath(r.path) === normalizePath(activeRootPath.value!))
        if (found) return found.entries
      }
      return workspaceRoots.value.length > 0 ? workspaceRoots.value[0].entries : []
    },
    set: (val: FileEntry[]) => {
      if (activeRootPath.value) {
        const found = workspaceRoots.value.find((r) => normalizePath(r.path) === normalizePath(activeRootPath.value!))
        if (found) {
          found.entries = val
          return
        }
      }
      if (workspaceRoots.value.length > 0) {
        workspaceRoots.value[0].entries = val
      }
    }
  })

  const tabList = ref<WorkspaceTab[]>([
    {
      id: 'tab-welcome',
      title: 'Selamat Datang',
      icon: 'pi pi-home',
      tabType: 'welcome',
      content: '',
      savedContent: '',
      isDirty: false,
      language: 'markdown'
    }
  ])

  const activeTabId = ref<string>('tab-welcome')
  const isCommandPaletteVisible = ref<boolean>(false)
  const isQuickOpenVisible = ref<boolean>(false)
  const isWindowSwitcherVisible = ref<boolean>(false)
  const registeredApps = ref<RegisteredApp[]>([])
  const activeWindows = ref<Array<{ id: number; title: string; isFocused: boolean }>>([])
  const recentFiles = ref<Array<{ name: string; path: string }>>([])
  const isCopilotPanelOpen = ref<boolean>(true)
  const isSidebarOpen = ref<boolean>(true)
  const activeSidebarTab = ref<'explorer' | 'search'>('explorer')
  const isBottomPanelOpen = ref<boolean>(false)
  const bottomPanelHeight = ref<number>(260)

  function toggleBottomPanel(): void {
    isBottomPanelOpen.value = !isBottomPanelOpen.value
  }

  function setBottomPanelOpen(open: boolean): void {
    isBottomPanelOpen.value = open
  }

  function setBottomPanelHeight(height: number): void {
    bottomPanelHeight.value = Math.max(120, Math.min(height, window.innerHeight * 0.85))
  }

  function recordRecentFile(filePath: string, fileName: string): void {
    recentFiles.value = [
      { name: fileName, path: filePath },
      ...recentFiles.value.filter((f) => f.path !== filePath)
    ].slice(0, 30)
    try {
      localStorage.setItem('makarya_recent_files', JSON.stringify(recentFiles.value))
    } catch (e) {
      console.warn('Gagal menyimpan riwayat file:', e)
    }
  }

  function loadRecentFilesFromStorage(): void {
    try {
      const saved = localStorage.getItem('makarya_recent_files')
      if (saved) {
        recentFiles.value = JSON.parse(saved)
      }
    } catch (e) {
      console.warn('Gagal memuat riwayat file:', e)
    }
  }

  function toggleWindowSwitcher(): void {
    isWindowSwitcherVisible.value = !isWindowSwitcherVisible.value
    if (isWindowSwitcherVisible.value) {
      refreshActiveWindows()
      loadRegisteredAppsFromDb()
    }
  }

  function closeWindowSwitcher(): void {
    isWindowSwitcherVisible.value = false
  }

  async function refreshActiveWindows(): Promise<void> {
    if (window.makaryaAPI?.listWindows) {
      try {
        const wins = await window.makaryaAPI.listWindows()
        activeWindows.value = wins || []
      } catch (err) {
        console.warn('Gagal mengambil daftar jendela aktif:', err)
      }
    }
  }

  async function loadRegisteredAppsFromDb(): Promise<void> {
    try {
      const localSaved = localStorage.getItem('makarya_registered_apps')
      if (localSaved) {
        registeredApps.value = JSON.parse(localSaved)
      }
      if (window.makaryaAPI?.dbGetSetting) {
        const dbStr = await window.makaryaAPI.dbGetSetting('makarya_registered_apps')
        if (dbStr) {
          registeredApps.value = JSON.parse(dbStr)
          localStorage.setItem('makarya_registered_apps', dbStr)
        }
      }
    } catch (e) {
      console.warn('Gagal memuat aplikasi terdaftar dari database:', e)
    }
  }

  async function addRegisteredApp(app: Omit<RegisteredApp, 'id' | 'addedAt'>): Promise<void> {
    const newApp: RegisteredApp = {
      ...app,
      id: `app_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      addedAt: Date.now()
    }
    registeredApps.value = [newApp, ...registeredApps.value.filter((a) => a.exePath !== app.exePath)]
    const str = JSON.stringify(registeredApps.value)
    try {
      localStorage.setItem('makarya_registered_apps', str)
    } catch (e) {
      console.warn('Gagal menyimpan aplikasi ke localStorage:', e)
    }
    if (window.makaryaAPI?.dbSetSetting) {
      await window.makaryaAPI.dbSetSetting('makarya_registered_apps', str).catch?.((err) => {
        console.warn('Gagal menyimpan aplikasi ke SQLite:', err)
      })
    }
  }

  async function removeRegisteredApp(id: string): Promise<void> {
    registeredApps.value = registeredApps.value.filter((a) => a.id !== id)
    const str = JSON.stringify(registeredApps.value)
    try {
      localStorage.setItem('makarya_registered_apps', str)
    } catch (e) {
      console.warn('Gagal menyimpan aplikasi ke localStorage:', e)
    }
    if (window.makaryaAPI?.dbSetSetting) {
      await window.makaryaAPI.dbSetSetting('makarya_registered_apps', str).catch?.((err) => {
        console.warn('Gagal menyimpan aplikasi ke SQLite:', err)
      })
    }
  }

  interface CopiedEntryState {
    path: string
    name: string
    isDirectory: boolean
  }

  const copiedEntry = ref<CopiedEntryState | null>(null)
  const hasCopiedEntry = computed(() => copiedEntry.value !== null)

  // Centralized directory children and expanded state
  const directoryChildrenMap = ref<Record<string, FileEntry[]>>({})
  const expandedFolderPaths = ref<Record<string, boolean>>({})

  // Pending Inline Diffs (file path normalized -> diff details)
  const pendingDiffs = ref<Record<string, PendingDiffState>>({})

  function normalizePath(p: string): string {
    return p.replace(/\\/g, '/').toLowerCase()
  }

  function setPendingDiff(filePath: string, originalContent: string, newContent: string): void {
    const norm = normalizePath(filePath)
    pendingDiffs.value = {
      ...pendingDiffs.value,
      [norm]: {
        filePath,
        originalContent,
        newContent,
        timestamp: Date.now()
      }
    }
  }

  function getPendingDiff(filePath?: string): PendingDiffState | undefined {
    if (!filePath) return undefined
    return pendingDiffs.value[normalizePath(filePath)]
  }

  function clearPendingDiff(filePath: string): void {
    const norm = normalizePath(filePath)
    const updated = { ...pendingDiffs.value }
    delete updated[norm]
    pendingDiffs.value = updated
  }

  async function acceptDiff(filePath: string): Promise<boolean> {
    const norm = normalizePath(filePath)
    const diff = pendingDiffs.value[norm]
    if (!diff) return false

    if (window.makaryaAPI) {
      await window.makaryaAPI.writeFile(filePath, diff.newContent)
    }

    const targetTab = tabList.value.find((tab) => tab.filePath && normalizePath(tab.filePath) === norm)
    if (targetTab) {
      targetTab.content = diff.newContent
      targetTab.savedContent = diff.newContent
      targetTab.isDirty = false
    }

    const updated = { ...pendingDiffs.value }
    delete updated[norm]
    pendingDiffs.value = updated
    return true
  }

  async function rejectDiff(filePath: string): Promise<boolean> {
    const norm = normalizePath(filePath)
    const diff = pendingDiffs.value[norm]
    if (!diff) return false

    if (window.makaryaAPI) {
      await window.makaryaAPI.writeFile(filePath, diff.originalContent)
    }

    const targetTab = tabList.value.find((tab) => tab.filePath && normalizePath(tab.filePath) === norm)
    if (targetTab) {
      targetTab.content = diff.originalContent
      targetTab.savedContent = diff.originalContent
      targetTab.isDirty = false
    }

    const updated = { ...pendingDiffs.value }
    delete updated[norm]
    pendingDiffs.value = updated
    return true
  }

  async function acceptHunk(filePath: string, hunkId: string): Promise<{ finished: boolean; remainingHunksCount: number }> {
    const norm = normalizePath(filePath)
    const diff = pendingDiffs.value[norm]
    if (!diff) return { finished: true, remainingHunksCount: 0 }

    const resolution = resolveHunk(diff.originalContent, diff.newContent, hunkId, 'accept')

    if (window.makaryaAPI) {
      await window.makaryaAPI.writeFile(filePath, resolution.updatedOriginal)
    }

    const targetTab = tabList.value.find((tab) => tab.filePath && normalizePath(tab.filePath) === norm)
    if (targetTab) {
      targetTab.content = resolution.updatedOriginal
      targetTab.savedContent = resolution.updatedOriginal
      targetTab.isDirty = false
    }

    if (resolution.remainingHunksCount === 0) {
      const updated = { ...pendingDiffs.value }
      delete updated[norm]
      pendingDiffs.value = updated
      return { finished: true, remainingHunksCount: 0 }
    } else {
      pendingDiffs.value = {
        ...pendingDiffs.value,
        [norm]: {
          ...diff,
          originalContent: resolution.updatedOriginal,
          newContent: resolution.updatedNew
        }
      }
      return { finished: false, remainingHunksCount: resolution.remainingHunksCount }
    }
  }

  async function rejectHunk(filePath: string, hunkId: string): Promise<{ finished: boolean; remainingHunksCount: number }> {
    const norm = normalizePath(filePath)
    const diff = pendingDiffs.value[norm]
    if (!diff) return { finished: true, remainingHunksCount: 0 }

    const resolution = resolveHunk(diff.originalContent, diff.newContent, hunkId, 'reject')

    if (window.makaryaAPI) {
      await window.makaryaAPI.writeFile(filePath, resolution.updatedOriginal)
    }

    const targetTab = tabList.value.find((tab) => tab.filePath && normalizePath(tab.filePath) === norm)
    if (targetTab) {
      targetTab.content = resolution.updatedOriginal
      targetTab.savedContent = resolution.updatedOriginal
      targetTab.isDirty = false
    }

    if (resolution.remainingHunksCount === 0) {
      const updated = { ...pendingDiffs.value }
      delete updated[norm]
      pendingDiffs.value = updated
      return { finished: true, remainingHunksCount: 0 }
    } else {
      pendingDiffs.value = {
        ...pendingDiffs.value,
        [norm]: {
          ...diff,
          originalContent: resolution.updatedOriginal,
          newContent: resolution.updatedNew
        }
      }
      return { finished: false, remainingHunksCount: resolution.remainingHunksCount }
    }
  }

  const activeTab = computed(() => {
    return tabList.value.find((tab) => tab.id === activeTabId.value) || tabList.value[0]
  })

  const openedFolderPath = computed(() => rootFolderPath.value)

  function getEffectiveProjectRoot(): string | undefined {
    // 1. If active tab belongs to one of the workspace roots, use that root
    const activeFile = activeTab.value
    if (activeFile && activeFile.filePath) {
      const normalizedTabPath = normalizePath(activeFile.filePath)
      for (const root of workspaceRoots.value) {
        if (normalizedTabPath.startsWith(normalizePath(root.path))) {
          return root.path
        }
      }
      // Fallback: intelligently derive project root from active tab file path if available
      const normalized = activeFile.filePath.replace(/\\/g, '/')
      const appIndex = normalized.indexOf('/application/')
      if (appIndex > 0) {
        return normalized.slice(0, appIndex)
      }
      const srcIndex = normalized.indexOf('/src/')
      if (srcIndex > 0) {
        return normalized.slice(0, srcIndex)
      }
      const lastSlash = normalized.lastIndexOf('/')
      if (lastSlash > 0) {
        return normalized.slice(0, lastSlash)
      }
    }

    if (activeRootPath.value) {
      return activeRootPath.value
    }

    if (workspaceRoots.value.length > 0) {
      return workspaceRoots.value[0].path
    }

    return undefined
  }

  // Open a file from disk into a tab
  async function openFile(filePath: string, fileName: string): Promise<void> {
    recordRecentFile(filePath, fileName)
    const existingTab = tabList.value.find((tab) => tab.filePath === filePath)
    if (existingTab) {
      activeTabId.value = existingTab.id
      return
    }

    if (!window.makaryaAPI) return

    const readResult = await window.makaryaAPI.readFile(filePath)
    if (readResult.error) {
      console.error(`Gagal membaca file ${filePath}:`, readResult.error)
      return
    }

    const detectedLang = detectMonacoLanguage(filePath)
    const iconClass = getFileIconClass(fileName, false)

    const newTab: WorkspaceTab = {
      id: `tab-${filePath.replace(/[^a-zA-Z0-9]/g, '_')}`,
      title: fileName,
      icon: iconClass,
      tabType: 'editor',
      filePath,
      content: readResult.content,
      savedContent: readResult.content,
      isDirty: false,
      language: detectedLang
    }

    // Remove welcome tab if it's the only one open
    if (tabList.value.length === 1 && tabList.value[0].id === 'tab-welcome') {
      tabList.value = []
    }

    tabList.value.push(newTab)
    activeTabId.value = newTab.id
  }

  // Update tab content on typing in Monaco
  function updateTabContent(tabId: string, newContent: string): void {
    const targetTab = tabList.value.find((tab) => tab.id === tabId)
    if (!targetTab) return

    targetTab.content = newContent
    targetTab.isDirty = targetTab.content !== targetTab.savedContent
  }

  // Save active file back to disk (Ctrl+S)
  async function saveActiveFile(): Promise<{ success: boolean; message: string }> {
    const currentTab = activeTab.value
    if (!currentTab || !currentTab.filePath) {
      return { success: false, message: 'Tidak ada file aktif untuk disimpan' }
    }

    if (!window.makaryaAPI) {
      return { success: false, message: 'API desktop tidak tersedia' }
    }

    const saveResult = await window.makaryaAPI.writeFile(currentTab.filePath, currentTab.content)
    if (saveResult.success) {
      currentTab.savedContent = currentTab.content
      currentTab.isDirty = false
      return { success: true, message: `File ${currentTab.title} berhasil disimpan` }
    } else {
      return { success: false, message: saveResult.error || 'Gagal menyimpan file' }
    }
  }

  function closeTab(targetTabId: string): void {
    const targetIndex = tabList.value.findIndex((tab) => tab.id === targetTabId)
    if (targetIndex === -1) return

    tabList.value.splice(targetIndex, 1)

    if (activeTabId.value === targetTabId) {
      if (tabList.value.length > 0) {
        const nextIndex = Math.max(0, targetIndex - 1)
        activeTabId.value = tabList.value[nextIndex].id
      } else {
        // Open welcome tab if all tabs are closed
        tabList.value.push({
          id: 'tab-welcome',
          title: 'Selamat Datang',
          icon: 'pi pi-home',
          tabType: 'welcome',
          content: '',
          savedContent: '',
          isDirty: false,
          language: 'markdown'
        })
        activeTabId.value = 'tab-welcome'
      }
    }
  }

  function getParentDirectoryPath(filePath: string): string {
    const cleanPath = filePath.replace(/[\\/]+$/, '')
    const lastSlashIndex = Math.max(cleanPath.lastIndexOf('/'), cleanPath.lastIndexOf('\\'))
    return lastSlashIndex > 0 ? cleanPath.substring(0, lastSlashIndex) : (rootFolderPath.value || '')
  }

  async function loadDirectoryChildren(folderPath: string): Promise<FileEntry[]> {
    if (!window.makaryaAPI) return []
    const entries = await window.makaryaAPI.readDirectory(folderPath)
    directoryChildrenMap.value = {
      ...directoryChildrenMap.value,
      [folderPath]: entries
    }
    return entries
  }

  async function toggleFolderExpanded(folderPath: string): Promise<void> {
    const isNowExpanded = !expandedFolderPaths.value[folderPath]
    expandedFolderPaths.value = {
      ...expandedFolderPaths.value,
      [folderPath]: isNowExpanded
    }
    if (isNowExpanded && !directoryChildrenMap.value[folderPath]) {
      await loadDirectoryChildren(folderPath)
    }
  }

  async function refreshDirectory(targetFolderPath?: string): Promise<void> {
    if (!window.makaryaAPI) return

    // Re-read all workspace roots entries
    for (const root of workspaceRoots.value) {
      try {
        root.entries = await window.makaryaAPI.readDirectory(root.path)
      } catch (err) {
        console.error(`Gagal membaca folder root ${root.path}:`, err)
      }
    }

    // If target folder is specified and is not one of the roots
    if (targetFolderPath && !workspaceRoots.value.some((r) => normalizePath(r.path) === normalizePath(targetFolderPath))) {
      try {
        const entries = await window.makaryaAPI.readDirectory(targetFolderPath)
        directoryChildrenMap.value = {
          ...directoryChildrenMap.value,
          [targetFolderPath]: entries
        }
      } catch (err) {
        console.error('Failed to refresh target folder:', err)
      }
    }

    // Refresh all currently expanded folders so the entire tree view stays synchronized
    const rootPathsSet = new Set(workspaceRoots.value.map((r) => normalizePath(r.path)))
    const expandedList = Object.keys(expandedFolderPaths.value).filter(
      (path) => expandedFolderPaths.value[path] && !rootPathsSet.has(normalizePath(path)) && normalizePath(path) !== normalizePath(targetFolderPath || '')
    )
    for (const folder of expandedList) {
      try {
        const entries = await window.makaryaAPI.readDirectory(folder)
        directoryChildrenMap.value = {
          ...directoryChildrenMap.value,
          [folder]: entries
        }
      } catch {
        // Folder might have been deleted or moved
      }
    }
  }

  async function refreshFileTree(): Promise<void> {
    await refreshDirectory()
  }

  async function createFile(parentDirectoryPath: string, fileName: string): Promise<{ success: boolean; message: string }> {
    if (!window.makaryaAPI) return { success: false, message: 'API desktop tidak tersedia' }

    const separator = parentDirectoryPath.includes('\\') ? '\\' : '/'
    const targetFilePath = `${parentDirectoryPath.replace(/[\\/]+$/, '')}${separator}${fileName}`

    const createResult = await window.makaryaAPI.createFile(targetFilePath)
    if (createResult.success) {
      // Auto expand parent directory so new file is visible
      if (parentDirectoryPath !== rootFolderPath.value) {
        expandedFolderPaths.value = {
          ...expandedFolderPaths.value,
          [parentDirectoryPath]: true
        }
      }
      await refreshDirectory(parentDirectoryPath)
      await openFile(targetFilePath, fileName)
      return { success: true, message: `File ${fileName} berhasil dibuat` }
    } else {
      return { success: false, message: createResult.error || 'Gagal membuat file' }
    }
  }

  async function createFolder(parentDirectoryPath: string, folderName: string): Promise<{ success: boolean; message: string }> {
    if (!window.makaryaAPI) return { success: false, message: 'API desktop tidak tersedia' }

    const separator = parentDirectoryPath.includes('\\') ? '\\' : '/'
    const targetDirectoryPath = `${parentDirectoryPath.replace(/[\\/]+$/, '')}${separator}${folderName}`

    const createResult = await window.makaryaAPI.createDirectory(targetDirectoryPath)
    if (createResult.success) {
      // Auto expand parent directory so new folder is visible
      if (parentDirectoryPath !== rootFolderPath.value) {
        expandedFolderPaths.value = {
          ...expandedFolderPaths.value,
          [parentDirectoryPath]: true
        }
      }
      await refreshDirectory(parentDirectoryPath)
      return { success: true, message: `Folder ${folderName} berhasil dibuat` }
    } else {
      return { success: false, message: createResult.error || 'Gagal membuat folder' }
    }
  }

  async function renameEntry(oldPath: string, newName: string): Promise<{ success: boolean; message: string }> {
    if (!window.makaryaAPI) return { success: false, message: 'API desktop tidak tersedia' }

    const separator = oldPath.includes('\\') ? '\\' : '/'
    const parentDirectoryPath = getParentDirectoryPath(oldPath)
    const newPath = `${parentDirectoryPath.replace(/[\\/]+$/, '')}${separator}${newName}`

    const renameResult = await window.makaryaAPI.renameEntry(oldPath, newPath)
    if (renameResult.success) {
      // If the renamed item was an expanded folder, transfer its state
      if (directoryChildrenMap.value[oldPath]) {
        directoryChildrenMap.value[newPath] = directoryChildrenMap.value[oldPath]
        delete directoryChildrenMap.value[oldPath]
      }
      if (expandedFolderPaths.value[oldPath]) {
        expandedFolderPaths.value[newPath] = true
        delete expandedFolderPaths.value[oldPath]
      }

      // Update open tab if renamed
      const affectedTab = tabList.value.find((tab) => tab.filePath === oldPath)
      if (affectedTab) {
        affectedTab.filePath = newPath
        affectedTab.title = newName
        affectedTab.language = detectMonacoLanguage(newPath)
      }

      await refreshDirectory(parentDirectoryPath)
      return { success: true, message: `Berhasil diubah menjadi ${newName}` }
    } else {
      return { success: false, message: renameResult.error || 'Gagal mengubah nama' }
    }
  }

  async function deleteEntry(targetPath: string): Promise<{ success: boolean; message: string }> {
    if (!window.makaryaAPI) return { success: false, message: 'API desktop tidak tersedia' }

    const parentDirectoryPath = getParentDirectoryPath(targetPath)
    const deleteResult = await window.makaryaAPI.deleteEntry(targetPath)
    if (deleteResult.success) {
      delete directoryChildrenMap.value[targetPath]
      delete expandedFolderPaths.value[targetPath]

      // Close tab if deleted file was open
      const affectedTab = tabList.value.find((tab) => tab.filePath === targetPath)
      if (affectedTab) {
        closeTab(affectedTab.id)
      }
      await refreshDirectory(parentDirectoryPath)
      return { success: true, message: 'Berhasil dihapus' }
    } else {
      return { success: false, message: deleteResult.error || 'Gagal menghapus' }
    }
  }

  function setCopiedEntry(entry: { path: string; name: string; isDirectory: boolean }): void {
    copiedEntry.value = {
      path: entry.path,
      name: entry.name,
      isDirectory: entry.isDirectory
    }
  }

  function clearCopiedEntry(): void {
    copiedEntry.value = null
  }

  async function pasteCopiedEntry(targetDirectoryPath: string): Promise<{ success: boolean; message: string }> {
    if (!copiedEntry.value) {
      return { success: false, message: 'Tidak ada berkas yang disalin' }
    }
    if (!window.makaryaAPI) {
      return { success: false, message: 'API desktop tidak tersedia' }
    }

    const copyResult = await window.makaryaAPI.copyEntry(copiedEntry.value.path, targetDirectoryPath)
    if (copyResult.success) {
      // Auto expand target folder so newly pasted item is immediately visible
      if (targetDirectoryPath !== rootFolderPath.value) {
        expandedFolderPaths.value = {
          ...expandedFolderPaths.value,
          [targetDirectoryPath]: true
        }
      }
      await refreshDirectory(targetDirectoryPath)

      if (!copiedEntry.value.isDirectory && copyResult.destinationPath) {
        const newFileName = copyResult.destinationPath.split(/[\\/]/).pop() || copiedEntry.value.name
        await openFile(copyResult.destinationPath, newFileName)
      }
      return { success: true, message: `"${copiedEntry.value.name}" berhasil disalin` }
    } else {
      return { success: false, message: copyResult.error || 'Gagal menyalin' }
    }
  }

  async function duplicateEntry(entry: { path: string; name: string; isDirectory: boolean }): Promise<{ success: boolean; message: string }> {
    if (!window.makaryaAPI) {
      return { success: false, message: 'API desktop tidak tersedia' }
    }

    const parentDirectoryPath = getParentDirectoryPath(entry.path)
    const copyResult = await window.makaryaAPI.copyEntry(entry.path, parentDirectoryPath)
    if (copyResult.success) {
      // Auto expand parent folder so duplicated item is immediately visible
      if (parentDirectoryPath !== rootFolderPath.value) {
        expandedFolderPaths.value = {
          ...expandedFolderPaths.value,
          [parentDirectoryPath]: true
        }
      }
      await refreshDirectory(parentDirectoryPath)

      if (!entry.isDirectory && copyResult.destinationPath) {
        const newFileName = copyResult.destinationPath.split(/[\\/]/).pop() || entry.name
        await openFile(copyResult.destinationPath, newFileName)
      }
      return { success: true, message: `"${entry.name}" berhasil diduplikasi` }
    } else {
      return { success: false, message: copyResult.error || 'Gagal menduplikasi' }
    }
  }

  function setActiveTab(targetTabId: string): void {
    activeTabId.value = targetTabId
  }

  function saveActiveTabViewState(viewState: TabEditorViewState, targetTabId?: string): void {
    const idToFind = targetTabId || activeTabId.value
    const current = tabList.value.find((tab) => tab.id === idToFind)
    if (current && viewState) {
      current.viewState = viewState
    }
  }

  function getTabViewState(tabId: string): TabEditorViewState | undefined {
    const target = tabList.value.find((tab) => tab.id === tabId)
    return target?.viewState
  }

  function toggleCommandPalette(): void {
    isCommandPaletteVisible.value = !isCommandPaletteVisible.value
  }

  function toggleQuickOpen(): void {
    isQuickOpenVisible.value = !isQuickOpenVisible.value
  }

  function closeQuickOpen(): void {
    isQuickOpenVisible.value = false
  }

  function toggleCopilotPanel(): void {
    isCopilotPanelOpen.value = !isCopilotPanelOpen.value
  }

  function toggleSidebar(): void {
    isSidebarOpen.value = !isSidebarOpen.value
  }

  return {
    workspaceRoots,
    activeRootPath,
    addWorkspaceRoot,
    removeWorkspaceRoot,
    setSingleWorkspaceRoot,
    toggleRootExpanded,
    loadWorkspaceRootsFromStorage,
    rootFolderPath,
    openedFolderPath,
    getEffectiveProjectRoot,
    fileTreeEntries,
    tabList,
    activeTabId,
    activeTab,
    isCommandPaletteVisible,
    isQuickOpenVisible,
    isWindowSwitcherVisible,
    registeredApps,
    activeWindows,
    toggleWindowSwitcher,
    closeWindowSwitcher,
    refreshActiveWindows,
    loadRegisteredAppsFromDb,
    addRegisteredApp,
    removeRegisteredApp,
    recentFiles,
    toggleQuickOpen,
    closeQuickOpen,
    isCopilotPanelOpen,
    isSidebarOpen,
    activeSidebarTab,
    isBottomPanelOpen,
    bottomPanelHeight,
    toggleBottomPanel,
    setBottomPanelOpen,
    setBottomPanelHeight,
    copiedEntry,
    hasCopiedEntry,
    directoryChildrenMap,
    expandedFolderPaths,
    getParentDirectoryPath,
    loadDirectoryChildren,
    toggleFolderExpanded,
    refreshDirectory,
    refreshFileTree,
    openFile,
    updateTabContent,
    saveActiveFile,
    closeTab,
    setActiveTab,
    saveActiveTabViewState,
    getTabViewState,
    toggleCommandPalette,
    toggleCopilotPanel,
    toggleSidebar,
    createFile,
    createFolder,
    renameEntry,
    deleteEntry,
    setCopiedEntry,
    clearCopiedEntry,
    pasteCopiedEntry,
    duplicateEntry,
    pendingDiffs,
    setPendingDiff,
    getPendingDiff,
    clearPendingDiff,
    acceptDiff,
    rejectDiff,
    acceptHunk,
    rejectHunk
  }
})
