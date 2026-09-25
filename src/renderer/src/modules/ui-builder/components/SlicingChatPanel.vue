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
          <li>Unggah screenshot atau mockup desain di atas.</li>
          <li>Ketik instruksi khusus (opsional) atau klik tombol <b>Generate UI</b>.</li>
          <li>AI akan mengekstrak aset dan menghasilkan 4 varian kode secara bersamaan.</li>
          <li>Kirim pesan lanjutan untuk melakukan revisi visual (misal: <i>"Ubah warna header"</i>).</li>
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
          <div v-if="msg.imageUrl" class="mb-2.5 rounded-xl overflow-hidden border border-white/10 max-w-[200px] shadow-sm">
            <img :src="msg.imageUrl" class="w-full h-auto object-cover rounded-xl" />
          </div>

          <!-- Thought / Reasoning AI jika ada -->
          <div v-if="msg.thoughts" class="mb-2 p-2.5 rounded-xl bg-black/40 border border-white/5 text-[11px] text-slate-400">
            <div class="font-medium text-amber-400 mb-0.5 flex items-center gap-1.5">
              <UIcon name="i-lucide-brain" class="w-3.5 h-3.5" />
              <span>Proses Berpikir Model:</span>
            </div>
            <div class="whitespace-pre-wrap">{{ msg.thoughts }}</div>
          </div>

          <div class="whitespace-pre-wrap">{{ msg.content }}</div>
        </div>
      </div>

      <!-- State Streaming Aktif Membulat -->
      <div v-if="store.isGenerating" class="flex items-center gap-2 text-xs text-emerald-400 p-2.5 bg-emerald-500/10 rounded-2xl border border-emerald-500/20 animate-pulse shadow-sm">
        <UIcon name="i-lucide-loader-2" class="w-4 h-4 animate-spin" />
        <span>{{ store.activeActionText || 'Sedang menghasilkan varian kode...' }}</span>
      </div>
    </div>

    <!-- Area Input Prompt & Tombol Generate Membulat -->
    <div class="p-3 border-t border-white/10 bg-[#0c111a]/80 backdrop-blur">
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

      <div class="flex items-end gap-2">
        <div class="relative flex-1 rounded-2xl bg-[#131d2e] border border-white/10 focus-within:border-emerald-500/50 focus-within:ring-1 focus-within:ring-emerald-500/30 transition-all overflow-hidden p-2.5 shadow-sm">
          <textarea
            v-model="promptInput"
            rows="2"
            :placeholder="store.hasGeneratedCode ? 'Ketik instruksi revisi visual...' : 'Instruksi tambahan (opsional)...'"
            class="w-full bg-transparent text-xs text-slate-100 placeholder-slate-500 resize-none outline-none leading-relaxed border-0 font-sans block"
            :disabled="store.isGenerating"
            @keydown.enter.exact.prevent="handleSubmit"
          ></textarea>
        </div>
        <button
          class="h-10 w-10 rounded-2xl bg-emerald-400 hover:bg-emerald-300 text-slate-950 flex items-center justify-center flex-shrink-0 transition-all shadow-md shadow-emerald-500/20 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          :disabled="store.isGenerating || (!promptInput.trim() && !store.uploadedImage)"
          @click="handleSubmit"
        >
          <UIcon name="i-lucide-send" class="w-4 h-4" />
        </button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, nextTick } from 'vue'
import { useUiBuilderStore } from '../stores/useUiBuilderStore'
import { streamUiCodeGeneration } from '../services/uiBuilderAiService'

const store = useUiBuilderStore()
const promptInput = ref('')
const chatScrollRef = ref<HTMLDivElement | null>(null)

function scrollToBottom(): void {
  nextTick(() => {
    if (chatScrollRef.value) {
      chatScrollRef.value.scrollTop = chatScrollRef.value.scrollHeight
    }
  })
}

async function startInitialGeneration(): Promise<void> {
  if (store.isGenerating || !store.uploadedImage) return

  store.isGenerating = true
  store.activeActionText = 'Menganalisis visual dan menghasilkan 4 varian...'

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

  // Set status varian menjadi generating
  store.variants.forEach((_, idx) => {
    store.setVariantStatus(idx, 'generating')
    store.setVariantCode(idx, '')
  })

  try {
    // Generate untuk Varian Utama (Varian yang dipilih)
    await streamUiCodeGeneration(
      {
        stack: store.outputStack,
        imageInput: store.uploadedImage,
        customPrompt: userPrompt,
        model: store.activeVariant.model
      },
      {
        onChunk: (chunk) => {
          store.appendVariantChunk(store.activeVariantIndex, chunk)
        },
        onThinking: (thoughts) => {
          store.setVariantThoughts(store.activeVariantIndex, thoughts, true)
        },
        onComplete: (code) => {
          store.setVariantStatus(store.activeVariantIndex, 'ready')
          store.setVariantCode(store.activeVariantIndex, code)
        },
        onError: (err) => {
          store.setVariantStatus(store.activeVariantIndex, 'error', err.message)
        }
      }
    )

    store.addChatMessage({
      id: `msg-${Date.now()}`,
      role: 'assistant',
      content: 'Generasi UI selesai! Anda dapat melihat hasilnya di Live Preview atau berganti varian.',
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
  if (!promptInput.value.trim() && !store.uploadedImage) return
  if (!store.hasGeneratedCode && store.uploadedImage) {
    return startInitialGeneration()
  }

  const instruction = promptInput.value.trim()
  promptInput.value = ''

  store.addChatMessage({
    id: `msg-${Date.now()}`,
    role: 'user',
    content: instruction,
    timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
  })

  store.isGenerating = true
  store.activeActionText = 'Memperbarui kode sesuai instruksi...'
  scrollToBottom()

  try {
    const currentCode = store.activeVariant.code
    store.setVariantStatus(store.activeVariantIndex, 'generating')

    await streamUiCodeGeneration(
      {
        stack: store.outputStack,
        imageInput: store.uploadedImage,
        customPrompt: instruction,
        existingCode: currentCode,
        model: store.activeVariant.model
      },
      {
        onChunk: (chunk) => {
          store.appendVariantChunk(store.activeVariantIndex, chunk)
        },
        onComplete: (code) => {
          store.setVariantStatus(store.activeVariantIndex, 'ready')
          store.setVariantCode(store.activeVariantIndex, code)
        },
        onError: (err) => {
          store.setVariantStatus(store.activeVariantIndex, 'error', err.message)
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
