<script setup lang="ts">
import { ref, onMounted, onUnmounted, onBeforeUnmount, watch, computed, nextTick } from 'vue'
import * as monaco from 'monaco-editor'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useAgentStore } from '@renderer/stores/agentStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { usePluginStore } from '@renderer/stores/pluginStore'
import { computeInlineDiff, InlineDiffResult } from '@renderer/utils/diffEngine'
import { registerAutoRenameTagProvider, setupAutoCloseTag } from '@renderer/utils/tagIntelligence'
import { globalPluginEvents } from '@renderer/sdk/runtime'

const props = withDefaults(
  defineProps<{
    modelValue?: string
    language?: string
    readOnly?: boolean
    filePath?: string
    tabId?: string
  }>(),
  {
    modelValue: '',
    language: 'javascript',
    readOnly: false,
    filePath: '',
    tabId: ''
  }
)

const emit = defineEmits<{
  (event: 'update:modelValue', value: string): void
}>()

const workspaceStore = useWorkspaceStore()
const settingsStore = useSettingsStore()
const pluginStore = usePluginStore()
const editorContainerRef = ref<HTMLDivElement | null>(null)
let editorInstance: monaco.editor.IStandaloneCodeEditor | null = null
let resizeObserver: ResizeObserver | null = null
let decorationsCollection: monaco.editor.IEditorDecorationsCollection | null = null
let autoCloseDisposable: monaco.IDisposable | null = null

// Diff state for current file
const activeDiff = computed(() => {
  return workspaceStore.getPendingDiff(props.filePath)
})

const isDiffActive = computed(() => !!activeDiff.value)

const diffData = computed<InlineDiffResult | null>(() => {
  if (!activeDiff.value) return null
  return computeInlineDiff(activeDiff.value.originalContent, activeDiff.value.newContent)
})

interface HunkPosition {
  id: string
  top: number
  visible: boolean
}

const hunkPositions = ref<HunkPosition[]>([])

function updateHunkPositions(): void {
  if (!editorInstance || !diffData.value || !isDiffActive.value) {
    hunkPositions.value = []
    return
  }

  const scrollTop = editorInstance.getScrollTop()
  const layout = editorInstance.getLayoutInfo()
  const containerHeight = layout ? layout.height : 600

  const positions: HunkPosition[] = []

  for (const hunk of diffData.value.hunks) {
    const lineTop = editorInstance.getTopForLineNumber(hunk.actionLine)
    const relativeTop = lineTop - scrollTop
    const isVisible = relativeTop >= -10 && relativeTop <= containerHeight - 20

    positions.push({
      id: hunk.id,
      top: Math.max(2, relativeTop),
      visible: isVisible
    })
  }

  hunkPositions.value = positions
}

