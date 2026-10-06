import type {
  PluginManifest,
  PluginContext,
  Disposable,
  CommandAPI,
  WorkspaceAPI,
  EditorAPI,
  UIAPI,
  StorageAPI,
  AgentAPI,
  TerminalAPI,
  EventsAPI,
  DatabaseAPI,
  SystemAPI,
  StatusBarItem,
  StatusBarItemOptions,
  SidebarViewContribution,
  AIToolDefinition,
  ToastOptions,
  ConfirmDialogOptions,
  WorkspaceTabInfo
} from '@makarya/sdk'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { useAgentStore } from '@renderer/stores/agentStore'
import { usePluginStore } from '@renderer/stores/pluginStore'

/**
 * Global event emitter for Makarya extensions
 */
class PluginEventEmitter {
  private listeners = new Map<string, Set<(payload: any) => void>>()

  public on(event: string, handler: (payload: any) => void): Disposable {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set())
    }
    this.listeners.get(event)!.add(handler)

    return {
      dispose: () => {
        this.listeners.get(event)?.delete(handler)
      }
    }
  }

  public emit(event: string, payload?: any): void {
    const handlers = this.listeners.get(event)
    if (handlers) {
      handlers.forEach((h) => {
        try {
          h(payload)
        } catch (e) {
          console.error(`[PluginEvent] Error in handler for event "${event}":`, e)
        }
      })
    }
  }
}

export const globalPluginEvents = new PluginEventEmitter()

/**
 * Factory that creates a sandbox/runtime PluginContext for a specific plugin.
 */
