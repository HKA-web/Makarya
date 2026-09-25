import type { Component, AsyncComponentLoader } from 'vue'

export interface ModuleManifest {
  id: string
  name: string
  version: string
  description?: string
  author?: string
  icon: string
  badge?: string
  order?: number
  enabledByDefault?: boolean
  isRemovable?: boolean
  category?: 'core' | 'analytics' | 'database' | 'custom'
}

export interface ModuleStorage {
  get<T = any>(key: string, defaultValue?: T): T
  set<T = any>(key: string, value: T): void
  remove(key: string): void
  clear(): void
}

export interface ModuleToast {
  success(message: string, title?: string): void
  error(message: string, title?: string): void
  info(message: string, title?: string): void
  warn(message: string, title?: string): void
}

export interface ModuleEvents {
  emit(event: string, payload?: any): void
  on(event: string, handler: (payload: any) => void): () => void
  off(event: string, handler: (payload: any) => void): void
}

export interface ModuleContext {
  manifest: Readonly<ModuleManifest>
  storage: ModuleStorage
  toast: ModuleToast
  events: ModuleEvents
  db: {
    query: (sql: string, params?: any[]) => Promise<any>
    getInfo: () => Promise<any>
  }
}

export interface ModuleDefinition {
  manifest: ModuleManifest
  component: AsyncComponentLoader<Component> | Component
  onInit?: (context: ModuleContext) => void | Promise<void>
  onDestroy?: (context: ModuleContext) => void | Promise<void>
}

export interface InstalledModule extends ModuleDefinition {
  enabled: boolean
  isLoaded: boolean
  hasError: boolean
  errorMessage?: string
}