function applyDiffDecorations(): void {
  if (!editorInstance) return

  const targetTab = workspaceStore.tabList.find((t) => t.id === props.tabId) || workspaceStore.activeTab
  const targetFilePath = targetTab?.filePath || props.filePath || ''
  const targetLanguage = targetTab?.language || props.language || 'plaintext'
  const targetContent = targetTab?.content !== undefined ? targetTab.content : props.modelValue

  const model = getOrCreateTextModel(
    props.tabId || targetTab?.id || 'default',
    targetFilePath,
    targetContent,
    targetLanguage
  )
  if (editorInstance.getModel() !== model) {
    editorInstance.setModel(model)
  }

  if (isDiffActive.value && diffData.value) {
    if (diffData.value.hunks.length === 0) {
      decorationsCollection?.clear()
      hunkPositions.value = []
      editorInstance.updateOptions({ readOnly: props.readOnly })
      if (props.filePath) {
        workspaceStore.clearPendingDiff(props.filePath)
        agentStore.removeModifiedFile(props.filePath)
      }
      return
    }

    // 1. Set editor text to unified inline diff
    if (editorInstance.getValue() !== diffData.value.unifiedText) {
      editorInstance.setValue(diffData.value.unifiedText)
    }
    editorInstance.updateOptions({ readOnly: true })

    // 2. Build decorations
    const decorations: monaco.editor.IModelDeltaDecoration[] = []

    for (const lineNum of diffData.value.removedLineNumbers) {
      decorations.push({
        range: new monaco.Range(lineNum, 1, lineNum, 1),
        options: {
          isWholeLine: true,
          className: 'monaco-diff-line-removed',
          linesDecorationsClassName: 'monaco-diff-gutter-removed',
          description: 'diff-removed'
        }
      })
    }

    for (const lineNum of diffData.value.addedLineNumbers) {
      decorations.push({
        range: new monaco.Range(lineNum, 1, lineNum, 1),
        options: {
          isWholeLine: true,
          className: 'monaco-diff-line-added',
          linesDecorationsClassName: 'monaco-diff-gutter-added',
          description: 'diff-added'
        }
      })
    }

    if (decorationsCollection) {
      decorationsCollection.set(decorations)
    } else {
      decorationsCollection = editorInstance.createDecorationsCollection(decorations)
    }

    nextTick(() => {
      updateHunkPositions()
    })
  } else {
    // Clean up diff view and restore normal editing
    decorationsCollection?.clear()
    hunkPositions.value = []
    editorInstance.updateOptions({ readOnly: props.readOnly })
    const normalContent = targetTab?.content !== undefined ? targetTab.content : props.modelValue
    if (editorInstance.getValue() !== normalContent) {
      editorInstance.setValue(normalContent)
    }
  }
}

const agentStore = useAgentStore()

async function handleAcceptDiff(): Promise<void> {
  if (!props.filePath) return
  await workspaceStore.acceptDiff(props.filePath)
  agentStore.removeModifiedFile(props.filePath)
}

async function handleRejectDiff(): Promise<void> {
  if (!props.filePath) return
  await workspaceStore.rejectDiff(props.filePath)
  agentStore.removeModifiedFile(props.filePath)
}

async function handleAcceptHunk(hunkId: string): Promise<void> {
  if (!props.filePath) return
  const result = await workspaceStore.acceptHunk(props.filePath, hunkId)
  if (result.finished) {
    agentStore.removeModifiedFile(props.filePath)
  }
}

async function handleRejectHunk(hunkId: string): Promise<void> {
  if (!props.filePath) return
  const result = await workspaceStore.rejectHunk(props.filePath, hunkId)
  if (result.finished) {
    agentStore.removeModifiedFile(props.filePath)
  }
}

function getHunkAtCursor(): string | null {
  if (!editorInstance || !diffData.value || diffData.value.hunks.length === 0) return null
  const cursorLine = editorInstance.getPosition()?.lineNumber || 1
  let closestHunk = diffData.value.hunks[0]
  let minDistance = Infinity

  for (const hunk of diffData.value.hunks) {
    const dist = Math.abs(hunk.actionLine - cursorLine)
    if (dist < minDistance) {
      minDistance = dist
      closestHunk = hunk
    }
  }
  return closestHunk.id
}

function registerCustomThemes(): void {
  monaco.editor.defineTheme('makarya-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'comment', foreground: '6272a4', fontStyle: 'italic' },
      { token: 'keyword', foreground: '42b883', fontStyle: 'bold' },
      { token: 'string', foreground: 'a7f3d0' },
      { token: 'number', foreground: 'f6ad55' },
      { token: 'type', foreground: '38bdf8' }
    ],
    colors: {
      'editor.background': '#090d14',
      'editor.foreground': '#e2e8f0',
      'editorCursor.foreground': '#42b883',
      'editor.lineHighlightBackground': '#131d2e50',
      'editorLineNumber.foreground': '#475569',
      'editorLineNumber.activeForeground': '#42b883',
      'editor.selectionBackground': '#42b88335'
    }
  })

  monaco.editor.defineTheme('github-dark', {
    base: 'vs-dark',
    inherit: true,
    rules: [],
    colors: {
      'editor.background': '#0d1117',
      'editor.foreground': '#c9d1d9',
      'editorCursor.foreground': '#58a6ff',
      'editor.lineHighlightBackground': '#161b22',
      'editorLineNumber.foreground': '#6e7681',
      'editorLineNumber.activeForeground': '#58a6ff'
    }
  })

  monaco.editor.defineTheme('monokai', {
    base: 'vs-dark',
    inherit: true,
    rules: [
      { token: 'keyword', foreground: 'f92672' },
      { token: 'string', foreground: 'e6db74' }
    ],
    colors: {
      'editor.background': '#272822',
      'editor.foreground': '#f8f8f2',
      'editorCursor.foreground': '#f8f8f0'
    }
  })
}

