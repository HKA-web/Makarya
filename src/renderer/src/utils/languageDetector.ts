import { usePluginStore } from '@renderer/stores/pluginStore'
import { resolveStudioIcon } from '../../../../packages/makarya-sdk/examples/theme-studio-icons/src/index'

/**
 * Detect Monaco Editor Language ID from file path
 */
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
