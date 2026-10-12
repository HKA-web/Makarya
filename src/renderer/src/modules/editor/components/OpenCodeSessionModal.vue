<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import { useOpenCodeStore, type OpenCodeSessionItem } from '@renderer/stores/openCodeStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'

const props = defineProps<{
  isOpen: boolean
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', sessionId: string): void
}>()

const openCodeStore = useOpenCodeStore()
const settingsStore = useSettingsStore()
const searchQuery = ref('')
const searchInputRef = ref<HTMLInputElement | null>(null)

// Filter sessions
const filteredSessions = computed(() => {
  const query = searchQuery.value.trim().toLowerCase()
  if (!query) return openCodeStore.sessions

  return openCodeStore.sessions.filter(
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
      openCodeStore.loadSessions()
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

function chooseSession(session: OpenCodeSessionItem) {
  emit('close')
  emit('select', session.id)
  openCodeStore.switchSession(session.id)
}

function handleCreateNew() {
  emit('close')
  openCodeStore.createNewSession()
}

async function deleteSession(sessionId: string) {
  await openCodeStore.deleteSession(sessionId)
}
</script>

<template>
  <!-- Full Overlay Matching Matte Black Sessions Modal -->
  <div
    v-if="isOpen"
    class="absolute inset-0 bg-[#090b0e]/95 backdrop-blur-md z-50 flex flex-col p-3.5 space-y-3 animate-in fade-in zoom-in-95 duration-150 select-none font-sans"
  >
    <!-- Modal Header -->
    <div class="flex items-center justify-between pb-2 border-b border-white/[0.08] flex-shrink-0">
      <div class="flex items-center gap-2">
        <div class="w-6 h-6 rounded-lg bg-white/10 border border-white/20 flex items-center justify-center text-slate-200">
          <UIcon name="i-lucide-history" class="size-3.5" />
        </div>
        <div>
          <div class="text-xs font-semibold text-white leading-tight">Riwayat Sesi Obrolan</div>
          <div class="text-[10px] text-slate-400">Pilih sesi untuk melanjutkan obrolan</div>
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
      class="w-full py-2 px-3 rounded-xl bg-zinc-200 hover:bg-white text-zinc-950 font-semibold text-xs flex items-center justify-center gap-2 shadow-md shadow-white/5 active:scale-98 transition-all cursor-pointer flex-shrink-0"
    >
      <UIcon name="i-lucide-plus-circle" class="size-4 text-zinc-950" />
      <span>Mulai Obrolan Baru</span>
    </button>

    <!-- Search Input -->
    <div class="relative flex-shrink-0">
      <UIcon name="i-lucide-search" class="size-3 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
      <input
        ref="searchInputRef"
        v-model="searchQuery"
        type="text"
        placeholder="Cari sesi obrolan..."
        class="w-full bg-[#111317] border border-white/[0.08] focus:border-white/30 focus:ring-1 focus:ring-white/15 rounded-xl pl-7 pr-7 py-1.5 text-[11px] text-slate-200 placeholder:text-slate-500 outline-none transition-all font-sans"
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
        :class="session.id === openCodeStore.activeSessionId
          ? 'bg-white/15 border-white/40 shadow-sm ring-1 ring-white/20'
          : 'bg-[#111317] hover:bg-[#181b22] border-white/[0.06] hover:border-white/[0.15]'"
      >
        <!-- Title & Active Badge & Delete Button -->
        <div class="flex items-center justify-between gap-1.5">
          <div class="flex items-center gap-1.5 min-w-0 pr-1">
            <span
              v-if="session.id === openCodeStore.activeSessionId"
              class="w-1.5 h-1.5 rounded-full bg-white animate-pulse flex-shrink-0"
            ></span>
            <span class="text-xs font-semibold text-slate-100 truncate group-hover:text-white transition-colors">
              {{ session.title }}
            </span>
          </div>

          <div class="flex items-center gap-1 flex-shrink-0">
            <span
              v-if="session.id === openCodeStore.activeSessionId"
              class="text-[9px] px-1.5 py-0.5 rounded-full bg-white/20 text-white font-semibold"
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
            <span class="text-slate-400 font-mono">{{ session.model || openCodeStore.currentModel }}</span>
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
          {{ searchQuery ? 'Sesi obrolan tidak ditemukan' : 'Belum ada riwayat sesi obrolan' }}
        </p>
        <p class="text-[10px] text-slate-500 max-w-[220px]">
          Riwayat sesi OpenCode otomatis disinkronkan langsung dari OpenCode CLI (/session).
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
  background: rgba(255, 255, 255, 0.18);
  border-radius: 4px;
}
.custom-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.32);
}
</style>
