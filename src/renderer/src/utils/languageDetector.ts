export function detectMonacoLanguage(filePath: string): string {
  const extensionMatch = filePath.match(/\.([^.]+)$/)
  if (!extensionMatch) return 'plaintext'

  const fileExtension = extensionMatch[1].toLowerCase()

  switch (fileExtension) {
    case 'php':
    case 'phtml':
      return 'php'
    case 'js':
    case 'mjs':
    case 'cjs':
      return 'javascript'
    case 'ts':
    case 'mts':
      return 'typescript'
    case 'vue':
    case 'html':
    case 'htm':
      return 'html'
    case 'css':
    case 'scss':
    case 'less':
      return 'css'
    case 'json':
      return 'json'
    case 'sql':
      return 'sql'
    case 'py':
      return 'python'
    case 'md':
    case 'markdown':
      return 'markdown'
    case 'rs':
      return 'rust'
    case 'go':
      return 'go'
    case 'yml':
    case 'yaml':
      return 'yaml'
    case 'sh':
    case 'bash':
      return 'shell'
    case 'bat':
    case 'cmd':
      return 'bat'
    case 'xml':
      return 'xml'
    default:
      return 'plaintext'
  }
}

export function getNuxtFileIcon(fileName: string, isDirectory: boolean): { icon: string; colorClass: string } {
  if (isDirectory) {
    return { icon: 'i-lucide-folder', colorClass: 'text-amber-400' }
  }

  const extensionMatch = fileName.match(/\.([^.]+)$/)
  if (!extensionMatch) {
    return { icon: 'i-lucide-file', colorClass: 'text-slate-400' }
  }

  const ext = extensionMatch[1].toLowerCase()
  switch (ext) {
    case 'vue':
      return { icon: 'i-lucide-code-2', colorClass: 'text-emerald-400' }
    case 'ts':
    case 'mts':
    case 'cts':
      return { icon: 'i-lucide-file-code-2', colorClass: 'text-sky-400' }
    case 'js':
    case 'mjs':
    case 'cjs':
      return { icon: 'i-lucide-file-code-2', colorClass: 'text-yellow-400' }
    case 'php':
    case 'phtml':
      return { icon: 'i-lucide-file-code', colorClass: 'text-indigo-400' }
    case 'json':
      return { icon: 'i-lucide-braces', colorClass: 'text-amber-300' }
    case 'md':
    case 'markdown':
      return { icon: 'i-lucide-file-text', colorClass: 'text-blue-400' }
    case 'css':
    case 'scss':
    case 'less':
      return { icon: 'i-lucide-palette', colorClass: 'text-cyan-400' }
    case 'html':
    case 'htm':
      return { icon: 'i-lucide-globe', colorClass: 'text-orange-400' }
    case 'sql':
      return { icon: 'i-lucide-database', colorClass: 'text-rose-400' }
    case 'py':
      return { icon: 'i-lucide-file-code', colorClass: 'text-emerald-300' }
    case 'yml':
    case 'yaml':
    case 'env':
    case 'ini':
      return { icon: 'i-lucide-settings', colorClass: 'text-purple-400' }
    case 'svg':
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'webp':
      return { icon: 'i-lucide-image', colorClass: 'text-pink-400' }
    case 'git':
    case 'gitignore':
      return { icon: 'i-lucide-git-branch', colorClass: 'text-orange-500' }
    default:
      return { icon: 'i-lucide-file', colorClass: 'text-slate-400' }
  }
}

export function getFileIconClass(fileName: string, isDirectory: boolean): string {
  if (isDirectory) return 'pi pi-folder text-amber-400'

  const extensionMatch = fileName.match(/\.([^.]+)$/)
  if (!extensionMatch) return 'pi pi-file text-zinc-400'

  const ext = extensionMatch[1].toLowerCase()
  switch (ext) {
    case 'php':
      return 'pi pi-code text-indigo-400'
    case 'js':
    case 'ts':
      return 'pi pi-code text-yellow-400'
    case 'vue':
      return 'pi pi-code text-emerald-400'
    case 'json':
      return 'pi pi-sliders-h text-amber-300'
    case 'md':
      return 'pi pi-info-circle text-blue-400'
    case 'css':
      return 'pi pi-palette text-sky-400'
    case 'html':
      return 'pi pi-globe text-orange-400'
    case 'sql':
      return 'pi pi-database text-rose-400'
    default:
      return 'pi pi-file text-zinc-400'
  }
}

