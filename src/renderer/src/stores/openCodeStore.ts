import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWorkspaceStore } from './workspaceStore'
import { useSettingsStore } from './settingsStore'

export interface OpenCodeToolCall {
  id: string
  name: string
  args: Record<string, any>
  status: 'pending' | 'running' | 'completed' | 'failed'
  output?: string
  durationMs?: number
  diff?: {
    filePath: string
    oldCode: string
    newCode: string
  }
}

export interface OpenCodeQuestion {
  toolCallId: string
  question: string
  options: string[]
  isMultiSelect?: boolean
  selectedOption?: string | string[]
}

export interface OpenCodeMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  displayPrompt?: string
  timestamp: number
  isStreaming?: boolean
  thinking?: string
  isThinkingExpanded?: boolean
  userToggledThinking?: boolean
  thinkingSeconds?: number
  activeStatusText?: string
  tools?: OpenCodeToolCall[]
  pendingQuestion?: OpenCodeQuestion
  pendingApproval?: {
    type: 'file_edit' | 'command_exec'
    description: string
    payload: any
  }
  modifiedFiles?: Array<{
    filePath: string
    fileName: string
    additions: number
    deletions: number
    originalContent?: string
    newContent?: string
  }>
}

export interface OpenCodeModelItem {
  id: string
  name: string
  provider?: string
  category: string
  isFree?: boolean
  isFavorite?: boolean
}

export interface OpenCodeSessionItem {
  id: string
  title: string
  updated?: string
  dateGroup?: string
  timestamp?: number
  subtitle?: string
  lastMessage?: string
  messageCount?: number
  model?: string
  updatedAt?: string
  isPinned?: boolean
}

export const DEFAULT_OPENCODE_MODELS: OpenCodeModelItem[] = []

