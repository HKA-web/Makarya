import { defineStore } from 'pinia'
import { ref, computed, watch } from 'vue'
import type {
  ViewportMode,
  OutputStack,
  UiBuilderVariant,
  ExtractedAsset,
  UiBuilderChatMessage,
  VariantStatus
} from '../types'
import { useWorkspaceStore } from '../../../stores/workspaceStore'
import { useSettingsStore } from '../../../stores/settingsStore'
import { useAgentStore } from '../../../stores/agentStore'

function getCleanModelLabel(modelName: string): string {
  if (!modelName) return 'Default Model'
  const parts = modelName.split('/')
  return parts[parts.length - 1]
}

function detectProvider(modelName: string): 'gemini' | 'anthropic' | 'openai' | 'custom' {
  const lower = modelName.toLowerCase()
  if (lower.includes('gemini') || lower.includes('google')) return 'gemini'
  if (lower.includes('claude') || lower.includes('anthropic')) return 'anthropic'
  if (lower.includes('gpt') || lower.includes('openai')) return 'openai'
  return 'custom'
}

export const useUiBuilderStore = defineStore('uiBuilderStore', () => {
  const settingsStore = useSettingsStore()
  const agentStore = useAgentStore()

  // State Input & Output settings
  const uploadedImage = ref<string | null>(null)
  const uploadedImageName = ref<string>('')
  const outputStack = ref<OutputStack>('html-tailwind')
  const viewportMode = ref<ViewportMode>('desktop')
  const activeTab = ref<'preview' | 'code' | 'assets'>('preview')
  const clickToEditActive = ref<boolean>(false)

  // Model selection state
  const selectedModel = ref<string>('')

  const currentModel = computed(() => {
    return (
      selectedModel.value ||
      settingsStore.ai.defaultModel ||
      agentStore.selectedModel ||
      agentStore.availableModels[0] ||
      'ag/gemini-3.6-flash-medium'
    )
  })

  // Single session state
  const activeVariantIndex = ref<number>(0)
  const variants = ref<UiBuilderVariant[]>([])

  function initVariantsFromRouter(): void {
    const model = currentModel.value
    variants.value = [
      {
        id: 'var-1',
        index: 0,
        name: `Slicing Agent (${getCleanModelLabel(model)})`,
        model,
        provider: detectProvider(model),
        code: variants.value[0]?.code || '',
        status: variants.value[0]?.status || 'idle'
      }
    ]
  }

  function setSelectedModel(modelName: string): void {
    selectedModel.value = modelName
    if (variants.value[0]) {
      variants.value[0].model = modelName
      variants.value[0].name = `Slicing Agent (${getCleanModelLabel(modelName)})`
      variants.value[0].provider = detectProvider(modelName)
    }
  }

  // Load models if not yet loaded
  if (agentStore.availableModels.length === 0) {
    agentStore.loadModels().then(() => {
      initVariantsFromRouter()
    })
  } else {
    initVariantsFromRouter()
  }

  // Sync variants whenever 9router models or defaultModel changes
  watch(
    [() => agentStore.availableModels, () => agentStore.selectedModel, () => settingsStore.ai.defaultModel, selectedModel],
    () => {
      initVariantsFromRouter()
    },
    { deep: true }
  )

  const extractedAssets = ref<ExtractedAsset[]>([])

  // Chat & Iterative History
  const chatMessages = ref<UiBuilderChatMessage[]>([])
  const isGenerating = ref<boolean>(false)
  const activeActionText = ref<string>('')

  // Computed Properties
  const activeVariant = computed(() => {
    return (
      variants.value[0] || {
        id: 'var-1',
        index: 0,
        name: 'Slicing Agent',
        model: currentModel.value,
        provider: 'custom',
        code: '',
        status: 'idle'
      }
    )
  })

  const hasGeneratedCode = computed(() => {
    return (variants.value[0]?.code || '').trim().length > 0
  })

  const attachedHtml = ref<{ name: string; content: string } | null>(null)

  // Actions
  function setUploadedImage(dataUrl: string, filename = 'screenshot.png'): void {
    uploadedImage.value = dataUrl
    uploadedImageName.value = filename
  }

  function clearUploadedImage(): void {
    uploadedImage.value = null
    uploadedImageName.value = ''
    extractedAssets.value = []
  }

  function setAttachedHtml(filename: string, content: string): void {
    attachedHtml.value = { name: filename, content }
    setVariantCode(0, content)
    setVariantStatus(0, 'ready')
  }

  function clearAttachedHtml(): void {
    attachedHtml.value = null
  }

  function setViewportMode(mode: ViewportMode): void {
    viewportMode.value = mode
  }

  function setOutputStack(stack: OutputStack): void {
    outputStack.value = stack
  }

  function setActiveVariantIndex(index: number): void {
    if (index >= 0 && index < variants.value.length) {
      activeVariantIndex.value = index
    }
  }

  function setVariantCode(index: number, code: string): void {
    if (variants.value[index]) {
      variants.value[index].code = code
    }
  }

  function appendVariantChunk(index: number, chunk: string): void {
    if (variants.value[index]) {
      variants.value[index].code += chunk
    }
  }

  function setVariantStatus(index: number, status: VariantStatus, error?: string): void {
    if (variants.value[index]) {
      variants.value[index].status = status
      if (error !== undefined) {
        variants.value[index].error = error
      }
    }
  }

  function setVariantThoughts(index: number, thoughts: string, isThinking = false): void {
    if (variants.value[index]) {
      variants.value[index].thoughts = thoughts
      variants.value[index].isThinking = isThinking
    }
  }

  function addExtractedAsset(asset: ExtractedAsset): void {
    const existingIndex = extractedAssets.value.findIndex((a) => a.id === asset.id)
    if (existingIndex >= 0) {
      extractedAssets.value[existingIndex] = asset
    } else {
      extractedAssets.value.push(asset)
    }
  }

  function addChatMessage(message: UiBuilderChatMessage): void {
    chatMessages.value.push(message)
  }

  function resetAll(): void {
    uploadedImage.value = null
    uploadedImageName.value = ''
    attachedHtml.value = null
    extractedAssets.value = []
    chatMessages.value = []
    isGenerating.value = false
    activeActionText.value = ''
    const model = currentModel.value
    variants.value = [
      {
        id: 'var-1',
        index: 0,
        name: `Slicing Agent (${getCleanModelLabel(model)})`,
        model,
        provider: detectProvider(model),
        code: '',
        status: 'idle'
      }
    ]
    activeVariantIndex.value = 0
  }

  async function saveActiveCodeToWorkspace(options?: { fileName?: string; targetDirectory?: string }): Promise<{ success: boolean; fullPath?: string; fileName?: string; error?: string }> {
    const workspaceStore = useWorkspaceStore()
    const code = activeVariant.value.code
    if (!code) return { success: false, error: 'Tidak ada kode yang dihasilkan' }

    const extension = outputStack.value === 'vue-sfc' ? '.vue' : '.html'
    const fileName = options?.fileName || `GeneratedComponent${extension}`
    const targetDir = options?.targetDirectory || workspaceStore.activeRootPath || workspaceStore.rootFolderPath

    if (!targetDir) {
      return { success: false, error: 'Folder tujuan penyimpanan belum ditentukan' }
    }

    try {
      const cleanDir = targetDir.replace(/\\/g, '/').replace(/\/+$/, '')
      const fullPath = `${cleanDir}/${fileName}`
      if (window.makaryaAPI) {
        const writeRes = await window.makaryaAPI.writeFile(fullPath, code)
        if (writeRes && !writeRes.success) {
          return { success: false, error: writeRes.error || 'Gagal menulis berkas ke disk' }
        }
      }
      await workspaceStore.refreshDirectory(cleanDir)
      return { success: true, fullPath, fileName }
    } catch (err: any) {
      console.error('Gagal menyimpan file ke workspace:', err)
      return { success: false, error: err.message || 'Terjadi kesalahan sistem' }
    }
  }

  return {
    uploadedImage,
    uploadedImageName,
    attachedHtml,
    outputStack,
    viewportMode,
    activeTab,
    clickToEditActive,
    activeVariantIndex,
    variants,
    extractedAssets,
    chatMessages,
    isGenerating,
    activeActionText,
    activeVariant,
    hasGeneratedCode,
    selectedModel,
    currentModel,
    setSelectedModel,
    setUploadedImage,
    clearUploadedImage,
    setAttachedHtml,
    clearAttachedHtml,
    setViewportMode,
    setOutputStack,
    setActiveVariantIndex,
    setVariantCode,
    appendVariantChunk,
    setVariantStatus,
    setVariantThoughts,
    addExtractedAsset,
    addChatMessage,
    resetAll,
    saveActiveCodeToWorkspace,
    initVariantsFromRouter
  }
})
