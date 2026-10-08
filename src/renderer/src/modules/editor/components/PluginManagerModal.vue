<script setup lang="ts">
import { ref, computed } from 'vue'
import { usePluginStore } from '@renderer/stores/pluginStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'

const pluginStore = usePluginStore()
const workspaceStore = useWorkspaceStore()

type TabMode = 'installed' | 'sdk_docs'
const activeTab = ref<TabMode>('installed')

const searchFilter = ref('')
const selectedCategory = ref<string>('all')

interface CategoryItem {
  id: string
  label: string
  icon: string
  iconColor: string
}

const categories: CategoryItem[] = [
  { id: 'all', label: 'Semua Kategori', icon: 'i-lucide-layout-grid', iconColor: 'text-[#42b883]' },
  { id: 'editor', label: 'Editor', icon: 'i-lucide-file-code-2', iconColor: 'text-blue-400' },
  { id: 'tools', label: 'Utilitas & Tools', icon: 'i-lucide-wrench', iconColor: 'text-amber-400' },
  { id: 'ai', label: 'AI & Otomasi', icon: 'i-lucide-bot', iconColor: 'text-cyan-400' },
  { id: 'other', label: 'Lainnya', icon: 'i-lucide-package', iconColor: 'text-purple-400' }
]

function getCategoryCount(catId: string): number {
  if (catId === 'all') return pluginStore.allPlugins.length
  return pluginStore.allPlugins.filter((p) => p.manifest.category === catId).length
}

function getCategoryIcon(catId?: string): string {
  const found = categories.find((c) => c.id === catId)
  return found ? found.icon : 'i-lucide-package'
}

function getCategoryLabel(catId?: string): string {
  const found = categories.find((c) => c.id === catId)
  return found ? found.label : 'Lainnya'
}

const filteredPlugins = computed(() => {
  let list = pluginStore.allPlugins
  if (selectedCategory.value !== 'all') {
    list = list.filter((p) => p.manifest.category === selectedCategory.value)
  }
  if (searchFilter.value.trim()) {
    const q = searchFilter.value.toLowerCase()
    list = list.filter(
      (p) =>
        p.manifest.name.toLowerCase().includes(q) ||
        p.manifest.description.toLowerCase().includes(q) ||
        p.manifest.id.toLowerCase().includes(q)
    )
  }
  return list
})

async function handleTogglePlugin(pluginId: string): Promise<void> {
  await pluginStore.togglePlugin(pluginId)
}

function handleClose(): void {
  pluginStore.isPluginManagerOpen = false
}
</script>

