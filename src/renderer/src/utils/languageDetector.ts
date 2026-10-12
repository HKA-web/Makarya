import { usePluginStore } from '@renderer/stores/pluginStore'
import { resolveStudioIcon } from '../../../../packages/makarya-sdk/examples/theme-studio-icons/src/index'

/**
 * Detect Monaco Editor Language ID from file path
 */
export function detectMonacoLanguage(filePath: string): string {
  if (!filePath) return 'plaintext'

  const cleanPath = filePath.replace(/\\/g, '/')
  const fileName = cleanPath.split('/').pop()?.toLowerCase() || ''

  // 1. Exact / Special filename detection
  if (fileName === 'dockerfile' || fileName.startsWith('dockerfile.')) return 'dockerfile'
  if (fileName === 'makefile' || fileName === 'gnumakefile') return 'makefile'
  if (fileName === '.env' || fileName.startsWith('.env.')) return 'shell'
  if (fileName === '.gitignore' || fileName === '.npmignore' || fileName === '.dockerignore' || fileName === '.prettierignore') return 'shell'
  if (fileName === 'composer.lock' || fileName === 'package-lock.json' || fileName === 'tsconfig.json') return 'json'

  const extensionMatch = fileName.match(/\.([^.]+)$/)
  if (!extensionMatch) return 'plaintext'

  const ext = extensionMatch[1].toLowerCase()

  switch (ext) {
    // PHP (supports native CI2/CI3 modules like Hrms.Sni/Nbim)
    case 'php':
    case 'phtml':
    case 'php3':
    case 'php4':
    case 'php5':
    case 'php7':
    case 'phps':
    case 'inc':
      return 'php'

    // Python & Data Science
    case 'py':
    case 'pyw':
    case 'pyx':
    case 'pyi':
    case 'rpy':
    case 'ipynb':
      return 'python'

    // Vue Single File Components
    case 'vue':
      return 'vue'

    // JavaScript & JSX (React / Preact / Vanilla)
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
    case 'es6':
    case 'pac':
      return 'javascript'

    // TypeScript & TSX
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return 'typescript'

    // HTML / Web Markup
    case 'html':
    case 'htm':
    case 'xhtml':
    case 'shtml':
      return 'html'

    // CSS & Stylesheets
    case 'css':
    case 'postcss':
    case 'pcss':
      return 'css'
    case 'scss':
    case 'sass':
      return 'scss'
    case 'less':
      return 'less'

    // JSON & Data formats
    case 'json':
    case 'jsonc':
    case 'json5':
    case 'webmanifest':
      return 'json'

    // Databases & SQL
    case 'sql':
    case 'mysql':
    case 'pgsql':
    case 'sqlite':
    case 'cql':
      return 'sql'

    // Shell Scripts & Terminal
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
    case 'ksh':
      return 'shell'
    case 'bat':
    case 'cmd':
      return 'bat'
    case 'ps1':
    case 'psm1':
    case 'psd1':
      return 'powershell'

    // Documentation & Markdown
    case 'md':
    case 'markdown':
    case 'mdown':
    case 'mkdn':
    case 'mdx':
      return 'markdown'

    // Systems & Backend languages
    case 'rs':
    case 'rlib':
      return 'rust'
    case 'go':
      return 'go'
    case 'c':
    case 'h':
    case 'cpp':
    case 'hpp':
    case 'cc':
    case 'cxx':
    case 'ino':
      return 'cpp'
    case 'cs':
    case 'csx':
      return 'csharp'
    case 'java':
    case 'class':
      return 'java'
    case 'kt':
    case 'kts':
      return 'kotlin'
    case 'swift':
      return 'swift'
    case 'rb':
    case 'erb':
    case 'rake':
      return 'ruby'
    case 'lua':
      return 'lua'
    case 'r':
    case 'rmd':
      return 'r'
    case 'dart':
      return 'dart'

    // Config & Structured data
    case 'yml':
    case 'yaml':
      return 'yaml'
    case 'xml':
    case 'plist':
    case 'xaml':
    case 'xsl':
    case 'xslt':
    case 'svg':
      return 'xml'
    case 'ini':
    case 'conf':
    case 'cfg':
    case 'properties':
    case 'toml':
    case 'editorconfig':
      return 'ini'
    case 'graphql':
    case 'gql':
      return 'graphql'
    case 'dockerfile':
      return 'dockerfile'

    default:
      return 'plaintext'
  }
}

function isStudioPalettePluginEnabled(): boolean {
  try {
    const store = usePluginStore()
    const plugin = store.installedPlugins.get('makarya.builtin.theme-customizer')
    return plugin ? plugin.enabled : true
  } catch {
    return true
  }
}

/**
 * Resolve icon definition for file tree node.
 * Uses Studio Palette plugin when active, otherwise gracefully falls back to minimal default icons.
 */
export function getNuxtFileIcon(
  fileName: string,
  isDirectory: boolean,
  isExpanded = false
): { icon: string; colorClass: string } {
  if (isStudioPalettePluginEnabled()) {
    return resolveStudioIcon(fileName, isDirectory, isExpanded)
  }

  // Graceful minimal default fallback
  if (isDirectory) {
    return {
      icon: isExpanded ? 'i-lucide-folder-open' : 'i-lucide-folder',
      colorClass: 'text-slate-400'
    }
  }

  return {
    icon: 'i-lucide-file',
    colorClass: 'text-slate-400'
  }
}

/**
 * Legacy PrimeIcons fallback helper
 */
export function getFileIconClass(fileName: string, isDirectory: boolean): string {
  if (isDirectory) return 'pi pi-folder text-amber-400'

  const extensionMatch = fileName.match(/\.([^.]+)$/)
  if (!extensionMatch) return 'pi pi-file text-zinc-400'

  const ext = extensionMatch[1].toLowerCase()
  switch (ext) {
    case 'php':
    case 'phtml':
    case 'inc':
      return 'pi pi-code text-indigo-400'
    case 'py':
    case 'pyw':
      return 'pi pi-code text-blue-400'
    case 'js':
    case 'jsx':
    case 'mjs':
      return 'pi pi-code text-yellow-400'
    case 'ts':
    case 'tsx':
    case 'mts':
      return 'pi pi-code text-sky-400'
    case 'vue':
      return 'pi pi-code text-emerald-400'
    case 'json':
      return 'pi pi-sliders-h text-amber-300'
    case 'md':
      return 'pi pi-info-circle text-blue-400'
    case 'css':
    case 'scss':
    case 'less':
      return 'pi pi-palette text-sky-400'
    case 'html':
      return 'pi pi-globe text-orange-400'
    case 'sql':
      return 'pi pi-database text-rose-400'
    case 'sh':
    case 'bash':
    case 'bat':
    case 'ps1':
      return 'pi pi-terminal text-green-400'
    default:
      return 'pi pi-file text-zinc-400'
  }
}
