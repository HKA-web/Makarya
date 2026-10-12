import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { useWorkspaceStore } from './workspaceStore'

export interface AntigravityToolCall {
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

export interface AntigravityQuestion {
  toolCallId: string
  question: string
  options: string[]
  isMultiSelect?: boolean
  selectedOption?: string | string[]
}

export interface AntigravityMessage {
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
  tools?: AntigravityToolCall[]
  pendingQuestion?: AntigravityQuestion
  pendingApproval?: {
    type: 'file_edit' | 'command_exec'
    description: string
    payload: any
  }
}

export interface AntigravityModelItem {
  id: string
  name: string
  provider?: string
  category: string
  isFree?: boolean
  isFavorite?: boolean
}

export interface AntigravitySessionItem {
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

export const DEFAULT_ANTIGRAVITY_MODELS: AntigravityModelItem[] = [
  { id: 'gemini-3.8-flash-high', name: 'Gemini 3.8 Flash (High)', provider: 'Google', category: 'Antigravity CLI', isFree: false },
  { id: 'gemini-3.7-flash-high', name: 'Gemini 3.7 Flash (High)', provider: 'Google', category: 'Antigravity CLI', isFree: false },
  { id: 'claude-sonnet-4-6', name: 'Claude Sonnet 4.6 (Thinking)', provider: 'Anthropic', category: 'Antigravity CLI', isFree: false },
  { id: 'claude-opus-4-6-thinking', name: 'Claude Opus 4.6 (Thinking)', provider: 'Anthropic', category: 'Antigravity CLI', isFree: false },
  { id: 'gpt-oss-120b-medium', name: 'GPT-OSS 120B (Medium)', provider: 'OpenAI', category: 'Antigravity CLI', isFree: false }
]

export const useAntigravityStore = defineStore('antigravityStore', () => {
  const isConnected = ref<boolean>(true)
  const isExecuting = ref<boolean>(false)
  const currentModel = ref<string>('gemini-3.8-flash-high')
  const models = ref<AntigravityModelItem[]>([...DEFAULT_ANTIGRAVITY_MODELS])
  const availableModels = ref<string[]>([...DEFAULT_ANTIGRAVITY_MODELS.map((m) => m.id)])
  const executionMode = ref<'agent' | 'chat' | 'plan'>('agent')

  const currentModelItem = computed<AntigravityModelItem>(() => {
    return (
      models.value.find((m) => m.id === currentModel.value || m.name === currentModel.value) || {
        id: currentModel.value,
        name: currentModel.value,
        provider: 'Google',
        category: 'Antigravity CLI',
        isFree: false
      }
    )
  })

  function selectModel(modelId: string) {
    currentModel.value = modelId
  }

  const messages = ref<AntigravityMessage[]>([])
  const sessionHistoryMap = ref<Record<string, AntigravityMessage[]>>({})

  const activeSessionId = ref<string>(
    typeof crypto !== 'undefined' && crypto.randomUUID
      ? crypto.randomUUID()
      : 'agy_ses_' + Date.now().toString(36)
  )
  const activeSessionTitle = ref<string>('New session - ' + new Date().toISOString())
  const sessions = ref<AntigravitySessionItem[]>([])
  const isLoadingSessions = ref<boolean>(false)
  const isLoadingSessionHistory = ref<boolean>(false)

  function syncCurrentSessionToHistory() {
    if (activeSessionId.value) {
      sessionHistoryMap.value[activeSessionId.value] = JSON.parse(JSON.stringify(messages.value))
    }
  }

  function getDateGroup(timestamp?: number | string): string {
    if (!timestamp) return 'HARI INI'
    const d = new Date(timestamp)
    const now = new Date()
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
    const oneDay = 24 * 60 * 60 * 1000
    const msgTime = d.getTime()

    if (msgTime >= startOfToday) return 'HARI INI'
    if (msgTime >= startOfToday - oneDay) return 'KEMARIN'
    if (msgTime >= startOfToday - 7 * oneDay) return '7 HARI TERAKHIR'
    return 'LEBIH LAMA'
  }

  async function loadAvailableModels() {
    try {
      if (window.makaryaAPI?.fetchAntigravityModels) {
        const discovered = await window.makaryaAPI.fetchAntigravityModels()
        if (Array.isArray(discovered) && discovered.length > 0) {
          models.value = discovered
          availableModels.value = discovered.map((m) => m.id)

          if (!models.value.some((m) => m.id === currentModel.value)) {
            currentModel.value = models.value[0]?.id || 'gemini-3.8-flash-high'
          }
        }
      }
    } catch (err) {
      console.warn('Gagal memuat model Antigravity CLI:', err)
    }
  }

  let currentRequestId = ''
  let currentActiveProjectRoot: string | undefined = undefined
  let listenersInitialized = false
  let timerInterval: any = null

  const hasPendingApproval = computed(() => {
    return messages.value.some((m) => m.pendingApproval !== undefined || m.pendingQuestion !== undefined)
  })

  function startThinkingTimer(targetMsg: AntigravityMessage) {
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
        targetMsg.activeStatusText = 'Antigravity sedang menulis respons...'
        syncCurrentSessionToHistory()
      }
    })

