export interface FileEntry {
  name: string
  path: string
  isDirectory: boolean
  children?: FileEntry[]
}

export interface WorkspaceFileItem {
  name: string
  path: string
  relativePath: string
  rootPath: string
}

export interface ToolStartEventPayload {
  requestId: string
  toolCallId: string
  toolName: string
  args: Record<string, any>
}

export interface ToolFinishEventPayload {
  requestId: string
  toolCallId: string
  toolName: string
  status: 'success' | 'error'
  output: string
  durationMs: number
}

export interface FileModifiedEventPayload {
  filePath: string
  fileName: string
  additions: number
  deletions: number
  originalContent?: string
  newContent?: string
}

export type MultimodalContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface ElectronAPI {
  ping: () => Promise<string>
  executeCommand: (commandString: string) => Promise<{ exitCode: number; stdout: string; stderr: string }>
  onCommandOutput: (callback: (outputChunk: string) => void) => () => void
  readSystemInfo: () => Promise<{ platform: string; arch: string; nodeVersion: string }>

  // Window Controls & Process Management (Task View)
  minimizeWindow: () => Promise<void>
  maximizeWindow: () => Promise<boolean>
  closeWindow: () => Promise<void>
  isWindowMaximized: () => Promise<boolean>
  openNewWindow: () => Promise<{ success: boolean; windowId?: number }>
  listWindows: () => Promise<Array<{ id: number; title: string; isFocused: boolean }>>
  focusWindow: (windowId: number) => Promise<{ success: boolean }>
  pickExeFile: () => Promise<{ canceled: boolean; filePath?: string; fileName?: string; error?: string }>
  launchExe: (exePath: string, appId?: string) => Promise<{ success: boolean; pid?: number; error?: string }>
  stopExe: (appId: string) => Promise<{ success: boolean; error?: string }>
  getRunningApps: () => Promise<string[]>
  onAppStatusChange: (callback: (payload: { appId: string; isRunning: boolean }) => void) => () => void
  onWindowStateChange: (callback: (isMaximized: boolean) => void) => () => void

  // File System & Explorer Operations
  openFolderDialog: () => Promise<{ canceled: boolean; folderPath?: string; entries?: FileEntry[] }>
  readDirectory: (targetDirectoryPath: string) => Promise<FileEntry[]>
  readFile: (targetFilePath: string) => Promise<{ content: string; error?: string }>
  writeFile: (targetFilePath: string, fileContent: string) => Promise<{ success: boolean; error?: string }>
  createFile: (targetFilePath: string) => Promise<{ success: boolean; error?: string }>
  createDirectory: (targetDirectoryPath: string) => Promise<{ success: boolean; error?: string }>
  renameEntry: (oldPath: string, newPath: string) => Promise<{ success: boolean; error?: string }>
  deleteEntry: (targetPath: string) => Promise<{ success: boolean; error?: string }>
  copyEntry: (sourcePath: string, destinationDirectory: string, customNewName?: string) => Promise<{ success: boolean; destinationPath?: string; error?: string }>
  searchWorkspaceFiles: (rootPaths: string[]) => Promise<WorkspaceFileItem[]>

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
  }) => Promise<{ accepted: boolean }>
  abortChatMessage: (requestId: string) => Promise<{ aborted: boolean }>
  respondToolApproval: (toolCallId: string, approved: boolean) => Promise<boolean>
  fetchAvailableModels: () => Promise<string[]>
  onAgentToolRequireApproval: (callback: (data: { requestId: string; toolCallId: string; toolName: string; args: any }) => void) => () => void
  onAgentStreamToken: (callback: (data: { requestId: string; deltaContent: string }) => void) => () => void
  onAgentThought: (callback: (data: { requestId: string; deltaThought: string }) => void) => () => void
  onAgentToolStart: (callback: (data: ToolStartEventPayload) => void) => () => void
  onAgentToolFinish: (callback: (data: ToolFinishEventPayload) => void) => () => void
  onAgentFileModified: (callback: (data: FileModifiedEventPayload) => void) => () => void
  onAgentStreamDone: (callback: (data: { requestId: string; fullContent?: string; isAborted?: boolean }) => void) => () => void
  onAgentStreamError: (callback: (data: { requestId: string; errorMessage: string }) => void) => () => void

  // SQLite Main Database API
  dbGetInfo: () => Promise<{ dbPath: string; exists: boolean; sizeBytes: number; tableCount: number; tables: string[]; version: string }>
  dbGetSetting: (key: string) => Promise<string | null>
  dbSetSetting: (key: string, value: string) => Promise<boolean>
  dbGetWorkspaces: () => Promise<Array<{ id: string; path: string; name: string; last_opened_at: string }>>
  dbSaveWorkspace: (folderPath: string, folderName: string) => Promise<boolean>
  dbDeleteWorkspace: (folderPath: string) => Promise<boolean>
  dbGetChatSessions: () => Promise<Array<{ id: string; title: string; model: string; projectRoot?: string; createdAt: string; updatedAt: string; messageCount: number; lastMessage: string }>>
  dbCreateSession: (session: { id: string; title?: string; model?: string; projectRoot?: string }) => Promise<boolean>
  dbDeleteSession: (sessionId: string) => Promise<boolean>
  dbSaveChatMessage: (messagePayload: any) => Promise<boolean>
  dbGetChatHistory: (sessionId?: string, limit?: number) => Promise<any[]>
  dbClearChatHistory: (sessionId?: string) => Promise<boolean>
  dbExecuteQuery: (sql: string, params?: any[]) => Promise<{ success: boolean; data?: any; error?: string }>

  // Integrated Terminal Panel API
  createTerminal: (options: {
    id: string
    cols?: number
    rows?: number
    cwd?: string
    shell?: string
  }) => Promise<{ success: boolean; id?: string; shell?: string; cwd?: string; error?: string }>
  writeTerminal: (payload: { id: string; data: string }) => Promise<{ success: boolean; error?: string }>
  resizeTerminal: (payload: { id: string; cols: number; rows: number }) => Promise<{ success: boolean; error?: string }>
  killTerminal: (payload: { id: string }) => Promise<{ success: boolean }>
  onTerminalData: (callback: (payload: { id: string; data: string }) => void) => () => void
  onTerminalExit: (callback: (payload: { id: string; exitCode: number }) => void) => () => void
}

declare global {
  interface Window {
    makaryaAPI: ElectronAPI
  }
}