<template>
  <div v-if="pluginStore.isPluginManagerOpen"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200"
    @click.self="handleClose">
    <div
      class="bg-[#12161f]/95 border border-white/10 rounded-2xl w-full max-w-4xl h-[85vh] max-h-[750px] flex flex-col shadow-2xl overflow-hidden">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
        <div class="flex items-center gap-3">
          <div
            class="size-9 rounded-xl bg-[#42b883]/15 border border-[#42b883]/30 flex items-center justify-center text-[#42b883]">
            <UIcon name="i-lucide-puzzle" class="size-5" />
          </div>
          <div>
            <h2 class="text-sm font-semibold text-white tracking-wide flex items-center gap-2">
              Pengelola Plugin Makarya IDE
            </h2>
            <p class="text-xs text-slate-400">Kelola dan kembangkan plugin kustom asli untuk Makarya IDE.</p>
          </div>
        </div>
        <button @click="handleClose"
          class="size-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer">
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
      </div>

      <!-- Main Layout -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Sidebar Navigation -->
        <div class="w-60 border-r border-white/[0.08] p-3 flex flex-col gap-1 bg-white/[0.01]">
          <button @click="activeTab = 'installed'"
            class="px-3 py-2 rounded-lg text-xs font-medium flex items-center justify-between transition-colors cursor-pointer"
            :class="activeTab === 'installed'
                ? 'bg-white/[0.08] text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              ">
            <div class="flex items-center gap-2.5">
              <UIcon name="i-lucide-check-circle-2" class="size-4 text-[#42b883]" />
              <span>Plugin Terpasang</span>
            </div>
            <span class="text-[10px] px-1.5 py-0.5 rounded bg-white/10 text-slate-300 font-mono">
              {{ pluginStore.allPlugins.length }}
            </span>
          </button>

          <button @click="activeTab = 'sdk_docs'"
            class="px-3 py-2 rounded-lg text-xs font-medium flex items-center gap-2.5 transition-colors cursor-pointer"
            :class="activeTab === 'sdk_docs'
                ? 'bg-white/[0.08] text-white'
                : 'text-slate-400 hover:text-white hover:bg-white/[0.04]'
              ">
            <UIcon name="i-lucide-code-2" class="size-4 text-cyan-400" />
            <span>Developer SDK Guide</span>
          </button>

          <!-- Category Filter Section -->
          <div class="mt-4 pt-4 border-t border-white/[0.08]" v-if="activeTab === 'installed'">
            <div class="flex items-center justify-between px-2 mb-2">
              <span class="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">Kategori</span>
            </div>
            <div class="space-y-0.5">
              <button v-for="cat in categories" :key="cat.id" @click="selectedCategory = cat.id"
                class="w-full text-left px-2.5 py-1.5 rounded-lg text-xs transition-colors flex items-center justify-between cursor-pointer"
                :class="selectedCategory === cat.id
                    ? 'text-white font-medium bg-white/[0.06]'
                    : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.02]'
                  ">
                <div class="flex items-center gap-2.5">
                  <UIcon :name="cat.icon" class="size-4"
                    :class="selectedCategory === cat.id ? cat.iconColor : 'text-slate-400'" />
                  <span>{{ cat.label }}</span>
                </div>
                <span class="text-[10px] px-1.5 py-0.5 rounded font-mono text-slate-500">
                  {{ getCategoryCount(cat.id) }}
                </span>
              </button>
            </div>
          </div>
        </div>

        <!-- Content Area -->
        <div class="flex-1 flex flex-col overflow-hidden p-6 bg-[#0c0f17]/40">
          <!-- 1. TAB INSTALLED -->
          <template v-if="activeTab === 'installed'">
            <!-- Search & Filter Bar -->
            <div class="flex items-center gap-3 mb-4">
              <div class="flex-1 relative">
                <UIcon name="i-lucide-search" class="size-4 text-slate-400 absolute left-3 top-2.5" />
                <input v-model="searchFilter" type="text"
                  placeholder="Cari plugin terpasang berdasarkan nama atau deskripsi..."
                  class="w-full pl-9 pr-4 py-2 bg-white/[0.04] border border-white/10 rounded-xl text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#42b883]/50 focus:ring-1 focus:ring-[#42b883]/50 transition-all" />
              </div>
              <button v-if="selectedCategory !== 'all' || searchFilter"
                @click="selectedCategory = 'all'; searchFilter = ''"
                class="px-3 py-2 bg-white/[0.04] hover:bg-white/10 border border-white/10 rounded-xl text-xs text-slate-300 hover:text-white flex items-center gap-1.5 transition-colors cursor-pointer">
                <UIcon name="i-lucide-rotate-ccw" class="size-3.5" />
                <span>Reset Filter</span>
              </button>
            </div>

            <!-- Plugin List -->
            <div class="flex-1 overflow-y-auto space-y-3 pr-1 custom-scroll">
              <div v-for="p in filteredPlugins" :key="p.manifest.id"
                class="bg-white/[0.02] border border-white/[0.08] hover:border-white/15 rounded-xl p-4 flex items-start justify-between gap-4 transition-all">
                <div class="flex items-start gap-3.5 flex-1">
                  <div
                    class="size-10 rounded-xl bg-[#42b883]/10 border border-[#42b883]/20 flex items-center justify-center text-[#42b883] flex-shrink-0 mt-0.5">
                    <UIcon :name="p.manifest.icon || 'i-lucide-puzzle'" class="size-5" />
                  </div>
                  <div class="flex-1">
                    <div class="flex items-center gap-2">
                      <h3 class="text-xs font-semibold text-white">{{ p.manifest.name }}</h3>
                      <span class="text-[9px] px-1.5 py-0.2 rounded border font-mono uppercase" :class="p.source === 'builtin'
                          ? 'bg-blue-500/10 text-blue-400 border-blue-500/20'
                          : 'bg-purple-500/10 text-purple-400 border-purple-500/20'
                        ">
                        {{ p.source }}
                      </span>
                      <span
                        class="text-[9px] px-1.5 py-0.2 rounded border font-mono bg-white/[0.04] text-slate-400 border-white/10 flex items-center gap-1">
                        <UIcon :name="getCategoryIcon(p.manifest.category)" class="size-3" />
                        {{ getCategoryLabel(p.manifest.category) }}
                      </span>
                    </div>
                    <p class="text-xs text-slate-400 mt-1 leading-relaxed">{{ p.manifest.description }}</p>

                    <!-- Contributions Badges -->
                    <div class="flex items-center gap-2 mt-2.5">
                      <span v-if="p.manifest.contributes?.commands?.length"
                        class="text-[10px] text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/5 flex items-center gap-1">
                        <UIcon name="i-lucide-terminal" class="size-3 text-[#42b883]" />
                        {{ p.manifest.contributes.commands.length }} Perintah
                      </span>
                      <span v-if="p.manifest.contributes?.aiTools?.length"
                        class="text-[10px] text-slate-400 bg-white/[0.04] px-2 py-0.5 rounded border border-white/5 flex items-center gap-1">
                        <UIcon name="i-lucide-bot" class="size-3 text-cyan-400" />
                        {{ p.manifest.contributes.aiTools.length }} AI Tool
                      </span>
                      <span class="text-[10px] text-slate-500">Oleh {{ p.manifest.author || 'Makarya Core' }}</span>
                    </div>
                  </div>
                </div>

                <!-- Toggle Switch -->
                <div class="flex items-center gap-3">
                  <span class="text-xs font-medium" :class="p.enabled ? 'text-[#42b883]' : 'text-slate-500'">
                    {{ p.enabled ? 'Aktif' : 'Nonaktif' }}
                  </span>
                  <button @click="handleTogglePlugin(p.manifest.id)"
                    class="w-11 h-6 rounded-full transition-colors relative flex items-center px-0.5 focus:outline-none cursor-pointer"
                    :class="p.enabled ? 'bg-[#42b883]' : 'bg-white/10'">
                    <span class="size-5 rounded-full bg-white transition-transform transform shadow-sm"
                      :class="p.enabled ? 'translate-x-5' : 'translate-x-0'"></span>
                  </button>
                </div>
              </div>

              <div v-if="filteredPlugins.length === 0" class="py-16 text-center text-slate-400 text-xs">
                Tidak ada plugin yang cocok dengan filter atau pencarian Anda.
              </div>
            </div>
          </template>

          <!-- 2. TAB DEVELOPER SDK GUIDE -->
          <template v-else-if="activeTab === 'sdk_docs'">
            <div class="flex-1 overflow-y-auto pr-1 custom-scroll space-y-4 text-slate-300 text-xs leading-relaxed">
              <div class="bg-[#42b883]/10 border border-[#42b883]/20 rounded-xl p-4">
                <h3 class="text-sm font-semibold text-[#42b883] flex items-center gap-2">
                  <UIcon name="i-lucide-sparkles" class="size-4" />
                  Makarya Plugin SDK Architecture
                </h3>
                <p class="mt-1 text-slate-300">
                  Makarya IDE menyediakan SDK mandiri (<code class="text-[#42b883] font-mono">@makarya/sdk</code>) yang
                  memungkinkan pengembang pihak ketiga membuat plugin kustom yang 100% kompatibel tanpa perlu
                  memodifikasi kode inti editor.
                </p>
              </div>

              <div class="bg-white/[0.02] border border-white/[0.08] rounded-xl p-4 space-y-3">
                <h4 class="font-semibold text-white flex items-center gap-2">
                  <UIcon name="i-lucide-layers" class="size-4 text-[#42b883]" />
                  Contoh Pembuatan Plugin Kustom
                </h4>
                <div
                  class="bg-[#0a0d14] rounded-lg p-3 border border-white/5 font-mono text-[11px] text-slate-300 overflow-x-auto">
                  <pre><code>import type { MakaryaPlugin, PluginContext } from '@makarya/sdk'

