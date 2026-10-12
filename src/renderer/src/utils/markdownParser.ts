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
 * Formats simple inline markdown elements (bold, italic, inline code, file pill badges) for text blocks safely.
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

  // 1. File pill tag: [📄 filename.ext:L1-L20] or [📄 filename.ext] or 📄 filename.ext or [filename.ext]
  formatted = formatted.replace(
    /(?:\[📄\s*([^\]]+)\]|📄\s*([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+(?:\s+L?\d+(?:-L?\d+)?)?)|\[([a-zA-Z0-9_\-\.\/\\]+\.(?:vue|ts|js|jsx|tsx|json|php|css|scss|html|md|py|go|rs|java|c|cpp|h|sql|yaml|yml|env|blade\.php)(?::L?\d+(?:-L?\d+)?)?)\])/g,
    (_, p1, p2, p3) => {
      const fileRef = (p1 || p2 || p3 || '').trim()
      if (!fileRef) return ''
      return `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 mx-1 rounded-md bg-[#161b24] hover:bg-[#202735] border border-white/15 text-slate-200 hover:text-white text-[10.5px] font-mono select-none cursor-pointer transition-colors align-middle shadow-2xs group" data-file-ref="${fileRef}" title="Buka berkas ${fileRef}"><svg class="size-3 text-slate-400 group-hover:text-emerald-400 inline-block flex-shrink-0 transition-colors" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg><span class="leading-tight">${fileRef}</span></span>`
    }
  )

  // 2. @ Mentions: @filename.ext (e.g. @index.php or @App.vue:10-20)
  formatted = formatted.replace(
    /(?:^|\s)@([a-zA-Z0-9_\-\.\/\\]+\.[a-zA-Z0-9]+(?::L?\d+(?:-L?\d+)?)?)/g,
    (match, fileRef) => {
      const prefix = match.startsWith(' ') ? ' ' : ''
      return `${prefix}<span class="inline-flex items-center gap-1.5 px-2 py-0.5 mx-1 rounded-md bg-[#161b24] hover:bg-[#202735] border border-white/15 text-slate-200 hover:text-white text-[10.5px] font-mono select-none cursor-pointer transition-colors align-middle shadow-2xs group" data-file-ref="${fileRef}" title="Buka berkas ${fileRef}"><svg class="size-3 text-slate-400 group-hover:text-emerald-400 inline-block flex-shrink-0 transition-colors" xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/></svg><span class="leading-tight">${fileRef}</span></span>`
    }
  )

  // 3. Inline code: `code`
  formatted = formatted.replace(
    /`([^`]+)`/g,
    '<code class="bg-white/10 text-zinc-200 border border-white/15 px-1.5 py-0.5 rounded text-[10px] font-mono">$1</code>'
  )

  // 4. Bold: **text**
  formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-zinc-100">$1</strong>')

  // 5. Italic: *text*
  formatted = formatted.replace(/\*([^*]+)\*/g, '<em class="italic text-zinc-300">$1</em>')

  // 6. Line breaks to <br />
  formatted = formatted.replace(/\n/g, '<br />')

  return formatted
}