// Persistent TextModels Map across tabs
const textModelsMap = new Map<string, monaco.editor.ITextModel>()

function getOrCreateTextModel(tabId: string, filePath: string, content: string, language: string): monaco.editor.ITextModel {
  const modelKey = tabId || filePath || 'default'
  const existing = textModelsMap.get(modelKey)
  if (existing && !existing.isDisposed()) {
    return existing
  }

  // Create clean URI for Monaco model tracking
  const uri = filePath
    ? monaco.Uri.file(filePath.replace(/\\/g, '/'))
    : monaco.Uri.parse(`makarya://tab/${modelKey}`)

  const existingByUri = monaco.editor.getModel(uri)
  if (existingByUri && !existingByUri.isDisposed()) {
    textModelsMap.set(modelKey, existingByUri)
    return existingByUri
  }

  const model = monaco.editor.createModel(content, language, uri)
  textModelsMap.set(modelKey, model)

  // Listen to model changes - strictly tied to this specific tabId
  model.onDidChangeContent(() => {
    if (!isDiffActive.value) {
      const updatedValue = model.getValue()
      workspaceStore.updateTabContent(tabId, updatedValue)
      saveCurrentViewState(tabId)
      globalPluginEvents.emit('editor:content-change', { content: updatedValue, filePath })
    }
  })

  return model
}

function saveCurrentViewState(specificTabId?: string): void {
  if (!editorInstance || isDiffActive.value) return
  const pos = editorInstance.getPosition()
  const selection = editorInstance.getSelection()
  const selections = editorInstance.getSelections()
  const scrollTop = editorInstance.getScrollTop()
  const scrollLeft = editorInstance.getScrollLeft()
  const monacoViewState = editorInstance.saveViewState()

  const targetTabId = specificTabId || props.tabId || workspaceStore.activeTabId
  if (!targetTabId) return

  workspaceStore.saveActiveTabViewState(
    {
      cursorPosition: pos ? { lineNumber: pos.lineNumber, column: pos.column } : undefined,
      selection:
        selection && !selection.isEmpty()
          ? {
              startLineNumber: selection.startLineNumber,
              startColumn: selection.startColumn,
              endLineNumber: selection.endLineNumber,
              endColumn: selection.endColumn
            }
          : undefined,
      selections:
        selections && selections.length > 0
          ? selections.map((s) => ({
              startLineNumber: s.startLineNumber,
              startColumn: s.startColumn,
              endLineNumber: s.endLineNumber,
              endColumn: s.endColumn
            }))
          : undefined,
      scrollTop,
      scrollLeft,
      monacoViewState
    },
    targetTabId
  )
}