export const MyCustomPlugin: MakaryaPlugin = {
  manifest: {
    id: 'my-org.my-plugin',
    name: 'My Custom Productivity Plugin',
    version: '1.0.0',
    description: 'Menambahkan tool status bar & AI Copilot kustom.',
    category: 'tools'
  },
  activate(context: PluginContext) {
    // 1. Tambah Status Bar
    const item = context.ui.createStatusBarItem({
      id: 'my-status-item',
      text: '🚀 My Plugin: Active',
      alignment: 'right'
    })
    item.show()
    context.subscriptions.push(item)

    // 2. Daftarkan Perintah (Command)
    context.subscriptions.push(
      context.commands.registerCommand('myPlugin.sayHello', () => {
        context.ui.showToast({
          title: 'Hello from Plugin!',
          message: 'Plugin custom berhasil dijalankan.',
          type: 'success'
        })
      })
    )

    // 3. Daftarkan AI Agent Tool
    context.subscriptions.push(
      context.agent.registerTool({
        name: 'custom_data_fetcher',
        description: 'Membaca data custom untuk AI agent',
        parameters: { type: 'object', properties: {} },
        execute: async () => ({ status: 'success', data: [1, 2, 3] })
      })
    )
  }
}</code></pre>
                </div>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scroll::-webkit-scrollbar {
  width: 4px;
}

.custom-scroll::-webkit-scrollbar-track {
  background: transparent;
}

.custom-scroll::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.1);
  border-radius: 4px;
}

.custom-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.2);
}
</style>
