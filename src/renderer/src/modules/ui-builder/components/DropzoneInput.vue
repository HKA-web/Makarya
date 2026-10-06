<template>
  <div class="flex flex-col gap-3">
    <!-- State Kosong: Area Dropzone Membulat -->
    <div
      v-if="!store.uploadedImage && !store.attachedHtml"
      class="relative flex flex-col items-center justify-center p-5 border-2 border-dashed rounded-2xl transition-all duration-300 cursor-pointer text-center group"
      :class="[
        isDragging
          ? 'border-emerald-500 bg-emerald-500/10 scale-[0.99]'
          : 'border-white/10 hover:border-emerald-500/50 bg-[#0e1626]/70 hover:bg-[#0e1626] shadow-sm'
      ]"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="handleDrop"
      @click="triggerFileInput"
    >
      <input
        ref="fileInputRef"
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,.html,.htm,text/html"
        class="hidden"
        @change="handleFileSelect"
      />

      <div class="w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 mb-2.5 group-hover:scale-110 transition-transform shadow-inner">
        <UIcon name="i-lucide-file-code" class="w-6 h-6" />
      </div>

      <div class="font-semibold text-xs text-slate-200 mb-1">
        Tarik & Letakkan Screenshot atau Berkas HTML
      </div>
      <div class="text-[11px] text-slate-400 mb-3">
        Format PNG, JPG, WebP, HTML atau tekan <span class="px-1.5 py-0.5 rounded-md bg-white/10 text-[10px] font-mono border border-white/10 text-slate-300">Ctrl + V</span>
      </div>

      <div class="flex items-center gap-2">
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-slate-200 bg-white/5 hover:bg-white/10 border border-white/10 transition-all cursor-pointer shadow-sm"
        >
          <UIcon name="i-lucide-upload" class="w-3.5 h-3.5" />
          <span>Pilih Berkas</span>
        </button>
        <button
          type="button"
          class="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium text-emerald-400 hover:text-emerald-300 bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/20 transition-all cursor-pointer shadow-sm"
          @click.stop="handleClipboardPaste"
        >
          <UIcon name="i-lucide-clipboard" class="w-3.5 h-3.5" />
          <span>Paste Clipboard</span>
        </button>
      </div>
    </div>

    <!-- State Berkas HTML Dimuat -->
    <div
      v-else-if="store.attachedHtml && !store.uploadedImage"
      class="relative group rounded-2xl border border-amber-500/20 bg-[#0e1626] overflow-hidden p-2.5 flex items-center gap-3 shadow-md"
    >
      <div class="w-14 h-14 rounded-xl bg-amber-500/10 border border-amber-500/20 overflow-hidden flex-shrink-0 flex items-center justify-center text-amber-400 shadow-inner">
        <UIcon name="i-lucide-file-code" class="w-7 h-7" />
      </div>

      <div class="flex-1 min-w-0">
        <div class="text-xs font-semibold text-slate-200 truncate">
          {{ store.attachedHtml.name }}
        </div>
        <div class="text-[11px] text-amber-400 flex items-center gap-1 mt-0.5 font-medium">
          <UIcon name="i-lucide-check-circle-2" class="w-3.5 h-3.5" />
          <span>HTML aktif di Live Preview</span>
        </div>
      </div>

      <div class="flex items-center gap-1">
        <button
          class="w-7 h-7 rounded-xl flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all cursor-pointer"
          title="Hapus Berkas HTML"
          @click="store.clearAttachedHtml"
        >
          <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- State Gambar Sudah Terunggah: Thumbnail Preview Membulat -->
    <div
      v-else-if="store.uploadedImage"
      class="relative group rounded-2xl border border-white/10 bg-[#0e1626] overflow-hidden p-2.5 flex items-center gap-3 shadow-md"
    >
      <div class="w-20 h-14 rounded-xl bg-black/40 border border-white/10 overflow-hidden flex-shrink-0 flex items-center justify-center shadow-inner">
        <img
          :src="store.uploadedImage"
          alt="Screenshot Preview"
          class="max-w-full max-h-full object-contain rounded-lg"
        />
      </div>

      <div class="flex-1 min-w-0">
        <div class="text-xs font-semibold text-slate-200 truncate">
          {{ store.uploadedImageName || 'Screenshot.png' }}
        </div>
        <div class="text-[11px] text-emerald-400 flex items-center gap-1 mt-0.5 font-medium">
          <UIcon name="i-lucide-check-circle-2" class="w-3.5 h-3.5" />
          <span>Gambar siap dianalisis</span>
        </div>
      </div>

      <div class="flex items-center gap-1">
        <button
          class="w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:text-slate-200 hover:bg-white/10 transition-all cursor-pointer"
          title="Lihat Detail Gambar"
          @click="showFullImage = true"
        >
          <UIcon name="i-lucide-eye" class="w-4 h-4" />
        </button>
        <button
          class="w-7 h-7 rounded-xl flex items-center justify-center text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-all cursor-pointer"
          title="Hapus Gambar"
          @click="store.clearUploadedImage"
        >
          <UIcon name="i-lucide-trash-2" class="w-4 h-4" />
        </button>
      </div>
    </div>

    <!-- Modal Pratinjau Gambar Penuh Membulat -->
    <UModal v-model:open="showFullImage">
      <template #content>
        <div class="p-4 bg-[#090d14] rounded-2xl border border-white/10 flex flex-col items-center shadow-2xl">
          <div class="flex items-center justify-between w-full mb-3">
            <span class="text-sm font-semibold text-slate-200">Pratinjau Screenshot Asli</span>
            <button class="w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all" @click="showFullImage = false">
              <UIcon name="i-lucide-x" class="w-4 h-4" />
            </button>
          </div>
          <div class="max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-black/50 p-1">
            <img :src="store.uploadedImage || ''" class="max-w-full h-auto object-contain rounded-lg" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted, onUnmounted } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useUiBuilderStore } from '../stores/useUiBuilderStore'

