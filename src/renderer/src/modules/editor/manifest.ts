import type { ModuleManifest } from '../core/types'

export const manifest: ModuleManifest = {
  id: 'editor',
  name: 'Makarya Code Editor',
  version: '1.0.0',
  author: 'Makarya Engineering Team',
  description: 'Editor kode Monaco lengkap terintegrasi File Explorer, Tab Workspace, dan Terminal',
  icon: 'i-lucide-code-xml',
  badge: 'Core IDE',
  order: 2,
  enabledByDefault: true,
  isRemovable: true,
  category: 'core'
}
