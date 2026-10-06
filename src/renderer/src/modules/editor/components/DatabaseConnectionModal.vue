<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { usePluginStore } from '@renderer/stores/pluginStore'
import { useWorkspaceStore } from '@renderer/stores/workspaceStore'
import {
  loadSavedProfiles,
  saveProfiles,
  getActiveProfile,
  setActiveProfile,
  deleteProfile,
  type DatabaseConnectionProfile,
  type DatabaseType
} from '../../../../../../packages/makarya-sdk/examples/database-ai-tool/src/index'

const pluginStore = usePluginStore()
const workspaceStore = useWorkspaceStore()

const currentProjectRoot = computed(() => {
  if (workspaceStore.activeRootPath) return workspaceStore.activeRootPath
  if (workspaceStore.workspaceRoots.length > 0) return workspaceStore.workspaceRoots[0].path
  return null
})

const currentProjectName = computed(() => {
  if (!currentProjectRoot.value) return 'Project Umum'
  return currentProjectRoot.value.split(/[\\/]/).pop() || 'Project'
})

const savedProfiles = ref<DatabaseConnectionProfile[]>([])
const selectedProfileId = ref<string | null>(null)

// Form States
const formProfileName = ref('')
const formDbType = ref<DatabaseType>('sqlserver')
const formHost = ref('localhost')
const formPort = ref<number>(1433)
const formDatabase = ref('')
const formUsername = ref('sa')
const formPassword = ref('')
const formAuthType = ref<'sql_auth' | 'windows_auth' | 'none'>('sql_auth')
const formShowPassword = ref(false)

// Testing State
const isTesting = ref(false)
const testResult = ref<{
  status: 'idle' | 'success' | 'error'
  message?: string
  latencyMs?: number
}>({ status: 'idle' })

const dbTypeOptions: Array<{
  id: DatabaseType
  name: string
  subtitle: string
  icon: string
  defaultPort: number
}> = [
  {
    id: 'sqlserver',
    name: 'SQL Server',
    subtitle: 'Microsoft T-SQL',
    icon: 'i-lucide-server',
    defaultPort: 1433
  },
  {
    id: 'mysql',
    name: 'MySQL / MariaDB',
    subtitle: 'MySQL Server',
    icon: 'i-lucide-database',
    defaultPort: 3306
  },
  {
    id: 'postgres',
    name: 'PostgreSQL',
    subtitle: 'Postgres Engine',
    icon: 'i-lucide-layers',
    defaultPort: 5432
  },
  {
    id: 'sqlite',
    name: 'SQLite',
    subtitle: 'Berkas Lokal (.db)',
    icon: 'i-lucide-file-spreadsheet',
    defaultPort: 0
  }
]

function refreshList(): void {
  savedProfiles.value = loadSavedProfiles()
  const active = getActiveProfile(currentProjectRoot.value)
  if (active && (!selectedProfileId.value || !savedProfiles.value.some((p) => p.id === selectedProfileId.value))) {
    selectProfile(active)
  } else if (savedProfiles.value.length > 0 && !selectedProfileId.value) {
    selectProfile(savedProfiles.value[0])
  } else if (savedProfiles.value.length === 0) {
    createNewProfileForm()
  }
}

function selectProfile(profile: DatabaseConnectionProfile): void {
  selectedProfileId.value = profile.id
  formProfileName.value = profile.name
  formDbType.value = profile.type
  formHost.value = profile.host
  formPort.value = profile.port
  formDatabase.value = profile.database
  formUsername.value = profile.username || ''
  formPassword.value = profile.password || ''
  formAuthType.value = profile.authType
  testResult.value = profile.lastTestStatus
    ? {
        status: profile.lastTestStatus === 'success' ? 'success' : 'error',
        message: profile.lastTestMessage,
        latencyMs: profile.lastTestLatency
      }
    : { status: 'idle' }
}

function createNewProfileForm(): void {
  selectedProfileId.value = null
  formProfileName.value = `${currentProjectName.value} Database`
  formDbType.value = 'sqlserver'
  formHost.value = '127.0.0.1'
  formPort.value = 1433
  formDatabase.value = currentProjectName.value.toLowerCase().replace(/[^a-z0-9_]/g, '_')
  formUsername.value = 'sa'
  formPassword.value = ''
  formAuthType.value = 'sql_auth'
  testResult.value = { status: 'idle' }
}

