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
  openBlankAppWindow: (destroyCurrent?: boolean) => Promise<{ success: boolean; windowId?: number }>
  openEditorWindow: (destroyCurrent?: boolean) => Promise<{ success: boolean; windowId?: number }>
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
  saveImageToProject: (projectRoot: string, fileName: string, base64Data: string) => Promise<{ success: boolean; absolutePath?: string; relativePath?: string; fileName?: string; error?: string }>

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
  }) => Promise<{ accepted: boolean }>
  startOpenCodeStream: (payload: {
    requestId: string
    model?: string
    messages: Array<{
      role: 'system' | 'user' | 'assistant'
      content: string
    }>
    projectRoot?: string
    executionMode?: string
  }) => Promise<{ accepted: boolean }>
  abortOpenCodeStream: (requestId: string) => Promise<{ aborted: boolean }>
  fetchOpenCodeModels: () => Promise<Array<{ id: string; name: string; provider?: string; category: string; isFree?: boolean; source?: string }>>
  fetchOpenCodeSessions: () => Promise<Array<{ id: string; title: string; updated?: string; dateGroup?: string; timestamp?: number; subtitle?: string; isPinned?: boolean }>>
  loadOpenCodeSession: (sessionId: string) => Promise<{ id: string; title: string; messages: any[] } | null>
  deleteOpenCodeSession: (sessionId: string) => Promise<boolean>
  startClaudeStream: (payload: {
    requestId: string
    model?: string
    messages: Array<{
      role: 'system' | 'user' | 'assistant'
      content: string
    }>
    projectRoot?: string
    executionMode?: string
  }) => Promise<{ accepted: boolean }>
  abortClaudeStream: (requestId: string) => Promise<{ aborted: boolean }>
  fetchClaudeModels: () => Promise<Array<{ id: string; name: string; provider?: string; category: string; isFree?: boolean; source?: string }>>
  fetchClaudeSessions: () => Promise<Array<{ id: string; title: string; updated?: string; dateGroup?: string; timestamp?: number; subtitle?: string; isPinned?: boolean }>>
  loadClaudeSession: (sessionId: string) => Promise<{ id: string; title: string; messages: any[] } | null>
  deleteClaudeSession: (sessionId: string) => Promise<boolean>
  gitGetStatus: (projectPath: string) => Promise<{
    isGitRepo: boolean
    branch: string
    ahead: number
    behind: number
    staged: Array<{ path: string; status: string; statusCode: string; oldPath?: string; isStaged: boolean }>
    unstaged: Array<{ path: string; status: string; statusCode: string; oldPath?: string; isStaged: boolean }>
    untracked: Array<{ path: string; status: string; statusCode: string; isStaged: boolean }>
    totalChanges: number
  }>
  gitStage: (projectPath: string, filePath: string) => Promise<boolean>
  gitStageAll: (projectPath: string) => Promise<boolean>
  gitUnstage: (projectPath: string, filePath: string) => Promise<boolean>
  gitUnstageAll: (projectPath: string) => Promise<boolean>
  gitDiscard: (projectPath: string, filePath: string, isUntracked?: boolean) => Promise<boolean>
  gitDiscardAll: (projectPath: string) => Promise<boolean>
  gitCommit: (projectPath: string, message: string) => Promise<{ success: boolean; hash?: string; error?: string }>
  gitGetDiff: (projectPath: string, filePath: string, staged?: boolean) => Promise<{ originalContent: string; newContent: string }>
  gitGenerateCommitMsg: (projectPath: string, model?: string) => Promise<string>
  gitPush: (projectPath: string) => Promise<{ success: boolean; message?: string; error?: string }>
  gitPull: (projectPath: string) => Promise<{ success: boolean; message?: string; error?: string }>
  abortChatMessage: (requestId: string) => Promise<{ aborted: boolean }>
  respondToolApproval: (toolCallId: string, approved: boolean) => Promise<boolean>
  respondCustomTool: (toolCallId: string, result: any) => Promise<boolean>
  testDbConnection: (config: {
    type: string
    host: string
    port?: number
    database: string
    username?: string
    password?: string
    authType?: string
  }) => Promise<{ success: boolean; latencyMs?: number; message?: string; error?: string }>
  inspectDbSchema: (config: any) => Promise<{
    success: boolean
    database: string
    dbType: string
    tableCount: number
    tables: Array<{ name: string; schema?: string; columns: Array<{ name: string; type: string; isNullable?: boolean; isPrimary?: boolean; defaultValue?: string }> }>
    message?: string
    error?: string
  }>
  executeDbLiveQuery: (payload: { config: any; sql: string; limit?: number }) => Promise<{
    success: boolean
    rowCount: number
    columns: string[]
    rows: any[]
    durationMs: number
    error?: string
  }>
  fetchAvailableModels: () => Promise<string[]>
  onAgentToolRequireApproval: (callback: (data: { requestId: string; toolCallId: string; toolName: string; args: any }) => void) => () => void
  onAgentAskQuestion: (callback: (data: { requestId: string; toolCallId: string; question: string; options: string[]; is_multi_select?: boolean }) => void) => () => void
  onAgentExecuteCustomTool: (callback: (data: { requestId: string; toolCallId: string; toolName: string; args: any }) => void) => () => void
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
