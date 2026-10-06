<script setup lang="ts">
import logoImg from '@renderer/assets/logo.png'

const emit = defineEmits<{
  (e: 'navigate', moduleId: string): void
  (e: 'open-module-manager'): void
}>()
</script>

<template>
  <div class="w-full h-full flex flex-col items-center justify-center p-8 text-center select-none overflow-y-auto custom-scroll">
    <div class="max-w-xl mx-auto space-y-6 animate-in fade-in zoom-in-95 duration-200">
      <!-- Glow Aura & Makarya Logo -->
      <div class="relative mx-auto w-24 h-24 flex items-center justify-center">
        <div class="absolute -inset-2 bg-gradient-to-r from-[#42b883]/30 via-[#34d399]/20 to-[#42b883]/30 rounded-3xl blur-xl opacity-75 animate-pulse"></div>
        <div class="relative w-24 h-24 rounded-2xl bg-[#0c121d] border border-[#42b883]/40 p-2 shadow-2xl flex items-center justify-center">
          <img :src="logoImg" alt="Makarya" class="w-full h-full object-contain" />
        </div>
      </div>

      <div class="space-y-2">
        <div class="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#42b883]/15 border border-[#42b883]/30 text-[#42b883] text-xs font-semibold">
          <UIcon name="i-lucide-sparkles" class="size-3.5" />
          <span>Siap Digunakan</span>
        </div>
        <h2 class="text-2xl font-black text-white tracking-tight">
          Selamat Datang di Makarya App
        </h2>
        <p class="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
          Aplikasi sudah siap digunakan. Mulai eksplorasi dan tambahkan berbagai fitur baru sesuai dengan kebutuhan Anda.
        </p>
      </div>

      <!-- Action Button -->
      <div class="flex items-center justify-center gap-3 pt-2">
        <button
          @click="emit('open-module-manager')"
          class="px-5 py-2.5 rounded-full text-xs font-bold bg-[#42b883] hover:bg-[#34d399] text-[#090d14] shadow-lg shadow-[#42b883]/30 transition-all cursor-pointer active:scale-95 flex items-center gap-2"
        >
          <UIcon name="i-lucide-sliders-horizontal" class="size-4" />
          <span>Buka Manajer Modul</span>
        </button>
      </div>
    </div>
  </div>
</template>
