export interface MarkdownContentBlock {
  type: 'text' | 'code'
  content: string
  language?: string
}

/**
 * Splits AI assistant markdown text into alternating blocks of text and code fences.
 * This allows rendering syntax-highlighted code blocks with custom action buttons in Vue.
 */
export function parseMarkdownBlocks(rawMarkdown: string): MarkdownContentBlock[] {
  if (!rawMarkdown) return []

  const blocks: MarkdownContentBlock[] = []
  const codeBlockRegex = /```([a-zA-Z0-9_-]*)\s*([\s\S]*?)```/g
  let lastIndex = 0
  let match: RegExpExecArray | null

  while ((match = codeBlockRegex.exec(rawMarkdown)) !== null) {
    // Push preceding text block if non-empty
    if (match.index > lastIndex) {
      const textChunk = rawMarkdown.substring(lastIndex, match.index)
      if (textChunk.trim()) {
        blocks.push({
          type: 'text',
          content: textChunk
        })
      }
    }

    // Push the code block
    const language = match[1]?.trim() || 'plaintext'
    const code = match[2] || ''
    blocks.push({
      type: 'code',
      content: code,
      language
    })

    lastIndex = match.index + match[0].length
  }

  // Push any remaining text after the last code block
  if (lastIndex < rawMarkdown.length) {
    const trailingText = rawMarkdown.substring(lastIndex)
    if (trailingText.trim()) {
      blocks.push({
        type: 'text',
        content: trailingText
      })
    }
  }

  return blocks
}

/**
 * Formats simple inline markdown elements (bold, italic, inline code) for text blocks safely.
 */
export function formatInlineMarkdown(text?: any): string {
  if (text === null || text === undefined) return ''
  const str = typeof text === 'string' ? text : String(text)
  if (!str) return ''

  // Escape HTML characters first for security
  let formatted = str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

  // Inline code: `code`
  formatted = formatted.replace(
    /`([^`]+)`/g,
    '<code class="bg-[#42b883]/10 text-[#42b883] border border-[#42b883]/20 px-1.5 py-0.5 rounded text-[10px] font-mono">$1</code>'
  )

  // Bold: **text**
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-zinc-100">$1</strong>')

  // Italic: *text*
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em class="italic text-zinc-300">$1</em>')

  // Line breaks to <br />
  formatted = formatted.replace(/\n/g, '<br />')

  return formatted
}
