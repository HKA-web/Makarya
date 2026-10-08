<script setup lang="ts">
import { ref, computed, watch, nextTick, onMounted, onUnmounted } from 'vue'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { getNuxtFileIcon } from '@renderer/utils/languageDetector'

const workspaceStore = useWorkspaceStore()

const searchQuery = ref('')
const isCaseSensitive = ref(false)
const matchWholeWord = ref(false)
const isRegex = ref(false)

const showFilters = ref(false)
const includeFilter = ref('')
const excludeFilter = ref('')

const isSearching = ref(false)
const searchInputRef = ref<HTMLInputElement | null>(null)
const listContainerRef = ref<HTMLElement | null>(null)

// Pagination State (100 matches per batch/page)
const PAGE_SIZE = 100
const currentPage = ref(1)
const hasMore = ref(false)

interface SearchMatch {
  lineNumber: number
  lineContent: string
  matchStart: number
  matchEnd: number
}

interface FileSearchResult {
  filePath: string
  fileName: string
  relativePath: string
  rootPath: string
  matches: SearchMatch[]
  isCollapsed?: boolean
}

const searchResults = ref<FileSearchResult[]>([])
const totalMatches = ref(0)
const totalFiles = ref(0)

// Flattened list for keyboard up/down navigation
interface FlatMatchItem {
  file: FileSearchResult
  match: SearchMatch
  flatIndex: number
}

const flatMatches = computed<FlatMatchItem[]>(() => {
  const list: FlatMatchItem[] = []
  let index = 0
  for (const file of searchResults.value) {
    if (!file.isCollapsed) {
      for (const match of file.matches) {
        list.push({
          file,
          match,
          flatIndex: index++
        })
      }
    }
  }
  return list
})

const selectedMatchIndex = ref(0)
let debounceTimer: ReturnType<typeof setTimeout> | null = null
let currentSearchSeq = 0

async function performSearch(resetPage = true): Promise<void> {
  if (resetPage) {
    currentPage.value = 1
  }

  const query = searchQuery.value.trim()
  if (!query) {
    if (debounceTimer) clearTimeout(debounceTimer)
    searchResults.value = []
    totalMatches.value = 0
    totalFiles.value = 0
    hasMore.value = false
    isSearching.value = false
    return
  }

  if (!window.makaryaAPI?.findInFiles) return

  const rootPaths = workspaceStore.workspaceRoots.map((r) => r.path)
  if (rootPaths.length === 0 && workspaceStore.activeRootPath) {
    rootPaths.push(workspaceStore.activeRootPath)
  }

  if (rootPaths.length === 0) return

  const thisSeq = ++currentSearchSeq
  isSearching.value = true

  const offset = (currentPage.value - 1) * PAGE_SIZE

  try {
    const res = await window.makaryaAPI.findInFiles({
      query,
      rootPaths,
      isCaseSensitive: isCaseSensitive.value,
      matchWholeWord: matchWholeWord.value,
      isRegex: isRegex.value,
      includePattern: includeFilter.value.trim() || undefined,
      excludePattern: excludeFilter.value.trim() || undefined,
      maxResults: PAGE_SIZE,
      offset
    })

    // Ignore stale responses if a newer search has already started
    if (thisSeq !== currentSearchSeq) return

    searchResults.value = (res.results || []).map((r) => ({ ...r, isCollapsed: false }))
    totalMatches.value = res.totalMatches || 0
    totalFiles.value = res.totalFiles || 0
    hasMore.value = res.hasMore || false
    selectedMatchIndex.value = 0

    if (listContainerRef.value) {
      listContainerRef.value.scrollTop = 0
    }
    scrollToSelected()
  } catch (err) {
    console.error('Error finding in files:', err)
  } finally {
    if (thisSeq === currentSearchSeq) {
      isSearching.value = false
    }
  }
}

function handleInput(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    performSearch(true)
  }, 180)
}

function prevPage(): void {
  if (currentPage.value > 1 && !isSearching.value) {
    currentPage.value--
    performSearch(false)
  }
}

