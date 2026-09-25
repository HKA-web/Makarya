import type { ModuleDefinition } from '../core/types'
import { manifest } from './manifest'

export const moduleDefinition: ModuleDefinition = {
  manifest,
  component: () => import('./components/WelcomeModule.vue'),
  onInit: (_ctx) => {
    // Welcome ready
  }
}

export default moduleDefinition
export * from './types'
