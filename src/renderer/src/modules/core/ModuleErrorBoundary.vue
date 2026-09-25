<script setup lang="ts">
import { ref, onErrorCaptured } from 'vue'

const props = defineProps<{
  moduleName: string
  moduleId: string
}>()

const emit = defineEmits<{
  (e: 'retry'): void
}>()

const error = ref<Error | null>(null)
const errorInfo = ref<string>('')

onErrorCaptured((err: Error, _instance, info: string) => {
  error.value = err
  errorInfo.value = info
  console.error(`[ModuleErrorBoundary] Error in module "${props.moduleName}" (${props.moduleId}):`, err, info)
  return false // prevent error from bubbling up and crashing parent shell
})

function handleReset(): void {
  error.value = null
  errorInfo.value = ''
  emit('retry')
}
</script>

<template>
  <div v-if="error" class="w-full h-full flex flex-col items-center justify-center p-8 text-center select-none bg-[#090d14]">
    <div class="max-w-md w-full p-6 rounded-2xl bg-[#0b101b] border border-rose-500/30 shadow-2xl space-y-4 text-left animate-in fade-in zoom-in-95 duration-150">
      <div class="flex items-center gap-3 border-b border-rose-500/20 pb-3">
        <div class="w-9 h-9 rounded-xl bg-rose-500/15 text-rose-400 flex items-center justify-center flex-shrink-0">
          <UIcon name="i-lucide-alert-triangle" class="size-5" />
        </div>
        <div>
          <h3 class="text-sm font-bold text-white">Modul Mengalami Kesalahan</h3>
          <p class="text-[11px] text-slate-400 font-mono">{{ moduleName }} ({{ moduleId }})</p>
        </div>
      </div>

      <div class="p-3 rounded-xl bg-black/40 border border-white/[0.06] text-xs font-mono text-rose-300 break-words max-h-36 overflow-y-auto custom-scroll">
        {{ error.message || error.toString() }}
      </div>

      <p class="text-[11px] text-slate-400 leading-relaxed">
        Error boundary mencegah seluruh aplikasi crash. Modul lain tetap berfungsi normal.
      </p>

      <div class="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
        <button
          @click="handleReset"
          class="px-4 py-1.5 rounded-xl bg-rose-500 hover:bg-rose-600 text-white text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 active:scale-95 shadow-md shadow-rose-500/20"
        >
          <UIcon name="i-lucide-refresh-cw" class="size-3.5" />
          <span>Muat Ulang Modul</span>
        </button>
      </div>
    </div>
  </div>
  <slot v-else />
</template>
