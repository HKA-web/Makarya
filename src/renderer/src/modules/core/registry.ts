import { reactive, computed, markRaw, defineAsyncComponent, type Component } from 'vue'
import type { ModuleDefinition, InstalledModule, ModuleManifest } from './types'
import { createModuleContext } from './context'

const STORAGE_KEY = 'makarya_blank_modules_state'

function loadSavedEnabledStates(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // fallback
  }
  return {}
}

function saveEnabledStates(states: Record<string, boolean>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(states))
  } catch {
    // ignore
  }
}

class ProductionModuleRegistry {
  private state = reactive({
    activeModuleId: 'welcome',
    modules: new Map<string, InstalledModule>()
  })

  // Cache for module async components to avoid re-creation
  private componentCache = new Map<string, Component>()

  constructor() {
    this.discoverAndRegisterModules()
  }

  /**
   * Auto-Discovery via Vite import.meta.glob
   * Automatically discovers every index.ts inside modules/ directory
   */
  public discoverAndRegisterModules(): void {
    const savedStates = loadSavedEnabledStates()

    // Vite eager glob: reads all module definitions
    const moduleFiles = import.meta.glob(['../*/index.ts', '!../core/**'], { eager: true })

    for (const path in moduleFiles) {
      const moduleExport = moduleFiles[path] as { default?: ModuleDefinition; module?: ModuleDefinition }
      const modDef = moduleExport.default || moduleExport.module

      if (modDef && modDef.manifest && modDef.manifest.id) {
        this.register(modDef, savedStates)
      } else {
        console.warn(`[ModuleRegistry] File at ${path} does not export a valid ModuleDefinition.`)
      }
    }

    // Set initial active module
    const activeMods = this.activeModules
    if (activeMods.length > 0 && !activeMods.some((m) => m.manifest.id === this.state.activeModuleId)) {
      this.state.activeModuleId = activeMods[0].manifest.id
    }
  }

  /**
   * Register a module definition into the registry
   */
  public register(modDef: ModuleDefinition, savedStates?: Record<string, boolean>): void {
    const manifest = modDef.manifest
    const isSaved = savedStates ? savedStates[manifest.id] : undefined
    const isEnabled = isSaved !== undefined ? isSaved : (manifest.enabledByDefault !== false)

    const installed: InstalledModule = {
      manifest,
      component: modDef.component,
      onInit: modDef.onInit,
      onDestroy: modDef.onDestroy,
      enabled: isEnabled,
      isLoaded: false,
      hasError: false
    }

    this.state.modules.set(manifest.id, installed)

    if (isEnabled && modDef.onInit) {
      try {
        const ctx = createModuleContext(manifest)
        modDef.onInit(ctx)
        installed.isLoaded = true
      } catch (err: any) {
        console.error(`[ModuleRegistry] Failed onInit for module "${manifest.id}":`, err)
        installed.hasError = true
        installed.errorMessage = err?.message || String(err)
      }
    }
  }

  /**
   * Get all installed modules sorted by order
   */
  public get allModules(): InstalledModule[] {
    return Array.from(this.state.modules.values()).sort(
      (a, b) => (a.manifest.order || 99) - (b.manifest.order || 99)
    )
  }

  /**
   * Get only active/enabled modules
   */
  public get activeModules(): InstalledModule[] {
    return this.allModules.filter((m) => m.enabled)
  }

  /**
   * Get current active module
   */
  public get activeModule(): InstalledModule | null {
    const found = this.state.modules.get(this.state.activeModuleId)
    if (found && found.enabled) return found
    return this.activeModules[0] || null
  }

  public get activeModuleId(): string {
    return this.activeModule?.manifest.id || 'welcome'
  }

  public setActiveModule(id: string): void {
    const mod = this.state.modules.get(id)
    if (mod && mod.enabled) {
      this.state.activeModuleId = id
    }
  }

  /**
   * Plug / Unplug (Toggle Enable/Disable) Module
   */
  public toggleModule(id: string, forceState?: boolean): void {
    const mod = this.state.modules.get(id)
    if (!mod || mod.manifest.isRemovable === false) return

    const newState = forceState !== undefined ? forceState : !mod.enabled
    mod.enabled = newState

    const ctx = createModuleContext(mod.manifest)

    if (newState) {
      // Trigger onInit when plugged in
      if (mod.onInit && !mod.isLoaded) {
        try {
          mod.onInit(ctx)
          mod.isLoaded = true
          mod.hasError = false
        } catch (err: any) {
          mod.hasError = true
          mod.errorMessage = err?.message || String(err)
        }
      }
    } else {
      // Trigger onDestroy when unplugged
      if (mod.onDestroy) {
        try {
          mod.onDestroy(ctx)
        } catch (err) {
          console.error(`[ModuleRegistry] Failed onDestroy for module "${id}":`, err)
        }
      }
      mod.isLoaded = false
    }

    // Persist to storage
    const states: Record<string, boolean> = {}
    for (const [mId, m] of this.state.modules.entries()) {
      states[mId] = m.enabled
    }
    saveEnabledStates(states)

    // Fallback if active module was just disabled
    if (!newState && this.state.activeModuleId === id) {
      const next = this.activeModules[0]
      if (next) {
        this.state.activeModuleId = next.manifest.id
      }
    }
  }

  /**
   * Get dynamic lazy component for a module
   */
  public getModuleComponent(id: string): Component | null {
    const mod = this.state.modules.get(id)
    if (!mod) return null

    if (this.componentCache.has(id)) {
      return this.componentCache.get(id)!
    }

    let comp: Component
    if (typeof mod.component === 'function') {
      // Lazy loaded async component
      comp = markRaw(
        defineAsyncComponent({
          loader: mod.component as () => Promise<Component>,
          loadingComponent: {
            template: `
              <div class="w-full h-full flex items-center justify-center text-slate-400 gap-2">
                <span class="w-2 h-2 rounded-full bg-[#42b883] animate-ping"></span>
                <span class="text-xs font-mono">Memuat modul...</span>
              </div>
            `
          },
          delay: 100,
          timeout: 10000
        })
      )
    } else {
      comp = markRaw(mod.component)
    }

    this.componentCache.set(id, comp)
    return comp
  }
}

export const productionRegistry = new ProductionModuleRegistry()

export function useProductionRegistry() {
  return {
    allModules: computed(() => productionRegistry.allModules),
    activeModules: computed(() => productionRegistry.activeModules),
    activeModule: computed(() => productionRegistry.activeModule),
    activeModuleId: computed(() => productionRegistry.activeModuleId),
    setActiveModule: (id: string) => productionRegistry.setActiveModule(id),
    toggleModule: (id: string, forceState?: boolean) => productionRegistry.toggleModule(id, forceState),
    getModuleComponent: (id: string) => productionRegistry.getModuleComponent(id)
  }
}
