import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWorkspaceStore } from './workspaceStore'
import { useSettingsStore } from './settingsStore'

export interface ClaudeToolCall {
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

export interface ClaudeQuestion {
  toolCallId: string
  question: string
  options: string[]
  isMultiSelect?: boolean
  selectedOption?: string | string[]
}

export interface ClaudeMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  displayPrompt?: string
  timestamp: number
  isStreaming?: boolean
  thinking?: string
  isThinkingExpanded?: boolean
  thinkingSeconds?: number
  activeStatusText?: string
  tools?: ClaudeToolCall[]
  pendingQuestion?: ClaudeQuestion
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

export interface ClaudeModelItem {
  id: string
  name: string
  provider?: string
  category: string
  isFree?: boolean
  isFavorite?: boolean
}

export interface ClaudeSessionItem {
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

export const DEFAULT_CLAUDE_MODELS: ClaudeModelItem[] = [
  { id: 'Antigravity', name: 'Antigravity', provider: 'Anthropic', category: 'Claude Config', isFree: false }
]

export const useClaudeStore = defineStore('claudeStore', () => {
  const isConnected = ref<boolean>(true)
  const isExecuting = ref<boolean>(false)
  const currentModel = ref<string>('Antigravity')
  const models = ref<ClaudeModelItem[]>([...DEFAULT_CLAUDE_MODELS])
  const availableModels = ref<string[]>([...DEFAULT_CLAUDE_MODELS.map((m) => m.id)])
  const executionMode = ref<'agent' | 'chat' | 'plan'>('agent')

  const currentModelItem = computed<ClaudeModelItem>(() => {
    return (
      models.value.find((m) => m.id === currentModel.value || m.name === currentModel.value) || {
        id: currentModel.value,
        name: currentModel.value,
        provider: 'Anthropic',
        category: 'Claude Config',
        isFree: false
      }
    )
  })

  function selectModel(modelId: string) {
    currentModel.value = modelId
  }

  const messages = ref<ClaudeMessage[]>([])
  const sessionHistoryMap = ref<Record<string, ClaudeMessage[]>>({})

  const activeSessionId = ref<string>('c_ses_' + Date.now().toString(36))
  const activeSessionTitle = ref<string>('New session - ' + new Date().toISOString())
  const sessions = ref<ClaudeSessionItem[]>([])
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
    try {
      if (window.makaryaAPI?.fetchClaudeModels) {
        const discovered = await window.makaryaAPI.fetchClaudeModels()
        if (Array.isArray(discovered) && discovered.length > 0) {
          models.value = discovered
          availableModels.value = discovered.map((m) => m.id)

          if (!models.value.some((m) => m.id === currentModel.value)) {
            currentModel.value = models.value[0]?.id || 'Antigravity'
          }
          return
        }
      }

      if (window.makaryaAPI?.fetchAvailableModels) {
        const fetched = await window.makaryaAPI.fetchAvailableModels()
        if (Array.isArray(fetched) && fetched.length > 0) {
          const dynamicModels: ClaudeModelItem[] = []
          for (const item of fetched) {
            const modelId = typeof item === 'string' ? item : item.id || item.name
            if (modelId && (modelId.toLowerCase().includes('claude') || modelId.toLowerCase().includes('anthropic') || modelId.toLowerCase().includes('antigravity'))) {
              const cleanName = modelId.split('/').pop() || modelId
              const isAntigravity = modelId.toLowerCase().includes('antigravity')
              dynamicModels.push({
                id: modelId,
                name: cleanName,
                provider: isAntigravity ? 'Antigravity' : 'Anthropic',
                category: isAntigravity ? 'Recent' : 'Claude Gateway',
                isFree: modelId.includes('haiku') || modelId.includes('free') || isAntigravity
              })
            }
          }
          if (dynamicModels.length > 0) {
            models.value = dynamicModels
            availableModels.value = dynamicModels.map((m) => m.id)
          }
        }
      }
    } catch (err) {
      console.warn('Gagal memuat model Claude & Gateway:', err)
    }
  }

  let currentRequestId = ''
  let currentActiveProjectRoot: string | undefined = undefined
  let listenersInitialized = false
  let timerInterval: any = null

  const hasPendingApproval = computed(() => {
    return messages.value.some((m) => m.pendingApproval !== undefined || m.pendingQuestion !== undefined)
  })

  function startThinkingTimer(targetMsg: ClaudeMessage) {
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
        targetMsg.activeStatusText = 'Claude sedang menulis respons...'
        syncCurrentSessionToHistory()
      }
    })