export function createPluginContext(manifest: PluginManifest): PluginContext {
  const subscriptions: Disposable[] = []
  const workspaceStore = useWorkspaceStore()
  const settingsStore = useSettingsStore()
  const agentStore = useAgentStore()
  const pluginStore = usePluginStore()

  // 1. Commands API
  const commands: CommandAPI = {
    registerCommand(commandId: string, handler: (...args: any[]) => any): Disposable {
      const disposable = pluginStore.registerCommand(commandId, handler, manifest.id)
      subscriptions.push(disposable)
      return disposable
    },
    async executeCommand<T = any>(commandId: string, ...args: any[]): Promise<T> {
      return pluginStore.executeCommand<T>(commandId, ...args)
    },
    getRegisteredCommands(): string[] {
      return pluginStore.registeredCommandIds
    }
  }

  // 2. Workspace API
  const workspace: WorkspaceAPI = {
    getWorkspaceRoots() {
      return workspaceStore.workspaceRoots.map((r) => ({
        id: r.id,
        path: r.path,
        name: r.name
      }))
    },
    getActiveRootPath() {
      return workspaceStore.openedFolderPath || null
    },
    getOpenTabs(): WorkspaceTabInfo[] {
      return workspaceStore.tabList.map((t) => ({
        id: t.id,
        title: t.title,
        filePath: t.filePath,
        content: t.content,
        isDirty: t.isDirty,
        language: t.language
      }))
    },
    getActiveTab(): WorkspaceTabInfo | null {
      const active = workspaceStore.activeTab
      if (!active) return null
      return {
        id: active.id,
        title: active.title,
        filePath: active.filePath,
        content: active.content,
        isDirty: active.isDirty,
        language: active.language
      }
    },
    async openFile(filePath: string, targetLine?: number): Promise<void> {
      const name = filePath.split(/[\\/]/).pop() || 'Untitled'
      await workspaceStore.openFile(filePath, name, targetLine)
    },
    closeTab(tabId: string): void {
      workspaceStore.closeTab(tabId)
    },
    async saveActiveFile() {
      return workspaceStore.saveActiveFile()
    },
    async readFile(filePath: string) {
      if (window.makaryaAPI) {
        return window.makaryaAPI.readFile(filePath)
      }
      return { content: '', error: 'API desktop tidak tersedia' }
    },
    async writeFile(filePath: string, content: string) {
      if (window.makaryaAPI) {
        return window.makaryaAPI.writeFile(filePath, content)
      }
      return { success: false, error: 'API desktop tidak tersedia' }
    },
    async createFile(parentDir: string, fileName: string) {
      return workspaceStore.createFile(parentDir, fileName)
    },
    async createFolder(parentDir: string, folderName: string) {
      return workspaceStore.createFolder(parentDir, folderName)
    },
    async findFiles(searchQuery?: string) {
      if (window.makaryaAPI) {
        const rootPaths = workspaceStore.workspaceRoots.map((r) => r.path)
        const files = await window.makaryaAPI.searchWorkspaceFiles(rootPaths)
        if (!searchQuery) return files
        const q = searchQuery.toLowerCase()
        return files.filter((f) => f.name.toLowerCase().includes(q) || f.relativePath.toLowerCase().includes(q))
      }
      return []
    },
    onDidOpenFile(listener: (tab: WorkspaceTabInfo) => void): Disposable {
      return globalPluginEvents.on('workspace:did-open-file', listener)
    },
    onDidSaveFile(listener: (file: { path: string; content: string }) => void): Disposable {
      return globalPluginEvents.on('workspace:did-save-file', listener)
    },
    onDidChangeActiveTab(listener: (tab: WorkspaceTabInfo | null) => void): Disposable {
      return globalPluginEvents.on('workspace:did-change-active-tab', listener)
    }
  }

  // 3. Editor API
  const editor: EditorAPI = {
    insertText(text: string): void {
      const ed = workspaceStore.getActiveEditorInstance()
      if (ed) {
        const selection = ed.getSelection()
        if (selection) {
          ed.executeEdits('plugin', [{ range: selection, text, forceMoveMarkers: true }])
        }
      }
    },
    replaceSelection(text: string): void {
      this.insertText(text)
    },
    getSelectedText(): string {
      const ed = workspaceStore.getActiveEditorInstance()
      if (ed) {
        const model = ed.getModel()
        const selection = ed.getSelection()
        if (model && selection) {
          return model.getValueInRange(selection)
        }
      }
      return ''
    },
    getCursorPosition(): { lineNumber: number; column: number } | null {
      const ed = workspaceStore.getActiveEditorInstance()
      if (ed) {
        const pos = ed.getPosition()
        return pos ? { lineNumber: pos.lineNumber, column: pos.column } : null
      }
      return null
    },
    setCursorPosition(lineNumber: number, column: number): void {
      const ed = workspaceStore.getActiveEditorInstance()
      if (ed) {
        ed.setPosition({ lineNumber, column })
        ed.focus()
      }
    },
    revealLine(lineNumber: number): void {
      const ed = workspaceStore.getActiveEditorInstance()
      if (ed) {
        ed.revealLineInCenter(lineNumber)
      }
    },
    getRawMonacoEditor(): any | null {
      return workspaceStore.getActiveEditorInstance()
    }
  }

  // 4. UI API
  const ui: UIAPI = {
    showToast(options: ToastOptions | string): void {
      const opt: ToastOptions = typeof options === 'string' ? { message: options, type: 'info' } : options
      pluginStore.notifyToast(opt)
    },
    showConfirmDialog(options: ConfirmDialogOptions): void {
      pluginStore.requestConfirmDialog(options)
    },
    createStatusBarItem(options: StatusBarItemOptions): StatusBarItem {
      const item = pluginStore.addStatusBarItem(options, manifest.id)
      subscriptions.push(item)
      return item
    },
    registerSidebarView(view: SidebarViewContribution): Disposable {
      const disposable = pluginStore.registerSidebarView(view, manifest.id)
      subscriptions.push(disposable)
      return disposable
    }
  }

  // 5. Storage API (Isolated per plugin ID)
  const storagePrefix = `makarya_plugin_storage_${manifest.id}_`
  const storage: StorageAPI = {
    get<T = any>(key: string, defaultValue?: T): T {
      try {
        const val = localStorage.getItem(`${storagePrefix}${key}`)
        return val !== null ? JSON.parse(val) : defaultValue
      } catch {
        return defaultValue as T
      }
    },
    set<T = any>(key: string, value: T): void {
      try {
        localStorage.setItem(`${storagePrefix}${key}`, JSON.stringify(value))
      } catch (e) {
        console.warn(`[PluginStorage:${manifest.id}] Gagal menyimpan data:`, e)
      }
    },
    delete(key: string): void {
      localStorage.removeItem(`${storagePrefix}${key}`)
    },
    clear(): void {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(storagePrefix)) {
          keysToRemove.push(k)
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k))
    }
  }

  // 6. Agent API (AI Tool Extensibility)
  const agent: AgentAPI = {
    registerTool(tool: AIToolDefinition): Disposable {
      const disposable = pluginStore.registerAITool(tool, manifest.id)
      subscriptions.push(disposable)
      return disposable
    },
    async sendMessage(prompt: string, contextSnippet?: string): Promise<void> {
      if (contextSnippet) {
        await agentStore.sendMessage(`[Context]\n${contextSnippet}\n\n${prompt}`)
      } else {
        await agentStore.sendMessage(prompt)
      }
    },
    async getAvailableModels(): Promise<string[]> {
      return agentStore.availableModels
    },
    onStreamToken(listener: (data: { requestId: string; deltaContent: string }) => void): Disposable {
      return globalPluginEvents.on('agent:stream-token', listener)
    },
    onToolExecuted(listener: (data: { toolName: string; args: any; result: any }) => void): Disposable {
      return globalPluginEvents.on('agent:tool-executed', listener)
    }
  }

  // 7. Terminal API
  const terminal: TerminalAPI = {
    async executeCommand(command: string) {
      if (window.makaryaAPI?.executeCommand) {
        return window.makaryaAPI.executeCommand(command)
      }
      return { exitCode: 1, stdout: '', stderr: 'Terminal API tidak tersedia' }
    },
    async createTerminal(options) {
      const termId = `term_plugin_${manifest.id}_${Date.now()}`
      if (window.makaryaAPI?.createTerminal) {
        await window.makaryaAPI.createTerminal({
          id: termId,
          cwd: options?.cwd || workspaceStore.openedFolderPath || undefined,
          shell: options?.shell
        })
      }
      return {
        id: termId,
        write: (data: string) => {
          window.makaryaAPI?.writeTerminal({ id: termId, data })
        },
        kill: () => {
          window.makaryaAPI?.killTerminal({ id: termId })
        }
      }
    }
  }

  // 8. Events API
  const events: EventsAPI = {
    emit(eventName: string, payload?: any): void {
      globalPluginEvents.emit(eventName, payload)
    },
    on(eventName: string, handler: (payload: any) => void): Disposable {
      const disposable = globalPluginEvents.on(eventName, handler)
      subscriptions.push(disposable)
      return disposable
    }
  }

  // 9. Database API (SQLite main query)
  const db: DatabaseAPI = {
    async query<T = any>(sql: string, params?: any[]): Promise<T[]> {
      if (window.makaryaAPI?.dbExecuteQuery) {
        return window.makaryaAPI.dbExecuteQuery(sql, params)
      }
      return []
    },
    async getSetting(key: string): Promise<string | null> {
      if (window.makaryaAPI?.dbGetSetting) {
        return window.makaryaAPI.dbGetSetting(key)
      }
      return localStorage.getItem(key)
    },
    async setSetting(key: string, value: string): Promise<void> {
      if (window.makaryaAPI?.dbSetSetting) {
        await window.makaryaAPI.dbSetSetting(key, value)
      }
      localStorage.setItem(key, value)
    }
  }

  // 10. System API
  const system: SystemAPI = {
    async getInfo() {
      if (window.makaryaAPI?.readSystemInfo) {
        return window.makaryaAPI.readSystemInfo()
      }
      return { platform: 'browser', arch: 'unknown', nodeVersion: 'none' }
    },
    async openExternal(url: string): Promise<void> {
      window.open(url, '_blank')
    }
  }

  return {
    manifest: Object.freeze({ ...manifest }),
    subscriptions,
    commands,
    workspace,
    editor,
    ui,
    storage,
    agent,
    terminal,
    events,
    db,
    system
  }
}
