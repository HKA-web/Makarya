export type ViewportMode = 'desktop' | 'tablet' | 'mobile'
export type OutputStack = 'vue-sfc' | 'html-tailwind'
export type VariantStatus = 'idle' | 'generating' | 'ready' | 'error'

export interface ExtractedAsset {
  id: string
  name: string
  description: string
  dataUrl: string
  width?: number
  height?: number
  box2d?: [number, number, number, number] // [ymin, xmin, ymax, xmax] normalized 0..1000
}

export interface UiBuilderVariant {
  id: string
  index: number
  name: string
  model: string
  provider: 'gemini' | 'openai' | 'anthropic' | 'custom'
  code: string
  status: VariantStatus
  thoughts?: string
  isThinking?: boolean
  error?: string
  durationMs?: number
}

export interface UiBuilderToolCall {
  id: string
  name: string
  args: Record<string, any>
  status: 'running' | 'success' | 'error'
  output?: string
}

export interface UiBuilderChatMessage {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  imageUrl?: string
  thoughts?: string
  isThinking?: boolean
  toolCalls?: UiBuilderToolCall[]
  timestamp: string
}

export interface UiBuilderGenerationOptions {
  stack: OutputStack
  customPrompt?: string
  shouldExtractAssets: boolean
  shouldGenerateImages: boolean
  selectedModel?: string
}
