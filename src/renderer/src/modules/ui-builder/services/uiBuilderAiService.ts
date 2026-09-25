import type { OutputStack } from '../types'
import { getSystemPrompt, buildUpdatePrompt } from './uiBuilderPrompts'
import { useSettingsStore } from '../../../stores/settingsStore'

/**
 * Memotong gambar berbasis koordinat normalisasi box2d [ymin, xmin, ymax, xmax] (0..1000) menggunakan HTML5 Canvas di browser
 */
export async function cropImageFromDataUrl(
  base64Image: string,
  box2d: [number, number, number, number]
): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      const [ymin, xmin, ymax, xmax] = box2d
      const imgW = img.naturalWidth
      const imgH = img.naturalHeight

      // Konversi koordinat normalisasi 0..1000 ke piksel asli
      const sx = Math.max(0, Math.floor((xmin / 1000) * imgW))
      const sy = Math.max(0, Math.floor((ymin / 1000) * imgH))
      const sWidth = Math.min(imgW - sx, Math.ceil(((xmax - xmin) / 1000) * imgW))
      const sHeight = Math.min(imgH - sy, Math.ceil(((ymax - ymin) / 1000) * imgH))

      if (sWidth <= 0 || sHeight <= 0) {
        return reject(new Error('Dimensi bounding box tidak valid'))
      }

      const canvas = document.createElement('canvas')
      canvas.width = sWidth
      canvas.height = sHeight
      const ctx = canvas.getContext('2d')
      if (!ctx) return reject(new Error('Canvas 2D context tidak tersedia'))

      ctx.drawImage(img, sx, sy, sWidth, sHeight, 0, 0, sWidth, sHeight)
      resolve({
        dataUrl: canvas.toDataURL('image/png'),
        width: sWidth,
        height: sHeight
      })
    }
    img.onerror = (err) => reject(err)
    img.src = base64Image
  })
}

/**
 * Membersihkan output markdown kode (menghapus ```vue / ```html)
 */
export function cleanCodeOutput(rawCode: string): string {
  let cleaned = rawCode.trim()
  if (cleaned.startsWith('```')) {
    const firstNewline = cleaned.indexOf('\n')
    if (firstNewline !== -1) {
      cleaned = cleaned.slice(firstNewline + 1)
    }
  }
  if (cleaned.endsWith('```')) {
    cleaned = cleaned.slice(0, -3).trim()
  }
  return cleaned
}

export interface StreamGenerationCallbacks {
  onChunk: (chunk: string) => void
  onThinking?: (thoughts: string) => void
  onError?: (err: Error) => void
  onComplete?: (fullCode: string) => void
}

/**
 * Menjalankan generasi kode via Electron IPC (9router backend) secara streaming
 */
export async function streamUiCodeGeneration(
  params: {
    stack: OutputStack
    imageInput?: string | null
    customPrompt?: string
    existingCode?: string
    model?: string
  },
  callbacks: StreamGenerationCallbacks
): Promise<string> {
  const settingsStore = useSettingsStore()
  const model = params.model || settingsStore.ai.defaultModel || 'gpt-4o'
  const requestId = `ui-stream-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

  const systemPrompt = getSystemPrompt(params.stack)
  let userPrompt = params.customPrompt || 'Tolong konversi desain ini menjadi kode UI yang fungsional dan presisi.'
  if (params.existingCode) {
    userPrompt = buildUpdatePrompt(params.existingCode, userPrompt)
  }

  const userContent: any[] = [{ type: 'text', text: userPrompt }]
  if (params.imageInput) {
    userContent.push({
      type: 'image_url',
      image_url: { url: params.imageInput }
    })
  }

  const messages: any[] = [
    { role: 'system', content: systemPrompt },
    { role: 'user', content: userContent }
  ]

  // 1. Prioritas Utama: Gunakan Electron Main Process IPC (bypasses CORS, handles 9router via Node.js fetch)
  if (window.makaryaAPI?.sendUiBuilderChat) {
    return new Promise((resolve, reject) => {
      let accumulatedCode = ''
      let accumulatedThoughts = ''

      const cleanups: Array<() => void> = []

      cleanups.push(
        window.makaryaAPI.onUiBuilderStreamToken((data: { requestId: string; deltaContent: string }) => {
          if (data.requestId === requestId) {
            accumulatedCode += data.deltaContent
            callbacks.onChunk(data.deltaContent)
          }
        })
      )

      cleanups.push(
        window.makaryaAPI.onUiBuilderThought((data: { requestId: string; deltaThought: string }) => {
          if (data.requestId === requestId) {
            accumulatedThoughts += data.deltaThought
            callbacks.onThinking?.(accumulatedThoughts)
          }
        })
      )

      cleanups.push(
        window.makaryaAPI.onUiBuilderStreamDone((data: { requestId: string; fullContent?: string; isAborted?: boolean }) => {
          if (data.requestId === requestId) {
            cleanups.forEach((c) => c())
            const finalCode = cleanCodeOutput(data.fullContent || accumulatedCode)
            callbacks.onComplete?.(finalCode)
            resolve(finalCode)
          }
        })
      )

      cleanups.push(
        window.makaryaAPI.onUiBuilderStreamError((data: { requestId: string; errorMessage: string }) => {
          if (data.requestId === requestId) {
            cleanups.forEach((c) => c())
            const err = new Error(data.errorMessage)
            callbacks.onError?.(err)
            reject(err)
          }
        })
      )

      window.makaryaAPI
        .sendUiBuilderChat({
          requestId,
          model,
          messages,
          temperature: 0.3
        })
        .catch((ipcErr) => {
          cleanups.forEach((c) => c())
          callbacks.onError?.(ipcErr)
          reject(ipcErr)
        })
    })
  }

  // 2. Fallback untuk standalone web: direct fetch
  const apiKey = settingsStore.ai.apiKey
  const baseUrl = (settingsStore.ai.baseUrl || 'http://127.0.0.1:20128/v1').replace(/\/+$/, '')

  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.3,
        stream: true
      })
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`9router HTTP ${response.status}: ${errText}`)
    }

    const reader = response.body?.getReader()
    if (!reader) throw new Error('Response stream tidak terbaca')

    const decoder = new TextDecoder('utf-8')
    let buffer = ''
    let accumulatedCode = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || trimmed === 'data: [DONE]') continue
        if (trimmed.startsWith('data: ')) {
          try {
            const data = JSON.parse(trimmed.slice(6))
            const delta = data.choices?.[0]?.delta
            if (delta?.content) {
              accumulatedCode += delta.content
              callbacks.onChunk(delta.content)
            }
          } catch {
            // Ignore parse errors on partial chunks
          }
        }
      }
    }

    const finalCleanedCode = cleanCodeOutput(accumulatedCode)
    callbacks.onComplete?.(finalCleanedCode)
    return finalCleanedCode
  } catch (err: any) {
    callbacks.onError?.(err)
    throw err
  }
}
