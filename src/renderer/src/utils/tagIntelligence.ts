import * as monaco from 'monaco-editor'
import { usePluginStore } from '@renderer/stores/pluginStore'

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr'
])

const SUPPORTED_LANGUAGES = [
  'html',
  'vue',
  'xml',
  'php',
  'javascript',
  'typescript',
  'javascriptreact',
  'typescriptreact',
  'twig',
  'blade',
  'markdown',
  'plaintext'
]

let isLinkedEditingRegistered = false

function isTagIntelligenceEnabled(): boolean {
  try {
    const pluginStore = usePluginStore()
    const plugin = pluginStore.installedPlugins.get('makarya.builtin.tag-intelligence')
    return plugin ? plugin.enabled : true
  } catch {
    return true
  }
}

interface TagToken {
  name: string
  isClosing: boolean
  isSelfClosing: boolean
  startOffset: number
  endOffset: number
  nameStartOffset: number
  nameEndOffset: number
}

/**
 * Scan all tags across document accurately
 */
function scanDocumentTags(text: string): TagToken[] {
  const tags: TagToken[] = []
  const len = text.length
  let i = 0

  while (i < len) {
    if (text[i] === '<') {
      // 1. Skip comments: <!-- ... -->
      if (text.startsWith('<!--', i)) {
        const end = text.indexOf('-->', i + 4)
        i = end === -1 ? len : end + 3
        continue
      }
      // 2. Skip DOCTYPE / CDATA: <!...>
      if (text.startsWith('<!', i)) {
        const end = text.indexOf('>', i + 2)
        i = end === -1 ? len : end + 1
        continue
      }
      // 3. Skip PHP tags: <?php ... ?> or <?= ... ?>
      if (text.startsWith('<?', i)) {
        const end = text.indexOf('?>', i + 2)
        i = end === -1 ? len : end + 2
        continue
      }

      const isClosing = text[i + 1] === '/'
      const nameStart = isClosing ? i + 2 : i + 1

      let nameEnd = nameStart
      while (nameEnd < len && /[a-zA-Z0-9_.:-]/.test(text[nameEnd])) {
        nameEnd++
      }

      const name = text.slice(nameStart, nameEnd)

      // Find '>'
      let inQuote: '"' | "'" | null = null
      let tagEnd = nameEnd
      let isSelfClosing = false

      while (tagEnd < len) {
        const char = text[tagEnd]
        if (inQuote) {
          if (char === inQuote && text[tagEnd - 1] !== '\\') {
            inQuote = null
          }
        } else if (char === '"' || char === "'") {
          inQuote = char
        } else if (char === '>') {
          if (text[tagEnd - 1] === '/') {
            isSelfClosing = true
          }
          break
        }
        tagEnd++
      }

      if (tagEnd < len && text[tagEnd] === '>') {
        const isVoid = name ? VOID_ELEMENTS.has(name.toLowerCase()) : false
        tags.push({
          name,
          isClosing,
          isSelfClosing: isSelfClosing || isVoid,
          startOffset: i,
          endOffset: tagEnd + 1,
          nameStartOffset: nameStart,
          nameEndOffset: nameEnd
        })
        i = tagEnd + 1
        continue
      }
    }
    i++
  }

  return tags
}

/**
 * Register Monaco Linked Editing Range Provider (Auto Rename Tag)
 * Monaco's native linked editing engine manages the simultaneous cursor edits cleanly and safely without any document infection!
 */
