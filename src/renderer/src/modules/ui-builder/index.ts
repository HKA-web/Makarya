import type { ModuleDefinition } from '../core/types'
import { manifest } from './manifest'

export const moduleDefinition: ModuleDefinition = {
  manifest,
  component: () => import('./components/UiBuilderWorkspace.vue'),
  onInit: (ctx) => {
    ctx.toast.info('Modul UI Builder aktif dan siap digunakan', manifest.name)
  },
  onDestroy: (_ctx) => {
    // Cleanup UI Builder listeners when disabled
  }
}

export default moduleDefinition
export * from './types'
export * from './stores/useUiBuilderStore'
