<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import Dialog from 'primevue/dialog'
import { useWorkspaceStore } from '../stores/workspaceStore'
import { getNuxtFileIcon } from '../utils/languageDetector'

const workspaceStore = useWorkspaceStore()

const searchKeyword = ref('')
const selectedIndex = ref(0)
const searchInputRef = ref<HTMLInputElement | null>(null)
const isLoadingFiles = ref(false)

interface IndexedFile {
  name: string
  path: string
  relativePath: string
  rootPath: string
}

const allProjectFiles = ref<IndexedFile[]>([])

// Ambil seluruh daftar file dari semua project yang dibuka
async function refreshWorkspaceFiles(): Promise<void> {
  const rootPaths = workspaceStore.workspaceRoots.map((r) => r.path)
  if (rootPaths.length === 0 || !window.makaryaAPI?.searchWorkspaceFiles) {
    allProjectFiles.value = []
    return
  }

  isLoadingFiles.value = true
  try {
    const files = await window.makaryaAPI.searchWorkspaceFiles(rootPaths)
    allProjectFiles.value = files || []
  } catch (err) {
    console.warn('Gagal mengindeks berkas workspace:', err)
  } finally {
    isLoadingFiles.value = false
  }
}

// Logika cerdas fuzzy search & recent files
const filteredFiles = computed<IndexedFile[]>(() => {
  const query = searchKeyword.value.trim().toLowerCase()

  // Jika keyword kosong: Tampilkan berkas yang sedang terbuka di tab dan riwayat berkas terbaru
  if (!query) {
    const resultList: IndexedFile[] = []
    const seenPaths = new Set<string>()

    // 1. Tambahkan tab-tab yang sedang terbuka saat ini
    for (const tab of workspaceStore.tabList) {
      if (tab.filePath && !seenPaths.has(tab.filePath)) {
        seenPaths.add(tab.filePath)
        // Cari info relative path dari cache atau gunakan title
        const cached = allProjectFiles.value.find((f) => f.path === tab.filePath)
        resultList.push({
          name: tab.title,
          path: tab.filePath,
          relativePath: cached?.relativePath || tab.title,
          rootPath: cached?.rootPath || ''
        })
      }
    }

    // 2. Tambahkan riwayat file yang pernah dibuka sebelumnya
    for (const recent of workspaceStore.recentFiles) {
      if (recent.path && !seenPaths.has(recent.path)) {
        seenPaths.add(recent.path)
        const cached = allProjectFiles.value.find((f) => f.path === recent.path)
        resultList.push({
          name: recent.name,
          path: recent.path,
          relativePath: cached?.relativePath || recent.name,
          rootPath: cached?.rootPath || ''
        })
      }
    }

    // 3. Jika belum ada recent/tab, tampilkan beberapa berkas pertama dari workspace
    if (resultList.length === 0) {
      return allProjectFiles.value.slice(0, 30)
    }

    return resultList.slice(0, 30)
  }

  // Jika ada query: Filter dengan algoritma kecocokan bertingkat (Exact > StartsWith > Substring > Path)
  const matches: Array<{ file: IndexedFile; score: number }> = []

  for (const file of allProjectFiles.value) {
    const fileNameLower = file.name.toLowerCase()
    const relPathLower = file.relativePath.toLowerCase()

    if (fileNameLower === query) {
      matches.push({ file, score: 100 })
    } else if (fileNameLower.startsWith(query)) {
      matches.push({ file, score: 80 })
    } else if (fileNameLower.includes(query)) {
      matches.push({ file, score: 60 })
    } else if (relPathLower.includes(query)) {
      matches.push({ file, score: 40 })
    } else {
      // Fuzzy sequential character match (contoh: 'cp' cocok 'CommandPalette.vue')
      let qIdx = 0
      for (let i = 0; i < fileNameLower.length && qIdx < query.length; i++) {
        if (fileNameLower[i] === query[qIdx]) {
          qIdx++
        }
      }
      if (qIdx === query.length) {
        matches.push({ file, score: 20 })
      }
    }
  }

  // Urutkan berdasarkan score tertinggi, lalu abjad
  matches.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return a.file.name.localeCompare(b.file.name)
  })

  return matches.slice(0, 50).map((m) => m.file)
})

watch(filteredFiles, () => {
  selectedIndex.value = 0
})

watch(
  () => workspaceStore.isQuickOpenVisible,
  async (visible) => {
    if (visible) {
      searchKeyword.value = ''
      selectedIndex.value = 0
      await refreshWorkspaceFiles()
      nextTick(() => {
        searchInputRef.value?.focus()
      })
    }
  }
)

function openSelectedFile(): void {
  const items = filteredFiles.value
  if (items.length > 0 && selectedIndex.value >= 0 && selectedIndex.value < items.length) {
    const selected = items[selectedIndex.value]
    workspaceStore.closeQuickOpen()
    workspaceStore.openFile(selected.path, selected.name)
  }
}

