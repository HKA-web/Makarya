<script setup lang="ts">
import { ref } from 'vue'
import { useProductionRegistry } from './core/registry'
import ModuleErrorBoundary from './core/ModuleErrorBoundary.vue'

const {
  allModules,
  activeModules,
  activeModule,
  activeModuleId,
  setActiveModule,
  toggleModule,
  getModuleComponent
} = useProductionRegistry()

const isManagerOpen = ref(false)
</script>

<template>
  <div class="flex-1 flex flex-col bg-[#090d14] rounded-2xl border border-white/[0.08] shadow-sm overflow-hidden relative select-none">
    <!-- Modular App Header Bar (Full Focus for Module Tabs) -->
    <div class="h-9 px-2 bg-[#0b101b]/95 border-b border-white/[0.06] flex items-center gap-1 overflow-x-auto w-full flex-shrink-0 custom-scroll">
      <button
        v-for="mod in activeModules"
        :key="mod.manifest.id"
        @click="setActiveModule(mod.manifest.id)"
        class="h-7 px-3 rounded-xl flex items-center gap-2 text-xs transition-all cursor-pointer select-none flex-shrink-0 font-medium"
        :class="activeModuleId === mod.manifest.id
          ? 'bg-[#131d2e] text-[#42b883] border border-[#42b883]/30 shadow-xs'
          : 'text-slate-400 hover:text-slate-200 hover:bg-white/[0.04] border border-transparent'"
        :title="mod.manifest.description || mod.manifest.name"
      >
        <UIcon :name="mod.manifest.icon" class="size-3.5" />
        <span class="text-[11px]">{{ mod.manifest.name }}</span>
        <span
          v-if="mod.manifest.badge"
          class="text-[9px] px-1 py-0.2 rounded bg-white/[0.06] text-slate-300 font-mono scale-90"
        >
          {{ mod.manifest.badge }}
        </span>
      </button>
    </div>

    <!-- Active Module Component View Area with Production Error Boundary -->
    <div class="flex-1 overflow-hidden relative bg-[#090d14]">
      <ModuleErrorBoundary
        v-if="activeModule"
        :key="activeModuleId"
        :module-name="activeModule.manifest.name"
        :module-id="activeModuleId"
        @retry="setActiveModule(activeModuleId)"
      >
        <component
          :is="getModuleComponent(activeModuleId)"
          @navigate="setActiveModule"
          @open-module-manager="isManagerOpen = true"
        />
      </ModuleErrorBoundary>

      <div v-else class="h-full flex flex-col items-center justify-center text-slate-500 text-xs space-y-2">
        <UIcon name="i-lucide-inbox" class="size-8 text-slate-600" />
        <span>Tidak ada modul yang aktif. Buka Manajer Modul untuk mengaktifkan.</span>
      </div>
    </div>

    <!-- Module Manager Modal (Lepas-Pasang Modul) -->
    <div
      v-if="isManagerOpen"
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div
        @click.stop
        class="w-full max-w-xl bg-[#0b101b] border border-white/[0.1] rounded-2xl shadow-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-150"
      >
        <!-- Modal Header -->
        <div class="px-5 py-3.5 border-b border-white/[0.08] flex items-center justify-between">
          <div class="flex items-center gap-2">
            <div class="w-7 h-7 rounded-lg bg-indigo-500/15 text-indigo-400 flex items-center justify-center">
              <UIcon name="i-lucide-sliders-horizontal" class="size-4" />
            </div>
            <div>
              <h3 class="text-sm font-bold text-white">Manajer Modul Aplikasi (Enterprise Modular)</h3>
              <p class="text-[10px] text-slate-400">Aktifkan atau nonaktifkan modul sesuka Anda (lepas-pasang instan)</p>
            </div>
          </div>
          <button
            @click="isManagerOpen = false"
            class="w-6 h-6 rounded-lg flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer"
          >
            <UIcon name="i-lucide-x" class="size-4" />
          </button>
        </div>

        <!-- Modal Body: Modules List with Switches & Metadata -->
        <div class="p-5 space-y-3 max-h-[60vh] overflow-y-auto custom-scroll">
          <div
            v-for="mod in allModules"
            :key="mod.manifest.id"
            class="p-3.5 rounded-xl border transition-all flex items-center justify-between"
            :class="mod.enabled
              ? 'bg-white/[0.03] border-white/[0.08]'
              : 'bg-black/20 border-white/[0.04] opacity-60'"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-9 h-9 rounded-xl flex items-center justify-center"
                :class="mod.enabled ? 'bg-[#42b883]/15 text-[#42b883]' : 'bg-white/[0.04] text-slate-500'"
              >
                <UIcon :name="mod.manifest.icon" class="size-4.5" />
              </div>
              <div>
                <div class="flex items-center gap-2">
                  <span class="text-xs font-semibold text-white">{{ mod.manifest.name }}</span>
                  <span
                    v-if="mod.manifest.version"
                    class="text-[9px] px-1.5 py-0.2 rounded bg-indigo-500/15 text-indigo-300 font-mono border border-indigo-500/20"
                  >
                    v{{ mod.manifest.version }}
                  </span>
                  <span
                    v-if="mod.manifest.badge"
                    class="text-[9px] px-1.5 py-0.2 rounded bg-white/[0.06] text-slate-300 font-mono"
                  >
                    {{ mod.manifest.badge }}
                  </span>
                  <span
                    v-if="!mod.enabled"
                    class="text-[9px] text-rose-400 font-mono font-medium"
                  >
                    (Dilepas)
                  </span>
                </div>
                <p class="text-[11px] text-slate-400 leading-tight mt-0.5">{{ mod.manifest.description }}</p>
                <div class="text-[9px] text-slate-500 font-mono mt-1">Author: {{ mod.manifest.author || 'Internal' }} &bull; ID: {{ mod.manifest.id }}</div>
              </div>
            </div>

            <!-- Toggle Switch -->
            <button
              @click="toggleModule(mod.manifest.id)"
              :disabled="mod.manifest.isRemovable === false"
              class="w-11 h-6 rounded-full transition-colors relative cursor-pointer flex-shrink-0 disabled:opacity-40 disabled:cursor-not-allowed"
              :class="mod.enabled ? 'bg-[#42b883]' : 'bg-white/[0.1]'"
              :title="mod.manifest.isRemovable === false ? 'Modul inti tidak dapat dinonaktifkan' : (mod.enabled ? 'Lepas modul' : 'Pasang modul')"
            >
              <span
                class="absolute top-1 w-4 h-4 rounded-full bg-white transition-transform"
                :class="mod.enabled ? 'right-1' : 'left-1'"
              ></span>
            </button>
          </div>


        </div>

        <!-- Modal Footer -->
        <div class="px-5 py-3 border-t border-white/[0.08] bg-black/20 flex justify-end">
          <button
            @click="isManagerOpen = false"
            class="px-4 py-1.5 rounded-xl bg-[#42b883] hover:bg-[#34d399] text-[#090d14] text-xs font-bold transition-all cursor-pointer active:scale-95"
          >
            Selesai
          </button>
        </div>
      </div>
    </div>
  </div>
</template>
