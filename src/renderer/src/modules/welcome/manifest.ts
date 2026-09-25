import type { ModuleManifest } from '../core/types'

export const manifest: ModuleManifest = {
  id: 'welcome',
  name: 'Selamat Datang',
  version: '1.0.0',
  author: 'Makarya Core Team',
  description: 'Pusat panduan dan eksplorasi ekosistem ruang kerja modular',
  icon: 'i-lucide-sparkles',
  badge: 'Core',
  order: 1,
  enabledByDefault: true,
  isRemovable: false, // Core module cannot be uninstalled
  category: 'core'
}
