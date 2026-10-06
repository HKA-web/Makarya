import type { BrowserWindow } from 'electron'
import type { AiServiceConfiguration } from './vercelAiService'

export interface UiBuilderStreamRequest {
  requestId: string
  model?: string
  messages: Array<{
    role: 'system' | 'user' | 'assistant'
    content: string | Array<{ type: 'text'; text: string } | { type: 'image_url'; image_url: { url: string } }>
  }>
  temperature?: number
}

export class UiBuilderService {
  private activeAbortControllers: Map<string, AbortController> = new Map()

  public abortStream(requestId: string): boolean {
    const controller = this.activeAbortControllers.get(requestId)
    if (controller) {
      controller.abort()
      this.activeAbortControllers.delete(requestId)
      return true
    }
    return false
  }

  public async streamGeneration(
    request: UiBuilderStreamRequest,
    config: AiServiceConfiguration,
    targetWindow: BrowserWindow | null
  ): Promise<void> {
    const { requestId, messages, model, temperature = 0.3 } = request

    if (!config.baseUrl) {
      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('ui-builder:stream-error', {
          requestId,
          errorMessage: 'Base URL 9router belum dikonfigurasi di Pengaturan (Settings > AI Provider).'
        })
      }
      return
    }

    let selectedModel = model || config.defaultModel
    if (!selectedModel || selectedModel === 'default' || selectedModel === 'gpt-4o') {
      selectedModel = (config.defaultModel && config.defaultModel !== 'default' ? config.defaultModel : '') || 'ag/gemini-3.6-flash-medium'
    }

    const abortController = new AbortController()
    this.activeAbortControllers.set(requestId, abortController)

    try {
      const cleanBase = config.baseUrl.replace(/\/+$/, '')
      const headers: Record<string, string> = {
        'Content-Type': 'application/json'
      }
      if (config.apiKey) {
        headers['Authorization'] = `Bearer ${config.apiKey}`
      }

      const response = await fetch(`${cleanBase}/chat/completions`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          model: selectedModel,
          messages,
          temperature,
          stream: true
        }),
        signal: abortController.signal
      })

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`)
      }

      if (!response.body) {
        throw new Error('Response body kosong dari AI router')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder('utf-8')
      let buffer = ''
      let fullContent = ''

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

              if (delta?.reasoning_content) {
                if (targetWindow && !targetWindow.isDestroyed()) {
                  targetWindow.webContents.send('ui-builder:thought-token', {
                    requestId,
                    deltaThought: delta.reasoning_content
                  })
                }
              }

              if (delta?.content) {
                fullContent += delta.content
                if (targetWindow && !targetWindow.isDestroyed()) {
                  targetWindow.webContents.send('ui-builder:stream-token', {
                    requestId,
                    deltaContent: delta.content
                  })
                }
              }
            } catch {
              // Ignore partial chunk parse errors
            }
          }
        }
      }

      if (targetWindow && !targetWindow.isDestroyed()) {
        targetWindow.webContents.send('ui-builder:stream-done', {
          requestId,
          fullContent
        })
      }
    } catch (err: any) {
      if (err.name === 'AbortError' || abortController.signal.aborted) {
        if (targetWindow && !targetWindow.isDestroyed()) {
          targetWindow.webContents.send('ui-builder:stream-done', {
            requestId,
            isAborted: true
          })
        }
      } else {
        console.error('[UiBuilderService] Error saat streaming:', err)
        if (targetWindow && !targetWindow.isDestroyed()) {
          targetWindow.webContents.send('ui-builder:stream-error', {
            requestId,
            errorMessage: err.message || 'Gagal menghubungi 9router AI gateway'
          })
        }
      }
    } finally {
      this.activeAbortControllers.delete(requestId)
    }
  }
}

export const uiBuilderService = new UiBuilderService()