const store = useUiBuilderStore()
const toast = useToast()
const isDragging = ref(false)
const showFullImage = ref(false)
const fileInputRef = ref<HTMLInputElement | null>(null)

function triggerFileInput(): void {
  fileInputRef.value?.click()
}

function handleFileSelect(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (file) processFile(file)
}

function handleDrop(event: DragEvent): void {
  isDragging.value = false
  const file = event.dataTransfer?.files?.[0]
  if (file) processFile(file)
}

function processFile(file: File): void {
  const isHtml = file.name.endsWith('.html') || file.name.endsWith('.htm') || file.type === 'text/html'
  const isImage = file.type.startsWith('image/') || /\.(png|jpe?g|webp|svg)$/i.test(file.name)

  if (isHtml) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const content = e.target?.result as string
      if (content) {
        store.setAttachedHtml(file.name, content)
        toast.add({
          severity: 'info',
          summary: 'Berkas HTML Dimuat',
          detail: `Berkas "${file.name}" dimuat ke Live Preview`,
          life: 2500
        })
      }
    }
    reader.readAsText(file)
  } else if (isImage) {
    const reader = new FileReader()
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string
      if (dataUrl) {
        store.setUploadedImage(dataUrl, file.name)
        toast.add({
          severity: 'info',
          summary: 'Gambar Dimuat',
          detail: `Gambar "${file.name}" siap dianalisis`,
          life: 2000
        })
      }
    }
    reader.readAsDataURL(file)
  }
}

async function handleClipboardPaste(): Promise<void> {
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith('image/'))
      if (imageType) {
        const blob = await item.getType(imageType)
        processFile(new File([blob], `clipboard-${Date.now()}.png`, { type: imageType }))
        return
      }
    }
    toast.add({
      severity: 'warn',
      summary: 'Tidak Ada Gambar',
      detail: 'Clipboard tidak berisi gambar. Salin screenshot terlebih dahulu.',
      life: 3000
    })
  } catch (err) {
    toast.add({
      severity: 'warn',
      summary: 'Gunakan Ctrl+V',
      detail: 'Tekan Ctrl+V untuk menempelkan gambar dari clipboard.',
      life: 3000
    })
  }
}

function onGlobalPaste(e: ClipboardEvent): void {
  const items = e.clipboardData?.items
  if (!items) return
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.startsWith('image/')) {
      const file = items[i].getAsFile()
      if (file) {
        processFile(file)
        break
      }
    }
  }
}

onMounted(() => {
  window.addEventListener('paste', onGlobalPaste)
})

onUnmounted(() => {
  window.removeEventListener('paste', onGlobalPaste)
})
</script>