export function registerAutoRenameTagProvider(monacoInstance: typeof monaco): void {
  if (isLinkedEditingRegistered) return
  isLinkedEditingRegistered = true

  for (const lang of SUPPORTED_LANGUAGES) {
    monacoInstance.languages.registerLinkedEditingRangeProvider(lang, {
      wordPattern: /[a-zA-Z0-9_.:-]+/,
      provideLinkedEditingRanges(model, position) {
        if (!isTagIntelligenceEnabled()) return null

        const text = model.getValue()
        const offset = model.getOffsetAt(position)
        const tags = scanDocumentTags(text)

        // Find which tag the cursor is currently inside
        const targetIndex = tags.findIndex(
          (t) => offset >= t.nameStartOffset && offset <= t.nameEndOffset && t.name.length > 0
        )
        if (targetIndex === -1) return null

        const target = tags[targetIndex]
        if (target.isSelfClosing) return null

        // Find counterpart using depth balance
        if (!target.isClosing) {
          let depth = 0
          for (let i = targetIndex + 1; i < tags.length; i++) {
            const current = tags[i]
            if (current.isSelfClosing) continue

            if (!current.isClosing) {
              depth++
            } else {
              if (depth === 0) {
                const openStart = model.getPositionAt(target.nameStartOffset)
                const openEnd = model.getPositionAt(target.nameEndOffset)
                const closeStart = model.getPositionAt(current.nameStartOffset)
                const closeEnd = model.getPositionAt(current.nameEndOffset)
                return {
                  ranges: [
                    new monacoInstance.Range(openStart.lineNumber, openStart.column, openEnd.lineNumber, openEnd.column),
                    new monacoInstance.Range(closeStart.lineNumber, closeStart.column, closeEnd.lineNumber, closeEnd.column)
                  ],
                  wordPattern: /[a-zA-Z0-9_.:-]+/
                }
              }
              depth--
            }
          }
        } else {
          let depth = 0
          for (let i = targetIndex - 1; i >= 0; i--) {
            const current = tags[i]
            if (current.isSelfClosing) continue

            if (current.isClosing) {
              depth++
            } else {
              if (depth === 0) {
                const openStart = model.getPositionAt(current.nameStartOffset)
                const openEnd = model.getPositionAt(current.nameEndOffset)
                const closeStart = model.getPositionAt(target.nameStartOffset)
                const closeEnd = model.getPositionAt(target.nameEndOffset)
                return {
                  ranges: [
                    new monacoInstance.Range(openStart.lineNumber, openStart.column, openEnd.lineNumber, openEnd.column),
                    new monacoInstance.Range(closeStart.lineNumber, closeStart.column, closeEnd.lineNumber, closeEnd.column)
                  ],
                  wordPattern: /[a-zA-Z0-9_.:-]+/
                }
              }
              depth--
            }
          }
        }

        return null
      }
    })
  }
}

/**
 * Setup Auto Close Tag on Monaco Editor
 * 1. Closes open tags when typing '>'
 * 2. Completes nearest open tag when typing '</'
 */
export function setupAutoCloseTag(editor: monaco.editor.IStandaloneCodeEditor): monaco.IDisposable {
  let isExecutingEdit = false

  const contentDisposable = editor.onDidChangeModelContent((event) => {
    if (isExecutingEdit || !isTagIntelligenceEnabled()) return

    const model = editor.getModel()
    if (!model) return

    for (const change of event.changes) {
      const position = editor.getPosition()
      if (!position) continue

      const offset = model.getOffsetAt(position)
      const text = model.getValue()

      // 1. AUTO CLOSE on typing '>'
      if (change.text === '>') {
        const textBefore = text.slice(0, offset)
        const openTagMatch = textBefore.match(/<([a-zA-Z][a-zA-Z0-9_.:-]*)(?:[^"'>]|"[^"]*"|'[^']*')*>$/)

        if (openTagMatch) {
          const tagName = openTagMatch[1]
          if (!VOID_ELEMENTS.has(tagName.toLowerCase()) && !openTagMatch[0].endsWith('/>')) {
            const textAfter = text.slice(offset)
            const nextClosingTag = new RegExp(`^<\\/${tagName}[\\s>]`, 'i')
            if (!nextClosingTag.test(textAfter)) {
              const closeTagText = `</${tagName}>`
              isExecutingEdit = true
              try {
                editor.executeEdits('tag-autoclose', [
                  {
                    range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                    text: closeTagText,
                    forceMoveMarkers: false
                  }
                ])
                editor.setPosition(position)
              } finally {
                isExecutingEdit = false
              }
              continue
            }
          }
        }
      }

      // 2. AUTO CLOSE on typing '</'
      if (change.text === '/' || change.text === '</') {
        const textBefore = text.slice(0, offset)
        if (textBefore.endsWith('</')) {
          const tagsBefore = scanDocumentTags(textBefore.slice(0, -2))
          const stack: TagToken[] = []
          for (const t of tagsBefore) {
            if (t.isSelfClosing) continue
            if (!t.isClosing) {
              stack.push(t)
            } else {
              if (stack.length > 0) {
                stack.pop()
              }
            }
          }

          if (stack.length > 0) {
            const nearest = stack[stack.length - 1]
            if (nearest.name) {
              const completion = `${nearest.name}>`
              isExecutingEdit = true
              try {
                editor.executeEdits('tag-autoclose-slash', [
                  {
                    range: new monaco.Range(position.lineNumber, position.column, position.lineNumber, position.column),
                    text: completion,
                    forceMoveMarkers: true
                  }
                ])
              } finally {
                isExecutingEdit = false
              }
              continue
            }
          }
        }
      }
    }
  })

  return {
    dispose: () => {
      contentDisposable.dispose()
    }
  }
}