function restoreTabViewState(targetTabId: string): void {
  if (!editorInstance || isDiffActive.value) return
  const savedState = workspaceStore.getTabViewState(targetTabId)
  if (!savedState) return

  if (savedState.monacoViewState) {
    editorInstance.restoreViewState(savedState.monacoViewState)
  }
  if (savedState.selections && savedState.selections.length > 0) {
    editorInstance.setSelections(
      savedState.selections.map(
        (s) => new monaco.Selection(s.startLineNumber, s.startColumn, s.endLineNumber, s.endColumn)
      )
    )
  } else if (savedState.selection) {
    editorInstance.setSelection(
      new monaco.Selection(
        savedState.selection.startLineNumber,
        savedState.selection.startColumn,
        savedState.selection.endLineNumber,
        savedState.selection.endColumn
      )
    )
  }
  if (savedState.cursorPosition) {
    editorInstance.setPosition(savedState.cursorPosition)
  }
  if (typeof savedState.scrollTop === 'number') {
    editorInstance.setScrollTop(savedState.scrollTop)
  }
  if (typeof savedState.scrollLeft === 'number') {
    editorInstance.setScrollLeft(savedState.scrollLeft)
  }

  // Microtask reassurance for visual highlight and layout centering
  nextTick(() => {
    setTimeout(() => {
      if (!editorInstance || isDiffActive.value) return
      if (savedState.monacoViewState) {
        editorInstance.restoreViewState(savedState.monacoViewState)
      }
      if (savedState.selections && savedState.selections.length > 0) {
        editorInstance.setSelections(
          savedState.selections.map(
            (s) => new monaco.Selection(s.startLineNumber, s.startColumn, s.endLineNumber, s.endColumn)
          )
        )
      } else if (savedState.selection) {
        editorInstance.setSelection(
          new monaco.Selection(
            savedState.selection.startLineNumber,
            savedState.selection.startColumn,
            savedState.selection.endLineNumber,
            savedState.selection.endColumn
          )
        )
      }
      if (typeof savedState.scrollTop === 'number') {
        editorInstance.setScrollTop(savedState.scrollTop)
      }
      if (savedState.cursorPosition) {
        editorInstance.setPosition(savedState.cursorPosition)
        editorInstance.revealPositionInCenterIfOutsideViewport(savedState.cursorPosition)
      }
    }, 40)
  })
}

onMounted(() => {
  if (!editorContainerRef.value) return

  registerCustomThemes()
  registerAutoRenameTagProvider(monaco)

  // Always get or create model for current initial tab
  const targetTab = workspaceStore.tabList.find((t) => t.id === props.tabId) || workspaceStore.activeTab
  const targetFilePath = targetTab?.filePath || props.filePath || ''
  const targetLanguage = targetTab?.language || props.language || 'plaintext'
  const targetContent = isDiffActive.value && diffData.value
    ? diffData.value.unifiedText
    : (targetTab?.content !== undefined ? targetTab.content : props.modelValue)

  const initialModel = getOrCreateTextModel(
    props.tabId || targetTab?.id || 'default',
    targetFilePath,
    targetContent,
    targetLanguage
  )

  // Initialize Monaco editor instance
  editorInstance = monaco.editor.create(editorContainerRef.value, {
    model: initialModel,
    language: props.language,
    theme: settingsStore.editor.theme,
    readOnly: isDiffActive.value || props.readOnly,
    automaticLayout: false,
    minimap: { enabled: settingsStore.editor.minimap },
    fontSize: settingsStore.editor.fontSize,
    lineNumbers: settingsStore.editor.lineNumbers as any,
    wordWrap: settingsStore.editor.wordWrap,
    roundedSelection: true,
    scrollBeyondLastLine: false,
    tabSize: settingsStore.editor.tabSize,
    cursorBlinking: settingsStore.editor.cursorBlinking,
    bracketPairColorization: {
      enabled: true
    },
    guides: {
      bracketPairs: true,
      bracketPairsHorizontal: true,
      highlightActiveBracketPair: true,
      indentation: true,
      highlightActiveIndentation: true
    },
    colorDecorators: true,
    colorDecoratorsLimit: 500,
    defaultColorDecorators: true,
    linkedEditing: true,
    autoClosingBrackets: 'always',
    autoClosingQuotes: 'always',
    suggest: {
      showWords: true,
      showSnippets: true
    }
  })

  // Attach Auto Close Tag engine
  autoCloseDisposable = setupAutoCloseTag(editorInstance)

  // Register active editor instance globally
  workspaceStore.setActiveEditorInstance(editorInstance)

  editorInstance.onDidFocusEditorText(() => {
    workspaceStore.setActiveEditorInstance(editorInstance)
  })

  editorInstance.onDidFocusEditorWidget(() => {
    workspaceStore.setActiveEditorInstance(editorInstance)
  })

  // Restore saved view state for current tab
  const targetTabId = props.tabId || workspaceStore.activeTabId
  restoreTabViewState(targetTabId)

  // Listen for cursor selection and position changes
  editorInstance.onDidChangeCursorSelection(() => {
    saveCurrentViewState()
  })

  editorInstance.onDidChangeCursorPosition(() => {
    saveCurrentViewState()
  })

  // Track scrolling and layout for floating pill alignment & viewState persistence
  editorInstance.onDidScrollChange(() => {
    if (isDiffActive.value) {
      updateHunkPositions()
    } else {
      saveCurrentViewState()
    }
  })

  editorInstance.onDidLayoutChange(() => {
    if (isDiffActive.value) {
      updateHunkPositions()
    }
  })

  // Register keyboard shortcuts: Alt+Enter for Accept current hunk, Shift+Alt+Backspace for Reject current hunk
  editorInstance.addCommand(monaco.KeyMod.Alt | monaco.KeyCode.Enter, () => {
    if (isDiffActive.value) {
      const hunkId = getHunkAtCursor()
      if (hunkId) {
        handleAcceptHunk(hunkId)
      } else {
        handleAcceptDiff()
      }
    }
  })

  editorInstance.addCommand(
    monaco.KeyMod.Shift | monaco.KeyMod.Alt | monaco.KeyCode.Backspace,
    () => {
      if (isDiffActive.value) {
        const hunkId = getHunkAtCursor()
        if (hunkId) {
          handleRejectHunk(hunkId)
        } else {
          handleRejectDiff()
        }
      }
    }
  )

  // Register Ctrl+L to tag selected code into Copilot Agent Chat
  editorInstance.addAction({
    id: 'makarya.tagCodeToAgent',
    label: 'Tag Selected Lines to Chat Agent',
    keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyL],
    run: (ed) => {
      tagEditorSelectionToAgent(ed)
    }
  })

  // Observe container size
  resizeObserver = new ResizeObserver(() => {
    editorInstance?.layout()
    if (isDiffActive.value) {
      updateHunkPositions()
    }
  })
  resizeObserver.observe(editorContainerRef.value)

  if (isDiffActive.value) {
    applyDiffDecorations()
  }
})