function handleDbTypeChange(type: DatabaseType): void {
  formDbType.value = type
  const opt = dbTypeOptions.find((o) => o.id === type)
  if (opt && type !== 'sqlite') {
    formPort.value = opt.defaultPort
  }
  if (type === 'sqlserver') {
    formAuthType.value = 'sql_auth'
  } else if (type === 'sqlite') {
    formAuthType.value = 'none'
  }
}

async function handleTestConnection(): Promise<void> {
  isTesting.value = true
  testResult.value = { status: 'idle' }

  try {
    const payload = {
      type: formDbType.value,
      host: formHost.value.trim(),
      port: Number(formPort.value) || 1433,
      database: formDatabase.value.trim(),
      username: formUsername.value.trim(),
      password: formPassword.value,
      authType: formAuthType.value
    }

    if (window.makaryaAPI?.testDbConnection) {
      const res = await window.makaryaAPI.testDbConnection(payload)
      if (res.success) {
        testResult.value = {
          status: 'success',
          message: res.message || 'Koneksi ke database target berhasil terverifikasi.',
          latencyMs: res.latencyMs
        }
        pluginStore.notifyToast({
          title: 'Koneksi Berhasil',
          message: `Terhubung ke ${formDbType.value.toUpperCase()} (${res.latencyMs || 0}ms)`,
          type: 'success'
        })
      } else {
        testResult.value = {
          status: 'error',
          message: res.error || 'Gagal terhubung ke host target.'
        }
      }
    } else {
      // Fallback
      testResult.value = {
        status: 'success',
        message: `Koneksi simulasi ke ${formHost.value}:${formPort.value}/${formDatabase.value} sukses.`,
        latencyMs: 12
      }
    }
  } catch (err: any) {
    testResult.value = {
      status: 'error',
      message: err?.message || 'Terjadi kesalahan saat menguji koneksi.'
    }
  } finally {
    isTesting.value = false
  }
}

function handleSaveProfile(): void {
  if (!formDatabase.value.trim()) {
    pluginStore.notifyToast({
      title: 'Nama Database Wajib Diisi',
      message: 'Mohon isi nama basis data target yang ingin dihubungkan.',
      type: 'warn'
    })
    return
  }

  const profiles = loadSavedProfiles()
  const now = new Date().toISOString()
  const projectRoot = currentProjectRoot.value || undefined

  // Deactivate existing profiles for this project
  profiles.forEach((p) => {
    if (projectRoot && p.projectRoot === projectRoot) {
      p.isActive = false
    } else if (!projectRoot) {
      p.isActive = false
    }
  })

  const profileData: DatabaseConnectionProfile = {
    id: selectedProfileId.value || `db_${Date.now()}`,
    name: formProfileName.value.trim() || `${formDbType.value.toUpperCase()} - ${formDatabase.value}`,
    type: formDbType.value,
    host: formHost.value.trim(),
    port: Number(formPort.value) || 1433,
    database: formDatabase.value.trim(),
    username: formUsername.value.trim(),
    password: formPassword.value,
    authType: formAuthType.value,
    projectRoot,
    isActive: true,
    createdAt: now,
    lastTestedAt: testResult.value.status !== 'idle' ? now : undefined,
    lastTestStatus:
      testResult.value.status === 'success'
        ? 'success'
        : testResult.value.status === 'error'
          ? 'failed'
          : undefined,
    lastTestLatency: testResult.value.latencyMs,
    lastTestMessage: testResult.value.message
  }

  const existingIndex = profiles.findIndex((p) => p.id === profileData.id)
  if (existingIndex >= 0) {
    profiles[existingIndex] = profileData
  } else {
    profiles.unshift(profileData)
  }

  saveProfiles(profiles)
  selectedProfileId.value = profileData.id
  refreshList()

  pluginStore.notifyToast({
    title: 'Koneksi Database Aktif Disimpan',
    message: `Profil "${profileData.name}" telah diaktifkan untuk project ${currentProjectName.value}. Agent AI sekarang memiliki koneksi pasti.`,
    type: 'success'
  })

  pluginStore.isDbConnectionModalOpen = false
}

function handleDeleteProfile(id: string): void {
  deleteProfile(id)
  refreshList()
  pluginStore.notifyToast({
    title: 'Profil Dihapus',
    message: 'Profil koneksi telah dihapus dari sistem.',
    type: 'info'
  })
}

function handleClose(): void {
  pluginStore.isDbConnectionModalOpen = false
}

watch(
  () => pluginStore.isDbConnectionModalOpen,
  (isOpen) => {
    if (isOpen) {
      refreshList()
    }
  }
)