function handleFileClick(file: IndexedFile): void {
  workspaceStore.closeQuickOpen()
  workspaceStore.openFile(file.path, file.name)
}

function handlePaletteKeydown(event: KeyboardEvent): void {
  const isModifier = event.ctrlKey || event.metaKey
  const key = event.key.toLowerCase()

  // Jika di dalam Quick Open dan menekan Ctrl+E / Ctrl+P lagi: navigasi ke file berikutnya
  if (isModifier && (key === 'e' || key === 'p')) {
    event.preventDefault()
    event.stopPropagation()
    const items = filteredFiles.value
    if (items.length > 0) {
      selectedIndex.value = (selectedIndex.value + 1) % items.length
      scrollToSelected()
    }
    return
  }

  const items = filteredFiles.value
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    if (items.length > 0) {
      selectedIndex.value = (selectedIndex.value + 1) % items.length
      scrollToSelected()
    }
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    if (items.length > 0) {
      selectedIndex.value = (selectedIndex.value - 1 + items.length) % items.length
      scrollToSelected()
    }
  } else if (event.key === 'Enter') {
    event.preventDefault()
    event.stopPropagation()
    openSelectedFile()
  } else if (event.key === 'Escape') {
    event.preventDefault()
    event.stopPropagation()
    workspaceStore.closeQuickOpen()
  }
}

function scrollToSelected(): void {
  nextTick(() => {
    const el = document.getElementById(`quick-file-item-${selectedIndex.value}`)
    el?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  })
}
</script>