    // Thought Token
    window.makaryaAPI.onAgentThought((data: { requestId: string; deltaThought: string }) => {
      if (data.requestId !== currentRequestId) return
      const targetMsg = messages.value.find((m) => m.id === currentRequestId)
      if (targetMsg) {
        targetMsg.thinking = (targetMsg.thinking || '') + data.deltaThought
        targetMsg.isThinkingExpanded = true
        targetMsg.activeStatusText = 'Antigravity sedang menganalisis logika & kode...'
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
          t = targetMsg.tools[targetMsg.tools.length - 1]
        }

        if (t) {
          t.status = data.success === false ? 'failed' : 'completed'
          t.output = typeof data.result === 'string' ? data.result : JSON.stringify(data.result || data.output || '')
          t.durationMs = data.durationMs || undefined
        }
        targetMsg.activeStatusText = 'Melanjutkan analisis...'
        syncCurrentSessionToHistory()
      }
    })

    // Stream Done
    window.makaryaAPI.onAgentStreamDone((data: { requestId: string }) => {
      if (data.requestId !== currentRequestId) return
      const targetMsg = messages.value.find((m) => m.id === currentRequestId)
      if (targetMsg) {
        targetMsg.isStreaming = false
        targetMsg.activeStatusText = undefined
      }
      if (timerInterval) clearInterval(timerInterval)
      isExecuting.value = false
      syncCurrentSessionToHistory()
    })

    // Stream Error
    window.makaryaAPI.onAgentStreamError((data: { requestId: string; errorMessage: string }) => {
      if (data.requestId !== currentRequestId) return
      const targetMsg = messages.value.find((m) => m.id === currentRequestId)
      if (targetMsg) {
        targetMsg.isStreaming = false
        targetMsg.activeStatusText = undefined
        targetMsg.content += `\n\n❌ **Error Antigravity CLI:** ${data.errorMessage}`
      }
      if (timerInterval) clearInterval(timerInterval)
      isExecuting.value = false
      syncCurrentSessionToHistory()
    })

