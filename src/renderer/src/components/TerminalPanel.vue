<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { useWorkspaceStore } from '../stores/workspaceStore'

const workspaceStore = useWorkspaceStore()

const terminalContainerRef = ref<HTMLDivElement | null>(null)
let terminalInstance: Terminal | null = null
let fitAddon: FitAddon | null = null
let removeDataListener: (() => void) | null = null
let removeExitListener: (() => void) | null = null

const terminalId = ref<string>(`term-${Date.now()}`)
const selectedShell = ref<'powershell' | 'cmd'>('powershell')
const isResizing = ref(false)
const isTerminalReady = ref(false)

// Initialize or reconnect Terminal
async function initTerminal(): Promise<void> {
  if (!terminalContainerRef.value || !window.makaryaAPI) return

  // Dispose previous instance if any
  if (terminalInstance) {
    try {
      terminalInstance.dispose()
    } catch {}
    terminalInstance = null
  }

  terminalId.value = `term-${Date.now()}`

  // Create xterm.js instance with Makarya theme
  terminalInstance = new Terminal({
    cursorBlink: true,
    cursorStyle: 'bar',
    fontSize: 13,
    fontFamily: 'Consolas, "Fira Code", "Courier New", monospace',
    lineHeight: 1.25,
    theme: {
      background: '#090d14',
      foreground: '#e2e8f0',
      cursor: '#10b981',
      cursorAccent: '#090d14',
      selectionBackground: 'rgba(16, 185, 129, 0.35)',
      black: '#1e293b',
      red: '#ef4444',
      green: '#10b981',
      yellow: '#f59e0b',
      blue: '#3b82f6',
      magenta: '#a855f7',
      cyan: '#06b6d4',
      white: '#f8fafc',
      brightBlack: '#475569',
      brightRed: '#f87171',
      brightGreen: '#34d399',
      brightYellow: '#fbbf24',
      brightBlue: '#60a5fa',
      brightMagenta: '#c084fc',
      brightCyan: '#22d3ee',
      brightWhite: '#ffffff'
    },
    convertEol: true,
    scrollback: 5000
  })

  fitAddon = new FitAddon()
  terminalInstance.loadAddon(fitAddon)

  // Clear container and open terminal
  terminalContainerRef.value.innerHTML = ''
  terminalInstance.open(terminalContainerRef.value)

  // Fit initially
  try {
    fitAddon.fit()
  } catch {}

  const cwd = workspaceStore.getEffectiveProjectRoot() || workspaceStore.activeRootPath || undefined
  const cols = terminalInstance.cols || 80
  const rows = terminalInstance.rows || 24

  // Register PTY backend in main process
  const res = await window.makaryaAPI.createTerminal({
    id: terminalId.value,
    cols,
    rows,
    cwd,
    shell: selectedShell.value
  })

  if (!res.success) {
    terminalInstance.writeln(`\x1b[31m[Error] Gagal memulai terminal: ${res.error}\x1b[0m`)
    return
  }

  // Handle user input from xterm to PTY
  terminalInstance.onData((data) => {
    window.makaryaAPI?.writeTerminal({
      id: terminalId.value,
      data
    })
  })

  // Handle resize from xterm fit
  terminalInstance.onResize(({ cols, rows }) => {
    window.makaryaAPI?.resizeTerminal({
      id: terminalId.value,
      cols,
      rows
    })
  })

  isTerminalReady.value = true
}

// Clear terminal output
function handleClearTerminal(): void {
  terminalInstance?.clear()
}

// Restart terminal session
async function handleRestartTerminal(): Promise<void> {
  if (window.makaryaAPI && terminalId.value) {
    await window.makaryaAPI.killTerminal({ id: terminalId.value })
  }
  await initTerminal()
}

// Switch shell type
async function handleSwitchShell(shell: 'powershell' | 'cmd'): Promise<void> {
  if (selectedShell.value === shell) return
  selectedShell.value = shell
  await handleRestartTerminal()
}

// Close/hide bottom panel
function handleClosePanel(): void {
  workspaceStore.setBottomPanelOpen(false)
}

// Fit terminal wrapper
function fitTerminal(): void {
  if (fitAddon && terminalInstance && workspaceStore.isBottomPanelOpen) {
    try {
      fitAddon.fit()
      window.makaryaAPI?.resizeTerminal({
        id: terminalId.value,
        cols: terminalInstance.cols,
        rows: terminalInstance.rows
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
      if (payload.id === terminalId.value && terminalInstance) {
        terminalInstance.write(payload.data)
      }
    })

    removeExitListener = window.makaryaAPI.onTerminalExit((payload) => {
      if (payload.id === terminalId.value && terminalInstance) {
        terminalInstance.writeln(`\r\n\x1b[33m[Proses terminal telah selesai (Exit code: ${payload.exitCode})]\x1b[0m\r\n`)
      }
    })
  }

  window.addEventListener('resize', fitTerminal)

  if (workspaceStore.isBottomPanelOpen) {
    nextTick(() => {
      initTerminal()
    })
  }
})

onBeforeUnmount(() => {
  window.removeEventListener('resize', fitTerminal)
  if (removeDataListener) removeDataListener()
  if (removeExitListener) removeExitListener()

  if (window.makaryaAPI && terminalId.value) {
    window.makaryaAPI.killTerminal({ id: terminalId.value })
  }

  if (terminalInstance) {
    try {
      terminalInstance.dispose()
    } catch {}
  }
})

// Watch panel open/close
watch(
  () => workspaceStore.isBottomPanelOpen,
  (isOpen) => {
    if (isOpen) {
      nextTick(() => {
        if (!terminalInstance) {
          initTerminal()
        } else {
          fitTerminal()
          terminalInstance.focus()
        }
      })
    }
  }
)

