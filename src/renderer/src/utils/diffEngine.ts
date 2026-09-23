import { diffLines, Change } from 'diff'

export interface DiffHunk {
  id: string
  actionLine: number // 1-based line number in unified text where the action pill is attached
  removedLines: { startLine: number; count: number } | null
  addedLines: { startLine: number; count: number } | null
  originalLines: string[]
  newLines: string[]
}

export interface InlineDiffResult {
  unifiedText: string
  hunks: DiffHunk[]
  removedLineNumbers: number[] // 1-based
  addedLineNumbers: number[]   // 1-based
}

export interface StructuredDiffBlock {
  type: 'unchanged' | 'hunk'
  lines: string[]
  hunkId?: string
  originalLines?: string[]
  newLines?: string[]
}

export function parseDiffBlocks(originalText: string, newText: string): StructuredDiffBlock[] {
  // If both texts are identical or only differ in trailing newlines/whitespace, treat as unchanged
  if (originalText.trimEnd() === newText.trimEnd()) {
    if (newText.length === 0) return []
    const lines = newText.split(/\r?\n/)
    if (lines.length > 0 && lines[lines.length - 1] === '') {
      lines.pop()
    }
    return [{ type: 'unchanged', lines }]
  }

  const changes: Change[] = diffLines(originalText, newText)
  const blocks: StructuredDiffBlock[] = []
  let hunkCount = 0
  let i = 0

  while (i < changes.length) {
    const change = changes[i]

    if (!change.added && !change.removed) {
      const lines = change.value.split(/\r?\n/)
      if (lines.length > 0 && lines[lines.length - 1] === '') {
        lines.pop()
      }
      blocks.push({
        type: 'unchanged',
        lines
      })
      i++
    } else {
      let removedChange: Change | null = null
      let addedChange: Change | null = null

      if (change.removed) {
        removedChange = change
        if (i + 1 < changes.length && changes[i + 1].added) {
          addedChange = changes[i + 1]
          i += 2
        } else {
          i += 1
        }
      } else if (change.added) {
        addedChange = change
        i += 1
      }

      const originalLines: string[] = []
      const newLines: string[] = []

      if (removedChange) {
        const lines = removedChange.value.split(/\r?\n/)
        if (lines.length > 0 && lines[lines.length - 1] === '') {
          lines.pop()
        }
        originalLines.push(...lines)
      }

      if (addedChange) {
        const lines = addedChange.value.split(/\r?\n/)
        if (lines.length > 0 && lines[lines.length - 1] === '') {
          lines.pop()
        }
        newLines.push(...lines)
      }

      // Check if originalLines and newLines are completely identical (e.g. newline artifact at end of file)
      if (
        originalLines.length > 0 &&
        originalLines.length === newLines.length &&
        originalLines.every((l, idx) => l === newLines[idx])
      ) {
        if (blocks.length > 0 && blocks[blocks.length - 1].type === 'unchanged') {
          blocks[blocks.length - 1].lines.push(...originalLines)
        } else {
          blocks.push({
            type: 'unchanged',
            lines: originalLines
          })
        }
        continue
      }

      blocks.push({
        type: 'hunk',
        lines: [],
        hunkId: `hunk-${hunkCount++}`,
        originalLines,
        newLines
      })
    }
  }

  return blocks
}

/**
 * Computes an inline unified diff representation between originalText and newText.
 * Deleted lines are shown immediately before added lines for each changed hunk.
 */
export function computeInlineDiff(originalText: string, newText: string): InlineDiffResult {
  const blocks = parseDiffBlocks(originalText, newText)
  const unifiedLines: string[] = []
  const removedLineNumbers: number[] = []
  const addedLineNumbers: number[] = []
  const hunks: DiffHunk[] = []

  let currentLine = 1

  for (const block of blocks) {
    if (block.type === 'unchanged') {
      for (const line of block.lines) {
        unifiedLines.push(line)
        currentLine++
      }
    } else if (block.type === 'hunk') {
      const hunkStartLine = currentLine
      let removedInfo: { startLine: number; count: number } | null = null
      let addedInfo: { startLine: number; count: number } | null = null

      if (block.originalLines && block.originalLines.length > 0) {
        removedInfo = { startLine: currentLine, count: block.originalLines.length }
        for (const line of block.originalLines) {
          unifiedLines.push(line)
          removedLineNumbers.push(currentLine)
          currentLine++
        }
      }

      if (block.newLines && block.newLines.length > 0) {
        addedInfo = { startLine: currentLine, count: block.newLines.length }
        for (const line of block.newLines) {
          unifiedLines.push(line)
          addedLineNumbers.push(currentLine)
          currentLine++
        }
      }

      hunks.push({
        id: block.hunkId || `hunk-${hunks.length}`,
        actionLine: hunkStartLine,
        removedLines: removedInfo,
        addedLines: addedInfo,
        originalLines: block.originalLines || [],
        newLines: block.newLines || []
      })
    }
  }

  return {
    unifiedText: unifiedLines.join('\n'),
    hunks,
    removedLineNumbers,
    addedLineNumbers
  }
}

/**
 * Resolves a single hunk by either accepting or rejecting it.
 * - 'accept': applies the hunk's proposed newLines into the baseline originalContent.
 * - 'reject': keeps originalLines in originalContent and reverts newLines in newContent to match.
 */
export function resolveHunk(
  originalText: string,
  newText: string,
  targetHunkId: string,
  action: 'accept' | 'reject'
): { updatedOriginal: string; updatedNew: string; remainingHunksCount: number } {
  const eol = originalText.includes('\r\n') || newText.includes('\r\n') ? '\r\n' : '\n'
  const blocks = parseDiffBlocks(originalText, newText)

  const newOriginalLines: string[] = []
  const newNewLines: string[] = []

  for (const block of blocks) {
    if (block.type === 'unchanged') {
      newOriginalLines.push(...block.lines)
      newNewLines.push(...block.lines)
    } else if (block.type === 'hunk') {
      if (block.hunkId === targetHunkId) {
        if (action === 'accept') {
          // Adopt newLines
          newOriginalLines.push(...(block.newLines || []))
          newNewLines.push(...(block.newLines || []))
        } else {
          // Revert to originalLines
          newOriginalLines.push(...(block.originalLines || []))
          newNewLines.push(...(block.originalLines || []))
        }
      } else {
        // Keep pending for other hunks
        newOriginalLines.push(...(block.originalLines || []))
        newNewLines.push(...(block.newLines || []))
      }
    }
  }

  // Check if both sides have identical lines
  const areLinesIdentical =
    newOriginalLines.length === newNewLines.length &&
    newOriginalLines.every((line, idx) => line === newNewLines[idx])

  let updatedOriginal = newOriginalLines.join(eol)
  let updatedNew = newNewLines.join(eol)

  if (areLinesIdentical) {
    if (newText.endsWith('\n') && !updatedOriginal.endsWith('\n')) {
      updatedOriginal += eol
    }
    return {
      updatedOriginal,
      updatedNew: updatedOriginal,
      remainingHunksCount: 0
    }
  }

  if (
    (originalText.endsWith('\n') || (action === 'accept' && newText.endsWith('\n'))) &&
    !updatedOriginal.endsWith('\n')
  ) {
    updatedOriginal += eol
  }

  if (newText.endsWith('\n') && !updatedNew.endsWith('\n')) {
    updatedNew += eol
  }

  const diffCheck = computeInlineDiff(updatedOriginal, updatedNew)

  return {
    updatedOriginal,
    updatedNew,
    remainingHunksCount: diffCheck.hunks.length
  }
}
