# Panduan Lengkap PrimeVue (untuk Vue 3)

Dokumen lanjutan dari `vue3-panduan-lengkap.md`. Fokus di sini adalah **PrimeVue** — library komponen UI populer untuk Vue 3, lengkap dengan komponen, styling (PrimeFlex/Tailwind), tema, form, dan best practices.

---

## Daftar Isi

1. [Pengenalan PrimeVue](#1-pengenalan-primevue)
2. [Instalasi & Setup](#2-instalasi--setup)
3. [Sistem Tema (Theming)](#3-sistem-tema-theming)
4. [Komponen Dasar](#4-komponen-dasar)
5. [Form & Validasi](#5-form--validasi)
6. [Data Table](#6-data-table)
7. [Overlay: Dialog, Toast, Confirm, Tooltip](#7-overlay-dialog-toast-confirm-tooltip)
8. [Menu & Navigasi](#8-menu--navigasi)
9. [Layout dengan PrimeFlex](#9-layout-dengan-primeflex)
10. [Icons (PrimeIcons)](#10-icons-primeicons)
11. [Integrasi dengan Tailwind CSS](#11-integrasi-dengan-tailwind-css)
12. [Komponen Kustom di Atas PrimeVue](#12-komponen-kustom-di-atas-primevue)
13. [Best Practices](#13-best-practices)
14. [Referensi Cepat (Cheat Sheet)](#14-referensi-cepat-cheat-sheet)

---

## 1. Pengenalan PrimeVue

PrimeVue adalah library UI komponen open-source untuk Vue 3 dengan 90+ komponen siap pakai: DataTable, Dialog, Calendar, Dropdown, Chart, dan lainnya. Dikembangkan oleh PrimeTek (tim yang sama dengan PrimeReact & PrimeNG).

Fitur utama:
- **Unstyled mode** — bisa dipakai tanpa CSS bawaan, cocok dipadukan dengan Tailwind.
- **Theming berbasis token** (PrimeVue 4+) — mudah kustomisasi warna, radius, dsb.
- **Aksesibilitas (a11y)** bawaan pada sebagian besar komponen.
- Pendamping resmi: **PrimeIcons** (ikon) dan **PrimeFlex** (utility CSS untuk layout).

> Catatan versi: mulai **PrimeVue 4**, sistem theming berubah total (Theme Tokens + Styled Mode/Unstyled Mode via `@primeuix/themes`). Jika proyek Anda masih pakai PrimeVue 3, konsep tema lama (`primevue/resources/themes/...`) berbeda — panduan ini fokus ke PrimeVue 4.

---

## 2. Instalasi & Setup

### Instalasi

```bash
npm install primevue @primeuix/themes
npm install primeicons
```

### Setup di `main.ts`

```ts
import { createApp } from 'vue'
import App from './App.vue'
import PrimeVue from 'primevue/config'
import Aura from '@primeuix/themes/aura'

import 'primeicons/primeicons.css'

const app = createApp(App)

app.use(PrimeVue, {
  theme: {
    preset: Aura,
    options: {
      darkModeSelector: '.dark-mode', // atau 'system'
    }
  }
})

app.mount('#app')
```

Preset tema bawaan yang tersedia: `Aura`, `Lara`, `Nora`, `Material` (import dari `@primeuix/themes/...`).

### Registrasi komponen (per komponen, disarankan untuk tree-shaking)

```ts
import Button from 'primevue/button'
app.component('Button', Button)
```

Atau import langsung di tiap SFC (lebih umum di proyek modern):

```vue
<script setup>
import Button from 'primevue/button'
</script>

<template>
  <Button label="Klik Saya" />
</template>
```

### Service Global (opsional, untuk Toast/Confirm/Dialog dinamis)

```ts
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import DialogService from 'primevue/dialogservice'

app.use(ToastService)
app.use(ConfirmationService)
app.use(DialogService)
```

---

## 3. Sistem Tema (Theming)

### Kustomisasi preset

```ts
import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

const MyPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{indigo.50}',
      500: '{indigo.500}',
      600: '{indigo.600}',
    }
  }
})

app.use(PrimeVue, {
  theme: { preset: MyPreset }
})
```

### Dark Mode

```html
<!-- toggle class 'dark-mode' di <html> atau elemen root -->
<html class="dark-mode">
```

```js
function toggleDarkMode() {
  document.documentElement.classList.toggle('dark-mode')
}
```

### Scoped Styling per komponen (override token lokal)

```vue
<Button label="Simpan" :pt="{ root: { style: { borderRadius: '20px' } } }" />
```

`pt` (Pass Through) memungkinkan Anda menyuntikkan class/style/attribute ke bagian internal komponen mana pun tanpa perlu unstyled mode penuh.

---

## 4. Komponen Dasar

### Button

```vue
<script setup>
import Button from 'primevue/button'
</script>

<template>
  <Button label="Primary" />
  <Button label="Success" severity="success" />
  <Button label="Danger" severity="danger" outlined />
  <Button icon="pi pi-check" label="Simpan" />
  <Button label="Loading" loading />
</template>
```

### InputText, Password, Textarea

```vue
<script setup>
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Textarea from 'primevue/textarea'
import { ref } from 'vue'

const name = ref('')
const pass = ref('')
const notes = ref('')
</script>

<template>
  <InputText v-model="name" placeholder="Nama" />
  <Password v-model="pass" toggleMask />
  <Textarea v-model="notes" rows="5" autoResize />
</template>
```

### Select / MultiSelect / Dropdown

```vue
<script setup>
import Select from 'primevue/select'
import { ref } from 'vue'

const selectedCity = ref(null)
const cities = ref([
  { name: 'Surabaya', code: 'SBY' },
  { name: 'Jakarta', code: 'JKT' },
])
</script>

<template>
  <Select
    v-model="selectedCity"
    :options="cities"
    optionLabel="name"
    placeholder="Pilih Kota"
  />
</template>
```

> Di PrimeVue 4, komponen `Dropdown` lama sudah diganti nama menjadi **`Select`** (nama lama masih tersedia sebagai alias di beberapa versi transisi, tapi gunakan `Select` untuk proyek baru).

### Checkbox, RadioButton, ToggleSwitch

```vue
<script setup>
import Checkbox from 'primevue/checkbox'
import RadioButton from 'primevue/radiobutton'
import ToggleSwitch from 'primevue/toggleswitch'
import { ref } from 'vue'

const agreed = ref(false)
const gender = ref('')
const active = ref(true)
</script>

<template>
  <Checkbox v-model="agreed" binary />
  <RadioButton v-model="gender" value="male" />
  <RadioButton v-model="gender" value="female" />
  <ToggleSwitch v-model="active" />
</template>
```

### Card & Panel

```vue
<script setup>
import Card from 'primevue/card'
</script>

<template>
  <Card>
    <template #title>Judul Kartu</template>
    <template #content>Isi konten di sini.</template>
  </Card>
</template>
```

---

## 5. Form & Validasi

PrimeVue 4 menyediakan modul **Forms** (`@primevue/forms`) terintegrasi dengan resolver validasi seperti Zod, Yup, atau Valibot.

```bash
npm install @primevue/forms zod
```

```vue
<script setup>
import { Form } from '@primevue/forms'
import { zodResolver } from '@primevue/forms/resolvers/zod'
import { z } from 'zod'
import InputText from 'primevue/inputtext'
import Button from 'primevue/button'
import Message from 'primevue/message'

const schema = z.object({
  email: z.string().min(1, 'Email wajib diisi').email('Email tidak valid'),
})

const resolver = zodResolver(schema)

function onSubmit({ valid, values }) {
  if (valid) {
    console.log('Data terkirim:', values)
  }
}
</script>

<template>
  <Form :resolver="resolver" @submit="onSubmit" class="flex flex-col gap-2">
    <InputText name="email" placeholder="Email" />
    <Message v-if="$form.email?.invalid" severity="error">
      {{ $form.email.error?.message }}
    </Message>
    <Button type="submit" label="Kirim" />
  </Form>
</template>
```

Alternatif: gunakan **VeeValidate** yang juga populer dipadukan dengan komponen PrimeVue jika proyek sudah memakainya sebelumnya.

---

## 6. Data Table

Komponen paling sering dipakai untuk menampilkan data tabular dengan fitur bawaan lengkap.

```vue
<script setup>
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { ref } from 'vue'

const products = ref([
  { id: 1, name: 'Kopi', price: 15000, category: 'Minuman' },
  { id: 2, name: 'Roti', price: 8000, category: 'Makanan' },
])
</script>

<template>
  <DataTable :value="products" paginator :rows="10" stripedRows>
    <Column field="name" header="Nama" sortable />
    <Column field="price" header="Harga" sortable>
      <template #body="{ data }">
        Rp{{ data.price.toLocaleString('id-ID') }}
      </template>
    </Column>
    <Column field="category" header="Kategori" />
  </DataTable>
</template>
```

### Fitur umum DataTable

- `paginator`, `rows`, `rowsPerPageOptions` — paginasi.
- `sortable` per kolom, atau `sortMode="multiple"`.
- `filters` + `<Column filterField ...>` — filtering per kolom.
- `selectionMode="multiple"` + `v-model:selection` — row selection.
- `lazy` + event `@page`, `@sort`, `@filter` — untuk data besar yang di-fetch dari server (server-side pagination).
- `scrollable` + `scrollHeight` — virtual scroll untuk ribuan baris.

```vue
<DataTable
  :value="products"
  lazy
  :totalRecords="totalRecords"
  :loading="loading"
  @page="onPage"
  paginator
  :rows="10"
>
  ...
</DataTable>
```

---

## 7. Overlay: Dialog, Toast, Confirm, Tooltip

### Dialog

```vue
<script setup>
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { ref } from 'vue'

const visible = ref(false)
</script>

<template>
  <Button label="Buka Dialog" @click="visible = true" />
  <Dialog v-model:visible="visible" header="Konfirmasi" modal :style="{ width: '25rem' }">
    <p>Apakah Anda yakin?</p>
    <Button label="Tutup" @click="visible = false" />
  </Dialog>
</template>
```

### Toast (notifikasi)

```vue
<script setup>
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import Button from 'primevue/button'

const toast = useToast()

function showSuccess() {
  toast.add({ severity: 'success', summary: 'Berhasil', detail: 'Data tersimpan', life: 3000 })
}
</script>

<template>
  <Toast />
  <Button label="Simpan" @click="showSuccess" />
</template>
```

> `<Toast />` cukup ditaruh sekali di `App.vue`. `ToastService` harus sudah didaftarkan di `main.ts` (lihat bagian 2).

### ConfirmDialog

```vue
<script setup>
import { useConfirm } from 'primevue/useconfirm'
import ConfirmDialog from 'primevue/confirmdialog'
import Button from 'primevue/button'

const confirm = useConfirm()

function confirmDelete() {
  confirm.require({
    message: 'Hapus data ini?',
    header: 'Konfirmasi Hapus',
    icon: 'pi pi-exclamation-triangle',
    accept: () => console.log('Dihapus'),
    reject: () => console.log('Dibatalkan'),
  })
}
</script>

<template>
  <ConfirmDialog />
  <Button label="Hapus" severity="danger" @click="confirmDelete" />
</template>
```

### Tooltip (directive)

```vue
<Button label="Info" v-tooltip="'Ini adalah tooltip'" />
```

Perlu registrasi directive di `main.ts`:

```ts
import Tooltip from 'primevue/tooltip'
app.directive('tooltip', Tooltip)
```

---

## 8. Menu & Navigasi

### Menubar

```vue
<script setup>
import Menubar from 'primevue/menubar'
import { ref } from 'vue'

const items = ref([
  { label: 'Home', icon: 'pi pi-home' },
  {
    label: 'Produk',
    icon: 'pi pi-box',
    items: [
      { label: 'Semua Produk' },
      { label: 'Tambah Produk' },
    ]
  },
])
</script>

<template>
  <Menubar :model="items" />
</template>
```

### TabView / Tabs

```vue
<script setup>
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
</script>

<template>
  <Tabs value="0">
    <TabList>
      <Tab value="0">Profil</Tab>
      <Tab value="1">Pengaturan</Tab>
    </TabList>
    <TabPanels>
      <TabPanel value="0">Isi profil</TabPanel>
      <TabPanel value="1">Isi pengaturan</TabPanel>
    </TabPanels>
  </Tabs>
</template>
```

### Breadcrumb, Steps, Sidebar/Drawer juga tersedia dengan API serupa (lihat dokumentasi resmi per komponen).

---

## 9. Layout dengan PrimeFlex

PrimeFlex adalah utility CSS (mirip Bootstrap grid / Tailwind) yang sering dipasangkan dengan PrimeVue.

```bash
npm install primeflex
```

```ts
// main.ts
import 'primeflex/primeflex.css'
```

```html
<div class="grid">
  <div class="col-12 md:col-6">Kolom 1</div>
  <div class="col-12 md:col-6">Kolom 2</div>
</div>

<div class="flex justify-content-between align-items-center gap-2">
  <span>Kiri</span>
  <span>Kanan</span>
</div>
```

> Jika proyek sudah memakai **Tailwind CSS**, umumnya PrimeFlex tidak diperlukan lagi — cukup pakai Tailwind untuk layout (lihat bagian 11).

---

## 10. Icons (PrimeIcons)

```html
<i class="pi pi-check"></i>
<i class="pi pi-times" style="font-size: 1.5rem; color: red"></i>
```

Dipakai juga sebagai prop `icon` di banyak komponen:

```vue
<Button icon="pi pi-search" label="Cari" iconPos="right" />
```

Katalog lengkap ikon: https://primevue.org/icons/

---

## 11. Integrasi dengan Tailwind CSS

PrimeVue 4 dirancang agar mudah dipadukan dengan Tailwind, terutama lewat plugin resmi.

```bash
npm install tailwindcss-primeui
```

```js
// tailwind.config.js
import PrimeUI from 'tailwindcss-primeui'

export default {
  plugins: [PrimeUI],
}
```

Setelah itu bisa memakai class seperti `p-primary-500`, `dark:p-surface-800`, dsb., yang otomatis mengikuti token tema PrimeVue aktif — sehingga styling custom tetap konsisten dengan tema komponen.

---

## 12. Komponen Kustom di Atas PrimeVue

### Membungkus komponen PrimeVue agar konsisten di seluruh aplikasi

```vue
<!-- components/AppButton.vue -->
<script setup>
import Button from 'primevue/button'
defineProps(['label', 'loading'])
const emit = defineEmits(['click'])
</script>

<template>
  <Button
    :label="label"
    :loading="loading"
    class="app-button"
    @click="emit('click')"
  />
</template>
```

Pola ini membantu jika suatu saat ingin mengganti library UI — cukup ubah 1 file wrapper, bukan seluruh aplikasi.

### Pass Through (`pt`) untuk kustomisasi mendalam

```vue
<DataTable
  :value="data"
  :pt="{
    header: { class: 'bg-primary text-white' },
    table: { style: 'min-width: 50rem' }
  }"
/>
```

`pt` berguna saat butuh menambahkan class/attribute ke elemen internal komponen tanpa override CSS global.

---

## 13. Best Practices

- **Import per komponen** (bukan seluruh library) agar bundle size kecil — tree-shaking otomatis berjalan baik dengan cara ini.
- **Gunakan satu preset tema terpusat** (`definePreset`) daripada override CSS manual di banyak tempat.
- **Pisahkan komponen form kompleks** (misal `Select`, `DataTable` dengan banyak konfigurasi) menjadi komponen wrapper reusable.
- **Gunakan `lazy` mode di DataTable** untuk dataset besar (ratusan/ribuan baris) — jangan render semua data sekaligus di client.
- **Pusatkan `Toast`, `ConfirmDialog`, `DynamicDialog`** di `App.vue` — cukup sekali per aplikasi, bukan di tiap halaman.
- **Cek breaking changes** saat upgrade dari PrimeVue 3 → 4: banyak nama komponen berubah (`Dropdown` → `Select`, `Calendar` → `DatePicker`, `InputSwitch` → `ToggleSwitch`, dll).
- **Gunakan `pt` daripada `!important` CSS** untuk override styling spesifik komponen.

---

## 14. Referensi Cepat (Cheat Sheet)

| Kebutuhan | Komponen PrimeVue |
|---|---|
| Tombol | `Button` |
| Input teks | `InputText` |
| Input angka | `InputNumber` |
| Dropdown pilihan | `Select` |
| Pilihan ganda | `MultiSelect` |
| Checkbox / Radio | `Checkbox` / `RadioButton` |
| Switch on/off | `ToggleSwitch` |
| Tanggal | `DatePicker` |
| Tabel data | `DataTable` + `Column` |
| Modal | `Dialog` |
| Notifikasi | `Toast` (+ `useToast`) |
| Konfirmasi aksi | `ConfirmDialog` (+ `useConfirm`) |
| Navigasi atas | `Menubar` |
| Tab | `Tabs`, `TabList`, `Tab`, `TabPanels`, `TabPanel` |
| Sidebar/drawer | `Drawer` |
| Loading indikator | `ProgressSpinner`, `ProgressBar`, `Skeleton` |
| Upload file | `FileUpload` |
| Kartu | `Card`, `Panel` |
| Tooltip | `v-tooltip` directive |

**Sumber resmi untuk pendalaman:** https://primevue.org/ (dokumentasi resmi, termasuk daftar lengkap komponen, props, dan contoh per versi).
