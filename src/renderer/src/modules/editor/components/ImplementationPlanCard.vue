<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { ParsedImplementationPlan, ImplementationPlanTask } from '@renderer/utils/planParser'
import { formatInlineMarkdown } from '@renderer/utils/markdownParser'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import { useAgentStore } from '@renderer/stores/agentStore'

const props = defineProps<{
  plan: ParsedImplementationPlan
  isGenerating?: boolean
}>()

const emit = defineEmits<{
  (e: 'execute-plan', plan: ParsedImplementationPlan): void
  (e: 'request-revision', plan: ParsedImplementationPlan): void
  (e: 'open-document', filePath: string): void
}>()

const workspaceStore = useWorkspaceStore()
const agentStore = useAgentStore()
const isExpanded = ref<boolean>(true)
const localTasks = ref<ImplementationPlanTask[]>(
  props.plan && Array.isArray(props.plan.tasks) ? JSON.parse(JSON.stringify(props.plan.tasks)) : []
)

watch(
  () => props.plan?.tasks,
  (newTasks) => {
    if (Array.isArray(newTasks)) {
      localTasks.value = JSON.parse(JSON.stringify(newTasks))
    } else {
      localTasks.value = []
    }
  },
  { deep: true }
)

const totalTasks = computed(() => localTasks.value.length)
const completedTasks = computed(() => localTasks.value.filter((t) => t.completed).length)
const progressPercent = computed(() => {
  if (totalTasks.value === 0) return 100
  return Math.round((completedTasks.value / totalTasks.value) * 100)
})

const isAllCompleted = computed(() => totalTasks.value > 0 && completedTasks.value === totalTasks.value)

function toggleTask(task: ImplementationPlanTask): void {
  task.completed = !task.completed
}

async function handleOpenFile(): Promise<void> {
  const rawPath = props.plan.filePath || '.makarya/plans/implementation_plan.md'
  const rootPath = agentStore.connectedWorkspacePath || workspaceStore.activeRootPath || (workspaceStore.workspaceRoots[0]?.path) || ''

  let fullPath = rawPath
  if (rootPath && !rawPath.match(/^([a-zA-Z]:|[\\/])/)) {
    const sep = rootPath.includes('\\') ? '\\' : '/'
    fullPath = `${rootPath.replace(/[\\/]+$/, '')}${sep}${rawPath.replace(/^[\\/]+/, '')}`
  }

  const fileName = fullPath.split(/[/\\]/).pop() || 'implementation_plan.md'

  // If the file does not exist on disk yet, save raw plan content directly so it can be viewed and edited
  if (window.makaryaAPI?.readFile && window.makaryaAPI?.writeFile) {
    const check = await window.makaryaAPI.readFile(fullPath)
    if (check.error && props.plan.rawContent) {
      await window.makaryaAPI.writeFile(fullPath, props.plan.rawContent)
      await workspaceStore.refreshFileTree()
    }
  }

  await workspaceStore.openFile(fullPath, fileName)
  emit('open-document', fullPath)
}

function handleExecutePlan(): void {
  emit('execute-plan', {
    ...props.plan,
    tasks: localTasks.value
  })
}

function handleRequestRevision(): void {
  emit('request-revision', props.plan)
}

