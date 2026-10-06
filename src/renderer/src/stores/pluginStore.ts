import { defineStore } from 'pinia'
import { ref, computed, shallowRef } from 'vue'
import type {
  MakaryaPlugin,
  PluginManifest,
  PluginContext,
  Disposable,
  StatusBarItem,
  StatusBarItemOptions,
  SidebarViewContribution,
  AIToolDefinition,
  ToastOptions,
  ConfirmDialogOptions
} from '@makarya/sdk'
import { createPluginContext } from '../sdk/runtime'
import {
  StudioPalettePlugin,
  TagIntelligencePlugin,
  DatabaseAiToolPlugin
} from '../../../../packages/makarya-sdk/examples/index'
import { useToast } from 'primevue/usetoast'
import { useConfirm } from 'primevue/useconfirm'

export interface InstalledPluginInfo {
  manifest: PluginManifest
  pluginInstance: MakaryaPlugin
  context?: PluginContext
  enabled: boolean
  isLoaded: boolean
  hasError: boolean
  errorMessage?: string
  source: 'builtin' | 'user' | 'workspace'
  path?: string
}

export interface RegisteredCommandInfo {
  id: string
  title: string
  category?: string
  icon?: string
  shortcut?: string
  pluginId: string
  handler: (...args: any[]) => any
}

export interface LiveStatusBarItem extends StatusBarItemOptions {
  pluginId: string
  visible: boolean
}

