export interface ImplementationPlanTask {
  id: string
  title: string
  completed: boolean
  description?: string
}

export interface ParsedImplementationPlan {
  title: string
  summary: string
  filePath?: string
  tasks: ImplementationPlanTask[]
  affectedFiles: string[]
  verification: string[]
  rawContent: string
}

/**
 * Extracts structured implementation plan data from an agent message or markdown text.
 * Returns null if the content does not contain a recognizable implementation plan.
 */
export function extractImplementationPlan(
  content: string,
  toolCalls?: Array<{ name: string; args?: any }>,
  modifiedFiles?: Array<{ filePath: string }>
): ParsedImplementationPlan | null {
  if (!content && (!toolCalls || toolCalls.length === 0)) return null

  const isPlanKeywords =
    /implementation\s+plan/i.test(content) ||
    /rencana\s+implementasi/i.test(content) ||
    /<implementation_plan>/i.test(content) ||
    /\.makarya[/\\]plans[/\\]/i.test(content)

  // Check if any tool call wrote to .makarya/plans/
  let planFilePath: string | undefined
  if (toolCalls && toolCalls.length > 0) {
    for (const tool of toolCalls) {
      if (tool.name === 'write_file' && tool.args?.filePath) {
        if (tool.args.filePath.replace(/\\/g, '/').includes('.makarya/plans/')) {
          planFilePath = tool.args.filePath
          break
        }
      }
    }
  }

  if (!planFilePath && modifiedFiles && modifiedFiles.length > 0) {
    for (const f of modifiedFiles) {
      if (f.filePath.replace(/\\/g, '/').includes('.makarya/plans/')) {
        planFilePath = f.filePath
        break
      }
    }
  }

  // Also check if text mentions a plan file path
  if (!planFilePath) {
    const fileMatch = content.match(/([a-zA-Z0-9_\-./\\]+\.makarya[/\\]plans[/\\][a-zA-Z0-9_\-.]+\.md)/i) ||
      content.match(/(`?\.makarya[/\\]plans[/\\][a-zA-Z0-9_\-.]+\.md`?)/i)
    if (fileMatch) {
      planFilePath = fileMatch[1].replace(/`/g, '')
    }
  }

  if (!isPlanKeywords && !planFilePath) {
    return null
  }

  // 1. Extract Title
  let title = 'Rencana Implementasi'
  const titleMatch =
    content.match(/#+\s+(?:Implementation\s+Plan|Rencana\s+Implementasi)[:\s\-]*([^\n\r]+)/i) ||
    content.match(/#+\s+([^\n\r]*(?:Plan|Rencana)[^\n\r]*)/i)

  if (titleMatch && titleMatch[1]?.trim()) {
    title = titleMatch[1].trim().replace(/^[-:–]\s*/, '')
  } else if (planFilePath) {
    const baseName = planFilePath.split(/[/\\]/).pop()?.replace(/\.md$/i, '') || ''
    if (baseName) {
      title = baseName.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
    }
  }

  // 2. Extract Tasks / Checklist items
  const tasks: ImplementationPlanTask[] = []
  const taskRegex = /^[ \t]*(?:[-*]|\d+\.)\s+\[([ xX])\]\s+([^\n\r]+)/gm
  let taskMatch: RegExpExecArray | null
  let taskIndex = 1

  while ((taskMatch = taskRegex.exec(content)) !== null) {
    const isCompleted = taskMatch[1].toLowerCase() === 'x'
    const rawTaskText = taskMatch[2].trim()
    tasks.push({
      id: `task-${taskIndex++}`,
      title: rawTaskText,
      completed: isCompleted
    })
  }

  // 3. Extract Affected Files
  const affectedFiles: string[] = []
  const fileSectionMatch = content.match(
    /(?:###?|##|\*\*)\s*(?:Proposed Changes|Files?|Berkas|File yang (?:Dibuat|Diubah|Dimodifikasi))[\s\S]*?(?=(?:###?|##|\*\*|\n\n\n|$))/i
  )
  if (fileSectionMatch) {
    const fileMatches = fileSectionMatch[0].match(/`([^`]+\.[a-zA-Z0-9]+)`/g) || []
    for (const fm of fileMatches) {
      const clean = fm.replace(/`/g, '').trim()
      if (clean && !affectedFiles.includes(clean) && !clean.endsWith('.md')) {
        affectedFiles.push(clean)
      }
    }
  }

  // 4. Extract Verification Steps
  const verification: string[] = []
  const verifSectionMatch = content.match(
    /(?:###?|##|\*\*)\s*(?:Verification|Pengujian|Verifikasi|Testing Plan)[\s\S]*?(?=(?:###?|##|\*\*|\n\n\n|$))/i
  )
  if (verifSectionMatch) {
    const verifItems = verifSectionMatch[0].match(/^[ \t]*(?:[-*]|\d+\.)\s+([^\n\r]+)/gm) || []
    for (const vi of verifItems) {
      const clean = vi.replace(/^[ \t]*(?:[-*]|\d+\.)\s+/, '').trim()
      if (clean && !clean.startsWith('[') && !verification.includes(clean)) {
        verification.push(clean)
      }
    }
  }

  // 5. Extract Summary
  let summary = ''
  const summaryMatch = content.match(
    /(?:###?|##|\*\*)\s*(?:Summary|Ringkasan|Deskripsi|Tujuan)[\s\S]*?(?=(?:###?|##|\*\*|\n\n|$))/i
  )
  if (summaryMatch) {
    summary = summaryMatch[0]
      .replace(/(?:###?|##|\*\*)\s*(?:Summary|Ringkasan|Deskripsi|Tujuan)[^\n]*\n+/i, '')
      .trim()
  } else {
    // Take first paragraph
    const firstParagraph = content
      .split(/\n{2,}/)
      .find((p) => p.trim() && !p.startsWith('#') && !p.startsWith('-'))
    if (firstParagraph) {
      summary = firstParagraph.trim().slice(0, 200)
    }
  }

  // Only return parsed plan if we found either tasks or a plan file path or explicit plan title
  if (tasks.length === 0 && !planFilePath && title === 'Rencana Implementasi') {
    return null
  }

  return {
    title,
    summary,
    filePath: planFilePath,
    tasks,
    affectedFiles,
    verification,
    rawContent: content
  }
}
