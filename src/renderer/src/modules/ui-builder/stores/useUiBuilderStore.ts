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
  const outputStack = ref<OutputStack>('vue-sfc')
  const viewportMode = ref<ViewportMode>('desktop')
  const activeTab = ref<'preview' | 'code' | 'assets'>('preview')
  const clickToEditActive = ref<boolean>(false)

  // Multi-variant generation state
  const activeVariantIndex = ref<number>(0)
  const variants = ref<UiBuilderVariant[]>([])

  function initVariantsFromRouter(): void {
    const models = agentStore.availableModels
    const defaultModel = settingsStore.ai.defaultModel || models[0] || 'default'

    const targetModels = [
      defaultModel,
      models[1] || defaultModel,
      models[2] || defaultModel,
      models[3] || defaultModel
    ]

    variants.value = targetModels.map((model, idx) => ({
      id: `var-${idx + 1}`,
      index: idx,
      name: `Varian ${idx + 1} (${getCleanModelLabel(model)})`,
      model,
      provider: detectProvider(model),
      code: variants.value[idx]?.code || '',
      status: variants.value[idx]?.status || 'idle'
    }))
  }

  // Initialize variants
  initVariantsFromRouter()

  // Sync variants whenever 9router models or defaultModel changes
  watch(
    [() => agentStore.availableModels, () => settingsStore.ai.defaultModel],
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
    return variants.value[activeVariantIndex.value] || variants.value[0] || {
      id: 'var-1',
      index: 0,
      name: 'Varian 1',
      model: settingsStore.ai.defaultModel || '',
      provider: 'custom',
      code: '',
      status: 'idle'
    }
  })

  const hasGeneratedCode = computed(() => {
    return variants.value.some((v) => v.code.trim().length > 0)
  })

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
    extractedAssets.value = []
    chatMessages.value = []
    isGenerating.value = false
    activeActionText.value = ''
    initVariantsFromRouter()
    activeVariantIndex.value = 0
  }

  async function saveActiveCodeToWorkspace(suggestedFileName?: string): Promise<{ success: boolean; fullPath?: string; fileName?: string }> {
    const workspaceStore = useWorkspaceStore()
    const code = activeVariant.value.code
    if (!code) return { success: false }

    const extension = outputStack.value === 'vue-sfc' ? '.vue' : '.html'
    const fileName = suggestedFileName || `GeneratedComponent${extension}`

    try {
      if (workspaceStore.activeRootPath) {
        const fullPath = `${workspaceStore.activeRootPath}/${fileName}`.replace(/\\/g, '/')
        await workspaceStore.createFile(fullPath, code)
        return { success: true, fullPath, fileName }
      }
      return { success: false }
    } catch (err) {
      console.error('Gagal menyimpan file ke workspace:', err)
      return { success: false }
    }
  }

  return {
    uploadedImage,
    uploadedImageName,
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
    setUploadedImage,
    clearUploadedImage,
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