function nextPage(): void {
  if (hasMore.value && !isSearching.value) {
    currentPage.value++
    performSearch(false)
  }
}

function clearQuery(): void {
  searchQuery.value = ''
  searchResults.value = []
  totalMatches.value = 0
  totalFiles.value = 0
  hasMore.value = false
  currentPage.value = 1
  searchInputRef.value?.focus()
}

function toggleCaseSensitive(): void {
  isCaseSensitive.value = !isCaseSensitive.value
  performSearch(true)
}

function toggleWholeWord(): void {
  matchWholeWord.value = !matchWholeWord.value
  performSearch(true)
}

function toggleRegex(): void {
  isRegex.value = !isRegex.value
  performSearch(true)
}

function toggleFileCollapse(file: FileSearchResult): void {
  file.isCollapsed = !file.isCollapsed
}

function toggleCollapseAll(): void {
  const hasExpanded = searchResults.value.some((f) => !f.isCollapsed)
  for (const f of searchResults.value) {
    f.isCollapsed = hasExpanded
  }
}

async function openMatch(file: FileSearchResult, match: SearchMatch): Promise<void> {
  await workspaceStore.openFile(file.filePath, file.fileName, match.lineNumber)
  workspaceStore.closeGlobalSearch()
}

function scrollToSelected(): void {
  nextTick(() => {
    if (!listContainerRef.value) return
    const activeEl = listContainerRef.value.querySelector('.selected-match-row') as HTMLElement
    if (activeEl) {
      activeEl.scrollIntoView({ block: 'nearest' })
    }
  })
}

function handleGlobalSearchKeydown(e: KeyboardEvent): void {
  if (!workspaceStore.isGlobalSearchVisible) return

  if (e.key === 'Escape') {
    e.preventDefault()
    workspaceStore.closeGlobalSearch()
  } else if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (flatMatches.value.length === 0) return
    selectedMatchIndex.value = (selectedMatchIndex.value + 1) % flatMatches.value.length
    scrollToSelected()
  } else if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (flatMatches.value.length === 0) return
    selectedMatchIndex.value =
      (selectedMatchIndex.value - 1 + flatMatches.value.length) % flatMatches.value.length
    scrollToSelected()
  } else if (e.key === 'Enter') {
    e.preventDefault()
    const item = flatMatches.value[selectedMatchIndex.value]
    if (item) {
      openMatch(item.file, item.match)
    }
  } else if (e.altKey && e.key.toLowerCase() === 'c') {
    e.preventDefault()
    toggleCaseSensitive()
  } else if (e.altKey && e.key.toLowerCase() === 'w') {
    e.preventDefault()
    toggleWholeWord()
  } else if (e.altKey && e.key.toLowerCase() === 'r') {
    e.preventDefault()
    toggleRegex()
  } else if (e.altKey && e.key === 'ArrowLeft') {
    e.preventDefault()
    prevPage()
  } else if (e.altKey && e.key === 'ArrowRight') {
    e.preventDefault()
    nextPage()
  }
}

// Highlight matching keyword inside code line
function formatHighlightedLine(lineContent: string, _match: SearchMatch): string {
  const query = searchQuery.value.trim()
  if (!query) return escapeHtml(lineContent)

  try {
    let pattern = query
    if (!isRegex.value) {
      pattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    }
    if (matchWholeWord.value) {
      pattern = `\\b${pattern}\\b`
    }
    const flags = isCaseSensitive.value ? 'g' : 'gi'
    const reg = new RegExp(pattern, flags)

    return escapeHtml(lineContent).replace(reg, (m) => `<mark class="bg-[#42b883]/30 text-[#42b883] font-bold px-0.5 rounded border border-[#42b883]/40">${escapeHtml(m)}</mark>`)
  } catch {
    return escapeHtml(lineContent)
  }
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

watch(
  () => workspaceStore.isGlobalSearchVisible,
  (val) => {
    if (val) {
      if (workspaceStore.globalSearchInitialQuery) {
        searchQuery.value = workspaceStore.globalSearchInitialQuery
        workspaceStore.globalSearchInitialQuery = ''
      }
      currentPage.value = 1
      nextTick(() => {
        searchInputRef.value?.focus()
        searchInputRef.value?.select()
        if (searchQuery.value.trim()) {
          performSearch(true)
        }
      })
    }
  }
)

onMounted(() => {
  window.addEventListener('keydown', handleGlobalSearchKeydown)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleGlobalSearchKeydown)
  if (debounceTimer) clearTimeout(debounceTimer)
})
</script>

