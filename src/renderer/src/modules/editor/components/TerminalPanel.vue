<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'

export interface TerminalTab {
  id: string
  title: string
  shell: 'powershell' | 'cmd' | 'bash'
  cwd?: string
  terminalInstance?: Terminal
  fitAddon?: FitAddon
  isReady?: boolean
  isExited?: boolean
  exitCode?: number
}

const workspaceStore = useWorkspaceStore()

const terminals = ref<TerminalTab[]>([])
const activeTerminalId = ref<string>('')
const terminalContainers = ref<Record<string, HTMLDivElement | null>>({})

const isResizing = ref(false)

let removeDataListener: (() => void) | null = null
let removeExitListener: (() => void) | null = null

const activeTerminal = computed(() => {
  return terminals.value.find((t) => t.id === activeTerminalId.value) || terminals.value[0] || null
})

function getShellBadgeName(shell: 'powershell' | 'cmd' | 'bash'): string {
  if (shell === 'powershell') return 'PowerShell'
  if (shell === 'cmd') return 'CMD'
  return 'Git Bash'
}

// Create a new terminal tab
async function createTerminalTab(shell: 'powershell' | 'cmd' | 'bash' = 'powershell'): Promise<void> {
  const newId = `term-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
  const shellLabel = getShellBadgeName(shell)
  const tabNumber = terminals.value.length + 1

  const newTab: TerminalTab = {
    id: newId,
    title: `${tabNumber}: ${shellLabel}`,
    shell,
    cwd: workspaceStore.getEffectiveProjectRoot() || workspaceStore.activeRootPath || undefined,
    isReady: false,
    isExited: false
  }

  terminals.value.push(newTab)
  activeTerminalId.value = newId

  await nextTick()
  await mountTerminalInstance(newTab)
}

// Select active terminal tab
function selectTerminalTab(id: string): void {
  if (activeTerminalId.value === id) return
  activeTerminalId.value = id
  nextTick(() => {
    const active = activeTerminal.value
    if (active?.fitAddon && active?.terminalInstance) {
      try {
        active.fitAddon.fit()
        window.makaryaAPI?.resizeTerminal({
          id: active.id,
          cols: active.terminalInstance.cols,
          rows: active.terminalInstance.rows
        })
      } catch {}
      active.terminalInstance.focus()
    }
  })
}

// Close and destroy a terminal tab
async function closeTerminalTab(id: string, e?: MouseEvent): Promise<void> {
  if (e) e.stopPropagation()

  const index = terminals.value.findIndex((t) => t.id === id)
  if (index === -1) return

  const target = terminals.value[index]
  if (window.makaryaAPI) {
    await window.makaryaAPI.killTerminal({ id: target.id })
  }

  if (target.terminalInstance) {
    try {
      target.terminalInstance.dispose()
    } catch {}
  }

  delete terminalContainers.value[target.id]
  terminals.value.splice(index, 1)

  if (terminals.value.length === 0) {
    // If closed all tabs, create a fresh default one
    await createTerminalTab('powershell')
  } else if (activeTerminalId.value === id) {
    const nextIdx = Math.max(0, index - 1)
    selectTerminalTab(terminals.value[nextIdx].id)
  }
}

// Mount xterm instance to its container
async function mountTerminalInstance(tab: TerminalTab): Promise<void> {
  const container = terminalContainers.value[tab.id]
  if (!container || !window.makaryaAPI) return

  if (tab.terminalInstance) {
    try {
      tab.terminalInstance.dispose()
    } catch {}
    tab.terminalInstance = undefined
    tab.fitAddon = undefined
  }

  const termInstance = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: 13,
    fontFamily: 'Consolas, "Fira Code", "Courier New", monospace',
    lineHeight: 1.25,
    theme: {
      background: '#090d14',
      foreground: '#e2e8f0',
      cursor: '#42b883',
      cursorAccent: '#090d14',
      selectionBackground: 'rgba(66, 184, 131, 0.35)',
      black: '#1e293b',
      red: '#ef4444',
      green: '#42b883',
      yellow: '#f59e0b',
      blue: '#3b82f6',
      magenta: '#a855f7',
      cyan: '#06b6d4',
      white: '#f8fafc',
      brightBlack: '#475569',
      brightRed: '#f87171',
      brightGreen: '#42b883',
      brightYellow: '#fbbf24',
      brightBlue: '#60a5fa',
      brightMagenta: '#c084fc',
      brightCyan: '#22d3ee',
      brightWhite: '#ffffff'
    },
    convertEol: true,
    scrollback: 5000
  })

  const fit = new FitAddon()
  termInstance.loadAddon(fit)

  container.innerHTML = ''
  termInstance.open(container)

  try {
    fit.fit()
  } catch {}

  tab.terminalInstance = termInstance
  tab.fitAddon = fit

  const cwd = tab.cwd || workspaceStore.getEffectiveProjectRoot() || workspaceStore.activeRootPath || undefined
  const cols = termInstance.cols || 80
  const rows = termInstance.rows || 24

  const res = await window.makaryaAPI.createTerminal({
    id: tab.id,
    cols,
    rows,
    cwd,
    shell: tab.shell
  })

  if (!res.success) {
    termInstance.writeln(`\x1b[31m[Error] Gagal memulai terminal: ${res.error}\x1b[0m`)
    return
  }

  termInstance.onData((data) => {
    window.makaryaAPI?.writeTerminal({
      id: tab.id,
      data
    })
  })

  termInstance.onResize(({ cols, rows }) => {
    window.makaryaAPI?.resizeTerminal({
      id: tab.id,
      cols,
      rows
    })
  })

  tab.isReady = true
  if (tab.id === activeTerminalId.value) {
    termInstance.focus()
  }
}

// Clear terminal output
function handleClearTerminal(): void {
  activeTerminal.value?.terminalInstance?.clear()
}

// Restart current active terminal session
async function handleRestartTerminal(): Promise<void> {
  const active = activeTerminal.value
  if (!active) return

  if (window.makaryaAPI) {
    await window.makaryaAPI.killTerminal({ id: active.id })
  }

  if (active.terminalInstance) {
    try {
      active.terminalInstance.dispose()
    } catch {}
    active.terminalInstance = undefined
    active.fitAddon = undefined
    active.isReady = false
    active.isExited = false
  }

  await nextTick()
  await mountTerminalInstance(active)
}

// Switch shell type for active terminal tab
async function handleSwitchActiveShell(shell: 'powershell' | 'cmd' | 'bash'): Promise<void> {
  const active = activeTerminal.value
  if (!active || active.shell === shell) return
  active.shell = shell
  active.title = `${terminals.value.indexOf(active) + 1}: ${getShellBadgeName(shell)}`
  await handleRestartTerminal()
}

// Close/hide bottom panel
function handleClosePanel(): void {
  workspaceStore.setBottomPanelOpen(false)
}

// Fit all active terminals
function fitTerminal(): void {
  const active = activeTerminal.value
  if (active?.fitAddon && active?.terminalInstance && workspaceStore.isBottomPanelOpen) {
    try {
      active.fitAddon.fit()
      window.makaryaAPI?.resizeTerminal({
        id: active.id,
        cols: active.terminalInstance.cols,
        rows: active.terminalInstance.rows
      })
    } catch {}
  }
}

// Drag Resizing logic
let startY = 0
let startHeight = 0

function handleMouseDownResize(e: MouseEvent): void {
  isResizing.value = true
  startY = e.clientY
  startHeight = workspaceStore.bottomPanelHeight

  window.addEventListener('mousemove', handleMouseMoveResize)
  window.addEventListener('mouseup', handleMouseUpResize)
}

function handleMouseMoveResize(e: MouseEvent): void {
  if (!isResizing.value) return
  const deltaY = startY - e.clientY
  const newHeight = startHeight + deltaY
  workspaceStore.setBottomPanelHeight(newHeight)
  fitTerminal()
}

function handleMouseUpResize(): void {
  isResizing.value = false
  window.removeEventListener('mousemove', handleMouseMoveResize)
  window.removeEventListener('mouseup', handleMouseUpResize)
  fitTerminal()
}

// Listen to terminal backend events
onMounted(() => {
  if (window.makaryaAPI) {
    removeDataListener = window.makaryaAPI.onTerminalData((payload) => {
      const target = terminals.value.find((t) => t.id === payload.id)
      if (target?.terminalInstance) {
        target.terminalInstance.write(payload.data)
      }
    })

    removeExitListener = window.makaryaAPI.onTerminalExit((payload) => {
      const target = terminals.value.find((t) => t.id === payload.id)
      if (target) {
        target.isExited = true
        target.exitCode = payload.exitCode
        target.terminalInstance?.writeln(`\r\n\x1b[33m[Proses terminal telah selesai (Exit code: ${payload.exitCode})]\x1b[0m\r\n`)
      }
    })
  }

  window.addEventListener('resize', fitTerminal)

  if (workspaceStore.isBottomPanelOpen) {
    nextTick(() => {
      if (terminals.value.length === 0) {
        createTerminalTab('powershell')
      }
    })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', fitTerminal)
  if (removeDataListener) removeDataListener()
  if (removeExitListener) removeExitListener()

  // Kill and dispose all terminal sessions
  for (const term of terminals.value) {
    if (window.makaryaAPI) {
      window.makaryaAPI.killTerminal({ id: term.id })
    }
    if (term.terminalInstance) {
      try {
        term.terminalInstance.dispose()
      } catch {}
    }
  }
  terminals.value = []
})

// Watch panel open/close
watch(
  () => workspaceStore.isBottomPanelOpen,
  (isOpen) => {
    if (isOpen) {
      nextTick(() => {
        if (terminals.value.length === 0) {
          createTerminalTab('powershell')
        } else {
          fitTerminal()
          activeTerminal.value?.terminalInstance?.focus()
        }
      })
    }
  }
)
</script>

<template>
  <div
    class="terminal-bottom-panel flex flex-col bg-[#090d14] border-t border-white/[0.08] relative z-25 w-full overflow-hidden shadow-2xl"
    :style="{ height: `${workspaceStore.bottomPanelHeight}px` }"
    :class="{ 'select-none': isResizing }"
  >
    <!-- Resize Handle -->
    <div
      class="resizer-handle h-1.5 w-full cursor-ns-resize flex items-center justify-center absolute top-0 left-0 z-10 hover:bg-[#42b883]/10 transition-colors"
      @mousedown="handleMouseDownResize"
      title="Tarik untuk mengubah ukuran tinggi terminal"
    >
      <div class="h-0.5 w-12 rounded-full bg-white/15 hover:w-16 hover:bg-[#42b883] transition-all"></div>
    </div>

    <!-- Terminal Header Bar (Nuxt UI Rounded & Vue Green #42b883 Style) -->
    <div class="h-8 min-h-[32px] bg-[#0c1017] border-b border-white/[0.06] flex items-center justify-between px-2.5 gap-2 mt-1 select-none">
      <!-- Left: Terminal Tabs & Single Round Plus Button -->
      <div class="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar py-0.5">
        <!-- Terminal Tab Items (Rounded Pill Shape) -->
        <div class="flex items-center gap-1.5">
          <button
            v-for="term in terminals"
            :key="term.id"
            @click="selectTerminalTab(term.id)"
            class="group relative flex items-center gap-1.5 px-3 py-0.5 rounded-full text-[11px] font-medium transition-all duration-150 border cursor-pointer select-none"
            :class="[
              term.id === activeTerminalId
                ? 'bg-[#42b883]/15 text-white border-[#42b883]/35 shadow-[0_0_10px_rgba(66,184,131,0.15)]'
                : 'bg-white/[0.02] text-slate-400 hover:text-slate-200 hover:bg-white/[0.05] border-white/[0.06]'
            ]"
          >
            <!-- Shell Icon in Vue Green -->
            <UIcon
              :name="term.shell === 'powershell' ? 'i-lucide-terminal' : term.shell === 'cmd' ? 'i-lucide-command' : 'i-lucide-code-2'"
              class="size-3.5 flex-shrink-0"
              :class="[
                term.id === activeTerminalId ? 'text-[#42b883] opacity-100' : 'text-slate-400 group-hover:text-[#42b883] opacity-70 group-hover:opacity-100'
              ]"
            />

            <span class="font-mono text-[10.5px] tracking-tight whitespace-nowrap" :class="term.id === activeTerminalId ? 'font-semibold text-white' : 'text-slate-300'">
              {{ term.title }}
            </span>

            <!-- Close Tab Button -->
            <span
              @click.stop="closeTerminalTab(term.id, $event)"
              class="size-3.5 rounded-full flex items-center justify-center text-slate-400 hover:text-white hover:bg-rose-500/30 transition-all ml-0.5"
              :class="term.id === activeTerminalId ? 'opacity-80 hover:opacity-100' : 'opacity-0 group-hover:opacity-100'"
            >
              <UIcon name="i-lucide-x" class="size-2.5" />
            </span>
          </button>
        </div>

        <!-- Add New Terminal Button (Clean Single Round Plus Button) -->
        <button
          class="size-6 rounded-full bg-white/[0.03] hover:bg-[#42b883]/15 text-slate-400 hover:text-[#42b883] border border-white/[0.08] hover:border-[#42b883]/35 transition-all flex items-center justify-center cursor-pointer ml-0.5 shadow-xs"
          @click="createTerminalTab(activeTerminal?.shell || 'powershell')"
        >
          <UIcon name="i-lucide-plus" class="size-3.5" />
        </button>
      </div>

      <!-- Right: Rounded Active Terminal Toolbar Controls -->
      <div class="flex items-center gap-2 flex-shrink-0">
        <!-- Shell Type Switcher in Rounded Pill -->
        <div v-if="activeTerminal" class="flex items-center p-0.5 rounded-full bg-white/[0.03] border border-white/[0.08]">
          <button
            class="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold transition-all cursor-pointer"
            :class="activeTerminal.shell === 'powershell' ? 'bg-[#42b883]/25 text-[#42b883] border border-[#42b883]/40 font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
            @click="handleSwitchActiveShell('powershell')"
          >
            PS
          </button>
          <button
            class="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold transition-all cursor-pointer"
            :class="activeTerminal.shell === 'cmd' ? 'bg-[#42b883]/25 text-[#42b883] border border-[#42b883]/40 font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
            @click="handleSwitchActiveShell('cmd')"
          >
            CMD
          </button>
          <button
            class="px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold transition-all cursor-pointer"
            :class="activeTerminal.shell === 'bash' ? 'bg-[#42b883]/25 text-[#42b883] border border-[#42b883]/40 font-bold shadow-xs' : 'text-slate-400 hover:text-slate-200'"
            @click="handleSwitchActiveShell('bash')"
          >
            BASH
          </button>
        </div>

        <!-- Working Directory Rounded Pill Badge -->
        <div
          v-if="workspaceStore.rootFolderPath"
          class="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/[0.02] border border-white/[0.06] text-[10px] text-slate-300 max-w-[140px] truncate"
        >
          <UIcon name="i-lucide-folder" class="size-3 text-[#42b883] flex-shrink-0" />
          <span class="truncate font-mono">{{ workspaceStore.rootFolderPath.split(/[\\/]/).pop() }}</span>
        </div>

        <!-- Action Icon Buttons (Rounded Full) -->
        <div class="flex items-center gap-1">
          <button
            class="size-6 rounded-full flex items-center justify-center text-slate-400 hover:text-[#42b883] hover:bg-[#42b883]/10 transition-colors cursor-pointer"
            @click="handleClearTerminal"
          >
            <UIcon name="i-lucide-ban" class="size-3.5" />
          </button>

          <button
            class="size-6 rounded-full flex items-center justify-center text-slate-400 hover:text-[#42b883] hover:bg-[#42b883]/10 transition-colors cursor-pointer"
            @click="handleRestartTerminal"
          >
            <UIcon name="i-lucide-rotate-cw" class="size-3.5" />
          </button>

          <button
            v-if="activeTerminal"
            class="size-6 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/15 transition-colors cursor-pointer"
            @click="closeTerminalTab(activeTerminal.id)"
          >
            <UIcon name="i-lucide-trash-2" class="size-3.5" />
          </button>

          <div class="h-3.5 w-px bg-white/10 mx-0.5"></div>

          <button
            class="size-6 rounded-full flex items-center justify-center text-slate-400 hover:text-rose-400 hover:bg-rose-500/20 transition-colors cursor-pointer"
            @click="handleClosePanel"
          >
            <UIcon name="i-lucide-x" class="size-3.5" />
          </button>
        </div>
      </div>
    </div>

    <!-- Terminal Body: Isolated DOM container per active session -->
    <div class="terminal-body-wrapper flex-1 w-full relative overflow-hidden">
      <div
        v-for="term in terminals"
        :key="term.id"
        v-show="term.id === activeTerminalId"
        class="terminal-instance-container w-full h-full p-1.5 box-border"
        :ref="(el) => { terminalContainers[term.id] = el as HTMLDivElement }"
      ></div>
    </div>
  </div>
</template>

<style scoped>
.terminal-body-wrapper {
  height: calc(100% - 36px);
}

.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

:deep(.xterm) {
  padding: 2px 0;
  height: 100%;
}

:deep(.xterm-viewport) {
  background-color: transparent !important;
}

:deep(.xterm-screen) {
  height: 100%;
}
</style>