export const usePluginStore = defineStore('plugins', () => {
  const installedPlugins = ref<Map<string, InstalledPluginInfo>>(new Map())
  const registeredCommands = ref<Map<string, RegisteredCommandInfo>>(new Map())
  const customSidebarViews = ref<Map<string, SidebarViewContribution & { pluginId: string }>>(new Map())
  const customStatusBarItems = ref<Map<string, LiveStatusBarItem>>(new Map())
  const customAiTools = ref<Map<string, AIToolDefinition & { pluginId: string }>>(new Map())
  const isPluginManagerOpen = ref(false)
  const isDbConnectionModalOpen = ref(false)

  if (typeof window !== 'undefined') {
    window.addEventListener('makarya:open-db-connection-modal', () => {
      isDbConnectionModalOpen.value = true
    })
  }

  // Toast / Confirm callbacks set from App.vue
  let globalToastHandler: ((opts: ToastOptions) => void) | null = null
  let globalConfirmHandler: ((opts: ConfirmDialogOptions) => void) | null = null

  function setUiHandlers(
    toast: (opts: ToastOptions) => void,
    confirm: (opts: ConfirmDialogOptions) => void
  ): void {
    globalToastHandler = toast
    globalConfirmHandler = confirm
  }

  function notifyToast(options: ToastOptions): void {
    if (globalToastHandler) {
      globalToastHandler(options)
    } else {
      console.log('[PluginToast]', options)
    }
  }

  function requestConfirmDialog(options: ConfirmDialogOptions): void {
    if (globalConfirmHandler) {
      globalConfirmHandler(options)
    } else if (window.confirm(`${options.title}\n\n${options.message}`)) {
      options.onAccept?.()
    } else {
      options.onReject?.()
    }
  }

  function loadPluginStates(): Record<string, boolean> {
    try {
      const raw = localStorage.getItem('makarya_plugins_enabled_states')
      if (raw) return JSON.parse(raw)
    } catch {
      // fallback
    }
    return {}
  }

  function savePluginStates(): void {
    try {
      const states = loadPluginStates()
      for (const [id, p] of installedPlugins.value.entries()) {
        states[id] = p.enabled
      }
      localStorage.setItem('makarya_plugins_enabled_states', JSON.stringify(states))
    } catch {
      // ignore
    }
  }

  // 1. Command Registration
  function registerCommand(
    commandId: string,
    handler: (...args: any[]) => any,
    pluginId: string,
    meta?: Partial<RegisteredCommandInfo>
  ): Disposable {
    const existing = registeredCommands.value.get(commandId)
    const cmdInfo: RegisteredCommandInfo = {
      id: commandId,
      title: meta?.title || existing?.title || commandId,
      category: meta?.category || existing?.category || 'Plugin',
      icon: meta?.icon || existing?.icon || 'i-lucide-puzzle',
      shortcut: meta?.shortcut || existing?.shortcut,
      pluginId,
      handler
    }

    registeredCommands.value.set(commandId, cmdInfo)

    return {
      dispose: () => {
        registeredCommands.value.delete(commandId)
      }
    }
  }

  async function executeCommand<T = any>(commandId: string, ...args: any[]): Promise<T> {
    const cmd = registeredCommands.value.get(commandId)
    if (!cmd) {
      throw new Error(`Command "${commandId}" tidak ditemukan atau plugin belum diaktifkan.`)
    }
    return Promise.resolve(cmd.handler(...args))
  }

  const registeredCommandIds = computed(() => Array.from(registeredCommands.value.keys()))
  const allRegisteredCommandsList = computed(() => Array.from(registeredCommands.value.values()))

  // 2. Status Bar Item Management
  function addStatusBarItem(options: StatusBarItemOptions, pluginId: string): StatusBarItem {
    const itemState = ref<LiveStatusBarItem>({
      ...options,
      pluginId,
      visible: true
    })

    customStatusBarItems.value.set(options.id, itemState.value)

    return {
      id: options.id,
      get text() {
        return itemState.value.text
      },
      set text(val: string) {
        itemState.value.text = val
        customStatusBarItems.value.set(options.id, { ...itemState.value })
      },
      get icon() {
        return itemState.value.icon
      },
      set icon(val: string | undefined) {
        itemState.value.icon = val
        customStatusBarItems.value.set(options.id, { ...itemState.value })
      },
      get tooltip() {
        return itemState.value.tooltip
      },
      set tooltip(val: string | undefined) {
        itemState.value.tooltip = val
        customStatusBarItems.value.set(options.id, { ...itemState.value })
      },
      get command() {
        return itemState.value.command
      },
      set command(val: string | undefined) {
        itemState.value.command = val
        customStatusBarItems.value.set(options.id, { ...itemState.value })
      },
      get color() {
        return itemState.value.color
      },
      set color(val: string | undefined) {
        itemState.value.color = val
        customStatusBarItems.value.set(options.id, { ...itemState.value })
      },
      show() {
        itemState.value.visible = true
        customStatusBarItems.value.set(options.id, { ...itemState.value })
      },
      hide() {
        itemState.value.visible = false
        customStatusBarItems.value.set(options.id, { ...itemState.value })
      },
      dispose() {
        customStatusBarItems.value.delete(options.id)
      }
    }
  }

  const activeStatusBarItems = computed(() => {
    return Array.from(customStatusBarItems.value.values()).filter((item) => item.visible)
  })

  // 3. Sidebar View Contributions
  function registerSidebarView(view: SidebarViewContribution, pluginId: string): Disposable {
    customSidebarViews.value.set(view.id, {
      ...view,
      pluginId
    })

    return {
      dispose: () => {
        customSidebarViews.value.delete(view.id)
      }
    }
  }

  const activeSidebarViews = computed(() => {
    return Array.from(customSidebarViews.value.values())
  })

  // 4. AI Tool Contributions
  function registerAITool(tool: AIToolDefinition, pluginId: string): Disposable {
    customAiTools.value.set(tool.name, {
      ...tool,
      pluginId
    })

    return {
      dispose: () => {
        customAiTools.value.delete(tool.name)
      }
    }
  }

  const activeAITools = computed(() => {
    return Array.from(customAiTools.value.values())
  })

  // 5. Plugin Lifecycle (Register, Activate, Deactivate, Toggle)
  function registerPlugin(plugin: MakaryaPlugin, source: 'builtin' | 'user' | 'workspace' = 'builtin', path?: string): void {
    const manifest = plugin.manifest
    const savedStates = loadPluginStates()
    const isSaved = savedStates[manifest.id]
    const isEnabled = isSaved !== undefined ? isSaved : (manifest.enabledByDefault !== false)

    // Process manifest static contributions (commands, etc.)
    if (manifest.contributes?.commands) {
      for (const cmd of manifest.contributes.commands) {
        registerCommand(
          cmd.id,
          () => {
            console.log(`[Plugin:${manifest.id}] Command "${cmd.id}" invoked before explicit activation.`)
          },
          manifest.id,
          cmd
        )
      }
    }

    const info: InstalledPluginInfo = {
      manifest,
      pluginInstance: plugin,
      enabled: isEnabled,
      isLoaded: false,
      hasError: false,
      source,
      path
    }

    installedPlugins.value.set(manifest.id, info)

    if (isEnabled) {
      activatePlugin(manifest.id)
    }
  }

  async function activatePlugin(pluginId: string): Promise<boolean> {
    const info = installedPlugins.value.get(pluginId)
    if (!info) return false

    info.enabled = true
    savePluginStates()

    try {
      const context = createPluginContext(info.manifest)
      info.context = context
      await Promise.resolve(info.pluginInstance.activate(context))
      info.isLoaded = true
      info.hasError = false
      info.errorMessage = undefined
      return true
    } catch (err: any) {
      console.error(`[PluginStore] Gagal mengaktifkan plugin "${pluginId}":`, err)
      info.hasError = true
      info.errorMessage = err?.message || String(err)
      return false
    }
  }

  async function deactivatePlugin(pluginId: string): Promise<void> {
    const info = installedPlugins.value.get(pluginId)
    if (!info) return

    info.enabled = false
    savePluginStates()

    // Dispose all plugin subscriptions
    if (info.context) {
      for (const sub of info.context.subscriptions) {
        try {
          sub.dispose()
        } catch (e) {
          console.warn(`[PluginStore] Error disposing subscription for plugin "${pluginId}":`, e)
        }
      }
    }

    // Call optional plugin deactivate hook
    if (info.pluginInstance.deactivate && info.context) {
      try {
        await Promise.resolve(info.pluginInstance.deactivate(info.context))
      } catch (err) {
        console.error(`[PluginStore] Error during deactivate for "${pluginId}":`, err)
      }
    }

    info.context = undefined
    info.isLoaded = false
  }

  async function togglePlugin(pluginId: string): Promise<void> {
    const info = installedPlugins.value.get(pluginId)
    if (!info) return

    if (info.enabled) {
      await deactivatePlugin(pluginId)
      notifyToast({
        title: 'Plugin Dinonaktifkan',
        message: `Plugin "${info.manifest.name}" telah dinonaktifkan.`,
        type: 'info'
      })
    } else {
      await activatePlugin(pluginId)
      notifyToast({
        title: 'Plugin Diaktifkan',
        message: `Plugin "${info.manifest.name}" berhasil diaktifkan.`,
        type: 'success'
      })
    }
  }

  const allPlugins = computed(() => Array.from(installedPlugins.value.values()))
  const activePlugins = computed(() => allPlugins.value.filter((p) => p.enabled && p.isLoaded))

  // Builtin Example Plugins Registration
  function registerBuiltinPlugins(): void {
    registerPlugin(TagIntelligencePlugin)
    registerPlugin(DatabaseAiToolPlugin)
    registerPlugin(StudioPalettePlugin)
  }

  return {
    installedPlugins,
    allPlugins,
    activePlugins,
    registeredCommands,
    registeredCommandIds,
    allRegisteredCommandsList,
    customSidebarViews,
    activeSidebarViews,
    customStatusBarItems,
    activeStatusBarItems,
    customAiTools,
    activeAITools,
    isPluginManagerOpen,
    isDbConnectionModalOpen,
    setUiHandlers,
    notifyToast,
    requestConfirmDialog,
    registerPlugin,
    activatePlugin,
    deactivatePlugin,
    togglePlugin,
    registerCommand,
    executeCommand,
    addStatusBarItem,
    registerSidebarView,
    registerAITool,
    registerBuiltinPlugins
  }
})