function renderMarkdown(text?: any): string {
  if (text === null || text === undefined) return ''
  const str = typeof text === 'string' ? text : String(text)
  if (!str) return ''
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/`([^`]+)`/g, '<code class="bg-[#42b883]/10 text-[#42b883] border border-[#42b883]/20 px-1.5 py-0.5 rounded text-[10px] font-mono">$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong class="font-semibold text-zinc-100">$1</strong>')
    .replace(/\*([^*]+)\*/g, '<em class="italic text-zinc-300">$1</em>')
    .replace(/\n/g, '<br />')
}

const formatInlineMarkdown = renderMarkdown
</script>

<template>
  <div
    class="my-2 rounded-2xl border border-emerald-500/30 bg-gradient-to-b from-[#0c1622] via-[#09101a] to-[#070b12] shadow-lg shadow-emerald-950/20 overflow-hidden text-[11px] transition-all duration-200"
  >
    <!-- Header Banner -->
    <div
      class="px-3.5 py-2.5 bg-gradient-to-r from-emerald-950/40 via-[#0e1c28]/60 to-transparent border-b border-emerald-500/20 flex items-center justify-between gap-2 select-none cursor-pointer"
      @click="isExpanded = !isExpanded"
    >
      <div class="flex items-center gap-2 min-w-0">
        <!-- Antigravity Plan Badge -->
        <span
          class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md text-[9px] font-bold tracking-wider uppercase bg-emerald-500/15 text-[#42b883] border border-emerald-500/30 shadow-xs flex-shrink-0"
        >
          <UIcon name="i-lucide-clipboard-list" class="size-3 text-[#42b883]" />
          <span>Implementation Plan</span>
        </span>

        <h4 class="font-semibold text-slate-100 truncate text-[11px]">
          {{ plan.title }}
        </h4>
      </div>

      <div class="flex items-center gap-2 flex-shrink-0">
        <!-- Progress Counter -->
        <span
          v-if="totalTasks > 0"
          class="text-[9px] font-mono font-medium px-2 py-0.5 rounded-full"
          :class="isAllCompleted ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : 'bg-slate-800/80 text-slate-300 border border-white/[0.08]'"
        >
          {{ completedTasks }}/{{ totalTasks }} Selesai
        </span>

        <!-- Toggle Chevron -->
        <UIcon
          :name="isExpanded ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          class="size-3.5 text-slate-400 hover:text-slate-200 transition-colors"
        />
      </div>
    </div>

    <!-- Progress Bar -->
    <div v-if="totalTasks > 0" class="w-full bg-slate-800/50 h-1 overflow-hidden">
      <div
        class="h-full bg-gradient-to-r from-[#42b883] to-[#34d399] transition-all duration-300"
        :style="{ width: `${progressPercent}%` }"
      ></div>
    </div>

    <!-- Card Body -->
    <div v-show="isExpanded" class="p-3.5 space-y-3 select-text">
      <!-- Summary / Goal -->
      <div v-if="plan.summary" class="text-slate-300 leading-relaxed text-[11px] bg-black/20 p-2 rounded-lg border border-white/[0.04]">
        <p v-html="renderMarkdown(plan.summary)"></p>
      </div>

      <!-- File Path Document Badge (If saved to disk) -->
      <div
        v-if="plan.filePath"
        @click="handleOpenFile"
        class="flex items-center justify-between gap-2 p-1.5 px-2.5 rounded-lg bg-[#0e1726]/80 hover:bg-[#121f33] border border-emerald-500/20 hover:border-emerald-500/40 text-[10px] cursor-pointer transition-colors group"
      >
        <div class="flex items-center gap-1.5 truncate text-slate-300">
          <UIcon name="i-lucide-file-text" class="size-3 text-emerald-400 flex-shrink-0" />
          <span class="text-slate-400">Dokumen Rencana:</span>
          <span class="font-mono text-emerald-300 truncate group-hover:underline">{{ plan.filePath }}</span>
        </div>
        <button
          type="button"
          @click.stop="handleOpenFile"
          class="flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/15 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/30 text-[9px] font-medium transition-colors cursor-pointer flex-shrink-0"
          title="Buka dokumen rencana implementasi di editor"
        >
          <UIcon name="i-lucide-external-link" class="size-2.5" />
          <span>Buka di Editor</span>
        </button>
      </div>

      <!-- Checklist of Tasks -->
      <div v-if="localTasks.length > 0" class="space-y-1.5">
        <div class="flex items-center justify-between text-[10px] text-slate-400 font-semibold px-0.5">
          <span class="flex items-center gap-1">
            <UIcon name="i-lucide-list-todo" class="size-3 text-emerald-400" />
            Tahapan Pekerjaan (Tasks)
          </span>
          <span class="text-[9px] text-slate-500">{{ progressPercent }}% Selesai</span>
        </div>

        <div class="space-y-1 bg-[#06090f]/70 p-2 rounded-xl border border-white/[0.05]">
          <div
            v-for="(task, idx) in localTasks"
            :key="task.id || idx"
            class="flex items-start gap-2 p-1.5 rounded-lg hover:bg-white/[0.04] transition-colors cursor-pointer group select-none"
            @click="toggleTask(task)"
          >
            <input
              type="checkbox"
              :checked="task.completed"
              class="mt-0.5 size-3.5 rounded border-slate-600 bg-slate-900 text-emerald-500 focus:ring-emerald-500/20 cursor-pointer flex-shrink-0 accent-[#42b883]"
              @click.stop="toggleTask(task)"
            />
            <div class="flex-1 min-w-0 text-[11px] leading-snug">
              <span
                class="transition-colors"
                :class="task.completed ? 'line-through text-slate-500' : 'text-slate-200 group-hover:text-emerald-300'"
                v-html="renderMarkdown(task.title)"
              ></span>
            </div>
          </div>
        </div>
      </div>

      <!-- Proposed Changes / Affected Files -->
      <div v-if="plan.affectedFiles && plan.affectedFiles.length > 0" class="space-y-1">
        <div class="text-[10px] text-slate-400 font-semibold flex items-center gap-1 px-0.5">
          <UIcon name="i-lucide-files" class="size-3 text-cyan-400" />
          <span>Berkas yang Dibuat / Dimodifikasi:</span>
        </div>
        <div class="flex flex-wrap gap-1.5">
          <span
            v-for="file in plan.affectedFiles"
            :key="file"
            class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#0e1928] border border-cyan-500/25 text-cyan-300 font-mono text-[9px] hover:border-cyan-400 transition-colors"
          >
            <UIcon name="i-lucide-file-code" class="size-2.5 text-cyan-400" />
            <span>{{ file }}</span>
          </span>
        </div>
      </div>

      <!-- Verification Plan (If available) -->
      <div v-if="plan.verification && plan.verification.length > 0" class="space-y-1">
        <div class="text-[10px] text-slate-400 font-semibold flex items-center gap-1 px-0.5">
          <UIcon name="i-lucide-shield-check" class="size-3 text-amber-400" />
          <span>Rencana Verifikasi & Testing:</span>
        </div>
        <ul class="list-disc list-inside space-y-0.5 text-[10px] text-slate-300/90 pl-1">
          <li v-for="(v, vIdx) in plan.verification" :key="vIdx" v-html="renderMarkdown(v)"></li>
        </ul>
      </div>

      <!-- Antigravity Action Bar -->
      <div class="pt-2 border-t border-white/[0.08] flex items-center gap-2 select-none">
        <!-- Execute / Proceed Button -->
        <button
          type="button"
          @click.stop="handleExecutePlan"
          :disabled="isGenerating"
          class="flex-1 py-1.5 px-3.5 rounded-xl bg-gradient-to-r from-[#42b883] to-[#2eb376] hover:from-[#4ece94] hover:to-[#34c784] text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1.5 shadow-md shadow-emerald-500/20 transition-all cursor-pointer hover:brightness-105 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Eksekusi seluruh tahapan rencana implementasi secara otomatis"
        >
          <UIcon v-if="isGenerating" name="i-lucide-loader-2" class="size-3.5 animate-spin text-slate-950" />
          <UIcon v-else name="i-lucide-play" class="size-3.5 text-slate-950 fill-current" />
          <span>Eksekusi</span>
        </button>

        <!-- Request Revision Button -->
        <button
          type="button"
          @click.stop="handleRequestRevision"
          :disabled="isGenerating"
          class="py-1.5 px-3 rounded-xl bg-[#0e1626] hover:bg-[#131e33] border border-white/[0.1] hover:border-emerald-500/40 text-slate-300 hover:text-white font-medium text-[11px] flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
          title="Minta agen merevisi atau menyesuaikan rencana sebelum eksekusi"
        >
          <UIcon name="i-lucide-message-square-diff" class="size-3.5 text-slate-400" />
          <span>Minta Revisi</span>
        </button>
      </div>
    </div>
  </div>
</template>
