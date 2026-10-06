<template>
  <div class="h-full flex flex-col bg-[#090d14] overflow-hidden">
    <!-- Chat History List -->
    <div ref="chatScrollRef" class="flex-1 overflow-y-auto p-3 flex flex-col gap-3">
      <!-- Pesan Selamat Datang / Panduan Awal Membulat -->
      <div v-if="store.chatMessages.length === 0" class="p-4 rounded-2xl border border-white/5 bg-[#0e1626]/60 text-slate-300 text-xs leading-relaxed shadow-sm">
        <div class="font-semibold text-emerald-400 mb-1.5 flex items-center gap-1.5">
          <div class="w-5 h-5 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <UIcon name="i-lucide-sparkles" class="w-3.5 h-3.5" />
          </div>
          <span>Panduan UI Slicing:</span>
        </div>
        <ol class="list-decimal list-inside space-y-1 text-slate-400 text-[11px] leading-normal">
          <li>Unggah screenshot atau paste langsung dari clipboard (<span class="px-1 py-0.5 rounded bg-white/10 text-[10px] font-mono border border-white/10 text-slate-200">Ctrl + V</span>).</li>
          <li>Ketik instruksi khusus (opsional) atau klik tombol <b>Generate UI</b>.</li>
          <li>AI akan mengekstrak aset dan menghasilkan 4 varian kode secara bersamaan.</li>
          <li>Kirim pesan lanjutan / paste gambar revisi (misal: <i>"Ubah warna header"</i>).</li>
        </ol>
      </div>

      <!-- Deretan Pesan Chat Membulat -->
      <div
        v-for="msg in store.chatMessages"
        :key="msg.id"
        class="flex flex-col gap-1 text-xs"
        :class="msg.role === 'user' ? 'items-end' : 'items-start'"
      >
        <div class="flex items-center gap-1.5 text-[10px] text-slate-500 px-1.5">
          <UIcon :name="msg.role === 'user' ? 'i-lucide-user' : 'i-lucide-bot'" class="w-3 h-3" />
          <span>{{ msg.role === 'user' ? 'Anda' : 'Makarya UI Specialist' }}</span>
          <span>•</span>
          <span>{{ msg.timestamp }}</span>
        </div>

        <div
          class="p-3.5 leading-relaxed shadow-md"
          :class="[
            msg.role === 'user'
              ? 'bg-emerald-600 text-white rounded-2xl rounded-tr-xs max-w-[85%]'
              : 'bg-[#131d2e] border border-white/10 text-slate-200 rounded-2xl rounded-tl-xs max-w-[90%]'
          ]"
        >
          <!-- Thumbnail Gambar jika pesan menyertakan gambar -->
          <div
            v-if="msg.imageUrl"
            class="mb-2.5 rounded-xl overflow-hidden border border-white/10 max-w-[200px] shadow-sm cursor-pointer group relative"
            @click="previewImageUrl = msg.imageUrl || null"
            title="Klik untuk memperbesar gambar"
          >
            <img :src="msg.imageUrl" class="w-full h-auto object-cover rounded-xl group-hover:scale-105 transition-transform duration-200" />
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
              <UIcon name="i-lucide-zoom-in" class="w-4 h-4" />
            </div>
          </div>

          <!-- Thought / Reasoning AI jika ada -->
          <div v-if="msg.thoughts" class="mb-2 p-2.5 rounded-xl bg-black/40 border border-white/5 text-[11px] text-slate-400">
            <div class="font-medium text-amber-400 mb-0.5 flex items-center gap-1.5">
              <UIcon name="i-lucide-brain" class="w-3.5 h-3.5" />
              <span>Proses Berpikir Model:</span>
            </div>
            <div class="whitespace-pre-wrap">{{ msg.thoughts }}</div>
          </div>

          <!-- Structured File Save Info if present -->
          <div v-if="msg.content.includes('Lokasi berkas:')" class="space-y-2">
            <div class="font-semibold text-emerald-400 flex items-center gap-1.5">
              <UIcon name="i-lucide-check-circle-2" class="w-4 h-4 text-emerald-400" />
              <span>Komponen berhasil disimpan!</span>
            </div>
            <div class="p-2.5 rounded-xl bg-black/40 border border-white/5 space-y-1">
              <div class="text-[11px] text-slate-300 flex items-center gap-1.5 font-medium">
                <UIcon name="i-lucide-folder" class="w-3.5 h-3.5 text-amber-400" />
                <span>Lokasi berkas:</span>
              </div>
              <div class="font-mono text-[10px] text-emerald-300 break-all select-text pl-5">
                {{ msg.content.split('Lokasi berkas:')[1]?.replace(/[`\n]/g, '').trim() || msg.content }}
              </div>
            </div>
          </div>

          <div v-else class="whitespace-pre-wrap">{{ msg.content }}</div>
        </div>
      </div>

      <!-- State Streaming Aktif Membulat -->
      <div v-if="store.isGenerating" class="flex items-center gap-2 text-xs text-emerald-400 p-2.5 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 animate-pulse shadow-sm">
        <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
        <span>{{ store.activeActionText || 'Sedang menghasilkan varian kode...' }}</span>
      </div>
    </div>

    <!-- Hidden File Input for Image & HTML Attachment -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/png,image/jpeg,image/webp,image/svg+xml,.html,.htm,text/html"
      class="hidden"
      @change="handleFileInputChange"
    />

    <!-- Area Input Prompt & Tombol Generate Membulat -->
    <div class="p-3 border-t border-white/10 bg-[#0c111a]/80 backdrop-blur relative">
      <!-- Floating Model Settings Menu (Persis seperti di Editor / AgentPanel) -->
      <div
        v-if="isSettingsMenuOpen"
        class="mb-2 p-3 rounded-2xl bg-[#0c121d] border border-white/10 shadow-2xl space-y-2.5 animate-in fade-in zoom-in-95 duration-150 text-left select-none"
      >
        <div class="flex items-center justify-between pb-1.5 border-b border-white/[0.06]">
          <span class="text-xs font-semibold text-white flex items-center gap-1.5">
            <UIcon name="i-lucide-cpu" class="size-3.5 text-[#42b883]" />
            Model AI
          </span>
          <div class="flex items-center gap-1.5">
            <span class="text-[9px] text-slate-500 font-mono">{{ filteredModels.length }} model</span>
            <button
              @click="isSettingsMenuOpen = false"
              class="w-5 h-5 rounded-full hover:bg-white/10 text-slate-400 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
            >
              <UIcon name="i-lucide-x" class="size-3" />
            </button>
          </div>
        </div>

        <!-- Search Model Input -->
        <div class="relative">
          <input
            v-model="modelSearchQuery"
            type="text"
            placeholder="Cari model..."
            class="w-full bg-[#131d2e] border border-white/[0.08] focus:border-[#42b883]/60 text-slate-200 text-[11px] rounded-lg pl-6 pr-2 py-1 placeholder-slate-500 focus:outline-none font-sans"
          />
          <UIcon name="i-lucide-search" class="size-3 text-slate-500 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
        </div>

        <!-- Model List -->
        <div class="max-h-44 overflow-y-auto space-y-0.5 custom-scroll pr-1">
          <button
            v-for="m in filteredModels"
            :key="m"
            @click="selectModel(m)"
            class="w-full px-2 py-1.5 rounded-lg text-left text-[11px] transition-all flex items-center justify-between group cursor-pointer"
            :class="store.currentModel === m
              ? 'bg-[#42b883]/15 text-[#42b883] font-semibold border border-[#42b883]/30'
              : 'text-slate-300 hover:bg-white/[0.04] border border-transparent'"
          >
            <span class="truncate pr-1 font-mono text-[10px]">{{ m }}</span>
            <UIcon v-if="store.currentModel === m" name="i-lucide-check-circle-2" class="size-3 text-[#42b883] flex-shrink-0" />
          </button>

          <div v-if="filteredModels.length === 0" class="py-2.5 text-center text-slate-500 text-[10px] space-y-1">
            <p>{{ agentStore.availableModels.length === 0 ? 'Belum ada model dari 9router' : 'Model tidak cocok dengan pencarian' }}</p>
            <button
              v-if="agentStore.availableModels.length === 0"
              @click="agentStore.loadModels"
              class="text-[9px] text-[#42b883] hover:underline cursor-pointer"
            >
              Coba hubungkan & cari model lagi
            </button>
          </div>
        </div>
      </div>

      <!-- Tombol Aksi Cepat Generate saat gambar ada tapi belum ada kode -->
      <div v-if="store.uploadedImage && !store.hasGeneratedCode" class="mb-2">
        <button
          class="w-full py-2 px-4 rounded-xl font-semibold text-xs text-slate-950 bg-emerald-400 hover:bg-emerald-300 transition-all flex items-center justify-center gap-2 shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-50"
          :disabled="store.isGenerating"
          @click="startInitialGeneration"
        >
          <UIcon :name="store.isGenerating ? 'i-lucide-loader-2' : 'i-lucide-sparkles'" :class="['w-4 h-4', store.isGenerating ? 'animate-spin' : '']" />
          <span>{{ store.isGenerating ? 'Sedang Menganalisis...' : 'Generate UI dari Screenshot' }}</span>
        </button>
      </div>

      <!-- Input Pill Container with Paste Handler -->
      <div
        class="bg-[#131d2e] border border-white/10 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/30 rounded-2xl p-2.5 shadow-sm transition-all space-y-1.5"
        @paste="handlePaste"
      >
        <!-- Attached HTML File Strip inside input pill -->
        <div v-if="store.attachedHtml" class="flex items-center gap-2 pb-1 pt-0.5 border-b border-white/5">
          <div class="w-8 h-8 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 flex-shrink-0 shadow-inner">
            <UIcon name="i-lucide-file-code" class="w-4 h-4" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-[11px] font-medium text-slate-200 truncate">
              {{ store.attachedHtml.name }}
            </div>
            <div class="text-[10px] text-amber-400/90 flex items-center gap-1 font-medium">
              <UIcon name="i-lucide-check-circle-2" class="w-3 h-3" />
              <span>HTML aktif di Live Preview</span>
            </div>
          </div>
          <button
            type="button"
            @click="store.clearAttachedHtml()"
            class="text-[10px] text-slate-400 hover:text-rose-400 px-2 py-1 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
            title="Hapus lampiran HTML"
          >
            Hapus
          </button>
        </div>

        <!-- Attached Image Strip inside input pill -->
        <div v-if="store.uploadedImage" class="flex items-center gap-2 pb-1 pt-0.5 border-b border-white/5">
          <div
            class="relative group rounded-lg overflow-hidden border border-white/10 bg-[#090d14] w-10 h-10 flex-shrink-0 cursor-pointer shadow-md"
            @click="previewImageUrl = store.uploadedImage"
            title="Klik untuk melihat pratinjau penuh"
          >
            <img :src="store.uploadedImage" alt="Attached screenshot" class="w-full h-full object-cover" />
            <div class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-opacity text-white">
              <UIcon name="i-lucide-zoom-in" class="w-3.5 h-3.5" />
            </div>
            <button
              type="button"
              @click.stop="store.clearUploadedImage()"
              class="absolute top-0.5 right-0.5 w-3.5 h-3.5 bg-black/80 hover:bg-rose-600 text-white rounded-full flex items-center justify-center text-[7px] transition-colors cursor-pointer"
              title="Hapus gambar"
            >
              <UIcon name="i-lucide-x" class="size-2.5" />
            </button>
          </div>
          <div class="min-w-0 flex-1">
            <div class="text-[11px] font-medium text-slate-200 truncate">
              {{ store.uploadedImageName || 'Screenshot / Mockup' }}
            </div>
            <div class="text-[10px] text-emerald-400 flex items-center gap-1">
              <UIcon name="i-lucide-image" class="w-3 h-3" />
              <span>Gambar siap diproses</span>
            </div>
          </div>
          <button
            type="button"
            @click="store.clearUploadedImage()"
            class="text-[10px] text-slate-400 hover:text-rose-400 px-2 py-1 rounded-lg hover:bg-rose-500/10 transition-colors cursor-pointer"
            title="Hapus gambar lampiran"
          >
            Hapus
          </button>
        </div>

        <!-- Input Textarea -->
        <textarea
          ref="textareaRef"
          v-model="promptInput"
          rows="2"
          :placeholder="store.hasGeneratedCode ? 'Ketik instruksi revisi visual... (bisa paste Ctrl+V gambar)' : 'Instruksi tambahan (opsional)... (bisa paste Ctrl+V gambar)'"
          class="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 resize-none outline-none leading-relaxed border-0 font-sans block p-0"
          :disabled="store.isGenerating"
          @keydown.enter.exact.prevent="handleSubmit"
        ></textarea>

        <!-- Bottom Controls Row -->
        <div class="flex items-center justify-between pt-1 border-t border-white/5">
          <div class="flex items-center gap-1.5">
            <!-- Gear Settings Button (Model Selector) -->
            <button
              type="button"
              @click="isSettingsMenuOpen = !isSettingsMenuOpen"
              class="w-6 h-6 rounded-full flex items-center justify-center transition-all cursor-pointer border text-[11px] flex-shrink-0"
              :class="isSettingsMenuOpen
                ? 'bg-[#42b883]/20 border-[#42b883]/50 text-[#42b883] shadow-xs'
                : 'bg-white/[0.04] border-white/[0.08] text-slate-400 hover:text-white hover:bg-white/[0.08]'"
              :title="`Pengaturan Model AI (${store.currentModel})`"
            >
              <UIcon name="i-lucide-settings" class="size-3" />
            </button>

            <!-- Attach File Button (Images & HTML) -->
            <button
              type="button"
              class="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-slate-400 hover:text-slate-200 hover:bg-white/5 border border-white/5 transition-colors cursor-pointer"
              title="Lampirkan berkas (Gambar PNG/JPG/WebP atau berkas HTML)"
              @click="triggerFileInput"
            >
              <UIcon name="i-lucide-paperclip" class="w-3 h-3 text-slate-400" />
              <span>Lampirkan</span>
            </button>

            <!-- Paste from Clipboard Button -->
            <button
              type="button"
              class="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-medium text-emerald-400 hover:text-emerald-300 hover:bg-emerald-500/10 border border-emerald-500/20 transition-colors cursor-pointer"
              title="Paste gambar dari clipboard (Ctrl+V)"
              @click="handlePasteClick"
            >
              <UIcon name="i-lucide-clipboard-paste" class="w-3 h-3" />
              <span>Paste (Ctrl+V)</span>
            </button>
          </div>

          <!-- Send Button -->
          <button
            type="button"
            class="h-7 px-3 rounded-xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 flex items-center justify-center gap-1.5 font-semibold text-xs transition-all shadow-sm shadow-emerald-500/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            :disabled="store.isGenerating || (!promptInput.trim() && !store.uploadedImage && !store.attachedHtml)"
            @click="handleSubmit"
          >
            <span>Kirim</span>
            <UIcon name="i-lucide-send" class="w-3 h-3" />
          </button>
        </div>
      </div>
    </div>

    <!-- Modal Pratinjau Gambar Penuh (Lightbox) -->
    <UModal :open="!!previewImageUrl" @update:open="(val) => { if (!val) previewImageUrl = null }">
      <template #content>
        <div class="p-4 bg-[#090d14] rounded-2xl border border-white/10 flex flex-col items-center shadow-2xl">
          <div class="flex items-center justify-between w-full mb-3">
            <span class="text-sm font-semibold text-slate-200">Pratinjau Gambar Screenshot</span>
            <button class="w-7 h-7 rounded-xl flex items-center justify-center text-slate-400 hover:text-white hover:bg-white/10 transition-all cursor-pointer" @click="previewImageUrl = null">
              <UIcon name="i-lucide-x" class="w-4 h-4" />
            </button>
          </div>
          <div class="max-h-[70vh] overflow-auto rounded-xl border border-white/10 bg-black/50 p-1 w-full flex items-center justify-center">
            <img :src="previewImageUrl || ''" class="max-w-full h-auto object-contain rounded-lg shadow-lg" />
          </div>
        </div>
      </template>
    </UModal>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, nextTick } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useUiBuilderStore } from '../stores/useUiBuilderStore'
import { useAgentStore } from '@renderer/stores/agentStore'
import { useSettingsStore } from '@renderer/stores/settingsStore'
import { streamUiCodeGeneration } from '../services/uiBuilderAiService'

const store = useUiBuilderStore()
const agentStore = useAgentStore()
const settingsStore = useSettingsStore()
const toast = useToast()

const promptInput = ref('')
const chatScrollRef = ref<HTMLDivElement | null>(null)
const textareaRef = ref<HTMLTextAreaElement | null>(null)
const fileInputRef = ref<HTMLInputElement | null>(null)
const previewImageUrl = ref<string | null>(null)

// Gear settings & Model selection
const isSettingsMenuOpen = ref<boolean>(false)
const modelSearchQuery = ref<string>('')

const filteredModels = computed(() => {
  if (!modelSearchQuery.value.trim()) {
    return agentStore.availableModels
  }
  const q = modelSearchQuery.value.toLowerCase().trim()
  return agentStore.availableModels.filter((m) => m.toLowerCase().includes(q))
})

function selectModel(modelName: string): void {
  if (typeof store.setSelectedModel === 'function') {
    store.setSelectedModel(modelName)
  } else {
    store.selectedModel = modelName
    if (store.variants && store.variants[0]) {
      store.variants[0].model = modelName
    }
  }
  isSettingsMenuOpen.value = false
  toast.add({
    severity: 'info',
    summary: 'Model AI Terpilih',
    detail: `Model diubah ke: ${modelName}`,
    life: 2000
  })
}

function scrollToBottom(): void {
  nextTick(() => {
    if (chatScrollRef.value) {
      chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight
    }
  })
}

function triggerFileInput(): void {
  fileInputRef.value?.click()
}

function handleFileInputChange(event: Event): void {
  const target = event.target as HTMLInputElement
  const file = target.files?.[0]
  if (!file) return

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
          summary: 'Berkas HTML Dilampirkan',
          detail: `Berkas "${file.name}" berhasil dimuat ke Live Preview`,
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
          summary: 'Gambar Dilampirkan',
          detail: `Gambar "${file.name}" berhasil dilampirkan`,
          life: 2000
        })
      }
    }
    reader.readAsDataURL(file)
  }
  target.value = ''
}

function handlePaste(event: ClipboardEvent): void {
  const items = event.clipboardData?.items
  if (!items) return

  for (let i = 0; i < items.length; i++) {
    const item = items[i]
    if (item.type.startsWith('image/')) {
      event.preventDefault()
      const blob = item.getAsFile()
      if (blob) {
        const reader = new FileReader()
        reader.onload = (e) => {
          const result = e.target?.result as string
          if (result) {
            store.setUploadedImage(result, `clipboard-${Date.now()}.png`)
            toast.add({
              severity: 'info',
              summary: 'Gambar Ditempel',
              detail: 'Gambar dari clipboard berhasil dilampirkan ke prompt',
              life: 2000
            })
          }
        }
        reader.readAsDataURL(blob)
      }
      break
    }
  }
}

async function handlePasteClick(): Promise<void> {
  try {
    const items = await navigator.clipboard.read()
    for (const item of items) {
      const imageType = item.types.find((t) => t.startsWith('image/'))
      if (imageType) {
        const blob = await item.getType(imageType)
        const reader = new FileReader()
        reader.onload = (e) => {
          const result = e.target?.result as string
          if (result) {
            store.setUploadedImage(result, `clipboard-${Date.now()}.png`)
            toast.add({
              severity: 'info',
              summary: 'Gambar Ditempel',
              detail: 'Gambar dari clipboard berhasil dilampirkan ke prompt',
              life: 2000
            })
          }
        }
        reader.readAsDataURL(blob)
        return
      }
    }
    toast.add({
      severity: 'warn',
      summary: 'Tidak Ada Gambar',
      detail: 'Clipboard tidak berisi file gambar. Salin screenshot terlebih dahulu (misal: Win+Shift+S).',
      life: 3000
    })
  } catch (err: any) {
    toast.add({
      severity: 'warn',
      summary: 'Gunakan Ctrl+V',
      detail: 'Tekan Ctrl+V langsung pada input chat untuk menempelkan gambar dari clipboard.',
      life: 3000
    })
  }
}

async function startInitialGeneration(): Promise<void> {
  if (store.isGenerating || !store.uploadedImage) return

  store.isGenerating = true
  store.activeActionText = 'Menganalisis visual dan menghasilkan kode UI...'

  store.addChatMessage({
    id: `msg-${Date.now()}`,
    role: 'user',
    content: promptInput.value || 'Generate komponen UI dari screenshot ini',
    imageUrl: store.uploadedImage,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  })

  const userPrompt = promptInput.value
  promptInput.value = ''
  scrollToBottom()

  // Set status varian aktif menjadi generating
  store.setVariantStatus(0, 'generating')
  store.setVariantCode(0, '')

  try {
    // Generate untuk model yang dipilih
    await streamUiCodeGeneration(
      {
        stack: store.outputStack,
        imageInput: store.uploadedImage,
        customPrompt: userPrompt,
        model: store.currentModel
      },
      {
        onChunk: (chunk) => {
          store.appendVariantChunk(0, chunk)
        },
        onThinking: (thoughts) => {
          store.setVariantThoughts(0, thoughts, true)
        },
        onComplete: (code) => {
          store.setVariantStatus(0, 'ready')
          store.setVariantCode(0, code)
        },
        onError: (err) => {
          store.setVariantStatus(0, 'error', err.message)
        }
      }
    )

    store.addChatMessage({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: 'Generasi UI selesai! Anda dapat melihat hasilnya di Live Preview atau mengirim instruksi revisi visual.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    })
  } catch (err: any) {
    store.addChatMessage({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `Gagal menghasilkan UI: ${err.message}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    })
  } finally {
    store.isGenerating = false
    store.activeActionText = ''
    scrollToBottom()
  }
}