// Watch project root change
watch(
  () => workspaceStore.rootFolderPath,
  () => {
    if (workspaceStore.isBottomPanelOpen && isTerminalReady.value) {
      // Prompt user or automatically inform cwd
    }
  }
)
</script>

<template>
  <div
    class="terminal-bottom-panel"
    :style="{ height: `${workspaceStore.bottomPanelHeight}px` }"
    :class="{ 'is-resizing': isResizing }"
  >
    <!-- Resize Handle -->
    <div
      class="resizer-handle"
      @mousedown="handleMouseDownResize"
      title="Tarik untuk mengubah ukuran tinggi terminal"
    >
      <div class="resizer-line"></div>
    </div>

    <!-- Terminal Header Bar -->
    <div class="terminal-header">
      <div class="header-left">
        <div class="tab-item active">
          <i class="pi pi-terminal text-emerald-400"></i>
          <span class="tab-title">TERMINAL</span>
          <span class="shell-badge">{{ selectedShell === 'powershell' ? 'PowerShell' : 'CMD' }}</span>
        </div>

        <!-- Shell Selector -->
        <div class="shell-selector">
          <button
            class="shell-btn"
            :class="{ active: selectedShell === 'powershell' }"
            @click="handleSwitchShell('powershell')"
            title="Gunakan PowerShell"
          >
            PS
          </button>
          <button
            class="shell-btn"
            :class="{ active: selectedShell === 'cmd' }"
            @click="handleSwitchShell('cmd')"
            title="Gunakan Command Prompt (cmd)"
          >
            CMD
          </button>
        </div>
      </div>

      <div class="header-right">
        <!-- Working dir indicator -->
        <div
          v-if="workspaceStore.rootFolderPath"
          class="cwd-indicator"
          :title="`CWD: ${workspaceStore.rootFolderPath}`"
        >
          <i class="pi pi-folder text-xs"></i>
          <span>{{ workspaceStore.rootFolderPath.split(/[\\/]/).pop() }}</span>
        </div>

        <button
          class="action-btn"
          @click="handleClearTerminal"
          title="Bersihkan Tampilan (Clear)"
        >
          <i class="pi pi-ban"></i>
        </button>

        <button
          class="action-btn"
          @click="handleRestartTerminal"
          title="Mulai Ulang Sesi Terminal (Restart)"
        >
          <i class="pi pi-refresh"></i>
        </button>

        <button
          class="action-btn close-btn"
          @click="handleClosePanel"
          title="Tutup Panel Terminal (Ctrl+`)"
        >
          <i class="pi pi-times"></i>
        </button>
      </div>
    </div>

    <!-- Terminal Body Container -->
    <div class="terminal-body" ref="terminalContainerRef"></div>
  </div>
</template>

<style scoped>
.terminal-bottom-panel {
  display: flex;
  flex-direction: column;
  background: #090d14;
  border-top: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
  z-index: 25;
  width: 100%;
  overflow: hidden;
  box-shadow: 0 -4px 20px rgba(0, 0, 0, 0.35);
}

.terminal-bottom-panel.is-resizing {
  user-select: none;
}

/* Resize Handle */
.resizer-handle {
  height: 6px;
  width: 100%;
  cursor: ns-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  position: absolute;
  top: 0;
  left: 0;
  z-index: 10;
  transition: background 0.15s ease;
}

.resizer-line {
  height: 2px;
  width: 48px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.15);
  transition: all 0.2s ease;
}

.resizer-handle:hover .resizer-line,
.terminal-bottom-panel.is-resizing .resizer-line {
  background: #10b981;
  width: 72px;
  box-shadow: 0 0 8px rgba(16, 185, 129, 0.6);
}

.resizer-handle:hover {
  background: rgba(16, 185, 129, 0.08);
}

/* Header Bar */
.terminal-header {
  height: 32px;
  min-height: 32px;
  background: #0d121c;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 10px;
  font-family: inherit;
  margin-top: 4px;
}

.header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.tab-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.05em;
  color: #94a3b8;
  padding: 3px 8px;
  border-radius: 4px;
}

.tab-item.active {
  color: #f1f5f9;
  background: rgba(255, 255, 255, 0.04);
}

.shell-badge {
  font-size: 10px;
  font-weight: 500;
  padding: 1px 5px;
  border-radius: 3px;
  background: rgba(16, 185, 129, 0.12);
  color: #34d399;
  border: 1px solid rgba(16, 185, 129, 0.25);
}

.shell-selector {
  display: flex;
  align-items: center;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  padding: 1px;
}

.shell-btn {
  background: transparent;
  border: none;
  color: #64748b;
  font-size: 10px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 3px;
  cursor: pointer;
  transition: all 0.15s ease;
}

.shell-btn:hover {
  color: #cbd5e1;
}

.shell-btn.active {
  background: rgba(16, 185, 129, 0.2);
  color: #10b981;
}

.header-right {
  display: flex;
  align-items: center;
  gap: 6px;
}

.cwd-indicator {
  display: flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: #64748b;
  background: rgba(255, 255, 255, 0.03);
  padding: 2px 8px;
  border-radius: 4px;
  max-width: 140px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  border: 1px solid rgba(255, 255, 255, 0.05);
}

.action-btn {
  background: transparent;
  border: none;
  color: #64748b;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
  transition: all 0.15s ease;
}

.action-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: #e2e8f0;
}

.action-btn.close-btn:hover {
  background: rgba(239, 68, 68, 0.18);
  color: #ef4444;
}

/* Terminal Body */
.terminal-body {
  flex: 1;
  width: 100%;
  height: calc(100% - 36px);
  padding: 4px 8px;
  overflow: hidden;
  box-sizing: border-box;
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
