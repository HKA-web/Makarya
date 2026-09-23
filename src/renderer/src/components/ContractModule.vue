<script setup lang="ts">
import { ref } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import InputText from 'primevue/inputtext'

interface EmployeeContract {
  id: string
  nik: string
  fullName: string
  department: string
  contractEnd: string
  remainingDays: number
  status: 'Critical' | 'Warning' | 'Normal'
}

const contractList = ref<EmployeeContract[]>([
  {
    id: '1',
    nik: '2023001',
    fullName: 'Budi Santoso',
    department: 'Teknikal & Support',
    contractEnd: '2026-10-15',
    remainingDays: 22,
    status: 'Critical'
  },
  {
    id: '2',
    nik: '2023045',
    fullName: 'Siti Rahmawati',
    department: 'Keuangan & Payroll',
    contractEnd: '2026-11-01',
    remainingDays: 39,
    status: 'Warning'
  },
  {
    id: '3',
    nik: '2022119',
    fullName: 'Ahmad Fauzi',
    department: 'Operasional Lapangan',
    contractEnd: '2026-12-31',
    remainingDays: 99,
    status: 'Normal'
  }
])

const globalFilter = ref('')

function getSeverity(status: EmployeeContract['status']): 'danger' | 'warn' | 'success' {
  switch (status) {
    case 'Critical':
      return 'danger'
    case 'Warning':
      return 'warn'
    case 'Normal':
      return 'success'
  }
}
</script>

<template>
  <div class="h-full flex flex-col p-4 bg-zinc-950 text-zinc-100 overflow-y-auto">
    <!-- Header Modul -->
    <div class="flex items-center justify-between pb-4 border-b border-zinc-800 mb-4">
      <div>
        <h2 class="text-lg font-semibold text-zinc-100 flex items-center gap-2">
          <i class="pi pi-id-card text-indigo-400"></i>
          Penilaian Akhir Kontrak Karyawan
        </h2>
        <p class="text-xs text-zinc-400">Monitoring sisa hari kontrak dan usulan status kepegawaian</p>
      </div>
      <div class="flex items-center gap-2">
        <Button icon="pi pi-refresh" severity="secondary" outlined size="small" />
        <Button icon="pi pi-plus" label="Formulir Penilaian Baru" size="small" class="bg-indigo-600 hover:bg-indigo-500 border-none text-white" />
      </div>
    </div>

    <!-- Toolbar Filter -->
    <div class="flex items-center justify-between mb-3 gap-3">
      <div class="flex items-center gap-2 w-72">
        <i class="pi pi-search text-zinc-500 text-sm"></i>
        <InputText
          v-model="globalFilter"
          placeholder="Cari NIK atau Nama..."
          class="w-full bg-zinc-900 border border-zinc-800 text-xs py-1.5 px-2.5 rounded text-zinc-200"
        />
      </div>
      <span class="text-xs text-zinc-400">Total: {{ contractList.length }} Pegawai</span>
    </div>

    <!-- PrimeVue DataTable -->
    <div class="border border-zinc-800 rounded-lg overflow-hidden flex-1 bg-zinc-900/50">
      <DataTable
        :value="contractList"
        paginator
        :rows="10"
        class="text-xs"
        stripedRows
        :pt="{
          table: { class: 'w-full' },
          headerRow: { class: 'bg-zinc-900 text-zinc-400 border-b border-zinc-800 text-left' },
          bodyRow: { class: 'border-b border-zinc-800/50 hover:bg-zinc-800/40 transition-colors' }
        }"
      >
        <Column field="nik" header="NIK" sortable style="width: 120px"></Column>
        <Column field="fullName" header="Nama Lengkap" sortable></Column>
        <Column field="department" header="Departemen"></Column>
        <Column field="contractEnd" header="Tgl Berakhir" sortable style="width: 140px"></Column>
        <Column field="remainingDays" header="Sisa Hari" sortable style="width: 120px">
          <template #body="{ data }">
            <span :class="data.remainingDays < 30 ? 'text-red-400 font-semibold' : 'text-zinc-300'">
              {{ data.remainingDays }} Hari
            </span>
          </template>
        </Column>
        <Column field="status" header="Urgensi" style="width: 120px">
          <template #body="{ data }">
            <Tag :value="data.status" :severity="getSeverity(data.status)" class="text-[10px]" />
          </template>
        </Column>
        <Column header="Aksi" style="width: 120px">
          <template #body>
            <div class="flex items-center gap-1.5">
              <Button icon="pi pi-file-edit" text size="small" severity="info" title="Buat Penilaian" />
              <Button icon="pi pi-ellipsis-v" text size="small" severity="secondary" />
            </div>
          </template>
        </Column>
      </DataTable>
    </div>
  </div>
</template>