function tagEditorSelectionToAgent(ed?: monaco.editor.IStandaloneCodeEditor | null): void {
  const currentEd = ed || editorInstance || workspaceStore.getActiveEditorInstance()
  const activeTab = workspaceStore.activeTab

  if (!workspaceStore.isCopilotPanelOpen) {
    workspaceStore.isCopilotPanelOpen = true
  }

  if (currentEd) {
    const selection = currentEd.getSelection()
    const model = currentEd.getModel()
    if (model) {
      let snippet = ''
      let startLine = 1
      let endLine = 1
      let lineRange = ''

      if (selection && !selection.isEmpty()) {
        snippet = model.getValueInRange(selection)
        startLine = selection.startLineNumber
        endLine = selection.endLineNumber
        lineRange = startLine === endLine ? `L${startLine}` : `L${startLine}-L${endLine}`
      } else {
        const pos = currentEd.getPosition()
        if (pos) {
          startLine = pos.lineNumber
          endLine = pos.lineNumber
          snippet = model.getLineContent(pos.lineNumber)
          lineRange = `L${startLine}`
        }
      }

      const filePath = props.filePath || activeTab?.filePath || ''
      const fileName = activeTab?.title || (filePath ? filePath.split(/[/\\]/).pop() || 'Untitled' : 'Untitled')
      const language = props.language || activeTab?.language || 'plaintext'

      window.dispatchEvent(
        new CustomEvent('makarya:tag-to-agent', {
          detail: {
            path: filePath,
            name: fileName,
            startLine,
            endLine,
            lineRange,
            selectedSnippet: snippet,
            language
          }
        })
      )
      return
    }
  }

  if (activeTab && activeTab.filePath) {
    window.dispatchEvent(
      new CustomEvent('makarya:tag-to-agent', {
        detail: {
          path: activeTab.filePath,
          name: activeTab.title,
          language: activeTab.language
        }
      })
    )
  } else {
    window.dispatchEvent(new CustomEvent('makarya:focus-agent-chat'))
  }
}

