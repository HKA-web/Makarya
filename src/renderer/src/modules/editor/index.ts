import type { ModuleDefinition } from '../core/types'
import { manifest } from './manifest'

export const moduleDefinition: ModuleDefinition = {
  manifest,
  component: () => import('./components/EditorModule.vue'),
  onInit: (ctx) => {
    ctx.toast.info('Modul Code Editor berhasil diaktifkan', manifest.name)
  },
  onDestroy: (_ctx) => {
    // Cleanup editor listeners when disabled
  }
}

export default moduleDefinition
export * from './types'
