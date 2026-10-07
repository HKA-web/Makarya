<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useClaudeStore, type ClaudeSessionItem } from '@renderer/stores/claudeStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', sessionId: string): void
}>()

const claudeStore = useClaudeStore()
const settingsStore = useSettingsStore()
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)

// Filter sessions
const filteredSessions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return claudeStore.sessions

  return claudeStore.sessions.filter(
    (s) =>
      s.title.toLowerCase().includes(query) ||
      (s.lastMessage && s.lastMessage.toLowerCase().includes(query)) ||
      (s.subtitle && s.subtitle.toLowerCase().includes(query)) ||
      (s.model && s.model.toLowerCase().includes(query)) ||
      s.id.toLowerCase().includes(query)
  )
})

watch(
  () => props.isOpen,
  (val) => {
    if (val) {
      searchQuery.value = ''
      claudeStore.loadSessions()
      nextTick(() => {
        searchInputRef.value?.focus()
      })
    }
  }
)

function formatSessionDate(dateStr?: string | number): string {
  if (!dateStr) return ''
  return settingsStore.formatDateTime(dateStr)
}

function chooseSession(session: ClaudeSessionItem) {
  emit('close')
  emit('select', session.id)
  claudeStore.switchSession(session.id)
}

function handleCreateNew() {
  emit('close')
  claudeStore.createNewSession()
}

async function deleteSession(sessionId: string) {
  await claudeStore.deleteSession(sessionId)
}
</script>

<template>
  <!-- Full Overlay Matching Claude Sessions Modal -->
  <div
    v-if="isOpen"
    class="absolute inset-0 bg-[#070b13]/92 backdrop-blur-md z-50 flex flex-col p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150 select-none font-sans"
  >
    <!-- Modal Header -->
    <div class="flex items-center justify-between pb-2 border-b border-white/[0.08] flex-shrink-0">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded-lg bg-[#d97706]/15 border border-[#d97706]/30 flex items-center justify-center text-[#f59e0b]">
          <UIcon name="i-lucide-history" class="size-3.5" />
        </div>
        <div>
          <div class="text-xs font-semibold text-white leading-tight">Riwayat Sesi Claude</div>
          <div class="text-[10px] text-slate-400">Pilih sesi untuk melanjutkan obrolan Claude</div>
        </div>
      </div>
      <button
        @click="emit('close')"
        class="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
        title="Tutup riwayat"
      >
        <UIcon name="i-lucide-x" class="size-3.5" />
      </button>
    </div>

    <!-- Action: Mulai Obrolan Baru -->
    <button
      @click="handleCreateNew"
      class="w-full py-2 px-3 rounded-xl bg-gradient-to-r from-[#ea580c] to-[#d97706] hover:from-[#f97316] hover:to-[#ea580c] text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-lg shadow-[#ea580c]/25 active:scale-98 transition-all cursor-pointer flex-shrink-0"
    >
      <UIcon name="i-lucide-plus-circle" class="size-4 text-white" />
      <span>Mulai Obrolan Claude Baru</span>
    </button>

    <!-- Search Input -->
    <div class="relative flex-shrink-0">
      <UIcon name="i-lucide-search" class="size-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        ref="searchInputRef"
        v-model="searchQuery"
        type="text"
        placeholder="Cari sesi Claude..."
        class="w-full bg-[#080d16] border border-white/[0.08] focus:border-[#d97706]/50 focus:ring-1 focus:ring-[#d97706]/20 rounded-xl pl-7 pr-7 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-500 outline-none transition-all font-sans"
      />
      <button
        v-if="searchQuery"
        @click="searchQuery = ''"
        class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
      >
        <UIcon name="i-lucide-x" class="size-3" />
      </button>
    </div>

    <!-- Scrollable Sessions List (Master) -->
    <div class="flex-1 overflow-y-auto space-y-2 pr-1 custom-scroll">
      <div
        v-for="session in filteredSessions"
        :key="session.id"
        @click="chooseSession(session)"
        class="p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1.5 group relative"
        :class="session.id === claudeStore.activeSessionId
          ? 'bg-[#d97706]/15 border-[#d97706]/45 shadow-sm shadow-[#d97706]/10'
          : 'bg-[#0f1624]/60 hover:bg-[#1f1710] border-white/[0.06] hover:border-white/[0.12]'"
      >
        <!-- Title & Active Badge & Delete Button -->
        <div class="flex items-center justify-between gap-1.5">
          <div class="flex items-center gap-1.5 min-w-0 pr-1">
            <span
              v-if="session.id === claudeStore.activeSessionId"
              class="w-1.5 h-1.5 rounded-full bg-[#f59e0b] animate-pulse flex-shrink-0"
            ></span>
            <span class="text-xs font-semibold text-slate-100 truncate group-hover:text-[#f59e0b] transition-colors">
              {{ session.title }}
            </span>
          </div>

          <div class="flex items-center gap-1 flex-shrink-0">
            <span
              v-if="session.id === claudeStore.activeSessionId"
              class="text-[9px] px-1.5 py-0.5 rounded-full bg-[#d97706]/20 text-[#f59e0b] font-semibold"
            >
              Aktif
            </span>
            <button
              @click.stop="deleteSession(session.id)"
              class="w-5 h-5 rounded-md flex items-center justify-center text-slate-500 hover:text-rose-400 hover:bg-rose-500/10 transition-colors opacity-0 group-hover:opacity-100 cursor-pointer"
              title="Hapus sesi ini"
            >
              <UIcon name="i-lucide-trash-2" class="size-3" />
            </button>
          </div>
        </div>

        <!-- Last Message Preview -->
        <p v-if="session.lastMessage || session.subtitle" class="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">
          {{ session.lastMessage || session.subtitle }}
        </p>

        <!-- Footer Metadata: Message count, Model, Time -->
        <div class="flex items-center justify-between text-[9px] text-slate-500 pt-0.5 border-t border-white/[0.04]">
          <span class="flex items-center gap-1">
            <UIcon name="i-lucide-message-square" class="size-2.5 text-slate-400" />
            <span>{{ session.messageCount || 1 }} pesan</span>
            <span>•</span>
            <span class="text-slate-400 font-mono">{{ session.model || claudeStore.currentModel }}</span>
          </span>
          <span class="font-mono text-slate-400">
            {{ formatSessionDate(session.updatedAt || session.timestamp) }}
          </span>
        </div>
      </div>

      <!-- Empty State -->
      <div v-if="filteredSessions.length === 0" class="py-10 text-center flex flex-col items-center justify-center text-slate-500 space-y-2">
        <UIcon name="i-lucide-history" class="size-8 text-slate-600" />
        <p class="text-xs font-medium text-slate-400">
          {{ searchQuery ? 'Sesi Claude tidak ditemukan' : 'Belum ada riwayat sesi Claude' }}
        </p>
        <p class="text-[10px] text-slate-500 max-w-[200px]">
          Sesi Claude akan otomatis tersimpan di SQLite saat Anda mulai mengirim pesan.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar {
  width: 3.5px;
}
.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scroll::-webkit-scrollbar-thumb {
  background: rgba(217, 119, 6, 0.25);
  border-radius: 4px;
}
.custom-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(217, 119, 6, 0.45);
}
</style>