// Seamless Tab Switcher Watcher
watch(
  () => props.tabId,
  (newTabId, oldTabId) => {
    if (!editorInstance) return

    // 1. Save view state for previous tab
    if (oldTabId) {
      saveCurrentViewState(oldTabId)
    }

    // 2. Switch or create TextModel for new tab
    if (newTabId) {
      const targetTab = workspaceStore.tabList.find((t) => t.id === newTabId) || workspaceStore.activeTab
      const targetFilePath = targetTab?.filePath || props.filePath || ''
      const targetContent = targetTab?.content !== undefined ? targetTab.content : props.modelValue
      const targetLanguage = targetTab?.language || props.language || 'plaintext'

      const model = getOrCreateTextModel(newTabId, targetFilePath, targetContent, targetLanguage)
      if (editorInstance.getModel() !== model) {
        editorInstance.setModel(model)
      }

      if (isDiffActive.value) {
        applyDiffDecorations()
      } else {
        decorationsCollection?.clear()
        hunkPositions.value = []
        editorInstance.updateOptions({ readOnly: props.readOnly })
        restoreTabViewState(newTabId)
      }

      editorInstance.focus()
    }
  }
)

// Auto-dispose models when tabs are closed (protect active editor model)
watch(
  () => workspaceStore.tabList.map((t) => t.id),
  (tabIds) => {
    const validIds = new Set(tabIds)
    const activeEditorModel = editorInstance?.getModel()
    for (const [key, model] of textModelsMap.entries()) {
      if (!validIds.has(key)) {
        if (!model.isDisposed() && model !== activeEditorModel) {
          model.dispose()
        }
        textModelsMap.delete(key)
      }
    }
  }
)

// React when active diff changes
watch(
  () => activeDiff.value,
  () => {
    applyDiffDecorations()
  },
  { deep: true }
)

// Sync external content changes from workspaceStore into each tab's model (e.g. diff apply, disk reload)
watch(
  () => workspaceStore.tabList.map((t) => ({ id: t.id, content: t.content })),
  (tabs) => {
    if (isDiffActive.value) return
    for (const tab of tabs) {
      const model = textModelsMap.get(tab.id)
      if (model && !model.isDisposed() && model.getValue() !== tab.content) {
        model.setValue(tab.content)
      }
    }
  },
  { deep: true }
)

watch(
  () => props.language,
  (newLanguage) => {
    if (editorInstance) {
      const model = editorInstance.getModel()
      if (model) {
        monaco.editor.setModelLanguage(model, newLanguage)
      }
    }
  }
)

watch(
  () => settingsStore.editor,
  (s) => {
    if (editorInstance) {
      monaco.editor.setTheme(s.theme)
      editorInstance.updateOptions({
        fontSize: s.fontSize,
        tabSize: s.tabSize,
        wordWrap: s.wordWrap,
        minimap: { enabled: s.minimap },
        lineNumbers: s.lineNumbers as any,
        cursorBlinking: s.cursorBlinking
      })
    }
  },
  { deep: true }
)

onBeforeUnmount(() => {
  autoCloseDisposable?.dispose()
  saveCurrentViewState()
})

onUnmounted(() => {
  if (workspaceStore.getActiveEditorInstance() === editorInstance) {
    workspaceStore.setActiveEditorInstance(null)
  }
  resizeObserver?.disconnect()
  decorationsCollection?.clear()
  // Dispose models
  for (const model of textModelsMap.values()) {
    if (!model.isDisposed()) {
      model.dispose()
    }
  }
  textModelsMap.clear()
  editorInstance?.dispose()
})
</script>

