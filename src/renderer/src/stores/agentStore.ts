import { ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useWorkspaceStore } from './workspaceStore'
import { useSettingsStore } from './settingsStore'
import { usePluginStore } from './pluginStore'

export interface AgentToolCallItem {
  id: string
  name: string
  args: Record<string, any>
  output?: string
  status: 'running' | 'success' | 'error' | 'waiting_approval'
  durationMs?: number
}

export interface AttachedFileMeta {
  path: string
  name: string
  isDirectory?: boolean
  lineRange?: string
  startLine?: number
  endLine?: number
  selectedSnippet?: string
}

export interface ChatMessage {
  id: string
  role: 'system' | 'user' | 'assistant'
  content: string
  images?: string[]
  thoughts?: string
  isThinking?: boolean
  thinkingDurationSeconds?: number
  activeAction?: string
  toolCalls?: AgentToolCallItem[]
  modifiedFiles?: Array<{
    filePath: string
    fileName: string
    additions: number
    deletions: number
    originalContent?: string
    newContent?: string
  }>
  attachedFiles?: AttachedFileMeta[]
  timestamp: string
  isStreaming?: boolean
  error?: string
}

export interface ModifiedFileSessionItem {
  filePath: string
  fileName: string
  additions: number
  deletions: number
  originalContent?: string
  newContent?: string
}

export interface ChatSessionItem {
  id: string
  title: string
  model: string
  projectRoot?: string
  createdAt: string
  updatedAt: string
  messageCount: number
  lastMessage?: string
}

export interface ActiveFileContext {
  filePath?: string
  fileName?: string
  content?: string
  language?: string
}

