import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'
import type {
  FileEntry,
  ToolStartEventPayload,
  ToolFinishEventPayload,
  FileModifiedEventPayload,
  MultimodalContentPart
} from './index.d'

const makaryaAPI = {
  ping: (): Promise<string> => ipcRenderer.invoke('system:ping'),
  executeCommand: (commandString: string): Promise<{ exitCode: number; stdout: string; stderr: string }> =>
    ipcRenderer.invoke('agent:execute-command', commandString),
  onCommandOutput: (callback: (outputChunk: string) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, outputChunk: string): void => callback(outputChunk)
    ipcRenderer.on('agent:command-output', listener)
    return (): void => {
      ipcRenderer.removeListener('agent:command-output', listener)
    }
  },
  readSystemInfo: (): Promise<{ platform: string; arch: string; nodeVersion: string }> =>
    ipcRenderer.invoke('system:info'),

  // Window Controls
  minimizeWindow: (): Promise<void> => ipcRenderer.invoke('window:minimize'),
  maximizeWindow: (): Promise<boolean> => ipcRenderer.invoke('window:maximize'),
  closeWindow: (): Promise<void> => ipcRenderer.invoke('window:close'),
  isWindowMaximized: (): Promise<boolean> => ipcRenderer.invoke('window:is-maximized'),
  openNewWindow: (): Promise<{ success: boolean; windowId?: number }> => ipcRenderer.invoke('window:open-new-window'),
  openBlankAppWindow: (destroyCurrent: boolean = true): Promise<{ success: boolean; windowId?: number }> =>
    ipcRenderer.invoke('window:open-blank-app', destroyCurrent),
  openEditorWindow: (destroyCurrent: boolean = false): Promise<{ success: boolean; windowId?: number }> =>
    ipcRenderer.invoke('window:open-editor-mode', destroyCurrent),
  listWindows: (): Promise<Array<{ id: number; title: string; isFocused: boolean }>> => ipcRenderer.invoke('window:list-all'),
  focusWindow: (windowId: number): Promise<{ success: boolean }> => ipcRenderer.invoke('window:focus-window', windowId),
  pickExeFile: (): Promise<{ canceled: boolean; filePath?: string; fileName?: string; error?: string }> => ipcRenderer.invoke('app:pick-exe'),
  launchExe: (exePath: string, appId?: string): Promise<{ success: boolean; pid?: number; error?: string }> => ipcRenderer.invoke('app:launch-exe', exePath, appId),
  stopExe: (appId: string): Promise<{ success: boolean; error?: string }> => ipcRenderer.invoke('app:stop-exe', appId),
  getRunningApps: (): Promise<string[]> => ipcRenderer.invoke('app:get-running'),
  onAppStatusChange: (callback: (payload: { appId: string; isRunning: boolean }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: { appId: string; isRunning: boolean }): void =>
      callback(data)
    ipcRenderer.on('app:status-changed', listener)
    return (): void => {
      ipcRenderer.removeListener('app:status-changed', listener)
    }
  },
  onWindowStateChange: (callback: (isMaximized: boolean) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: { isMaximized: boolean }): void =>
      callback(data.isMaximized)
    ipcRenderer.on('window:state-changed', listener)
    return (): void => {
      ipcRenderer.removeListener('window:state-changed', listener)
    }
  },

  openFolderDialog: (): Promise<{ canceled: boolean; folderPath?: string; entries?: FileEntry[] }> =>
    ipcRenderer.invoke('fs:open-folder-dialog'),
  readDirectory: (targetDirectoryPath: string): Promise<FileEntry[]> =>
    ipcRenderer.invoke('fs:read-directory', targetDirectoryPath),
  readFile: (targetFilePath: string): Promise<{ content: string; error?: string }> =>
    ipcRenderer.invoke('fs:read-file', targetFilePath),
  writeFile: (targetFilePath: string, fileContent: string) =>
    ipcRenderer.invoke('fs:write-file', targetFilePath, fileContent),
  createFile: (targetFilePath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('fs:create-file', targetFilePath),
  createDirectory: (targetDirectoryPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('fs:create-directory', targetDirectoryPath),
  renameEntry: (oldPath: string, newPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('fs:rename-entry', oldPath, newPath),
  deleteEntry: (targetPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('fs:delete-entry', targetPath),
  copyEntry: (sourcePath: string, destinationDirectory: string, customNewName?: string): Promise<{ success: boolean; destinationPath?: string; error?: string }> =>
    ipcRenderer.invoke('fs:copy-entry', sourcePath, destinationDirectory, customNewName),
  searchWorkspaceFiles: (rootPaths: string[]): Promise<Array<{ name: string; path: string; relativePath: string; rootPath: string }>> =>
    ipcRenderer.invoke('fs:search-workspace-files', rootPaths),
  saveImageToProject: (projectRoot: string, fileName: string, base64Data: string): Promise<{ success: boolean; absolutePath?: string; relativePath?: string; fileName?: string; error?: string }> =>
    ipcRenderer.invoke('fs:save-image-to-project', projectRoot, fileName, base64Data),

  // AI Copilot & Autonomous Agent API
  sendChatMessage: (payload: {
    requestId: string
    model?: string
    messages: Array<{
      role: 'system' | 'user' | 'assistant' | 'tool'
      content?: string | MultimodalContentPart[] | null
      tool_call_id?: string
      name?: string
    }>
    projectRoot?: string
    autoExecution?: string
    reviewPolicy?: string
    customTools?: Array<{
      name: string
      description: string
      parameters?: any
      pluginId?: string
    }>
  }): Promise<{ accepted: boolean }> =>
    ipcRenderer.invoke('agent:chat-stream', payload),
  startOpenCodeStream: (payload: {
    requestId: string
    model?: string
    messages: Array<{
      role: 'system' | 'user' | 'assistant'
      content: string
    }>
    projectRoot?: string
    executionMode?: string
  }): Promise<{ accepted: boolean }> =>
    ipcRenderer.invoke('opencode:chat-stream', payload),
  abortOpenCodeStream: (requestId: string): Promise<{ aborted: boolean }> =>
    ipcRenderer.invoke('opencode:chat-abort', requestId),
  fetchOpenCodeModels: (): Promise<Array<{ id: string; name: string; provider?: string; category: string; isFree?: boolean; source?: string }>> =>
    ipcRenderer.invoke('opencode:get-models'),
  fetchOpenCodeSessions: (): Promise<Array<{ id: string; title: string; updated?: string; dateGroup?: string; timestamp?: number; subtitle?: string; isPinned?: boolean }>> =>
    ipcRenderer.invoke('opencode:session-list'),
  loadOpenCodeSession: (sessionId: string): Promise<{ id: string; title: string; messages: any[] } | null> =>
    ipcRenderer.invoke('opencode:session-load', sessionId),
  deleteOpenCodeSession: (sessionId: string): Promise<boolean> =>
    ipcRenderer.invoke('opencode:session-delete', sessionId),
  startClaudeStream: (payload: {
    requestId: string
    model?: string
    messages: Array<{
      role: 'system' | 'user' | 'assistant'
      content: string
    }>
    projectRoot?: string
    executionMode?: string
  }): Promise<{ accepted: boolean }> =>
    ipcRenderer.invoke('claude:chat-stream', payload),
  abortClaudeStream: (requestId: string): Promise<{ aborted: boolean }> =>
    ipcRenderer.invoke('claude:chat-abort', requestId),
  fetchClaudeModels: (): Promise<Array<{ id: string; name: string; provider?: string; category: string; isFree?: boolean; source?: string }>> =>
    ipcRenderer.invoke('claude:get-models'),
  fetchClaudeSessions: (): Promise<Array<{ id: string; title: string; updated?: string; dateGroup?: string; timestamp?: number; subtitle?: string; isPinned?: boolean }>> =>
    ipcRenderer.invoke('claude:session-list'),
  loadClaudeSession: (sessionId: string): Promise<{ id: string; title: string; messages: any[] } | null> =>
    ipcRenderer.invoke('claude:session-load', sessionId),
  deleteClaudeSession: (sessionId: string): Promise<boolean> =>
    ipcRenderer.invoke('claude:session-delete', sessionId),
  gitGetStatus: (projectPath: string): Promise<any> =>
    ipcRenderer.invoke('git:get-status', projectPath),
  gitStage: (projectPath: string, filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('git:stage', projectPath, filePath),
  gitStageAll: (projectPath: string): Promise<boolean> =>
    ipcRenderer.invoke('git:stage-all', projectPath),
  gitUnstage: (projectPath: string, filePath: string): Promise<boolean> =>
    ipcRenderer.invoke('git:unstage', projectPath, filePath),
  gitUnstageAll: (projectPath: string): Promise<boolean> =>
    ipcRenderer.invoke('git:unstage-all', projectPath),
  gitDiscard: (projectPath: string, filePath: string, isUntracked?: boolean): Promise<boolean> =>
    ipcRenderer.invoke('git:discard', projectPath, filePath, isUntracked),
  gitDiscardAll: (projectPath: string): Promise<boolean> =>
    ipcRenderer.invoke('git:discard-all', projectPath),
  gitCommit: (projectPath: string, message: string): Promise<{ success: boolean; hash?: string; error?: string }> =>
    ipcRenderer.invoke('git:commit', projectPath, message),
  gitGetDiff: (projectPath: string, filePath: string, staged?: boolean): Promise<{ originalContent: string; newContent: string }> =>
    ipcRenderer.invoke('git:get-diff', projectPath, filePath, staged),
  gitGenerateCommitMsg: (
    projectPath: string,
    model?: string,
    config?: { baseUrl?: string; apiKey?: string }
  ): Promise<string> => ipcRenderer.invoke('git:generate-commit-msg', projectPath, model, config),
  gitPush: (projectPath: string): Promise<{ success: boolean; message?: string; error?: string }> =>
    ipcRenderer.invoke('git:push', projectPath),
  gitPull: (projectPath: string): Promise<{ success: boolean; message?: string; error?: string }> =>
    ipcRenderer.invoke('git:pull', projectPath),
  abortChatMessage: (requestId: string): Promise<{ aborted: boolean }> =>
    ipcRenderer.invoke('agent:chat-abort', requestId),
  respondToolApproval: (toolCallId: string, approved: boolean): Promise<boolean> =>
    ipcRenderer.invoke('agent:respond-tool-approval', toolCallId, approved),
  respondCustomTool: (toolCallId: string, result: any): Promise<boolean> =>
    ipcRenderer.invoke('agent:respond-custom-tool', toolCallId, result),
  testDbConnection: (config: {
    type: string
    host: string
    port?: number
    database: string
    username?: string
    password?: string
    authType?: string
  }): Promise<{ success: boolean; latencyMs?: number; message?: string; error?: string }> =>
    ipcRenderer.invoke('db:test-connection', config),
  inspectDbSchema: (config: any): Promise<any> =>
    ipcRenderer.invoke('db:inspect-schema', config),
  executeDbLiveQuery: (payload: { config: any; sql: string; limit?: number }): Promise<any> =>
    ipcRenderer.invoke('db:execute-live-query', payload),
  fetchAvailableModels: (): Promise<string[]> =>
    ipcRenderer.invoke('agent:get-models'),
  updateAiConfig: (config: { baseUrl?: string; apiKey?: string }): Promise<{ success: boolean }> =>
    ipcRenderer.invoke('agent:update-config', config),
  getAiConfig: (): Promise<{ baseUrl: string; apiKey: string; defaultModel: string }> =>
    ipcRenderer.invoke('agent:get-config'),
  onAgentToolRequireApproval: (callback: (data: { requestId: string; toolCallId: string; toolName: string; args: any }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: { requestId: string; toolCallId: string; toolName: string; args: any }): void => callback(data)
    ipcRenderer.on('agent:tool-require-approval', listener)
    return (): void => {
      ipcRenderer.removeListener('agent:tool-require-approval', listener)
    }
  },
  onAgentAskQuestion: (callback: (data: { requestId: string; toolCallId: string; question: string; options: string[]; is_multi_select?: boolean }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: { requestId: string; toolCallId: string; question: string; options: string[]; is_multi_select?: boolean }): void => callback(data)
    ipcRenderer.on('agent:ask-question', listener)
    return (): void => {
      ipcRenderer.removeListener('agent:ask-question', listener)
    }
  },
  onAgentExecuteCustomTool: (callback: (data: { requestId: string; toolCallId: string; toolName: string; args: any }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: { requestId: string; toolCallId: string; toolName: string; args: any }): void => callback(data)
    ipcRenderer.on('agent:execute-custom-tool', listener)
    return (): void => {
      ipcRenderer.removeListener('agent:execute-custom-tool', listener)
    }
  },
  onAgentStreamToken: (callback: (data: { requestId: string; deltaContent: string }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: { requestId: string; deltaContent: string }): void => callback(data)
    ipcRenderer.on('agent:stream-token', listener)
    return (): void => {
      ipcRenderer.removeListener('agent:stream-token', listener)
    }
  },
  onAgentThought: (callback: (data: { requestId: string; deltaThought: string }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: { requestId: string; deltaThought: string }): void => callback(data)
    ipcRenderer.on('agent:thought-token', listener)
    return (): void => {
      ipcRenderer.removeListener('agent:thought-token', listener)
    }
  },
  onAgentToolStart: (callback: (data: ToolStartEventPayload) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: ToolStartEventPayload): void => callback(data)
    ipcRenderer.on('agent:tool-start', listener)
    return (): void => {
      ipcRenderer.removeListener('agent:tool-start', listener)
    }
  },
  onAgentToolFinish: (callback: (data: ToolFinishEventPayload) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: ToolFinishEventPayload): void => callback(data)
    ipcRenderer.on('agent:tool-finish', listener)
    return (): void => {
      ipcRenderer.removeListener('agent:tool-finish', listener)
    }
  },
  onAgentFileModified: (callback: (data: FileModifiedEventPayload) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: FileModifiedEventPayload): void => callback(data)
    ipcRenderer.on('agent:file-modified', listener)
    return (): void => {
      ipcRenderer.removeListener('agent:file-modified', listener)
    }
  },
  onAgentStreamDone: (callback: (data: { requestId: string; fullContent?: string; isAborted?: boolean }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: { requestId: string; fullContent?: string; isAborted?: boolean }): void => callback(data)
    ipcRenderer.on('agent:stream-done', listener)
    return (): void => {
      ipcRenderer.removeListener('agent:stream-done', listener)
    }
  },
  onAgentStreamError: (callback: (data: { requestId: string; errorMessage: string }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: { requestId: string; errorMessage: string }): void => callback(data)
    ipcRenderer.on('agent:stream-error', listener)
    return (): void => {
      ipcRenderer.removeListener('agent:stream-error', listener)
    }
  },

  // UI Builder Multimodal IPC
  sendUiBuilderChat: (payload: {
    requestId: string
    model?: string
    messages: Array<{
      role: 'system' | 'user' | 'assistant'
      content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
    }>
    temperature?: number
  }): Promise<{ accepted: boolean }> =>
    ipcRenderer.invoke('ui-builder:chat-stream', payload),
  abortUiBuilderChat: (requestId: string): Promise<{ aborted: boolean }> =>
    ipcRenderer.invoke('ui-builder:chat-abort', requestId),
  onUiBuilderStreamToken: (callback: (data: { requestId: string; deltaContent: string }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: { requestId: string; deltaContent: string }): void => callback(data)
    ipcRenderer.on('ui-builder:stream-token', listener)
    return (): void => {
      ipcRenderer.removeListener('ui-builder:stream-token', listener)
    }
  },
  onUiBuilderThought: (callback: (data: { requestId: string; deltaThought: string }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: { requestId: string; deltaThought: string }): void => callback(data)
    ipcRenderer.on('ui-builder:thought-token', listener)
    return (): void => {
      ipcRenderer.removeListener('ui-builder:thought-token', listener)
    }
  },
  onUiBuilderStreamDone: (callback: (data: { requestId: string; fullContent?: string; isAborted?: boolean }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: { requestId: string; fullContent?: string; isAborted?: boolean }): void => callback(data)
    ipcRenderer.on('ui-builder:stream-done', listener)
    return (): void => {
      ipcRenderer.removeListener('ui-builder:stream-done', listener)
    }
  },
  onUiBuilderStreamError: (callback: (data: { requestId: string; errorMessage: string }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, data: { requestId: string; errorMessage: string }): void => callback(data)
    ipcRenderer.on('ui-builder:stream-error', listener)
    return (): void => {
      ipcRenderer.removeListener('ui-builder:stream-error', listener)
    }
  },

  // SQLite Main Database IPC
  dbGetInfo: () => ipcRenderer.invoke('db:get-info'),
  dbGetSetting: (key: string) => ipcRenderer.invoke('db:get-setting', key),
  dbSetSetting: (key: string, value: string) => ipcRenderer.invoke('db:set-setting', key, value),
  dbGetWorkspaces: () => ipcRenderer.invoke('db:get-workspaces'),
  dbSaveWorkspace: (folderPath: string, folderName: string) => ipcRenderer.invoke('db:save-workspace', folderPath, folderName),
  dbDeleteWorkspace: (folderPath: string) => ipcRenderer.invoke('db:delete-workspace', folderPath),
  dbGetChatSessions: () => ipcRenderer.invoke('db:get-chat-sessions'),
  dbCreateSession: (session: { id: string; title?: string; model?: string; projectRoot?: string }) => ipcRenderer.invoke('db:create-session', session),
  dbDeleteSession: (sessionId: string) => ipcRenderer.invoke('db:delete-session', sessionId),
  dbSaveChatMessage: (messagePayload: any) => ipcRenderer.invoke('db:save-chat-message', messagePayload),
  dbGetChatHistory: (sessionId?: string, limit?: number) => ipcRenderer.invoke('db:get-chat-history', sessionId, limit),
  dbClearChatHistory: (sessionId?: string) => ipcRenderer.invoke('db:clear-chat-history', sessionId),
  dbExecuteQuery: (sql: string, params?: any[]) => ipcRenderer.invoke('db:execute-query', sql, params),

  // Integrated Terminal Panel IPC
  createTerminal: (options: { id: string; cols?: number; rows?: number; cwd?: string; shell?: string }) =>
    ipcRenderer.invoke('terminal:create', options),
  writeTerminal: (payload: { id: string; data: string }) =>
    ipcRenderer.invoke('terminal:write', payload),
  resizeTerminal: (payload: { id: string; cols: number; rows: number }) =>
    ipcRenderer.invoke('terminal:resize', payload),
  killTerminal: (payload: { id: string }) =>
    ipcRenderer.invoke('terminal:kill', payload),
  onTerminalData: (callback: (payload: { id: string; data: string }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: { id: string; data: string }): void => callback(payload)
    ipcRenderer.on('terminal:data', listener)
    return (): void => {
      ipcRenderer.removeListener('terminal:data', listener)
    }
  },
  onTerminalExit: (callback: (payload: { id: string; exitCode: number }) => void): (() => void) => {
    const listener = (_event: IpcRendererEvent, payload: { id: string; exitCode: number }): void => callback(payload)
    ipcRenderer.on('terminal:exit', listener)
    return (): void => {
      ipcRenderer.removeListener('terminal:exit', listener)
    }
  },

  // Global Code & Text Search in Files
  findInFiles: (options: {
    query: string
    rootPaths?: string[]
    isRegex?: boolean
    isCaseSensitive?: boolean
    matchWholeWord?: boolean
    includePattern?: string
    excludePattern?: string
    maxResults?: number
    offset?: number
  }): Promise<{
    results: Array<{
      filePath: string
      fileName: string
      relativePath: string
      rootPath: string
      matches: Array<{
        lineNumber: number
        lineContent: string
        matchStart: number
        matchEnd: number
      }>
    }>
    totalMatches: number
    totalFiles: number
    hasMore: boolean
    offset: number
    limit: number
    truncated: boolean
  }> => ipcRenderer.invoke('search:find-in-files', options),

  // Auto / Mandatory Updater APIs
  checkForUpdates: (): Promise<{
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
  }> => ipcRenderer.invoke('updater:check-update'),

  downloadUpdate: (downloadUrl: string, targetFileName?: string): Promise<{ success: boolean; filePath?: string; error?: string }> =>
    ipcRenderer.invoke('updater:download-update', downloadUrl, targetFileName),

  installUpdate: (installerPath: string): Promise<{ success: boolean; error?: string }> =>
    ipcRenderer.invoke('updater:install-update', installerPath),

  onUpdateDownloadProgress: (
    callback: (data: { percent: number; transferredBytes: number; totalBytes: number; speedMbps: number }) => void
  ): (() => void) => {
    const listener = (
      _event: IpcRendererEvent,
      data: { percent: number; transferredBytes: number; totalBytes: number; speedMbps: number }
    ): void => callback(data)
    ipcRenderer.on('updater:download-progress', listener)
    return (): void => {
      ipcRenderer.removeListener('updater:download-progress', listener)
    }
  }
}

try {
  contextBridge.exposeInMainWorld('makaryaAPI', makaryaAPI)
} catch (exposeError) {
  console.warn('[Preload] Fallback direct window assignment:', exposeError)
  // @ts-ignore
  window.makaryaAPI = makaryaAPI
}