<template>
  <div class="w-full h-full relative overflow-hidden group">
    <!-- Monaco Editor Mounting Container -->
    <div ref="editorContainerRef" class="w-full h-full"></div>

    <!-- Floating Diff Action Pills (Accept / Reject) -->
    <template v-if="isDiffActive">
      <div
        v-for="hunk in hunkPositions"
        v-show="hunk.visible"
        :key="hunk.id"
        class="diff-hunk-pill select-none animate-in fade-in zoom-in-95 duration-150"
        :style="{ top: `${hunk.top}px` }"
      >
        <!-- Accept Button (Green Pill) -->
        <button
          class="diff-btn-accept"
          title="Terima perubahan baris ini saja (Alt + Enter)"
          @click.stop="handleAcceptHunk(hunk.id)"
        >
          <span>Accept</span>
          <span class="diff-kbd">Alt+↵</span>
        </button>

        <!-- Reject Button (Dark Rose Pill) -->
        <button
          class="diff-btn-reject"
          title="Tolak perubahan baris ini saja (Shift + Alt + Backspace)"
          @click.stop="handleRejectHunk(hunk.id)"
        >
          <span>Reject</span>
          <span class="diff-kbd">Shift+Alt+⌫</span>
        </button>

        <!-- Action icon -->
        <span class="text-zinc-500 hover:text-zinc-300 px-1 cursor-default text-[10px] flex items-center">
          <UIcon name="i-lucide-maximize-2" class="size-2.5 text-zinc-400" />
        </span>
      </div>
    </template>
  </div>
</template>

<style scoped>
/* Floating Diff Action Pill Container */
.diff-hunk-pill {
  position: absolute;
  right: 28px;
  z-index: 45;
  display: flex;
  align-items: center;
  gap: 6px;
  background: rgba(12, 18, 28, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 9999px;
  padding: 3px 6px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.55);
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.2;
}

/* Accept Button */
.diff-btn-accept {
  background-color: #42b883;
  color: #090d14;
  font-size: 10px;
  font-weight: 700;
  padding: 2.5px 9px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: none;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(66, 184, 131, 0.3);
  transition: background-color 140ms ease, transform 100ms ease;
}

.diff-btn-accept:hover {
  background-color: #34d399;
}

.diff-btn-accept:active {
  transform: scale(0.96);
}

/* Reject Button */
.diff-btn-reject {
  background-color: rgba(244, 63, 94, 0.12);
  color: #fda4af;
  font-size: 10px;
  font-weight: 600;
  padding: 2.5px 9px;
  border-radius: 9999px;
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid rgba(244, 63, 94, 0.25);
  cursor: pointer;
  transition: background-color 140ms ease, color 140ms ease, transform 100ms ease;
}

.diff-btn-reject:hover {
  background-color: rgba(244, 63, 94, 0.22);
  color: #ffe4e6;
}

.diff-btn-reject:active {
  transform: scale(0.96);
}

/* Kbd Badges inside buttons */
.diff-kbd {
  font-size: 9px;
  font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
  background: rgba(0, 0, 0, 0.22);
  padding: 1px 5px;
  border-radius: 9999px;
  letter-spacing: -0.02em;
}
</style>

<style>
/* Global Monaco Line Decorations for Diff */
.monaco-diff-line-removed {
  background-color: rgba(225, 29, 72, 0.26) !important;
}

.monaco-diff-gutter-removed {
  background-color: #f43f5e !important;
  width: 4px !important;
  margin-left: 2px;
}

.monaco-diff-line-added {
  background-color: rgba(16, 185, 129, 0.22) !important;
}

.monaco-diff-gutter-added {
  background-color: #10b981 !important;
  width: 4px !important;
  margin-left: 2px;
}

/* Global Indent Rainbow Styling */
.indent-rainbow-color-1 {
  background-color: rgba(255, 255, 64, 0.07) !important;
}

.indent-rainbow-color-2 {
  background-color: rgba(127, 255, 127, 0.07) !important;
}

.indent-rainbow-color-3 {
  background-color: rgba(255, 127, 255, 0.07) !important;
}

.indent-rainbow-color-4 {
  background-color: rgba(79, 236, 236, 0.07) !important;
}

.indent-rainbow-color-5 {
  background-color: rgba(255, 165, 0, 0.07) !important;
}

.indent-rainbow-color-6 {
  background-color: rgba(186, 85, 211, 0.07) !important;
}
</style>