    // Thought Token (Streaming Reasoning)
    window.makaryaAPI.onAgentThought((data: { requestId: string; deltaThought: string }) => {
      if (data.requestId !== currentRequestId) return
      const targetMsg = messages.value.find((m) => m.id === currentRequestId)
      if (targetMsg) {
        targetMsg.thinking = (targetMsg.thinking || '') + data.deltaThought
        targetMsg.isThinkingExpanded = true
        targetMsg.activeStatusText = 'Claude sedang menganalisis logika & kode...'
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
        const existing = targetMsg.tools.find((item) => data.toolCallId && item.id === data.toolCallId)
        if (existing) {
          existing.name = data.toolName || existing.name
          existing.args = { ...existing.args, ...(data.args || {}) }
          existing.status = 'running'
        } else {
          targetMsg.tools.push({
            id: data.toolCallId || 't-' + Date.now(),
            name: data.toolName,
            args: data.args || {},
            status: 'running'
          })
        }
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

    // File Modified Notification (Claude Agent edits/writes file)
    if (window.makaryaAPI.onAgentFileModified) {
      window.makaryaAPI.onAgentFileModified((data) => {
        if (currentRequestId) {
          const targetMsg = messages.value.find((m) => m.id === currentRequestId)
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
          const dbSessionId = activeSessionId.value.startsWith('claude_')
            ? activeSessionId.value
            : 'claude_' + activeSessionId.value

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

    // Stream Error
    window.makaryaAPI.onAgentStreamError((data: { requestId: string; errorMessage: string }) => {
      if (data.requestId !== currentRequestId) return
      const targetMsg = messages.value.find((m) => m.id === currentRequestId)
      if (targetMsg) {
        targetMsg.isStreaming = false
        targetMsg.activeStatusText = undefined
        targetMsg.content += `\n\n❌ **Error Claude:** ${data.errorMessage}`
      }
      if (timerInterval) clearInterval(timerInterval)
      isExecuting.value = false
      syncCurrentSessionToHistory()
    })

    // Dynamic Session Link from Claude CLI
    if (window.makaryaAPI?.onAgentSessionLinked) {
      window.makaryaAPI.onAgentSessionLinked((data: { clientSessionId: string; claudeSessionId?: string; openCodeSessionId?: string }) => {
        if (data.claudeSessionId) {
          if (activeSessionId.value === data.clientSessionId || activeSessionId.value.endsWith(data.clientSessionId)) {
            activeSessionId.value = data.claudeSessionId
          }
        }
      })
    }
  }

  async function sendPrompt(text: string, projectRoot?: string, displayPrompt?: string) {
    const trimmed = text.trim()
    if (!trimmed || isExecuting.value) return

    currentActiveProjectRoot = projectRoot
    initListeners()

    // 1. Add User Message
    const userMsg = addMessage({
      role: 'user',
      content: trimmed,
      displayPrompt: displayPrompt || trimmed
    })

    // Update Session Title if it's default
    if (activeSessionTitle.value.startsWith('New session') || activeSessionTitle.value.startsWith('Sesi Baru')) {
      const summarySource = displayPrompt || trimmed
      const cleanSummary = summarySource.split('\n')[0].replace(/\[.*?\]/g, '').trim()
      const newTitle = cleanSummary.length > 40 ? cleanSummary.slice(0, 40) + '...' : cleanSummary || 'Claude Session'
      activeSessionTitle.value = newTitle

      const curSession = sessions.value.find((s) => s.id === activeSessionId.value)
      if (curSession) {
        curSession.title = newTitle
        curSession.subtitle = summarySource.slice(0, 60)
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
      activeStatusText: 'Menghubungkan ke Claude AI Engine...'
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
      if (window.makaryaAPI?.startClaudeStream) {
        await window.makaryaAPI.startClaudeStream({
          requestId: reqId,
          sessionId: activeSessionId.value,
          model: currentModel.value,
          messages: historyPayload,
          projectRoot: projectRoot || undefined,
          executionMode: executionMode.value
        })
      } else {
        assistantMsg.content = 'Claude API bridge tidak ditemukan di renderer preload.'
        assistantMsg.isStreaming = false
        assistantMsg.activeStatusText = undefined
        isExecuting.value = false
        syncCurrentSessionToHistory()
      }
    } catch (err: any) {
      assistantMsg.content = `Gagal memulai komunikasi dengan Claude: ${err.message}`
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

      msg.activeStatusText = 'Melanjutkan proses Claude dengan pilihan Anda...'
      syncCurrentSessionToHistory()
    }
  }

  function abortCurrent() {
    if (currentRequestId && window.makaryaAPI?.abortClaudeStream) {
      window.makaryaAPI.abortClaudeStream(currentRequestId)
    }
    const targetMsg = messages.value.find((m) => m.id === currentRequestId)
    if (targetMsg) {
      targetMsg.isStreaming = false
      targetMsg.activeStatusText = undefined
      if (targetMsg.tools) {
        for (const t of targetMsg.tools) {
          if (t.status === 'running') {
            t.status = 'failed'
          }
        }
      }
      if (!targetMsg.content.trim()) {
        targetMsg.content = '*(Proses dihentikan oleh pengguna)*'
      } else {
        targetMsg.content += '\n\n*(Proses dihentikan oleh pengguna)*'
      }
    }
    if (timerInterval) clearInterval(timerInterval)
    isExecuting.value = false
    syncCurrentSessionToHistory()
  }

  function addMessage(msg: Omit<ClaudeMessage, 'id' | 'timestamp'>): ClaudeMessage {
    const newMsg: ClaudeMessage = {
      ...msg,
      id: 'cmsg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
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

      const sessionList: ClaudeSessionItem[] = []

      // 1. Fetch native Claude CLI sessions (~/.claude/projects/ as used by /resume)
      if (window.makaryaAPI?.fetchClaudeSessions) {
        try {
          const cliSessions = await window.makaryaAPI.fetchClaudeSessions(effectiveRoot)
          if (Array.isArray(cliSessions) && cliSessions.length > 0) {
            for (const s of cliSessions) {
              sessionList.push({
                id: s.id,
                title: s.title || `Claude Session ${s.id.slice(0, 8)}`,
                updated: s.updated,
                dateGroup: s.dateGroup || getDateGroup(s.timestamp),
                timestamp: s.timestamp || Date.now(),
                updatedAt: (s as any).updatedAt || (s.timestamp ? new Date(s.timestamp).toISOString() : undefined),
                lastMessage: (s as any).lastMessage || s.subtitle || 'Percakapan Claude CLI',
                subtitle: s.subtitle || (s as any).lastMessage || 'Percakapan Claude CLI',
                messageCount: (s as any).messageCount || 1,
                model: (s as any).model || currentModel.value,
                isPinned: s.isPinned
              })
            }
          }
        } catch (cliErr) {
          console.warn('Gagal memuat sesi native Claude CLI:', cliErr)
        }
      }

      // 2. Fetch from SQLite database if available as fallback / local storage
      if (window.makaryaAPI?.dbGetChatSessions) {
        const dbSessions = await window.makaryaAPI.dbGetChatSessions()
        if (Array.isArray(dbSessions)) {
          for (const s of dbSessions) {
            if (s.id.startsWith('claude_')) {
              const rawId = s.id.replace('claude_', '')
              if (!sessionList.some((item) => item.id === rawId || item.id === s.id)) {
                sessionList.push({
                  id: rawId,
                  title: s.title || `Claude Session ${rawId}`,
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
      }

      // 3. Merge in-memory sessions
      for (const [sId, msgs] of Object.entries(sessionHistoryMap.value)) {
        if (!sessionList.some((item) => item.id === sId)) {
          const firstUserMsg = msgs.find((m) => m.role === 'user')
          const lastMsg = msgs[msgs.length - 1]
          const title = firstUserMsg ? (firstUserMsg.content.length > 40 ? firstUserMsg.content.slice(0, 40) + '...' : firstUserMsg.content) : 'Claude Sesi Percakapan'
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
      console.warn('Gagal memuat daftar sesi Claude:', err)
    } finally {
      isLoadingSessions.value = false
    }
  }

  function createNewSession() {
    if (timerInterval) clearInterval(timerInterval)
    syncCurrentSessionToHistory()

    const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('c_ses_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4))
    const newTitle = `New session - ${new Date().toISOString()}`
    activeSessionId.value = newId
    activeSessionTitle.value = newTitle

    messages.value = []
    sessionHistoryMap.value[newId] = []

    sessions.value.unshift({
      id: newId,
      title: newTitle,
      updated: 'Baru saja',
      dateGroup: 'HARI INI',
      timestamp: Date.now(),
      subtitle: 'Percakapan Claude Baru'
    })

    if (window.makaryaAPI?.dbCreateSession) {
      window.makaryaAPI.dbCreateSession({
        id: 'claude_' + newId,
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

    syncCurrentSessionToHistory()

    try {
      activeSessionId.value = sessionId
      const found = sessions.value.find((s) => s.id === sessionId)
      if (found) {
        activeSessionTitle.value = found.title
      }

      // 1. In-memory check
      if (sessionHistoryMap.value[sessionId] && sessionHistoryMap.value[sessionId].length > 0) {
        messages.value = JSON.parse(JSON.stringify(sessionHistoryMap.value[sessionId]))
        return true
      }

      // 2. Load directly from native Claude CLI storage (.jsonl transcript, exactly as /resume)
      if (window.makaryaAPI?.loadClaudeSession) {
        try {
          const loaded = await window.makaryaAPI.loadClaudeSession(sessionId)
          if (loaded && Array.isArray(loaded.messages) && loaded.messages.length > 0) {
            messages.value = loaded.messages
            sessionHistoryMap.value[sessionId] = JSON.parse(JSON.stringify(loaded.messages))
            if (loaded.title) {
              activeSessionTitle.value = loaded.title
            }
            return true
          }
        } catch (cliErr) {
          console.warn('Gagal memuat sesi transcript native Claude CLI:', cliErr)
        }
      }

      // 3. Fallback to SQLite DB
      if (window.makaryaAPI?.dbGetChatHistory) {
        const dbSessionId = sessionId.startsWith('claude_') ? sessionId : 'claude_' + sessionId
        let history = await window.makaryaAPI.dbGetChatHistory(dbSessionId, 200)

        if ((!history || history.length === 0) && dbSessionId !== sessionId) {
          history = await window.makaryaAPI.dbGetChatHistory(sessionId, 200)
        }

        if (history && history.length > 0) {
          const restoredMessages: ClaudeMessage[] = history.map((item) => ({
            id: item.id || 'cmsg-' + Date.now(),
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

      messages.value = []
      sessionHistoryMap.value[sessionId] = []
      return true
    } catch (err) {
      console.warn('Gagal memuat sesi Claude:', err)
      return false
    } finally {
      isLoadingSessionHistory.value = false
    }
  }

  async function deleteSession(sessionId: string): Promise<boolean> {
    try {
      delete sessionHistoryMap.value[sessionId]

      if (window.makaryaAPI?.deleteClaudeSession) {
        await window.makaryaAPI.deleteClaudeSession(sessionId).catch(() => {})
      }

      if (window.makaryaAPI?.dbDeleteSession) {
        const dbSessionId = sessionId.startsWith('claude_') ? sessionId : 'claude_' + sessionId
        await window.makaryaAPI.dbDeleteSession(dbSessionId).catch(() => {})
        await window.makaryaAPI.dbDeleteSession(sessionId).catch(() => {})
      }

      sessions.value = sessions.value.filter((s) => s.id !== sessionId)

      if (activeSessionId.value === sessionId) {
        createNewSession()
      }
      return true
    } catch (err) {
      console.warn('Gagal menghapus sesi Claude:', err)
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
    approveAction
  }
})