export const useAgentStore = defineStore('agentStore', () => {
  const messages = ref<ChatMessage[]>([])

  // Master-Detail Session State
  const currentSessionId = ref<string>(
    localStorage.getItem('makarya_agent_current_session') || `session-${Date.now()}`
  )
  const currentSessionTitle = ref<string>('Obrolan Baru')
  const sessionsList = ref<ChatSessionItem[]>([])
  const isSessionsModalOpen = ref<boolean>(false)

  const connectedWorkspacePath = ref<string | null>(
    localStorage.getItem('makarya_agent_connected_workspace') || null
  )

  function setConnectedWorkspacePath(path: string | null): void {
    connectedWorkspacePath.value = path
    if (path) {
      localStorage.setItem('makarya_agent_connected_workspace', path)
    } else {
      localStorage.removeItem('makarya_agent_connected_workspace')
    }
  }

  const settingsStore = useSettingsStore()
  const isGenerating = ref<boolean>(false)
  const activeRequestId = ref<string | null>(null)

  // Selected model: follow settingsStore.ai.defaultModel first, then localStorage
  const savedModel = localStorage.getItem('makarya_agent_selected_model') || ''
  const selectedModel = ref<string>(settingsStore.ai.defaultModel || savedModel || '')
  const availableModels = ref<string[]>([])
  const isModelsLoading = ref<boolean>(false)

  // Keep selectedModel synchronized with settingsStore.ai.defaultModel
  watch(
    () => settingsStore.ai.defaultModel,
    (newDefault) => {
      if (newDefault && selectedModel.value !== newDefault) {
        selectedModel.value = newDefault
        localStorage.setItem('makarya_agent_selected_model', newDefault)
      }
    }
  )

  watch(
    selectedModel,
    (newModel) => {
      if (newModel) {
        localStorage.setItem('makarya_agent_selected_model', newModel)
        if (settingsStore.ai.defaultModel !== newModel) {
          settingsStore.ai.defaultModel = newModel
        }
      }
    }
  )

  async function loadModels(): Promise<void> {
    if (!window.makaryaAPI?.fetchAvailableModels) return
    isModelsLoading.value = true
    try {
      const models = await window.makaryaAPI.fetchAvailableModels()
      if (Array.isArray(models) && models.length > 0) {
        availableModels.value = models

        // Prioritas 1: Ambil model default dari Pengaturan
        const configuredDefault = settingsStore.ai.defaultModel
        const saved = localStorage.getItem('makarya_agent_selected_model')

        if (configuredDefault && models.includes(configuredDefault)) {
          selectedModel.value = configuredDefault
        } else if (saved && models.includes(saved)) {
          selectedModel.value = saved
          settingsStore.ai.defaultModel = saved
        } else if (selectedModel.value && models.includes(selectedModel.value)) {
          settingsStore.ai.defaultModel = selectedModel.value
        } else {
          // Fallback ke model pertama yang tersedia dari 9router
          selectedModel.value = models[0]
          settingsStore.ai.defaultModel = models[0]
        }
      } else {
        availableModels.value = []
      }
    } catch (err) {
      console.warn('Gagal memuat model dari 9router:', err)
      availableModels.value = []
    } finally {
      isModelsLoading.value = false
    }
  }

  function setSelectedModel(model: string): void {
    selectedModel.value = model
    if (model) {
      localStorage.setItem('makarya_agent_selected_model', model)
      settingsStore.ai.defaultModel = model
    }
  }

  const includeActiveFileContext = ref<boolean>(true)
  const sessionModifiedFiles = ref<ModifiedFileSessionItem[]>([])

  let thinkingTimer: any = null
  let cleanupTokenListener: (() => void) | null = null
  let cleanupThoughtListener: (() => void) | null = null
  let cleanupToolStartListener: (() => void) | null = null
  let cleanupToolRequireApprovalListener: (() => void) | null = null
  let cleanupToolFinishListener: (() => void) | null = null
  let cleanupFileModifiedListener: (() => void) | null = null
  let cleanupDoneListener: (() => void) | null = null
  let cleanupErrorListener: (() => void) | null = null

  function stopThinkingTimer(): void {
    if (thinkingTimer) {
      clearInterval(thinkingTimer)
      thinkingTimer = null
    }
  }

  function startThinkingTimer(targetMessage: ChatMessage): void {
    stopThinkingTimer()
    targetMessage.thinkingDurationSeconds = 1
    thinkingTimer = setInterval(() => {
      if (targetMessage.isStreaming) {
        targetMessage.thinkingDurationSeconds = (targetMessage.thinkingDurationSeconds || 0) + 1
      } else {
        stopThinkingTimer()
      }
    }, 1000)
  }

  async function loadSessions(): Promise<void> {
    if (!window.makaryaAPI?.dbGetChatSessions) return
    try {
      const list = await window.makaryaAPI.dbGetChatSessions()
      if (Array.isArray(list)) {
        sessionsList.value = list
        // Update currentSessionTitle if matching session exists
        const current = list.find((s) => s.id === currentSessionId.value)
        if (current) {
          currentSessionTitle.value = current.title
          if (current.model) selectedModel.value = current.model
        }
      }
    } catch (err) {
      console.warn('Gagal memuat daftar sesi chat SQLite:', err)
    }
  }

  function createNewSession(customTitle?: string): void {
    if (isGenerating.value) {
      abortGeneration()
    }
    const newSessionId = `session-${Date.now()}`
    currentSessionId.value = newSessionId
    currentSessionTitle.value = customTitle || 'Obrolan Baru'
    localStorage.setItem('makarya_agent_current_session', newSessionId)

    messages.value = []
    sessionModifiedFiles.value = []
    isSessionsModalOpen.value = false

    if (window.makaryaAPI?.dbCreateSession) {
      window.makaryaAPI.dbCreateSession({
        id: newSessionId,
        title: currentSessionTitle.value,
        model: selectedModel.value,
        projectRoot: connectedWorkspacePath.value || undefined
      }).then(() => {
        loadSessions()
      })
    }
  }

  async function switchSession(sessionId: string): Promise<void> {
    if (isGenerating.value) {
      await abortGeneration()
    }

    currentSessionId.value = sessionId
    localStorage.setItem('makarya_agent_current_session', sessionId)

    const targetSession = sessionsList.value.find((s) => s.id === sessionId)
    if (targetSession) {
      currentSessionTitle.value = targetSession.title
      if (targetSession.model) selectedModel.value = targetSession.model
    }

    sessionModifiedFiles.value = []
    isSessionsModalOpen.value = false

    if (window.makaryaAPI?.dbGetChatHistory) {
      try {
        const history = await window.makaryaAPI.dbGetChatHistory(sessionId, 200)
        messages.value = (history || []).map((item) => ({
          id: item.id,
          role: item.role,
          content: item.content || '',
          thoughts: item.thoughts || '',
          attachedFiles: item.attachedFiles,
          images: item.images,
          timestamp: item.timestamp
            ? settingsStore.formatTimestamp(item.timestamp)
            : 'Tersimpan'
        }))
      } catch (err) {
        console.warn(`Gagal memuat detail pesan sesi ${sessionId}:`, err)
      }
    }
  }

  async function deleteSession(sessionId: string): Promise<void> {
    if (window.makaryaAPI?.dbDeleteSession) {
      try {
        await window.makaryaAPI.dbDeleteSession(sessionId)
        if (currentSessionId.value === sessionId) {
          createNewSession()
        } else {
          await loadSessions()
        }
      } catch (err) {
        console.warn(`Gagal menghapus sesi ${sessionId}:`, err)
      }
    }
  }

  async function loadChatHistoryFromDb(): Promise<void> {
    await loadSessions()
    if (!window.makaryaAPI?.dbGetChatHistory) return
    try {
      const history = await window.makaryaAPI.dbGetChatHistory(currentSessionId.value, 200)
      if (history && history.length > 0) {
        messages.value = history.map((item) => ({
          id: item.id,
          role: item.role,
          content: item.content || '',
          thoughts: item.thoughts || '',
          attachedFiles: item.attachedFiles,
          images: item.images,
          timestamp: item.timestamp
            ? settingsStore.formatTimestamp(item.timestamp)
            : 'Tersimpan'
        }))
      }
    } catch (e) {
      console.warn('Gagal memuat riwayat chat dari SQLite:', e)
    }
  }

  function persistMessageToDb(msg: ChatMessage): void {
    if (!window.makaryaAPI?.dbSaveChatMessage) return
    try {
      const cleanPayload = {
        id: String(msg.id),
        sessionId: String(currentSessionId.value),
        role: String(msg.role),
        content: String(msg.content || ''),
        thoughts: msg.thoughts ? String(msg.thoughts) : '',
        attachedFiles: msg.attachedFiles ? JSON.parse(JSON.stringify(msg.attachedFiles)) : null,
        images: msg.images ? JSON.parse(JSON.stringify(msg.images)) : null,
        model: String(selectedModel.value || 'Antigravity'),
        projectRoot: connectedWorkspacePath.value || undefined
      }
      window.makaryaAPI.dbSaveChatMessage(cleanPayload)
        .then(() => {
          loadSessions().catch?.(() => {})
        })
        .catch((err) => {
          console.warn('Gagal menyimpan pesan ke SQLite:', err)
        })
    } catch (err) {
      console.warn('Gagal memformat payload pesan SQLite:', err)
    }
  }

  function initListeners(): void {
    if (!window.makaryaAPI) return
    loadChatHistoryFromDb()

    cleanupTokenListener?.()
    cleanupThoughtListener?.()
    cleanupToolStartListener?.()
    cleanupToolFinishListener?.()
    cleanupDoneListener?.()
    cleanupErrorListener?.()

    // 1. Stream Content Tokens
    cleanupTokenListener = window.makaryaAPI.onAgentStreamToken((data) => {
      if (data.requestId !== activeRequestId.value) return
      const targetMessage = messages.value.find((msg) => msg.id === data.requestId)
      if (targetMessage) {
        targetMessage.content += data.deltaContent
        // As soon as content begins streaming in, thinking is completed
        targetMessage.isThinking = false
        targetMessage.activeAction = undefined
      }
    })

    // 2. Stream Thought / Reasoning Tokens
    cleanupThoughtListener = window.makaryaAPI.onAgentThought?.((data) => {
      if (data.requestId !== activeRequestId.value) return
      const targetMessage = messages.value.find((msg) => msg.id === data.requestId)
      if (targetMessage) {
        targetMessage.thoughts = (targetMessage.thoughts || '') + data.deltaThought
        targetMessage.isThinking = true
      }
    })

    // 3. Tool Execution Started
    cleanupToolStartListener = window.makaryaAPI.onAgentToolStart?.((data) => {
      if (data.requestId !== activeRequestId.value) return
      const targetMessage = messages.value.find((msg) => msg.id === data.requestId)
      if (targetMessage) {
        if (!targetMessage.toolCalls) targetMessage.toolCalls = []
        
        // Detailed user-friendly activeAction label (Antigravity style)
        if (data.toolName === 'read_file') {
          targetMessage.activeAction = `Membaca berkas: ${data.args?.filePath || ''}...`
        } else if (data.toolName === 'write_file') {
          targetMessage.activeAction = `Menulis berkas: ${data.args?.filePath || ''}...`
        } else if (data.toolName === 'execute_command') {
          targetMessage.activeAction = `Menjalankan terminal: $ ${data.args?.command || ''}...`
        } else if (data.toolName === 'list_dir') {
          targetMessage.activeAction = `Memindai folder: ${data.args?.dirPath || 'root'}...`
        } else if (data.toolName === 'db_execute_query') {
          targetMessage.activeAction = `Mengeksekusi kueri database...`
        } else if (data.toolName === 'db_inspect_schema') {
          targetMessage.activeAction = `Memeriksa skema database...`
        } else {
          targetMessage.activeAction = `Menjalankan ${data.toolName}...`
        }

        const existingTool = targetMessage.toolCalls.find((tc) => tc.id === data.toolCallId)
        if (!existingTool) {
          targetMessage.toolCalls.push({
            id: data.toolCallId,
            name: data.toolName,
            args: data.args,
            status: 'running'
          })
        }
      }
    })

    // 3b. Tool Require Approval (Ask Before Execution)
    cleanupToolRequireApprovalListener = window.makaryaAPI.onAgentToolRequireApproval?.((data) => {
      const targetMessage = messages.value.find((msg) => msg.id === data.requestId)
      if (targetMessage) {
        targetMessage.activeAction = `Menunggu izin eksekusi: ${data.toolName}...`
        if (!targetMessage.toolCalls) targetMessage.toolCalls = []
        const existingTool = targetMessage.toolCalls.find((tc) => tc.id === data.toolCallId)
        if (existingTool) {
          existingTool.status = 'waiting_approval'
          existingTool.args = data.args
        } else {
          targetMessage.toolCalls.push({
            id: data.toolCallId,
            name: data.toolName,
            args: data.args,
            status: 'waiting_approval'
          })
        }
      }
    })

    // 3c. Dynamic Tool Execution from Plugins
    if (window.makaryaAPI?.onAgentExecuteCustomTool) {
      window.makaryaAPI.onAgentExecuteCustomTool(async (data) => {
        const pluginStore = usePluginStore()
        const tool = pluginStore.customAiTools.get(data.toolName)
        if (tool && tool.execute) {
          try {
            const rawResult = await Promise.resolve(tool.execute(data.args))
            const cleanResult =
              rawResult !== undefined
                ? JSON.parse(JSON.stringify(rawResult))
                : { status: 'success' }
            await window.makaryaAPI.respondCustomTool(data.toolCallId, cleanResult)
          } catch (err: any) {
            await window.makaryaAPI.respondCustomTool(data.toolCallId, {
              status: 'error',
              message: err?.message || String(err)
            })
          }
        } else {
          await window.makaryaAPI.respondCustomTool(data.toolCallId, {
            status: 'error',
            message: `Tool "${data.toolName}" tidak ditemukan di plugin aktif.`
          })
        }
      })
    }

    // 4. Tool Execution Finished
    cleanupToolFinishListener = window.makaryaAPI.onAgentToolFinish?.((data) => {
      if (data.requestId !== activeRequestId.value) return
      const targetMessage = messages.value.find((msg) => msg.id === data.requestId)
      if (targetMessage) {
        targetMessage.activeAction = 'Working...'
        if (targetMessage.toolCalls) {
          const targetTool = targetMessage.toolCalls.find((tc) => tc.id === data.toolCallId)
          if (targetTool) {
            targetTool.status = data.status
            targetTool.output = data.output
            targetTool.durationMs = data.durationMs
          } else {
            targetMessage.toolCalls.push({
              id: data.toolCallId,
              name: data.toolName,
              args: {},
              output: data.output,
              status: data.status,
              durationMs: data.durationMs
            })
          }
        }
      }

      // Auto-refresh file tree if a file modification or command execution tool finished
      if (['write_file', 'create_file', 'delete_file', 'rename_file', 'execute_command'].includes(data.toolName)) {
        const workspaceStore = useWorkspaceStore()
        workspaceStore.refreshFileTree().catch?.(() => {})
      }
    })

    // 5. File Modified Notification
    cleanupFileModifiedListener = window.makaryaAPI.onAgentFileModified?.((data) => {
      const workspaceStore = useWorkspaceStore()
      const settingsStore = useSettingsStore()
      const isAutoApply = settingsStore.ai.reviewPolicy === 'auto_apply'

      // Only show in the bottom review drawer with Accept/Reject buttons if reviewPolicy is NOT auto_apply
      if (!isAutoApply) {
        const normPath = data.filePath.replace(/\\/g, '/').toLowerCase()
        const existingIdx = sessionModifiedFiles.value.findIndex(
          (f) => f.filePath.replace(/\\/g, '/').toLowerCase() === normPath
        )
        if (existingIdx >= 0) {
          sessionModifiedFiles.value[existingIdx].additions += data.additions
          sessionModifiedFiles.value[existingIdx].deletions += data.deletions
          if (data.newContent !== undefined) sessionModifiedFiles.value[existingIdx].newContent = data.newContent
          if (data.originalContent !== undefined && !sessionModifiedFiles.value[existingIdx].originalContent) {
            sessionModifiedFiles.value[existingIdx].originalContent = data.originalContent
          }
        } else {
          sessionModifiedFiles.value.push({
            filePath: data.filePath,
            fileName: data.fileName,
            additions: data.additions,
            deletions: data.deletions,
            originalContent: data.originalContent,
            newContent: data.newContent
          })
        }
      }

      // Also attach to active assistant message if present so user can see what files were modified in chat info
      if (activeRequestId.value) {
        const targetMessage = messages.value.find((msg) => msg.id === activeRequestId.value)
        if (targetMessage) {
          if (!targetMessage.modifiedFiles) targetMessage.modifiedFiles = []
          const msgFileIdx = targetMessage.modifiedFiles.findIndex((f) => f.filePath === data.filePath)
          if (msgFileIdx >= 0) {
            targetMessage.modifiedFiles[msgFileIdx].additions += data.additions
            targetMessage.modifiedFiles[msgFileIdx].deletions += data.deletions
            if (data.newContent !== undefined) targetMessage.modifiedFiles[msgFileIdx].newContent = data.newContent
            if (data.originalContent !== undefined && !targetMessage.modifiedFiles[msgFileIdx].originalContent) {
              targetMessage.modifiedFiles[msgFileIdx].originalContent = data.originalContent
            }
          } else {
            targetMessage.modifiedFiles.push({
              filePath: data.filePath,
              fileName: data.fileName,
              additions: data.additions,
              deletions: data.deletions,
              originalContent: data.originalContent,
              newContent: data.newContent
            })
          }
        }
      }

      // Register pending diff or auto-focus file based on Review Policy
      if (data.originalContent !== undefined && data.newContent !== undefined) {
        if (isAutoApply) {
          workspaceStore.clearPendingDiff(data.filePath)
          workspaceStore.openFile(data.filePath, data.fileName)
        } else {
          workspaceStore.setPendingDiff(data.filePath, data.originalContent, data.newContent)
          workspaceStore.openFile(data.filePath, data.fileName)
        }
      }

      // Auto-refresh file tree so new file shows in Explorer without manual refresh
      workspaceStore.refreshFileTree().catch?.(() => {})
    })

    // 6. Stream Completed
    cleanupDoneListener = window.makaryaAPI.onAgentStreamDone((data) => {
      stopThinkingTimer()
      // Always release generation lock immediately
      isGenerating.value = false
      activeRequestId.value = null

      try {
        const targetMessage = messages.value.find((msg) => msg.id === data.requestId)
        if (targetMessage) {
          targetMessage.isStreaming = false
          targetMessage.isThinking = false
          targetMessage.activeAction = undefined
          targetMessage.timestamp = data.isAborted ? 'Dibatalkan' : settingsStore.formatTimestamp(new Date())
          if (data.fullContent && !targetMessage.content) {
            targetMessage.content = data.fullContent
          }
          persistMessageToDb(targetMessage)
        }
        loadSessions().catch?.(() => {})
        const workspaceStore = useWorkspaceStore()
        workspaceStore.refreshFileTree().catch?.(() => {})
      } catch (err) {
        console.warn('Error handling stream completion:', err)
      }
    })

    // 7. Stream Error
    cleanupErrorListener = window.makaryaAPI.onAgentStreamError((data) => {
      stopThinkingTimer()
      // Always release generation lock immediately
      isGenerating.value = false
      activeRequestId.value = null

      try {
        const targetMessage = messages.value.find((msg) => msg.id === data.requestId)
        if (targetMessage) {
          targetMessage.isStreaming = false
          targetMessage.isThinking = false
          targetMessage.activeAction = undefined
          targetMessage.error = data.errorMessage
          targetMessage.content = (targetMessage.content ? targetMessage.content + '\n\n' : '') + `⚠️ *Terjadi kesalahan: ${data.errorMessage}*`
          targetMessage.timestamp = 'Error'
          persistMessageToDb(targetMessage)
        }
        loadSessions().catch?.(() => {})
      } catch (err) {
        console.warn('Error handling stream error:', err)
      }
    })
  }



  async function acceptFileChanges(filePath: string): Promise<void> {
    const workspaceStore = useWorkspaceStore()
    await workspaceStore.acceptDiff(filePath)
    removeModifiedFile(filePath)
  }

  async function rejectFileChanges(filePath: string): Promise<void> {
    const workspaceStore = useWorkspaceStore()
    await workspaceStore.rejectDiff(filePath)
    removeModifiedFile(filePath)
  }

  async function acceptAllChanges(): Promise<void> {
    const workspaceStore = useWorkspaceStore()
    const filesToAccept = [...sessionModifiedFiles.value]
    for (const item of filesToAccept) {
      await workspaceStore.acceptDiff(item.filePath)
    }
    // Also accept any other pending diffs registered in workspaceStore
    for (const normPath of Object.keys(workspaceStore.pendingDiffs)) {
      const diff = workspaceStore.pendingDiffs[normPath]
      if (diff) {
        await workspaceStore.acceptDiff(diff.filePath)
      }
    }
    sessionModifiedFiles.value = []
  }

  async function rejectAllChanges(): Promise<void> {
    const workspaceStore = useWorkspaceStore()
    const filesToReject = [...sessionModifiedFiles.value]
    for (const item of filesToReject) {
      await workspaceStore.rejectDiff(item.filePath)
    }
    // Also reject any other pending diffs registered in workspaceStore
    for (const normPath of Object.keys(workspaceStore.pendingDiffs)) {
      const diff = workspaceStore.pendingDiffs[normPath]
      if (diff) {
        await workspaceStore.rejectDiff(diff.filePath)
      }
    }
    sessionModifiedFiles.value = []
  }

  function removeModifiedFile(filePath: string): void {
    const targetNorm = filePath.replace(/\\/g, '/').toLowerCase()
    sessionModifiedFiles.value = sessionModifiedFiles.value.filter(
      (f) => f.filePath.replace(/\\/g, '/').toLowerCase() !== targetNorm
    )
  }

  async function sendMessage(
    promptText: string,
    activeFileContext?: ActiveFileContext,
    projectRoot?: string,
    images?: string[],
    attachedFileContexts?: Array<{
      filePath: string
      fileName: string
      content?: string
      language?: string
      lineRange?: string
      startLine?: number
      endLine?: number
      selectedSnippet?: string
    }>
  ): Promise<void> {
    const cleanPrompt = promptText.trim()
    const hasImages = Array.isArray(images) && images.length > 0
    const hasFiles = Array.isArray(attachedFileContexts) && attachedFileContexts.length > 0
    if ((!cleanPrompt && !hasImages && !hasFiles) || isGenerating.value) return

    const effectiveRoot = connectedWorkspacePath.value || projectRoot
    if (!effectiveRoot) {
      console.warn('sendMessage dicegah: Folder target project belum ditetapkan.')
      return
    }

    const effectiveModel = selectedModel.value || settingsStore.ai.defaultModel
    if (!effectiveModel) {
      alert('Tidak ada model AI yang dipilih atau tersedia. Pastikan 9router aktif dan terdeteksi.')
      return
    }
    if (!selectedModel.value) {
      selectedModel.value = effectiveModel
    }

    if (!window.makaryaAPI?.sendChatMessage) {
      alert('Layanan AI desktop belum aktif. Harap muat ulang aplikasi.')
      return
    }

    const userMessageId = `user-${Date.now()}`
    const userMessage: ChatMessage = {
      id: userMessageId,
      role: 'user',
      content: cleanPrompt,
      images: hasImages ? [...images] : undefined,
      attachedFiles: hasFiles
        ? attachedFileContexts.map((f) => ({
            path: f.filePath,
            name: f.fileName,
            lineRange: f.lineRange,
            startLine: f.startLine,
            endLine: f.endLine,
            selectedSnippet: f.selectedSnippet
          }))
        : undefined,
      timestamp: settingsStore.formatTimestamp(new Date())
    }
    messages.value.push(userMessage)

    persistMessageToDb(userMessage)

    if (currentSessionTitle.value === 'Obrolan Baru' && cleanPrompt) {
      const condensed = cleanPrompt.slice(0, 36).replace(/[\r\n]+/g, ' ')
      currentSessionTitle.value = condensed
      if (window.makaryaAPI?.dbCreateSession) {
        window.makaryaAPI.dbCreateSession({
          id: currentSessionId.value,
          title: condensed,
          model: selectedModel.value,
          projectRoot: projectRoot || connectedWorkspacePath.value || undefined
        }).then(() => {
          loadSessions().catch?.(() => {})
        })
      }
    }

    const assistantRequestId = `assistant-${Date.now()}`
    activeRequestId.value = assistantRequestId
    isGenerating.value = true

    const newAssistantMessage: ChatMessage = {
      id: assistantRequestId,
      role: 'assistant',
      content: '',
      thoughts: '',
      isThinking: true,
      thinkingDurationSeconds: 1,
      activeAction: 'Working...',
      toolCalls: [],
      timestamp: 'Sedang bekerja...',
      isStreaming: true
    }

    messages.value.push(newAssistantMessage)
    startThinkingTimer(newAssistantMessage)

    const payloadMessages: Array<{
      role: 'system' | 'user' | 'assistant'
      content: any
    }> = []

    // Inject active file context if available and enabled
    if (includeActiveFileContext.value && activeFileContext?.content && activeFileContext.fileName) {
      payloadMessages.push({
        role: 'system',
        content:
          `[Konteks Berkas Aktif]:\n` +
          `- Nama: ${activeFileContext.fileName}\n` +
          `- Path: ${activeFileContext.filePath || 'Belum disimpan'}\n` +
          `- Bahasa: ${activeFileContext.language || 'plaintext'}\n` +
          `- Isi Berkas:\n\`\`\`${activeFileContext.language || ''}\n${activeFileContext.content}\n\`\`\``
      })
    }

    // Inject user attached files or tagged code snippets (from Ctrl+L or Drag & Drop)
    if (attachedFileContexts && attachedFileContexts.length > 0) {
      for (const af of attachedFileContexts) {
        if (af.lineRange && af.selectedSnippet) {
          payloadMessages.push({
            role: 'system',
            content:
              `[Potongan Kode Dilampirkan Pengguna (Ctrl+L)]:\n` +
              `- Berkas: ${af.fileName} (${af.lineRange})\n` +
              `- Path: ${af.filePath}\n` +
              `- Bahasa: ${af.language || 'plaintext'}\n` +
              `- Baris: ${af.lineRange}\n` +
              `- Kode Terpilih:\n\`\`\`${af.language || ''}\n${af.selectedSnippet}\n\`\`\``
          })
        } else if (af.content) {
          payloadMessages.push({
            role: 'system',
            content:
              `[Berkas Dilampirkan Pengguna]:\n` +
              `- Nama: ${af.fileName}\n` +
              `- Path: ${af.filePath}\n` +
              `- Bahasa: ${af.language || 'plaintext'}\n` +
              `- Isi Berkas:\n\`\`\`${af.language || ''}\n${af.content}\n\`\`\``
          })
        } else {
          payloadMessages.push({
            role: 'system',
            content: `[Berkas/Folder Dilampirkan Pengguna]:\n- Nama: ${af.fileName}\n- Path: ${af.filePath}`
          })
        }
      }
    }

    // Append conversation history (up to last 10 messages)
    const recentHistory = messages.value.slice(-10, -1)
    for (const msg of recentHistory) {
      if (msg.content && !msg.error) {
        payloadMessages.push({
          role: msg.role,
          content: msg.content
        })
      }
    }

    // Append latest prompt (multimodal if images present)
    if (hasImages) {
      const contentParts: any[] = []
      if (cleanPrompt) {
        contentParts.push({ type: 'text', text: cleanPrompt })
      }
      for (const imgUrl of images) {
        contentParts.push({
          type: 'image_url',
          image_url: { url: imgUrl }
        })
      }
      payloadMessages.push({
        role: 'user',
        content: contentParts
      })
    } else {
      payloadMessages.push({
        role: 'user',
        content: cleanPrompt
      })
    }

    try {
      const settingsStore = useSettingsStore()
      const pluginStore = usePluginStore()
      const activeCustomTools = pluginStore.activeAITools.map((t) => ({
        name: String(t.name || ''),
        description: String(t.description || ''),
        parameters: t.parameters ? JSON.parse(JSON.stringify(t.parameters)) : undefined,
        pluginId: t.pluginId ? String(t.pluginId) : undefined
      }))

      const cleanPayloadMessages = JSON.parse(JSON.stringify(payloadMessages))

      await window.makaryaAPI.sendChatMessage({
        requestId: assistantRequestId,
        model: selectedModel.value,
        messages: cleanPayloadMessages,
        projectRoot: effectiveRoot || undefined,
        autoExecution: settingsStore.ai.autoExecution,
        reviewPolicy: settingsStore.ai.reviewPolicy,
        customTools: activeCustomTools
      })
    } catch (sendError: any) {
      console.error('Error invoking sendChatMessage:', sendError)
      stopThinkingTimer()
      const targetMessage = messages.value.find((msg) => msg.id === assistantRequestId)
      if (targetMessage) {
        targetMessage.isStreaming = false
        targetMessage.isThinking = false
        targetMessage.activeAction = undefined
        targetMessage.error = sendError?.message || 'Gagal mengirim pesan ke AI'
        targetMessage.content = `⚠️ *Gagal menghubungi layanan AI: ${sendError?.message || 'Koneksi error'}*`
      }
      isGenerating.value = false
      activeRequestId.value = null
    }
  }

  async function abortGeneration(): Promise<void> {
    const targetRequestId = activeRequestId.value
    stopThinkingTimer()
    isGenerating.value = false
    activeRequestId.value = null

    if (targetRequestId) {
      const targetMessage = messages.value.find((msg) => msg.id === targetRequestId)
      if (targetMessage) {
        targetMessage.isStreaming = false
        targetMessage.isThinking = false
        targetMessage.activeAction = undefined
        targetMessage.timestamp = 'Dibatalkan'
        if (!targetMessage.content && !targetMessage.thoughts) {
          targetMessage.content = '*(Proses dibatalkan oleh pengguna)*'
        }
        persistMessageToDb(targetMessage)
      }

      if (window.makaryaAPI?.abortChatMessage) {
        try {
          await window.makaryaAPI.abortChatMessage(targetRequestId)
        } catch (abortError) {
          console.warn('Error aborting chat:', abortError)
        }
      }
    }
  }

  function clearHistory(): void {
    stopThinkingTimer()
    sessionModifiedFiles.value = []
    messages.value = []
    if (window.makaryaAPI?.dbClearChatHistory) {
      window.makaryaAPI.dbClearChatHistory(currentSessionId.value)
    }
    createNewSession()
  }

  async function revertAndResendMessage(
    messageId: string,
    activeFileContext?: ActiveFileContext,
    projectRoot?: string
  ): Promise<void> {
    const msgIdx = messages.value.findIndex((m) => m.id === messageId)
    if (msgIdx === -1) return

    const targetUserMsg = messages.value[msgIdx]
    if (targetUserMsg.role !== 'user') return

    // 1. Revert any file modifications from subsequent messages
    const subsequentMessages = messages.value.slice(msgIdx)
    const workspaceStore = useWorkspaceStore()

    for (const msg of subsequentMessages) {
      if (msg.modifiedFiles && msg.modifiedFiles.length > 0) {
        for (const file of msg.modifiedFiles) {
          if (file.originalContent !== undefined && window.makaryaAPI?.writeFile) {
            try {
              await window.makaryaAPI.writeFile(file.filePath, file.originalContent)
              workspaceStore.clearPendingDiff(file.filePath)
              const tab = workspaceStore.tabList.find((t) => t.filePath && t.filePath.replace(/\\/g, '/').toLowerCase() === file.filePath.replace(/\\/g, '/').toLowerCase())
              if (tab) {
                tab.content = file.originalContent
                tab.savedContent = file.originalContent
                tab.isDirty = false
              }
            } catch (err) {
              console.warn(`Gagal mengembalikan berkas ${file.filePath}:`, err)
            }
          }
          removeModifiedFile(file.filePath)
        }
      }
    }

    // Also reject any active pending diffs
    await rejectAllChanges()

    // 2. Remove all messages from msgIdx onward in current view
    messages.value.splice(msgIdx)

    // Save prompt and attachments to resend
    const promptText = targetUserMsg.content
    const images = targetUserMsg.images ? [...targetUserMsg.images] : undefined
    const attachedFiles = targetUserMsg.attachedFiles ? [...targetUserMsg.attachedFiles] : undefined

    // 3. Re-send message freshly
    await sendMessage(promptText, activeFileContext, projectRoot, images, attachedFiles as any)
  }

  async function approveToolCall(toolCallId: string, approved: boolean): Promise<void> {
    if (window.makaryaAPI?.respondToolApproval) {
      await window.makaryaAPI.respondToolApproval(toolCallId, approved)
      // Update tool status locally
      for (const msg of messages.value) {
        if (msg.toolCalls) {
          const tool = msg.toolCalls.find((t) => t.id === toolCallId)
          if (tool && tool.status === 'waiting_approval') {
            tool.status = approved ? 'running' : 'error'
            if (!approved) {
              tool.output = 'Eksekusi dibatalkan oleh pengguna (Ditolak).'
            }
          }
        }
      }
    }
  }

  return {
    messages,
    currentSessionId,
    currentSessionTitle,
    sessionsList,
    isSessionsModalOpen,
    connectedWorkspacePath,
    setConnectedWorkspacePath,
    isGenerating,
    activeRequestId,
    selectedModel,
    setSelectedModel,
    availableModels,
    includeActiveFileContext,
    sessionModifiedFiles,
    initListeners,
    loadModels,
    loadSessions,
    createNewSession,
    switchSession,
    deleteSession,
    sendMessage,
    revertAndResendMessage,
    abortGeneration,
    clearHistory,
    acceptAllChanges,
    rejectAllChanges,
    acceptFileChanges,
    rejectFileChanges,
    removeModifiedFile,
    approveToolCall
  }
})