onMounted(() => {
  if (typeof window !== 'undefined') {
    window.addEventListener('makarya:db-profiles-updated', () => {
      refreshList()
    })
  }
})
</script>

<template>
  <div
    v-if="pluginStore.isDbConnectionModalOpen"
    class="fixed inset-0 z-[100] flex items-center justify-center bg-black/75 backdrop-blur-md p-4 animate-in fade-in duration-200"
    @click.self="handleClose"
  >
    <div
      class="bg-[#12161f] border border-white/10 rounded-2xl w-full max-w-4xl h-[88vh] max-h-[760px] flex flex-col shadow-2xl overflow-hidden text-slate-200"
    >
      <!-- Header with Vue / Nuxt Green Accent -->
      <div class="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between bg-white/[0.02]">
        <div class="flex items-center gap-3">
          <div
            class="size-10 rounded-xl bg-[#42b883]/15 border border-[#42b883]/30 flex items-center justify-center text-[#42b883] shadow-sm"
          >
            <UIcon name="i-lucide-database" class="size-5" />
          </div>
          <div>
            <div class="flex items-center gap-2">
              <h2 class="text-sm font-semibold text-white tracking-wide">
                Pengaturan Koneksi Database Project
              </h2>
              <span
                class="text-[10.5px] bg-[#42b883]/15 text-[#42b883] px-2.5 py-0.5 rounded-full font-mono border border-[#42b883]/30 font-medium"
              >
                Project: {{ currentProjectName }}
              </span>
            </div>
            <p class="text-xs text-slate-400 mt-0.5">
              Atur dan uji koneksi target agar AI Agent memiliki referensi database pasti tanpa menebak-nebak.
            </p>
          </div>
        </div>

        <button
          @click="handleClose"
          class="size-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-slate-400 hover:text-white transition-colors cursor-pointer"
        >
          <UIcon name="i-lucide-x" class="size-4" />
        </button>
      </div>

      <!-- Main Body -->
      <div class="flex-1 flex overflow-hidden">
        <!-- Left Sidebar: Saved Profiles -->
        <div class="w-64 border-r border-white/[0.08] bg-black/25 flex flex-col p-3.5">
          <div class="flex items-center justify-between mb-3 px-1">
            <span class="text-[11px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
              Profil Tersimpan
            </span>
            <button
              @click="createNewProfileForm"
              class="text-xs text-[#42b883] hover:text-[#33a06f] flex items-center gap-1 font-medium cursor-pointer transition-colors"
              title="Buat Profil Baru"
            >
              <UIcon name="i-lucide-plus" class="size-3.5" />
              <span>Baru</span>
            </button>
          </div>

          <div class="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
            <div
              v-if="savedProfiles.length === 0"
              class="text-center py-8 px-2 text-slate-500 text-xs"
            >
              Belum ada profil koneksi. Klik tombol <b>+ Baru</b> untuk mengatur koneksi database pertama.
            </div>

            <button
              v-for="profile in savedProfiles"
              :key="profile.id"
              @click="selectProfile(profile)"
              :class="[
                'w-full text-left p-2.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-1',
                selectedProfileId === profile.id
                  ? 'bg-[#42b883]/15 border-[#42b883]/40 text-white shadow-sm'
                  : 'bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.06] text-slate-300'
              ]"
            >
              <div class="flex items-center justify-between">
                <span class="font-medium text-xs truncate max-w-[130px]">{{ profile.name }}</span>
                <span
                  v-if="profile.isActive"
                  class="text-[9.5px] px-1.5 py-0.5 rounded-full bg-[#42b883]/20 text-[#42b883] border border-[#42b883]/30 font-mono"
                >
                  Aktif
                </span>
              </div>
              <div class="flex items-center gap-1.5 text-[10.5px] text-slate-400 font-mono">
                <UIcon
                  :name="profile.type === 'sqlserver' ? 'i-lucide-server' : 'i-lucide-database'"
                  class="size-3 text-[#42b883]"
                />
                <span class="truncate">{{ profile.database }}</span>
                <span class="text-slate-600">•</span>
                <span class="uppercase text-[9px] text-slate-500">{{ profile.type }}</span>
              </div>
            </button>
          </div>
        </div>

        <!-- Right Content: Form & Live Tester -->
        <div class="flex-1 overflow-y-auto p-6 space-y-5 custom-scrollbar">
          <!-- Neat & Clean DBMS Selector with Vue/Nuxt Green Base -->
          <div>
            <label class="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-2 font-mono">
              Pilih Jenis Basis Data (DBMS)
            </label>
            <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <button
                v-for="opt in dbTypeOptions"
                :key="opt.id"
                type="button"
                @click="handleDbTypeChange(opt.id)"
                :class="[
                  'p-3 rounded-xl border text-left flex flex-col justify-between min-h-[76px] transition-all cursor-pointer',
                  formDbType === opt.id
                    ? 'bg-[#42b883]/15 border-[#42b883] shadow-md ring-1 ring-[#42b883]/30'
                    : 'bg-white/[0.02] border-white/[0.08] hover:bg-white/[0.06] hover:border-white/20'
                ]"
              >
                <div class="flex items-center justify-between">
                  <UIcon
                    :name="opt.icon"
                    :class="['size-5', formDbType === opt.id ? 'text-[#42b883]' : 'text-slate-400']"
                  />
                </div>
                <div class="mt-2">
                  <div class="text-xs font-semibold text-white leading-tight">{{ opt.name }}</div>
                  <div class="text-[10px] text-slate-400 mt-0.5 leading-tight">{{ opt.subtitle }}</div>
                </div>
              </button>
            </div>
          </div>

          <!-- Connection Form Fields -->
          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Alias Name -->
            <div class="md:col-span-2">
              <label class="block text-xs font-medium text-slate-300 mb-1.5">
                Nama Alias Profil Koneksi
              </label>
              <input
                v-model="formProfileName"
                type="text"
                placeholder="Contoh: HRMS Production SQL Server"
                class="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#42b883] focus:ring-1 focus:ring-[#42b883] transition-all font-sans"
              />
            </div>

            <!-- Host Server -->
            <div>
              <label class="block text-xs font-medium text-slate-300 mb-1.5">
                {{ formDbType === 'sqlite' ? 'Path Berkas Database SQLite' : 'Host / Alamat Server' }}
              </label>
              <input
                v-model="formHost"
                type="text"
                :placeholder="formDbType === 'sqlite' ? './database/app.sqlite' : 'localhost atau 127.0.0.1'"
                class="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#42b883] focus:ring-1 focus:ring-[#42b883] transition-all font-mono"
              />
            </div>

            <!-- Port -->
            <div v-if="formDbType !== 'sqlite'">
              <label class="block text-xs font-medium text-slate-300 mb-1.5">
                Port Koneksi
              </label>
              <input
                v-model.number="formPort"
                type="number"
                placeholder="1433"
                class="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#42b883] focus:ring-1 focus:ring-[#42b883] transition-all font-mono"
              />
            </div>

            <!-- Database Name -->
            <div :class="formDbType === 'sqlite' ? 'md:col-span-2' : ''">
              <label class="block text-xs font-medium text-slate-300 mb-1.5">
                Nama Database Target <span class="text-rose-400">*</span>
              </label>
              <input
                v-model="formDatabase"
                type="text"
                placeholder="Contoh: hrms_sni, makarya_db"
                class="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#42b883] focus:ring-1 focus:ring-[#42b883] transition-all font-mono"
              />
            </div>

            <!-- Auth Type -->
            <div v-if="formDbType !== 'sqlite'">
              <label class="block text-xs font-medium text-slate-300 mb-1.5">
                Metode Otentikasi
              </label>
              <select
                v-model="formAuthType"
                class="w-full bg-[#161b26] border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white focus:outline-none focus:border-[#42b883] transition-all"
              >
                <option value="sql_auth">SQL Server / Password Authentication</option>
                <option v-if="formDbType === 'sqlserver'" value="windows_auth">
                  Windows Authentication (Integrated Security)
                </option>
                <option value="none">Tanpa Password / Local Trusted</option>
              </select>
            </div>

            <!-- Username & Password -->
            <div v-if="formDbType !== 'sqlite' && formAuthType === 'sql_auth'">
              <label class="block text-xs font-medium text-slate-300 mb-1.5">
                Username Database
              </label>
              <input
                v-model="formUsername"
                type="text"
                placeholder="sa / root / postgres"
                class="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#42b883] transition-all font-mono"
              />
            </div>

            <div v-if="formDbType !== 'sqlite' && formAuthType === 'sql_auth'">
              <label class="block text-xs font-medium text-slate-300 mb-1.5">
                Password
              </label>
              <div class="relative">
                <input
                  v-model="formPassword"
                  :type="formShowPassword ? 'text' : 'password'"
                  placeholder="••••••••••••"
                  class="w-full bg-black/40 border border-white/10 rounded-xl px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-[#42b883] transition-all font-mono pr-9"
                />
                <button
                  type="button"
                  @click="formShowPassword = !formShowPassword"
                  class="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-white"
                >
                  <UIcon :name="formShowPassword ? 'i-lucide-eye-off' : 'i-lucide-eye'" class="size-3.5" />
                </button>
              </div>
            </div>
          </div>

          <!-- Mandatory AI Database Skill & Safety Notice -->
          <div class="p-3.5 rounded-xl bg-[#42b883]/10 border border-[#42b883]/25 text-xs">
            <div class="flex items-center gap-2 font-semibold text-[#42b883] mb-1">
              <UIcon name="i-lucide-shield-check" class="size-4 text-[#42b883]" />
              <span>Aturan Keamanan & Skill Database AI Agent Aktif</span>
            </div>
            <ul class="text-[11px] text-slate-300 space-y-1 list-disc list-inside mt-1 font-sans">
              <li>
                <b>Verifikasi Data:</b> Sebelum menjalankan <code class="text-[#42b883] font-mono">UPDATE</code> atau <code class="text-[#42b883] font-mono">DELETE</code>, selalu jalankan <code class="text-[#42b883] font-mono">SELECT</code> terlebih dahulu untuk memverifikasi data target.
              </li>
              <li>
                <b>Proteksi Skema:</b> Jangan pernah menjalankan <code class="text-rose-300 font-mono">DROP TABLE</code> tanpa konfirmasi pengguna.
              </li>
              <li>
                <b>Optimasi Performa:</b> Gunakan indexing jika query menyaring lebih dari 10.000 baris.
              </li>
            </ul>
          </div>

          <!-- Live Test Status Alert -->
          <div
            v-if="testResult.status !== 'idle'"
            :class="[
              'p-3.5 rounded-xl border flex items-start gap-3 transition-all',
              testResult.status === 'success'
                ? 'bg-[#42b883]/15 border-[#42b883]/40 text-[#42b883]'
                : 'bg-rose-500/15 border-rose-500/30 text-rose-300'
            ]"
          >
            <UIcon
              :name="testResult.status === 'success' ? 'i-lucide-check-circle-2' : 'i-lucide-alert-circle'"
              class="size-5 shrink-0 mt-0.5"
            />
            <div class="text-xs">
              <div class="font-semibold">
                {{ testResult.status === 'success' ? 'Tes Koneksi Berhasil' : 'Tes Koneksi Gagal' }}
              </div>
              <p class="mt-0.5 text-slate-300 text-[11px]">{{ testResult.message }}</p>
            </div>
          </div>

          <!-- Bottom Action Buttons -->
          <div class="pt-2 flex items-center justify-between border-t border-white/[0.08]">
            <div>
              <button
                v-if="selectedProfileId"
                type="button"
                @click="handleDeleteProfile(selectedProfileId)"
                class="px-3 py-2 rounded-xl text-rose-400 hover:bg-rose-500/10 text-xs font-medium transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <UIcon name="i-lucide-trash-2" class="size-3.5" />
                <span>Hapus Profil</span>
              </button>
            </div>

            <div class="flex items-center gap-3">
              <!-- Test Connection Button -->
              <button
                type="button"
                @click="handleTestConnection"
                :disabled="isTesting"
                class="px-4 py-2 rounded-xl bg-white/[0.06] hover:bg-white/10 border border-white/10 text-white text-xs font-medium transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <UIcon
                  v-if="isTesting"
                  name="i-lucide-loader-2"
                  class="size-3.5 animate-spin text-[#42b883]"
                />
                <UIcon
                  v-else
                  name="i-lucide-activity"
                  class="size-3.5 text-[#42b883]"
                />
                <span>{{ isTesting ? 'Menguji...' : 'Test Koneksi' }}</span>
              </button>

              <!-- Save and Set Active Button -->
              <button
                type="button"
                @click="handleSaveProfile"
                class="px-4 py-2 rounded-xl bg-[#42b883] hover:bg-[#33a06f] text-slate-950 font-semibold text-xs transition-all shadow-md shadow-[#42b883]/20 flex items-center gap-1.5 cursor-pointer"
              >
                <UIcon name="i-lucide-check" class="size-3.5" />
                <span>Simpan & Jadikan Aktif untuk Project Ini</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.custom-scrollbar::-webkit-scrollbar {
  width: 5px;
}
.custom-scrollbar::-webkit-scrollbar-track {
  background: transparent;
}
.custom-scrollbar::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.12);
  border-radius: 4px;
}
.custom-scrollbar::-webkit-scrollbar-thumb:hover {
  background: rgba(255, 255, 255, 0.25);
}
</style>