    // Dynamic Session Link
    if (window.makaryaAPI?.onAgentSessionLinked) {
      window.makaryaAPI.onAgentSessionLinked((data: { clientSessionId: string; antigravitySessionId?: string; claudeSessionId?: string }) => {
        const agyId = data.antigravitySessionId || (data as any).conversationId
        if (agyId) {
          if (activeSessionId.value === data.clientSessionId || activeSessionId.value.endsWith(data.clientSessionId)) {
            activeSessionId.value = agyId
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

    // Update Session Title if default
    if (activeSessionTitle.value.startsWith('New session') || activeSessionTitle.value.startsWith('Sesi Baru')) {
      const summarySource = displayPrompt || trimmed
      const cleanSummary = summarySource.split('\n')[0].replace(/\[.*?\]/g, '').trim()
      const newTitle = cleanSummary.length > 40 ? cleanSummary.slice(0, 40) + '...' : cleanSummary || 'Antigravity Session'
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
      activeStatusText: 'Menghubungkan ke Antigravity CLI (agy)...'
    })
    assistantMsg.id = reqId

    startThinkingTimer(assistantMsg)
    syncCurrentSessionToHistory()

    const historyPayload = messages.value
      .filter((m) => m.id !== reqId && (m.role === 'user' || m.role === 'assistant') && m.content && m.content.trim().length > 0)
      .map((m) => ({
        role: m.role,
        content: m.content
      }))

    try {
      if (window.makaryaAPI?.startAntigravityStream) {
        await window.makaryaAPI.startAntigravityStream({
          requestId: reqId,
          sessionId: activeSessionId.value,
          model: currentModel.value,
          messages: historyPayload,
          projectRoot: projectRoot || undefined,
          executionMode: executionMode.value
        })
      } else {
        assistantMsg.content = 'Antigravity API bridge tidak ditemukan di preload.'
        assistantMsg.isStreaming = false
        assistantMsg.activeStatusText = undefined
        isExecuting.value = false
        syncCurrentSessionToHistory()
      }
    } catch (err: any) {
      assistantMsg.content = `Gagal memulai komunikasi dengan Antigravity CLI: ${err.message}`
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

      msg.activeStatusText = 'Melanjutkan proses Antigravity dengan pilihan Anda...'
      syncCurrentSessionToHistory()
    }
  }

  function abortCurrent() {
    if (currentRequestId && window.makaryaAPI?.abortAntigravityStream) {
      window.makaryaAPI.abortAntigravityStream(currentRequestId)
    }
    if (timerInterval) clearInterval(timerInterval)
    isExecuting.value = false
  }

  function addMessage(msg: Omit<AntigravityMessage, 'id' | 'timestamp'>): AntigravityMessage {
    const newMsg: AntigravityMessage = {
      ...msg,
      id: 'agymsg-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
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

      const sessionList: AntigravitySessionItem[] = []

      // 1. Fetch native Antigravity sessions (agy)
      if (window.makaryaAPI?.fetchAntigravitySessions) {
        try {
          const cliSessions = await window.makaryaAPI.fetchAntigravitySessions()
          if (Array.isArray(cliSessions) && cliSessions.length > 0) {
            for (const s of cliSessions) {
              sessionList.push({
                id: s.id,
                title: s.title || `Antigravity Session ${s.id.slice(0, 8)}`,
                updated: s.updated,
                dateGroup: s.dateGroup || getDateGroup(s.timestamp),
                timestamp: s.timestamp || Date.now(),
                updatedAt: (s as any).updatedAt || (s.timestamp ? new Date(s.timestamp).toISOString() : undefined),
                lastMessage: (s as any).lastMessage || s.subtitle || 'Percakapan Antigravity CLI',
                subtitle: s.subtitle || (s as any).lastMessage || 'Percakapan Antigravity CLI',
                messageCount: (s as any).messageCount || 1,
                model: (s as any).model || currentModel.value,
                isPinned: s.isPinned
              })
            }
          }
        } catch (cliErr) {
          console.warn('Gagal memuat sesi native Antigravity CLI:', cliErr)
        }
      }

      // 2. Fetch from SQLite database if available as fallback / local storage
      if (window.makaryaAPI?.dbGetChatSessions) {
        const dbSessions = await window.makaryaAPI.dbGetChatSessions()
        if (Array.isArray(dbSessions)) {
          for (const s of dbSessions) {
            if (s.id.startsWith('antigravity_') || s.id.startsWith('agy_')) {
              const rawId = s.id.replace('antigravity_', '').replace('agy_', '')
              if (!sessionList.some((item) => item.id === rawId || item.id === s.id)) {
                sessionList.push({
                  id: rawId,
                  title: s.title || `Antigravity Session ${rawId}`,
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
          const title = firstUserMsg ? (firstUserMsg.content.length > 40 ? firstUserMsg.content.slice(0, 40) + '...' : firstUserMsg.content) : 'Antigravity Sesi Percakapan'
          sessionList.push({
            id: sId,
            title: sId === activeSessionId.value ? activeSessionTitle.value : title,
            updated: 'Just now',
            dateGroup: 'HARI INI',
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
          dateGroup: 'HARI INI',
          timestamp: Date.now(),
          updatedAt: new Date().toISOString(),
          lastMessage: lastMsg?.content ? lastMsg.content.slice(0, 120) : 'Sesi aktif saat ini',
          subtitle: lastMsg?.content ? lastMsg.content.slice(0, 120) : 'Sesi aktif saat ini',
          messageCount: messages.value.length || 0,
          model: currentModel.value
        })
      }

      sessionList.sort((a, b) => {
        if (a.isPinned && !b.isPinned) return -1
        if (!a.isPinned && b.isPinned) return 1
        return (b.timestamp || 0) - (a.timestamp || 0)
      })

      sessions.value = sessionList
    } catch (err) {
      console.warn('Gagal memuat daftar sesi Antigravity:', err)
    } finally {
      isLoadingSessions.value = false
    }
  }

  function createNewSession() {
    if (timerInterval) clearInterval(timerInterval)
    syncCurrentSessionToHistory()

    const newId = (typeof crypto !== 'undefined' && crypto.randomUUID) ? crypto.randomUUID() : ('agy_' + Date.now().toString(36) + Math.random().toString(36).substr(2, 4))
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
      subtitle: 'Percakapan Antigravity Baru'
    })

    if (window.makaryaAPI?.dbCreateSession) {
      window.makaryaAPI.dbCreateSession({
        id: 'antigravity_' + newId,
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

      // 2. Load directly from Antigravity CLI transcript
      if (window.makaryaAPI?.loadAntigravitySession) {
        try {
          const loaded = await window.makaryaAPI.loadAntigravitySession(sessionId)
          if (loaded && Array.isArray(loaded.messages) && loaded.messages.length > 0) {
            messages.value = loaded.messages
            sessionHistoryMap.value[sessionId] = JSON.parse(JSON.stringify(loaded.messages))
            if (loaded.title) {
              activeSessionTitle.value = loaded.title
            }
            return true
          }
        } catch (cliErr) {
          console.warn('Gagal memuat sesi transcript Antigravity CLI:', cliErr)
        }
      }

      // 3. Fallback to SQLite DB
      if (window.makaryaAPI?.dbGetChatHistory) {
        const dbSessionId = sessionId.startsWith('antigravity_') ? sessionId : 'antigravity_' + sessionId
        let history = await window.makaryaAPI.dbGetChatHistory(dbSessionId, 200)

        if ((!history || history.length === 0) && dbSessionId !== sessionId) {
          history = await window.makaryaAPI.dbGetChatHistory(sessionId, 200)
        }

        if (history && history.length > 0) {
          const restoredMessages: AntigravityMessage[] = history.map((item) => ({
            id: item.id || 'agymsg-' + Date.now(),
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
      console.warn('Gagal memuat sesi Antigravity:', err)
      return false
    } finally {
      isLoadingSessionHistory.value = false
    }
  }

  async function deleteSession(sessionId: string): Promise<boolean> {
    try {
      delete sessionHistoryMap.value[sessionId]

      if (window.makaryaAPI?.deleteAntigravitySession) {
        await window.makaryaAPI.deleteAntigravitySession(sessionId).catch(() => {})
      }

      if (window.makaryaAPI?.dbDeleteSession) {
        const dbSessionId = sessionId.startsWith('antigravity_') ? sessionId : 'antigravity_' + sessionId
        await window.makaryaAPI.dbDeleteSession(dbSessionId).catch(() => {})
        await window.makaryaAPI.dbDeleteSession(sessionId).catch(() => {})
      }

      sessions.value = sessions.value.filter((s) => s.id !== sessionId)

      if (activeSessionId.value === sessionId) {
        createNewSession()
      }
      return true
    } catch (err) {
      console.warn('Gagal menghapus sesi Antigravity:', err)
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

  return {
    isConnected,
    isExecuting,
    currentModel,
    currentModelItem,
    models,
    availableModels,
    executionMode,
    selectModel,
    messages,
    activeSessionId,
    activeSessionTitle,
    sessions,
    isLoadingSessions,
    isLoadingSessionHistory,
    hasPendingApproval,
    sendPrompt,
    abortCurrent,
    addMessage,
    clearMessages,
    loadSessions,
    createNewSession,
    switchSession,
    deleteSession,
    togglePinSession,
    toggleThinking,
    loadAvailableModels,
    submitQuestionAnswer
  }
})