<template>
  <Teleport to="body">
    <Transition
      enter-active-class="transition duration-150 ease-out"
      enter-from-class="opacity-0 scale-98"
      enter-to-class="opacity-100 scale-100"
      leave-active-class="transition duration-100 ease-in"
      leave-from-class="opacity-100 scale-100"
      leave-to-class="opacity-0 scale-98"
    >
      <div
        v-if="workspaceStore.isGlobalSearchVisible"
        class="fixed inset-0 z-50 flex items-start justify-center pt-16 bg-black/65 backdrop-blur-xs px-4"
        @click.self="workspaceStore.closeGlobalSearch"
      >
        <!-- Single Card Container without double-borders/outer padding -->
        <div
          class="w-full max-w-2xl rounded-2xl bg-[#090e17]/95 backdrop-blur-2xl border border-white/[0.12] shadow-[0_25px_60px_-15px_rgba(0,0,0,0.9)] overflow-hidden flex flex-col max-h-[82vh] ring-1 ring-white/[0.08]"
        >
          <!-- Top Glow Accent Line (Emerald Vue/Antigravity Green) -->
          <div class="h-[2px] w-full bg-gradient-to-r from-transparent via-[#42b883] to-transparent shadow-[0_0_12px_#42b883]"></div>

          <!-- Top Search Header -->
          <div class="p-3 border-b border-white/[0.08] bg-[#0c121d]/90 space-y-2.5">
            <div class="flex items-center gap-2">
              <!-- Search Icon / Spinner -->
              <div class="size-7 rounded-xl bg-[#42b883]/10 border border-[#42b883]/20 flex items-center justify-center flex-shrink-0">
                <UIcon v-if="isSearching" name="i-lucide-loader-2" class="size-4 text-[#42b883] animate-spin" />
                <UIcon v-else name="i-lucide-search" class="size-4 text-[#42b883]" />
              </div>

              <!-- Main Search Input -->
              <div class="flex-1 relative flex items-center">
                <input
                  ref="searchInputRef"
                  v-model="searchQuery"
                  @input="handleInput"
                  type="text"
                  placeholder="Cari teks, fungsi, atau variabel di seluruh file workspace... (Ctrl+Shift+F)"
                  class="w-full bg-white/[0.04] text-white text-xs font-mono placeholder:text-slate-500 pl-3 pr-8 py-2 rounded-xl border border-white/[0.08] focus:border-[#42b883]/50 focus:bg-white/[0.06] focus:outline-none transition-all shadow-inner"
                />
                <button
                  v-if="searchQuery"
                  @click="clearQuery"
                  class="absolute right-2 text-slate-500 hover:text-white transition-colors cursor-pointer p-0.5 rounded-full hover:bg-white/10"
                  title="Bersihkan Pencarian"
                >
                  <UIcon name="i-lucide-x" class="size-3.5" />
                </button>
              </div>

              <!-- Modifiers Group (Aa, \b, .*) in Vue Green Rounded Style -->
              <div class="flex items-center p-0.5 rounded-xl bg-white/[0.03] border border-white/[0.08] gap-0.5 flex-shrink-0">
                <button
                  @click="toggleCaseSensitive"
                  class="px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer"
                  :class="isCaseSensitive ? 'bg-[#42b883]/25 text-[#42b883] border border-[#42b883]/40 shadow-xs' : 'text-slate-400 hover:text-slate-200'"
                  title="Case Sensitive (Alt+C)"
                >
                  Aa
                </button>
                <button
                  @click="toggleWholeWord"
                  class="px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer"
                  :class="matchWholeWord ? 'bg-[#42b883]/25 text-[#42b883] border border-[#42b883]/40 shadow-xs' : 'text-slate-400 hover:text-slate-200'"
                  title="Match Whole Word (Alt+W)"
                >
                  \b
                </button>
                <button
                  @click="toggleRegex"
                  class="px-2 py-1 rounded-lg text-[10px] font-mono font-bold transition-all cursor-pointer"
                  :class="isRegex ? 'bg-[#42b883]/25 text-[#42b883] border border-[#42b883]/40 shadow-xs' : 'text-slate-400 hover:text-slate-200'"
                  title="Use Regular Expression (Alt+R)"
                >
                  .*
                </button>
              </div>

              <!-- Toggle Filter Button -->
              <button
                @click="showFilters = !showFilters"
                class="size-8 rounded-xl flex items-center justify-center transition-all cursor-pointer border"
                :class="showFilters || includeFilter || excludeFilter ? 'bg-[#42b883]/20 text-[#42b883] border-[#42b883]/40 shadow-xs' : 'bg-white/[0.03] text-slate-400 hover:text-slate-200 border-white/[0.08] hover:bg-white/[0.06]'"
                title="Filter Tipe File (Include / Exclude)"
              >
                <UIcon name="i-lucide-filter" class="size-3.5" />
              </button>

              <!-- Close Modal Button -->
              <button
                @click="workspaceStore.closeGlobalSearch"
                class="size-8 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer border border-transparent"
                title="Tutup (Esc)"
              >
                <UIcon name="i-lucide-x" class="size-4" />
              </button>
            </div>

            <!-- Secondary Filter Inputs (Include / Exclude patterns) -->
            <div v-if="showFilters" class="grid grid-cols-2 gap-2 pt-1 border-t border-white/[0.04] animate-in fade-in duration-100">
              <div class="flex items-center gap-1.5 bg-white/[0.02] px-2.5 py-1 rounded-xl border border-white/[0.06]">
                <UIcon name="i-lucide-file-plus" class="size-3 text-[#42b883] flex-shrink-0" />
                <input
                  v-model="includeFilter"
                  @input="handleInput"
                  type="text"
                  placeholder="files to include (e.g. *.vue, *.ts)"
                  class="w-full bg-transparent text-[11px] font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none"
                />
              </div>
              <div class="flex items-center gap-1.5 bg-white/[0.02] px-2.5 py-1 rounded-xl border border-white/[0.06]">
                <UIcon name="i-lucide-file-minus" class="size-3 text-rose-400 flex-shrink-0" />
                <input
                  v-model="excludeFilter"
                  @input="handleInput"
                  type="text"
                  placeholder="files to exclude (e.g. *.min.js)"
                  class="w-full bg-transparent text-[11px] font-mono text-slate-200 placeholder:text-slate-600 focus:outline-none"
                />
              </div>
            </div>
          </div>

          <!-- Stats Bar & Pagination Navigation Bar -->
          <div v-if="searchQuery.trim()" class="px-4 py-1.5 bg-[#0a0f19] border-b border-white/[0.06] flex items-center justify-between text-[11px] text-slate-400">
            <!-- Left: Match and File counts with Range info -->
            <div class="flex items-center gap-2 font-mono">
              <span v-if="totalMatches > 0" class="flex items-center gap-1.5">
                <span class="text-[#42b883] font-bold">
                  {{ (currentPage - 1) * PAGE_SIZE + 1 }} - {{ (currentPage - 1) * PAGE_SIZE + totalMatches }}
                </span>
                <span>di</span>
                <span class="text-white font-bold">{{ totalFiles }}</span>
                <span>file</span>
                <span v-if="hasMore || currentPage > 1" class="text-slate-500 font-normal">(Hal. {{ currentPage }})</span>
              </span>
              <span v-else-if="!isSearching" class="text-slate-500">
                Tidak ada hasil
              </span>
            </div>

            <!-- Right: Pagination Buttons and Collapse Toggle -->
            <div class="flex items-center gap-2">
              <button
                v-if="searchResults.length > 0"
                @click="toggleCollapseAll"
                class="hover:text-white transition-colors flex items-center gap-1 text-[10.5px] cursor-pointer mr-2"
                title="Ciutkan / Bentangkan Semua File"
              >
                <UIcon name="i-lucide-chevrons-up-down" class="size-3" />
                Toggle
              </button>

              <!-- Pagination: Sebelumnya (Prev) -->
              <button
                @click="prevPage"
                :disabled="currentPage <= 1 || isSearching"
                class="px-2 py-0.5 rounded-lg text-[11px] flex items-center gap-1 transition-all"
                :class="
                  currentPage > 1 && !isSearching
                    ? 'bg-white/[0.05] hover:bg-[#42b883]/20 text-slate-200 hover:text-[#42b883] border border-white/[0.08] hover:border-[#42b883]/30 cursor-pointer shadow-xs active:scale-95'
                    : 'bg-white/[0.01] text-slate-600 border border-white/[0.03] cursor-not-allowed opacity-50'
                "
                title="Halaman Sebelumnya (Alt+Left)"
              >
                <UIcon name="i-lucide-chevron-left" class="size-3" />
                <span>Sebelumnya</span>
              </button>

              <!-- Pagination: Selanjutnya (Next 100) -->
              <button
                @click="nextPage"
                :disabled="!hasMore || isSearching"
                class="px-2.5 py-0.5 rounded-lg text-[11px] flex items-center gap-1 transition-all font-medium"
                :class="
                  hasMore && !isSearching
                    ? 'bg-[#42b883]/15 hover:bg-[#42b883]/25 text-[#42b883] border border-[#42b883]/40 cursor-pointer shadow-xs active:scale-95'
                    : 'bg-white/[0.01] text-slate-600 border border-white/[0.03] cursor-not-allowed opacity-50'
                "
                title="Cari 100 Hasil Berikutnya (Alt+Right)"
              >
                <span>Selanjutnya</span>
                <UIcon name="i-lucide-chevron-right" class="size-3" />
              </button>
            </div>
          </div>

          <!-- Search Results List Container -->
          <div
            ref="listContainerRef"
            class="flex-1 overflow-y-auto p-2 space-y-2 select-none min-h-[160px] max-h-[58vh]"
          >
            <!-- Empty / Prompt State -->
            <div v-if="!searchQuery.trim()" class="py-12 flex flex-col items-center justify-center text-center space-y-3">
              <div class="size-12 rounded-2xl bg-[#42b883]/10 border border-[#42b883]/20 flex items-center justify-center shadow-lg">
                <UIcon name="i-lucide-search" class="size-6 text-[#42b883]" />
              </div>
              <div>
                <div class="text-sm font-semibold text-slate-200">Pencarian Kode Global (Find in Files)</div>
                <div class="text-xs text-slate-400 mt-1 max-w-sm">
                  Cari teks, nama simbol, fungsi, atau kueri regex di seluruh struktur workspace Anda (100 hasil per halaman).
                </div>
              </div>
              <div class="flex items-center gap-1.5 text-[10.5px] text-slate-400 font-mono pt-2">
                <kbd class="px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.1] text-slate-300">Ctrl</kbd>
                <span>+</span>
                <kbd class="px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.1] text-slate-300">Shift</kbd>
                <span>+</span>
                <kbd class="px-1.5 py-0.5 rounded-md bg-white/[0.06] border border-white/[0.1] text-slate-300">F</kbd>
              </div>
            </div>

            <!-- No Results State -->
            <div v-else-if="!isSearching && searchResults.length === 0" class="py-12 flex flex-col items-center justify-center text-center space-y-2">
              <UIcon name="i-lucide-file-question" class="size-8 text-slate-600" />
              <div class="text-xs font-medium text-slate-400">Tidak ada baris kode yang cocok dengan pencarian</div>
            </div>

            <!-- Results Grouped by File -->
            <div
              v-for="file in searchResults"
              :key="file.filePath"
              class="rounded-xl border border-white/[0.06] bg-white/[0.01] overflow-hidden transition-colors hover:border-white/[0.12]"
            >
              <!-- File Header Row -->
              <div
                @click="toggleFileCollapse(file)"
                class="px-3 py-1.5 bg-white/[0.02] hover:bg-white/[0.05] flex items-center justify-between cursor-pointer border-b border-white/[0.04]"
              >
                <div class="flex items-center gap-2 min-w-0">
                  <UIcon
                    name="i-lucide-chevron-right"
                    class="size-3 text-slate-500 transition-transform duration-150 flex-shrink-0"
                    :class="{ 'rotate-90': !file.isCollapsed }"
                  />
                  <i :class="getNuxtFileIcon(file.fileName)" class="text-xs flex-shrink-0"></i>
                  <span class="text-xs font-semibold text-slate-200 truncate font-mono">{{ file.fileName }}</span>
                  <span class="text-[10px] text-slate-500 truncate font-mono">{{ file.relativePath }}</span>
                </div>

                <span class="px-1.5 py-0.5 rounded-full bg-[#42b883]/15 border border-[#42b883]/30 text-[#42b883] font-mono text-[9.5px] font-bold">
                  {{ file.matches.length }}
                </span>
              </div>

              <!-- Matching Lines in File -->
              <div v-if="!file.isCollapsed" class="divide-y divide-white/[0.02]">
                <div
                  v-for="match in file.matches"
                  :key="`${file.filePath}:${match.lineNumber}:${match.matchStart}`"
                  @click="openMatch(file, match)"
                  class="px-3 py-1.5 flex items-start gap-3 text-xs font-mono cursor-pointer transition-all hover:bg-[#42b883]/10"
                  :class="[
                    flatMatches[selectedMatchIndex]?.file.filePath === file.filePath &&
                    flatMatches[selectedMatchIndex]?.match.lineNumber === match.lineNumber &&
                    flatMatches[selectedMatchIndex]?.match.matchStart === match.matchStart
                      ? 'selected-match-row bg-[#42b883]/15 border-l-2 border-[#42b883]'
                      : 'bg-transparent'
                  ]"
                >
                  <!-- Line Number Badge -->
                  <span class="px-1.5 py-0.5 rounded bg-white/[0.04] text-slate-400 text-[10px] font-semibold flex-shrink-0 min-w-[34px] text-center border border-white/[0.04]">
                    {{ match.lineNumber }}
                  </span>

                  <!-- Code Content with Highlighted Query Word -->
                  <div
                    class="flex-1 text-slate-300 truncate text-[11px] leading-relaxed select-text"
                    v-html="formatHighlightedLine(match.lineContent, match)"
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer Navigation Shortcuts & Next Batch Hint -->
          <div class="px-4 py-2 bg-[#090d15] border-t border-white/[0.06] flex items-center justify-between text-[10.5px] text-slate-500">
            <div class="flex items-center gap-3">
              <span class="flex items-center gap-1">
                <kbd class="px-1 py-0.2 rounded bg-white/[0.06] text-slate-300 font-mono text-[10px]">↑</kbd>
                <kbd class="px-1 py-0.2 rounded bg-white/[0.06] text-slate-300 font-mono text-[10px]">↓</kbd>
                <span>Navigasi</span>
              </span>
              <span class="flex items-center gap-1">
                <kbd class="px-1.5 py-0.2 rounded bg-white/[0.06] text-slate-300 font-mono text-[10px]">Enter</kbd>
                <span>Buka di Editor</span>
              </span>
              <span class="flex items-center gap-1">
                <kbd class="px-1.5 py-0.2 rounded bg-white/[0.06] text-slate-300 font-mono text-[10px]">Esc</kbd>
                <span>Tutup</span>
              </span>
            </div>

            <div class="flex items-center gap-1 text-[#42b883] font-medium text-[10px]">
              <UIcon name="i-lucide-sparkles" class="size-3" />
              <span>Makarya Fast Global Search (100 per halaman)</span>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
:deep(.selected-match-row mark) {
  background-color: rgba(66, 184, 131, 0.45);
  color: #ffffff;
}
</style>