<template>
  <Dialog
    v-model:visible="workspaceStore.isQuickOpenVisible"
    modal
    :closable="false"
    :dismissableMask="true"
    :style="{ width: '640px', maxWidth: '92vw', marginTop: '5vh' }"
    :position="'top'"
    :pt="{
      root: {
        class: 'relative bg-[#0b101b]/95 backdrop-blur-2xl border border-white/[0.12] text-slate-100 rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.85)] p-0 overflow-hidden ring-1 ring-white/[0.06] transition-all duration-300'
      },
      mask: {
        class: 'bg-black/60 backdrop-blur-sm transition-all duration-300'
      },
      header: { class: 'hidden' },
      content: { class: 'p-0 bg-transparent' }
    }"
  >
    <!-- Top Glow Accent Line (Emerald Vue Green) -->
    <div class="h-[2px] w-full bg-gradient-to-r from-transparent via-[#42b883]/80 to-transparent"></div>

    <!-- Search Input Box -->
    <div class="px-4 py-3.5 border-b border-white/[0.08] flex items-center gap-3 bg-white/[0.02]">
      <UIcon name="i-lucide-search" class="size-5 text-[#42b883] flex-shrink-0 animate-pulse" />
      <input
        ref="searchInputRef"
        v-model="searchKeyword"
        type="text"
        placeholder="Ketik nama file untuk mencari... (Ctrl+E)"
        class="flex-1 bg-transparent text-sm text-slate-100 placeholder:text-slate-500 focus:outline-none font-sans"
        @keydown="handlePaletteKeydown"
      />

      <!-- Clear keyword button -->
      <button
        v-if="searchKeyword"
        @click="searchKeyword = ''"
        class="text-slate-400 hover:text-white p-1 rounded-md transition-colors cursor-pointer"
        title="Bersihkan input"
      >
        <UIcon name="i-lucide-x" class="size-3.5" />
      </button>

      <!-- Badge shortcut info -->
      <div class="flex items-center gap-1.5 flex-shrink-0 select-none">
        <span class="text-[10px] text-slate-400 bg-white/[0.04] border border-white/[0.08] px-2 py-0.5 rounded-md font-mono">
          Ctrl+E
        </span>
        <span class="text-[10px] text-slate-500 font-mono">
          ESC
        </span>
      </div>
    </div>

    <!-- Context Header (Recent Files or Search Results) -->
    <div class="px-4 py-1.5 bg-white/[0.01] border-b border-white/[0.04] flex items-center justify-between text-[11px] text-slate-400">
      <div class="flex items-center gap-1.5 font-medium">
        <UIcon :name="searchKeyword ? 'i-lucide-list-filter' : 'i-lucide-history'" class="size-3.5 text-[#42b883]" />
        <span>{{ searchKeyword ? 'Hasil Pencarian Berkas' : 'Berkas Terbaru & Terbuka' }}</span>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="isLoadingFiles" class="flex items-center gap-1 text-[#42b883]">
          <UIcon name="i-lucide-loader-2" class="size-3 animate-spin" />
          <span>Memuat berkas...</span>
        </span>
        <span v-else class="text-[10px] text-slate-500 font-mono">
          {{ allProjectFiles.length }} total berkas
        </span>
      </div>
    </div>

    <!-- File Results List -->
    <div class="max-h-[360px] overflow-y-auto p-2 space-y-0.5 custom-scrollbar">
      <!-- Empty State: No workspace folder opened -->
      <div
        v-if="workspaceStore.workspaceRoots.length === 0"
        class="py-8 px-4 text-center text-slate-400 space-y-2 select-none"
      >
        <UIcon name="i-lucide-folder-open" class="size-8 mx-auto text-slate-600 mb-1" />
        <p class="text-xs font-medium text-slate-300">Belum ada folder project yang dibuka</p>
        <p class="text-[11px] text-slate-500">Buka folder project terlebih dahulu untuk mencari berkas.</p>
      </div>

      <!-- Empty State: No search results found -->
      <div
        v-else-if="filteredFiles.length === 0"
        class="py-8 px-4 text-center text-slate-400 space-y-1.5 select-none"
      >
        <UIcon name="i-lucide-file-x" class="size-8 mx-auto text-slate-600 mb-1" />
        <p class="text-xs font-medium text-slate-300">Tidak ada berkas yang cocok</p>
        <p class="text-[11px] text-slate-500">
          Coba kata kunci lain atau periksa ejaan berkas yang Anda cari.
        </p>
      </div>

      <!-- List Items -->
      <div
        v-for="(file, index) in filteredFiles"
        :id="`quick-file-item-${index}`"
        :key="file.path"
        @click="handleFileClick(file)"
        @mouseenter="selectedIndex = index"
        class="group flex items-center justify-between px-3 py-2 rounded-xl text-xs transition-all duration-150 cursor-pointer select-none"
        :class="selectedIndex === index
          ? 'bg-white/[0.08] text-white shadow-sm border-l-2 border-[#42b883] pl-2.5'
          : 'text-slate-300 hover:bg-white/[0.04] border-l-2 border-transparent'"
      >
        <div class="flex items-center gap-2.5 min-w-0 flex-1 pr-3">
          <!-- File Icon based on extension -->
          <UIcon
            :name="getNuxtFileIcon(file.name, false).icon"
            class="size-4.5 flex-shrink-0"
            :class="getNuxtFileIcon(file.name, false).colorClass"
          />

          <!-- File Name & Relative Path -->
          <div class="flex items-center gap-2 min-w-0 truncate">
            <span
              class="font-medium truncate tracking-tight"
              :class="selectedIndex === index ? 'text-white font-semibold' : 'text-slate-200'"
            >
              {{ file.name }}
            </span>
            <span class="text-[11px] text-slate-500 truncate font-mono">
              {{ file.relativePath }}
            </span>
          </div>
        </div>

        <!-- Badges on right: Aktif / Terbuka -->
        <div class="flex items-center gap-1.5 flex-shrink-0">
          <span
            v-if="workspaceStore.activeTab.filePath === file.path"
            class="text-[9px] px-1.5 py-0.5 rounded-md font-mono font-medium bg-[#42b883]/15 text-[#42b883] border border-[#42b883]/30 flex items-center gap-1"
          >
            <span class="w-1.5 h-1.5 rounded-full bg-[#42b883] animate-pulse"></span>
            <span>Aktif</span>
          </span>
          <span
            v-else-if="workspaceStore.tabList.some((t) => t.filePath === file.path)"
            class="text-[9px] px-1.5 py-0.5 rounded-md font-mono text-slate-400 bg-white/[0.04] border border-white/[0.08]"
          >
            Terbuka
          </span>
          <UIcon
            name="i-lucide-arrow-right"
            class="size-3 text-slate-500 opacity-0 group-hover:opacity-100 transition-opacity"
            :class="{ '!opacity-100 text-[#42b883]': selectedIndex === index }"
          />
        </div>
      </div>
    </div>

    <!-- Palette Footer & Shortcut Hints -->
    <div class="px-4 py-2 bg-white/[0.02] border-t border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400 select-none">
      <div class="flex items-center gap-3">
        <span class="flex items-center gap-1">
          <kbd class="px-1.5 py-0.5 text-[9px] rounded bg-white/[0.06] border border-white/[0.1] font-mono text-slate-300">↑</kbd>
          <kbd class="px-1.5 py-0.5 text-[9px] rounded bg-white/[0.06] border border-white/[0.1] font-mono text-slate-300">↓</kbd>
          <span class="text-slate-500 ml-0.5">Navigasi</span>
        </span>
        <span class="flex items-center gap-1">
          <kbd class="px-1.5 py-0.5 text-[9px] rounded bg-white/[0.06] border border-white/[0.1] font-mono text-slate-300">↵</kbd>
          <span class="text-slate-500 ml-0.5">Buka Berkas</span>
        </span>
        <span class="flex items-center gap-1">
          <kbd class="px-1.5 py-0.5 text-[9px] rounded bg-white/[0.06] border border-white/[0.1] font-mono text-slate-300">esc</kbd>
          <span class="text-slate-500 ml-0.5">Tutup</span>
        </span>
      </div>

      <div class="text-[10px] text-slate-500 font-mono">
        {{ filteredFiles.length }} dari {{ allProjectFiles.length }} ditampilkan
      </div>
    </div>
  </Dialog>
</template>