async function handleSubmit(): Promise<void> {
  if (!promptInput.value.trim() && !store.uploadedImage && !store.attachedHtml) return
  if (!store.hasGeneratedCode && store.uploadedImage && !store.attachedHtml) {
    return startInitialGeneration()
  }

  const instruction = promptInput.value.trim() || (store.attachedHtml ? `Analisis dan perbarui UI dari berkas ${store.attachedHtml.name}` : '')
  promptInput.value = ''

  store.addChatMessage({
    id: `msg-${Date.now()}`,
    role: 'user',
    content: instruction,
    imageUrl: store.uploadedImage || undefined,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  })

  store.isGenerating = true
  store.activeActionText = 'Memperbarui kode sesuai instruksi...'
  scrollToBottom()

  try {
    const currentCode = store.activeVariant.code
    store.setVariantStatus(0, 'generating')
    store.setVariantCode(0, '')

    await streamUiCodeGeneration(
      {
        stack: store.outputStack,
        imageInput: store.uploadedImage,
        customPrompt: instruction,
        existingCode: currentCode,
        model: store.currentModel
      },
      {
        onChunk: (chunk) => {
          store.appendVariantChunk(0, chunk)
        },
        onThinking: (thoughts) => {
          store.setVariantThoughts(0, thoughts, true)
        },
        onComplete: (code) => {
          store.setVariantStatus(0, 'ready')
          store.setVariantCode(0, code)
        },
        onError: (err) => {
          store.setVariantStatus(0, 'error', err.message)
        }
      }
    )

    store.addChatMessage({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: 'Revisi visual berhasil diterapkan ke kode.',
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    })
  } catch (err: any) {
    store.addChatMessage({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: `Gagal merevisi kode: ${err.message}`,
      timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    })
  } finally {
    store.isGenerating = false
    store.activeActionText = ''
    scrollToBottom()
  }
}
</script>
