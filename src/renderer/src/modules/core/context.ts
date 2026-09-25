import type { ModuleContext, ModuleManifest, ModuleStorage, ModuleToast, ModuleEvents } from './types'

// Global Event Bus across all pluggable modules
type EventHandler = (payload: any) => void
const globalEventHandlers = new Map<string, Set<EventHandler>>()

export const moduleEventBus: ModuleEvents = {
  emit(event: string, payload?: any): void {
    const handlers = globalEventHandlers.get(event)
    if (handlers) {
      handlers.forEach((fn) => {
        try {
          fn(payload)
        } catch (err) {
          console.error(`[EventBus] Error in handler for event "${event}":`, err)
        }
      })
    }
  },
  on(event: string, handler: EventHandler): () => void {
    if (!globalEventHandlers.has(event)) {
      globalEventHandlers.set(event, new Set())
    }
    globalEventHandlers.get(event)!.add(handler)
    return () => {
      this.off(event, handler)
    }
  },
  off(event: string, handler: EventHandler): void {
    const handlers = globalEventHandlers.get(event)
    if (handlers) {
      handlers.delete(handler)
      if (handlers.size === 0) {
        globalEventHandlers.delete(event)
      }
    }
  }
}

/**
 * Creates an isolated storage scoped to a specific module.
 * Keys in localStorage will be prefix-isolated, e.g., 'makarya_mod_dashboard_user_pref'
 */
function createScopedStorage(moduleId: string): ModuleStorage {
  const prefix = `makarya_mod_${moduleId}_`
  return {
    get<T = any>(key: string, defaultValue?: T): T {
      try {
        const item = localStorage.getItem(prefix + key)
        if (item === null) return defaultValue as T
        return JSON.parse(item) as T
      } catch {
        return defaultValue as T
      }
    },
    set<T = any>(key: string, value: T): void {
      try {
        localStorage.setItem(prefix + key, JSON.stringify(value))
      } catch (err) {
        console.warn(`[ModuleStorage] Failed to save key "${key}" for module "${moduleId}":`, err)
      }
    },
    remove(key: string): void {
      localStorage.removeItem(prefix + key)
    },
    clear(): void {
      const keysToRemove: string[] = []
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i)
        if (k && k.startsWith(prefix)) {
          keysToRemove.push(k)
        }
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k))
    }
  }
}

/**
 * Creates scoped Toast notifier for a module
 */
function createScopedToast(manifest: ModuleManifest): ModuleToast {
  return {
    success(message: string, title?: string): void {
      console.log(`[${manifest.name}] SUCCESS:`, message)
    },
    error(message: string, title?: string): void {
      console.error(`[${manifest.name}] ERROR:`, message)
    },
    info(message: string, title?: string): void {
      console.info(`[${manifest.name}] INFO:`, message)
    },
    warn(message: string, title?: string): void {
      console.warn(`[${manifest.name}] WARN:`, message)
    }
  }
}

/**
 * Context Factory for injecting into modules
 */
export function createModuleContext(manifest: ModuleManifest): ModuleContext {
  return {
    manifest: Object.freeze({ ...manifest }),
    storage: createScopedStorage(manifest.id),
    toast: createScopedToast(manifest),
    events: moduleEventBus,
    db: {
      async query(sql: string, params: any[] = []): Promise<any> {
        if (window.makaryaAPI?.dbQuery) {
          return await window.makaryaAPI.dbQuery(sql, params)
        }
        throw new Error('Database API not available in current environment.')
      },
      async getInfo(): Promise<any> {
        if (window.makaryaAPI?.dbGetInfo) {
          return await window.makaryaAPI.dbGetInfo()
        }
        return null
      }
    }
  }
}