export const useOpenCodeStore = defineStore('openCodeStore', () => {
  const isConnected = ref<boolean>(true)
  const isExecuting = ref<boolean>(false)
  const currentModel = ref<string>('')
  const models = ref<OpenCodeModelItem[]>([])
  const availableModels = ref<string[]>([])
  const isLoadingModels = ref<boolean>(false)
  const executionMode = ref<'agent' | 'chat' | 'plan'>('agent')

  const currentModelItem = computed<OpenCodeModelItem>(() => {
    return (
      models.value.find((m) => m.id === currentModel.value || m.name === currentModel.value) || {
        id: currentModel.value || 'Default',
        name: currentModel.value || 'Pilih Model',
        provider: 'OpenCode',
        category: 'Custom Model',
        isFree: true
      }
    )
  })

  function selectModel(modelId: string) {
    currentModel.value = modelId
  }
  
  const messages = ref<OpenCodeMessage[]>([])
  const sessionHistoryMap = ref<Record<string, OpenCodeMessage[]>>({})

  const activeSessionId = ref<string>('ses_' + Date.now().toString(36))
  const activeSessionTitle = ref<string>('New session - ' + new Date().toISOString())
  const sessions = ref<OpenCodeSessionItem[]>([])
  const isLoadingSessions = ref<boolean>(false)
  const isLoadingSessionHistory = ref<boolean>(false)

  function syncCurrentSessionToHistory() {
    if (activeSessionId.value) {
      sessionHistoryMap.value[activeSessionId.value] = JSON.parse(JSON.stringify(messages.value))
    }
  }

  function getDateGroup(timestamp?: number | string): string {
    if (!timestamp) return 'TODAY'
    const d = new Date(timestamp)
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const oneDay = 24 * 60 * 60 * 1000
    const msgTime = d.getTime()

    if (msgTime >= startOfToday) return 'TODAY'
    if (msgTime >= startOfToday - oneDay) return 'YESTERDAY'
    if (msgTime >= startOfToday - 7 * oneDay) return 'PREVIOUS 7 DAYS'
    return 'OLDER'
  }

  async function loadAvailableModels() {
    isLoadingModels.value = true
    try {
      if (window.makaryaAPI?.fetchOpenCodeModels) {
        const discovered = await window.makaryaAPI.fetchOpenCodeModels()
        if (Array.isArray(discovered) && discovered.length > 0) {
          const cleanList = discovered.filter(
            (m) =>
              !m.id.toLowerCase().includes('9router') &&
              !(m.provider && m.provider.toLowerCase().includes('9router')) &&
              !(m.category && m.category.toLowerCase().includes('9router'))
          )
          models.value = cleanList
          availableModels.value = cleanList.map((m) => m.id)

          // Ensure currentModel is valid and not 9router
          if (!models.value.some((m) => m.id === currentModel.value) || currentModel.value.toLowerCase().includes('9router')) {
            currentModel.value = models.value[0]?.id || ''
          }
          return
        }
      }
      models.value = []
      availableModels.value = []
    } catch (err) {
      console.warn('Gagal memuat model OpenCode dari config:', err)
      models.value = []
      availableModels.value = []
    } finally {
      isLoadingModels.value = false
    }
  }

  let currentRequestId = ''
  let currentActiveProjectRoot: string | undefined = undefined
  let listenersInitialized = false
  let timerInterval: any = null

  const hasPendingApproval = computed(() => {
    return messages.value.some((m) => m.pendingApproval !== undefined || m.pendingQuestion !== undefined)
  })

  function startThinkingTimer(targetMsg: OpenCodeMessage) {
    if (timerInterval) clearInterval(timerInterval)
    targetMsg.thinkingSeconds = 0
    timerInterval = setInterval(() => {
      if (targetMsg.isStreaming) {
        targetMsg.thinkingSeconds = (targetMsg.thinkingSeconds || 0) + 1
      } else {
        clearInterval(timerInterval)
      }
    }, 1000)
  }

  function initListeners() {
    if (listenersInitialized || !window.makaryaAPI) return
    listenersInitialized = true

    // Stream Token
    window.makaryaAPI.onAgentStreamToken((data: { requestId: string; deltaContent: string }) => {
      if (data.requestId !== currentRequestId) return
      const targetMsg = messages.value.find((m) => m.id === currentRequestId)
      if (targetMsg) {
        targetMsg.content += data.deltaContent
        targetMsg.activeStatusText = 'Menulis respons...'
        syncCurrentSessionToHistory()
      }
    })

    // Thought Token (Streaming Reasoning)
    window.makaryaAPI.onAgentThought((data: { requestId: string; deltaThought: string }) => {
      if (data.requestId !== currentRequestId) return
      const targetMsg = messages.value.find((m) => m.id === currentRequestId)
      if (targetMsg) {
        targetMsg.thinking = (targetMsg.thinking || '') + data.deltaThought
        // Buka otomatis saat proses penalaran sedang berjalan
        if (!targetMsg.userToggledThinking) {
          targetMsg.isThinkingExpanded = true
        }
        targetMsg.activeStatusText = 'Sedang menganalisis logika...'
        syncCurrentSessionToHistory()
      }
    })

    // Interactive Question Tool Trigger
    window.makaryaAPI.onAgentAskQuestion((data: { requestId: string; toolCallId: string; question: string; options: string[]; is_multi_select?: boolean }) => {
      if (data.requestId !== currentRequestId) return
      const targetMsg = messages.value.find((m) => m.id === currentRequestId)
      if (targetMsg) {
        targetMsg.pendingQuestion = {
          toolCallId: data.toolCallId,
          question: data.question,
          options: data.options || [],
          isMultiSelect: data.is_multi_select || false
        }
        targetMsg.activeStatusText = 'Menunggu pilihan keputusan Anda...'
        syncCurrentSessionToHistory()
      }
    })

    // Tool Start
    window.makaryaAPI.onAgentToolStart((data: any) => {
      if (data.requestId !== currentRequestId) return
      const targetMsg = messages.value.find((m) => m.id === currentRequestId)
      if (targetMsg) {
        if (!targetMsg.tools) targetMsg.tools = []
        targetMsg.tools.push({
          id: data.toolCallId || 't-' + Date.now(),
          name: data.toolName,
          args: data.args || {},
          status: 'running'
        })
        targetMsg.activeStatusText = `Menjalankan tool: ${data.toolName}...`
        syncCurrentSessionToHistory()
      }
    })

    // Tool Finish
    window.makaryaAPI.onAgentToolFinish((data: any) => {
      if (data.requestId !== currentRequestId) return
      const targetMsg = messages.value.find((m) => m.id === currentRequestId)
      if (targetMsg && targetMsg.tools) {
        let t = targetMsg.tools.find((item) => data.toolCallId && item.id === data.toolCallId)
        if (!t) {
          t = targetMsg.tools.find((item) => item.name === data.toolName && item.status === 'running')
        }
        if (!t) {
          t = targetMsg.tools.find((item) => item.name === data.toolName)
        }
        if (t) {
          t.status = data.status === 'success' ? 'completed' : 'failed'
          t.output = data.output
          t.durationMs = data.durationMs || 1
        }
        syncCurrentSessionToHistory()
      }
      const workspaceStore = useWorkspaceStore()
      workspaceStore.refreshFileTree().catch?.(() => {})
    })

    // Stream Done
    window.makaryaAPI.onAgentStreamDone((data: { requestId: string; fullContent?: string }) => {
      if (data.requestId !== currentRequestId) return
      const targetMsg = messages.value.find((m) => m.id === currentRequestId)
      if (targetMsg) {
        targetMsg.isStreaming = false
        targetMsg.activeStatusText = undefined
        if (data.fullContent && !targetMsg.content.trim()) {
          targetMsg.content = data.fullContent
        }
        if (targetMsg.tools) {
          for (const tool of targetMsg.tools) {
            if (tool.status === 'running') {
              tool.status = 'completed'
              if (!tool.durationMs) tool.durationMs = 1
            }
          }
        }

        // Persist to SQLite Database
        if (window.makaryaAPI?.dbSaveChatMessage) {
          const userMsg = messages.value.filter((m) => m.role === 'user').pop()
          const dbSessionId = activeSessionId.value.startsWith('opencode_')
            ? activeSessionId.value
            : 'opencode_' + activeSessionId.value

          if (userMsg) {
            window.makaryaAPI.dbSaveChatMessage({
              id: userMsg.id,
              sessionId: dbSessionId,
              role: 'user',
              content: userMsg.content,
              model: currentModel.value,
              projectRoot: currentActiveProjectRoot
            }).catch(() => {})
          }

          window.makaryaAPI.dbSaveChatMessage({
            id: targetMsg.id,
            sessionId: dbSessionId,
            role: 'assistant',
            content: targetMsg.content,
            thoughts: targetMsg.thinking,
            model: currentModel.value,
            projectRoot: currentActiveProjectRoot
          }).catch(() => {})
        }
      }
      if (timerInterval) clearInterval(timerInterval)
      isExecuting.value = false
      const workspaceStore = useWorkspaceStore()
      workspaceStore.refreshFileTree().catch?.(() => {})
      workspaceStore.reloadAllOpenTabsFromDisk().catch?.(() => {})
      syncCurrentSessionToHistory()
    })

    // File Modified Notification
    if (window.makaryaAPI?.onAgentFileModified) {
      window.makaryaAPI.onAgentFileModified((data) => {
        const targetMsg =
          (currentRequestId ? messages.value.find((m) => m.id === currentRequestId) : null) ||
          [...messages.value].reverse().find((m) => m.role === 'assistant')

        if (targetMsg) {
          if (!targetMsg.modifiedFiles) targetMsg.modifiedFiles = []
          const normPath = data.filePath.replace(/\\/g, '/').toLowerCase()
          const existingIdx = targetMsg.modifiedFiles.findIndex(
            (f) => f.filePath.replace(/\\/g, '/').toLowerCase() === normPath
          )
          if (existingIdx >= 0) {
            targetMsg.modifiedFiles[existingIdx].additions += data.additions
            targetMsg.modifiedFiles[existingIdx].deletions += data.deletions
            if (data.newContent !== undefined) targetMsg.modifiedFiles[existingIdx].newContent = data.newContent
            if (data.originalContent !== undefined && !targetMsg.modifiedFiles[existingIdx].originalContent) {
              targetMsg.modifiedFiles[existingIdx].originalContent = data.originalContent
            }
          } else {
            targetMsg.modifiedFiles.push({
              filePath: data.filePath,
              fileName: data.fileName,
              additions: data.additions,
              deletions: data.deletions,
              originalContent: data.originalContent,
              newContent: data.newContent
            })
          }
          syncCurrentSessionToHistory()
        }

        const workspaceStore = useWorkspaceStore()
        const settingsStore = useSettingsStore()
        const isAutoApply = settingsStore.ai.reviewPolicy === 'auto_apply'

        if (data.originalContent !== undefined && data.newContent !== undefined) {
          if (isAutoApply) {
            workspaceStore.clearPendingDiff(data.filePath)
            workspaceStore.openFile(data.filePath, data.fileName)
          } else {
            workspaceStore.setPendingDiff(data.filePath, data.originalContent, data.newContent)
            workspaceStore.openFile(data.filePath, data.fileName)
          }
        }
        workspaceStore.refreshFileTree().catch?.(() => {})
      })
    }

    // Stream Error
    window.makaryaAPI.onAgentStreamError((data: { requestId: string; errorMessage: string }) => {
      if (data.requestId !== currentRequestId) return
      const targetMsg = messages.value.find((m) => m.id === currentRequestId)
      if (targetMsg) {
        targetMsg.isStreaming = false
        targetMsg.activeStatusText = undefined
        targetMsg.content += `\n\n❌ **Error:** ${data.errorMessage}`
      }
      if (timerInterval) clearInterval(timerInterval)
      isExecuting.value = false
      syncCurrentSessionToHistory()
    })

    // Dynamic Session Link from OpenCode CLI
    if (window.makaryaAPI?.onAgentSessionLinked) {
      window.makaryaAPI.onAgentSessionLinked((data: { clientSessionId: string; openCodeSessionId: string }) => {
        if (data.openCodeSessionId) {
          activeSessionId.value = data.openCodeSessionId
        }
      })
    }
  }

  async function sendPrompt(text: string, projectRoot?: string, displayPrompt?: string) {
    const trimmed = text.trim()
    if (!trimmed || isExecuting.value) return

    currentActiveProjectRoot = projectRoot
    initListeners()

    // 1. Add User Message (storing full prompt with code/context for the AI in content, with displayPrompt for UI bubble)
    const userMsg = addMessage({
      role: 'user',
      content: trimmed,
      displayPrompt: displayPrompt && displayPrompt !== trimmed ? displayPrompt : undefined
    })

    // Update Session Title if it's default
    if (activeSessionTitle.value.startsWith('New session') || activeSessionTitle.value.startsWith('Sesi Baru')) {
      const summaryText = displayPrompt || trimmed
      const cleanSummary = summaryText.split('\n')[0].replace(/\[.*?\]/g, '').trim()
      const newTitle = cleanSummary.length > 40 ? cleanSummary.slice(0, 40) + '...' : cleanSummary || 'OpenCode Session'
      activeSessionTitle.value = newTitle

      const curSession = sessions.value.find((s) => s.id === activeSessionId.value)
      if (curSession) {
        curSession.title = newTitle
        curSession.subtitle = trimmed.slice(0, 60)
      }
    }

    const reqId = 'req-' + Date.now()
    currentRequestId = reqId
    isExecuting.value = true

    // 2. Add Streaming Assistant Message
    const assistantMsg = addMessage({
      role: 'assistant',
      content: '',
      isStreaming: true,
      thinking: '',
      isThinkingExpanded: true,
      activeStatusText:
        executionMode.value === 'chat' || executionMode.value === 'plan'
          ? 'Menghubungkan ke OpenCode Plan Engine (Chat)...'
          : 'Menghubungkan ke OpenCode Build Engine (Agent)...'
    })
    assistantMsg.id = reqId

    startThinkingTimer(assistantMsg)
    syncCurrentSessionToHistory()

    // 3. Prepare Chat History for API (only send non-empty messages)
    const historyPayload = messages.value
      .filter((m) => m.id !== reqId && (m.role === 'user' || m.role === 'assistant') && m.content && m.content.trim().length > 0)
      .map((m) => ({
        role: m.role,
        content: m.content
      }))

    try {
      if (window.makaryaAPI?.startOpenCodeStream) {
        await window.makaryaAPI.startOpenCodeStream({
          requestId: reqId,
          sessionId: activeSessionId.value,
          model: currentModel.value,
          messages: historyPayload,
          projectRoot: projectRoot || undefined,
          executionMode: executionMode.value
        })
      } else {
        assistantMsg.content = 'OpenCode API bridge tidak ditemukan di renderer preload.'
        assistantMsg.isStreaming = false
        assistantMsg.activeStatusText = undefined
        isExecuting.value = false
        syncCurrentSessionToHistory()
      }
    } catch (err: any) {
      assistantMsg.content = `Gagal memulai komunikasi: ${err.message}`
      assistantMsg.isStreaming = false
      assistantMsg.activeStatusText = undefined
      isExecuting.value = false
      syncCurrentSessionToHistory()
    }
  }

  async function submitQuestionAnswer(messageId: string, answer: string | string[]) {
    const msg = messages.value.find((m) => m.id === messageId)
    if (msg && msg.pendingQuestion) {
      const toolCallId = msg.pendingQuestion.toolCallId
      msg.pendingQuestion.selectedOption = answer

      if (window.makaryaAPI?.respondCustomTool) {
        await window.makaryaAPI.respondCustomTool(toolCallId, answer)
      }

      msg.activeStatusText = 'Melanjutkan proses dengan pilihan Anda...'
      syncCurrentSessionToHistory()
    }
  }

  function abortCurrent() {
    if (currentRequestId && window.makaryaAPI?.abortOpenCodeStream) {
      window.makaryaAPI.abortOpenCodeStream(currentRequestId)
    }
    if (timerInterval) clearInterval(timerInterval)
    isExecuting.value = false
  }

  function addMessage(msg: Omit<OpenCodeMessage, 'id' | 'timestamp'>): OpenCodeMessage {
    const newMsg: OpenCodeMessage = {
      ...msg,
      id: 'msg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
      timestamp: Date.now()
    }
    messages.value.push(newMsg)
    syncCurrentSessionToHistory()
    return newMsg
  }

  function clearMessages(): void {
    if (timerInterval) clearInterval(timerInterval)
    messages.value = []
    syncCurrentSessionToHistory()
  }

  async function loadSessions(projectRoot?: string) {
    isLoadingSessions.value = true
    try {
      const workspaceStore = useWorkspaceStore()
      const effectiveRoot =
        projectRoot ||
        currentActiveProjectRoot ||
        workspaceStore.getEffectiveProjectRoot() ||
        workspaceStore.activeRootPath ||
        workspaceStore.workspaceRoots[0]?.path

      const sessionList: OpenCodeSessionItem[] = []

      // 1. Fetch native OpenCode CLI sessions (/session -> opencode session list)
      if (window.makaryaAPI?.fetchOpenCodeSessions) {
        try {
          const cliSessions = await window.makaryaAPI.fetchOpenCodeSessions(effectiveRoot)
          if (Array.isArray(cliSessions) && cliSessions.length > 0) {
            for (const s of cliSessions) {
              sessionList.push({
                id: s.id,
                title: s.title || `Session ${s.id.slice(0, 8)}`,
                updated: s.updated,
                dateGroup: s.dateGroup || getDateGroup(s.timestamp),
                timestamp: s.timestamp || Date.now(),
                updatedAt: (s as any).updatedAt || (s.timestamp ? new Date(s.timestamp).toISOString() : undefined),
                lastMessage: (s as any).lastMessage || s.subtitle || 'Percakapan OpenCode CLI',
                subtitle: s.subtitle || (s as any).lastMessage || 'Percakapan OpenCode CLI',
                messageCount: (s as any).messageCount || 1,
                model: (s as any).model || currentModel.value,
                isPinned: s.isPinned
              })
            }
          }
        } catch (cliErr) {
          console.warn('Gagal memuat sesi native OpenCode CLI:', cliErr)
        }
      }

      // 2. Fetch from SQLite database if available as fallback
      if (window.makaryaAPI?.dbGetChatSessions) {
        const dbSessions = await window.makaryaAPI.dbGetChatSessions()
        if (Array.isArray(dbSessions)) {
          for (const s of dbSessions) {
            const rawId = s.id.startsWith('opencode_') ? s.id.replace('opencode_', '') : s.id
            if (!sessionList.some((item) => item.id === rawId || item.id === s.id)) {
              sessionList.push({
                id: rawId,
                title: s.title || `Session ${rawId}`,
                updated: s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : undefined,
                dateGroup: getDateGroup(s.updatedAt || s.createdAt),
                timestamp: s.updatedAt ? new Date(s.updatedAt).getTime() : Date.now(),
                updatedAt: s.updatedAt || s.createdAt,
                lastMessage: s.lastMessage || 'Percakapan tersimpan',
                subtitle: s.lastMessage || 'Percakapan tersimpan',
                messageCount: s.messageCount || 1,
                model: s.model || currentModel.value
              })
            }
          }
        }
      }

      // 3. Merge in-memory sessions that might not yet be in SQLite
      for (const [sId, msgs] of Object.entries(sessionHistoryMap.value)) {
        if (!sessionList.some((item) => item.id === sId)) {
          const firstUserMsg = msgs.find((m) => m.role === 'user')
          const lastMsg = msgs[msgs.length - 1]
          const title = firstUserMsg ? (firstUserMsg.content.length > 40 ? firstUserMsg.content.slice(0, 40) + '...' : firstUserMsg.content) : 'Sesi Percakapan'
          sessionList.push({
            id: sId,
            title: sId === activeSessionId.value ? activeSessionTitle.value : title,
            updated: 'Just now',
            dateGroup: 'TODAY',
            timestamp: Date.now(),
            updatedAt: new Date().toISOString(),
            lastMessage: lastMsg?.content ? lastMsg.content.slice(0, 120) : (firstUserMsg ? firstUserMsg.content.slice(0, 120) : 'Sesi Aktif'),
            subtitle: lastMsg?.content ? lastMsg.content.slice(0, 120) : 'Sesi Aktif',
            messageCount: msgs.length,
            model: currentModel.value
          })
        }
      }

      // 4. Ensure active session is present if it has messages
      if (activeSessionId.value && messages.value.length > 0 && !sessionList.some((s) => s.id === activeSessionId.value)) {
        const lastMsg = messages.value[messages.value.length - 1]
        sessionList.unshift({
          id: activeSessionId.value,
          title: activeSessionTitle.value,
          updated: 'Just now',
          dateGroup: 'TODAY',
          timestamp: Date.now(),
          updatedAt: new Date().toISOString(),
          lastMessage: lastMsg?.content ? lastMsg.content.slice(0, 120) : 'Sesi aktif saat ini',
          subtitle: lastMsg?.content ? lastMsg.content.slice(0, 120) : 'Sesi aktif saat ini',
          messageCount: messages.value.length || 0,
          model: currentModel.value
        })
      }

      // Sort with pinned first, then by timestamp desc
      sessionList.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1
        if (!a.isPinned && b.isPinned) return 1
        return (b.timestamp || 0) - (a.timestamp || 0)
      })

      sessions.value = sessionList
    } catch (err) {
      console.warn('Gagal memuat daftar sesi OpenCode:', err)
    } finally {
      isLoadingSessions.value = false
    }
  }

  function createNewSession() {
    if (timerInterval) clearInterval(timerInterval)
    // Save previous session messages
    syncCurrentSessionToHistory()

    const newId = 'ses_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4)
    const newTitle = `New session - ${new Date().toISOString()}`
    activeSessionId.value = newId
    activeSessionTitle.value = newTitle

    // Clear current chat messages for fresh session
    messages.value = []
    sessionHistoryMap.value[newId] = []

    // Prepend to sessions list
    sessions.value.unshift({
      id: newId,
      title: newTitle,
      updated: 'Baru saja',
      dateGroup: 'HARI INI',
      timestamp: Date.now(),
      subtitle: 'Sesi OpenCode Baru'
    })

    // Register in SQLite
    if (window.makaryaAPI?.dbCreateSession) {
      window.makaryaAPI.dbCreateSession({
        id: 'opencode_' + newId,
        title: newTitle,
        model: currentModel.value,
        projectRoot: currentActiveProjectRoot
      }).catch(() => {})
    }
  }

  async function switchSession(sessionId: string): Promise<boolean> {
    if (sessionId === activeSessionId.value && messages.value.length > 0) return true

    if (timerInterval) clearInterval(timerInterval)
    isExecuting.value = false
    isLoadingSessionHistory.value = true

    // 1. Save current session messages before switching
    syncCurrentSessionToHistory()

    try {
      activeSessionId.value = sessionId
      const found = sessions.value.find((s) => s.id === sessionId)
      if (found) {
        activeSessionTitle.value = found.title
      }

      // 2. Check in-memory cache first
      if (sessionHistoryMap.value[sessionId] && sessionHistoryMap.value[sessionId].length > 0) {
        messages.value = JSON.parse(JSON.stringify(sessionHistoryMap.value[sessionId]))
        return true
      }

      // 3. Load from OpenCode CLI native storage via `opencode export <sessionId>`
      if (window.makaryaAPI?.loadOpenCodeSession) {
        try {
          const loaded = await window.makaryaAPI.loadOpenCodeSession(sessionId)
          if (loaded && Array.isArray(loaded.messages) && loaded.messages.length > 0) {
            messages.value = loaded.messages
            sessionHistoryMap.value[sessionId] = JSON.parse(JSON.stringify(loaded.messages))
            if (loaded.title) {
              activeSessionTitle.value = loaded.title
            }
            return true
          }
        } catch (cliErr) {
          console.warn('Gagal memuat sesi OpenCode CLI export:', cliErr)
        }
      }

      // 4. Check SQLite database
      if (window.makaryaAPI?.dbGetChatHistory) {
        const dbSessionId = sessionId.startsWith('opencode_') ? sessionId : 'opencode_' + sessionId
        let history = await window.makaryaAPI.dbGetChatHistory(dbSessionId, 200)

        // Also check raw sessionId if not found
        if ((!history || history.length === 0) && dbSessionId !== sessionId) {
          history = await window.makaryaAPI.dbGetChatHistory(sessionId, 200)
        }

        if (history && history.length > 0) {
          const restoredMessages: OpenCodeMessage[] = history.map((item) => ({
            id: item.id || 'msg-' + Date.now(),
            role: item.role === 'assistant' ? 'assistant' : 'user',
            content: item.content || '',
            timestamp: item.timestamp ? new Date(item.timestamp).getTime() : Date.now(),
            thinking: item.thoughts || undefined,
            isThinkingExpanded: false
          }))

          messages.value = restoredMessages
          sessionHistoryMap.value[sessionId] = JSON.parse(JSON.stringify(restoredMessages))
          return true
        }
      }

      // 5. If empty fresh session, keep messages empty for clean hero screen
      messages.value = []
      sessionHistoryMap.value[sessionId] = []
      return true
    } catch (err) {
      console.warn('Gagal memuat sesi OpenCode:', err)
      return false
    } finally {
      isLoadingSessionHistory.value = false
    }
  }

  async function deleteSession(sessionId: string): Promise<boolean> {
    try {
      delete sessionHistoryMap.value[sessionId]

      if (window.makaryaAPI?.deleteOpenCodeSession) {
        await window.makaryaAPI.deleteOpenCodeSession(sessionId).catch(() => {})
      }

      if (window.makaryaAPI?.dbDeleteSession) {
        const dbSessionId = sessionId.startsWith('opencode_') ? sessionId : 'opencode_' + sessionId
        await window.makaryaAPI.dbDeleteSession(dbSessionId).catch(() => {})
        await window.makaryaAPI.dbDeleteSession(sessionId).catch(() => {})
      }

      sessions.value = sessions.value.filter((s) => s.id !== sessionId)

      // If active session was deleted, start new session
      if (activeSessionId.value === sessionId) {
        createNewSession()
      }
      return true
    } catch (err) {
      console.warn('Gagal menghapus sesi:', err)
      return false
    }
  }

  function togglePinSession(sessionId: string) {
    const s = sessions.value.find((item) => item.id === sessionId)
    if (s) {
      s.isPinned = !s.isPinned
    }
  }

  function toggleThinking(messageId: string): void {
    const msg = messages.value.find((m) => m.id === messageId)
    if (msg) {
      msg.isThinkingExpanded = !msg.isThinkingExpanded
      msg.userToggledThinking = true
    }
  }

  function approveAction(messageId: string, approved: boolean): void {
    const msg = messages.value.find((m) => m.id === messageId)
    if (msg && msg.pendingApproval) {
      if (approved) {
        msg.content += '\n\n*(Aksi telah disetujui pengguna)*'
      } else {
        msg.content += '\n\n*(Aksi dibatalkan oleh pengguna)*'
      }
      delete msg.pendingApproval
    }
  }

  return {
    isConnected,
    isExecuting,
    currentModel,
    currentModelItem,
    models,
    availableModels,
    executionMode,
    messages,
    activeSessionId,
    activeSessionTitle,
    sessions,
    isLoadingSessions,
    isLoadingSessionHistory,
    hasPendingApproval,
    selectModel,
    loadAvailableModels,
    loadSessions,
    createNewSession,
    switchSession,
    deleteSession,
    togglePinSession,
    sendPrompt,
    submitQuestionAnswer,
    abortCurrent,
    addMessage,
    clearMessages,
    toggleThinking,
    approveAction,
    initListeners
  }
})
