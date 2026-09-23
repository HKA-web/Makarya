# Panduan Lengkap Vue 3

Dokumen ini dirancang sebagai bahan belajar terstruktur untuk memahami Vue 3 dari dasar hingga tingkat lanjut, termasuk Composition API, ekosistem (Router, Pinia), dan praktik terbaik.

---

## Daftar Isi

1. [Pengenalan Vue 3](#1-pengenalan-vue-3)
2. [Setup Proyek](#2-setup-proyek)
3. [Dasar Template & Reaktivitas](#3-dasar-template--reaktivitas)
4. [Composition API](#4-composition-api)
5. [Komponen](#5-komponen)
6. [Computed & Watchers](#6-computed--watchers)
7. [Lifecycle Hooks](#7-lifecycle-hooks)
8. [Directives Bawaan](#8-directives-bawaan)
9. [Forms & v-model](#9-forms--v-model)
10. [Slots](#10-slots)
11. [Provide/Inject](#11-provideinject)
12. [Composables (Reusable Logic)](#12-composables-reusable-logic)
13. [Vue Router](#13-vue-router)
14. [Pinia (State Management)](#14-pinia-state-management)
15. [TypeScript dengan Vue 3](#15-typescript-dengan-vue-3)
16. [Performance & Best Practices](#16-performance--best-practices)
17. [Testing](#17-testing)
18. [Referensi Cepat (Cheat Sheet)](#18-referensi-cepat-cheat-sheet)

---

## 1. Pengenalan Vue 3

Vue 3 adalah framework JavaScript progresif untuk membangun antarmuka pengguna (UI). Fitur utama dibanding Vue 2:

- **Composition API** — cara baru menyusun logika komponen berdasarkan fitur, bukan opsi.
- **Performa lebih baik** — reaktivitas berbasis Proxy (bukan `Object.defineProperty`), virtual DOM lebih cepat.
- **Multiple root elements** (Fragments) — template tidak perlu satu root tunggal.
- **Teleport** — merender elemen ke bagian lain dari DOM (modal, tooltip).
- **Suspense** — menangani komponen async dengan elegan.
- **TypeScript support** yang jauh lebih baik.

Dua gaya penulisan komponen:
- **Options API** (gaya Vue 2, berbasis `data`, `methods`, `computed`)
- **Composition API** (gaya Vue 3, berbasis fungsi `setup()` atau `<script setup>`)

> Rekomendasi: pelajari **Composition API + `<script setup>`** karena ini adalah standar modern Vue 3.

---

## 2. Setup Proyek

### Membuat proyek baru (Vite — direkomendasikan)

```bash
npm create vue@latest
cd nama-proyek
npm install
npm run dev
```

Saat wizard berjalan, pilih opsi sesuai kebutuhan: TypeScript, Vue Router, Pinia, ESLint, dll.

### Struktur folder umum

```
src/
├── assets/
├── components/
├── composables/
├── router/
├── stores/
├── views/
├── App.vue
└── main.ts
```

### File `main.ts`

```ts
import { createApp } from 'vue'
import App from './App.vue'
import router from './router'
import { createPinia } from 'pinia'

const app = createApp(App)
app.use(router)
app.use(createPinia())
app.mount('#app')
```

---

## 3. Dasar Template & Reaktivitas

### Single File Component (SFC)

```vue
<script setup>
import { ref } from 'vue'

const count = ref(0)

function increment() {
  count.value++
}
</script>

<template>
  <button @click="increment">Count: {{ count }}</button>
</template>

<style scoped>
button {
  padding: 8px 16px;
}
</style>
```

### `ref` vs `reactive`

```js
import { ref, reactive } from 'vue'

// ref: untuk primitif ATAU objek. Akses via .value di script.
const name = ref('Budi')
name.value = 'Andi'

// reactive: hanya untuk objek/array. Tidak perlu .value.
const user = reactive({ name: 'Budi', age: 25 })
user.age = 26
```

**Aturan penting:**
- Di dalam `<template>`, `ref` otomatis "unwrapped" (tidak perlu `.value`).
- `reactive` tidak bisa di-destructure tanpa kehilangan reaktivitas (gunakan `toRefs`).
- Untuk objek kompleks, banyak developer lebih suka `ref` konsisten daripada campur `ref`+`reactive`.

```js
import { reactive, toRefs } from 'vue'

const state = reactive({ x: 0, y: 0 })
const { x, y } = toRefs(state) // tetap reaktif
```

---

## 4. Composition API

### `<script setup>` (disarankan)

Sintaks ringkas, semua yang dideklarasikan otomatis tersedia di template.

```vue
<script setup>
import { ref, computed } from 'vue'

const price = ref(100)
const qty = ref(2)
const total = computed(() => price.value * qty.value)
</script>

<template>
  <p>Total: {{ total }}</p>
</template>
```

### Fungsi `setup()` (gaya lama, tanpa `<script setup>`)

```vue
<script>
import { ref } from 'vue'

export default {
  setup() {
    const count = ref(0)
    function increment() { count.value++ }
    return { count, increment }
  }
}
</script>
```

### Props & Emits di `<script setup>`

```vue
<script setup>
const props = defineProps({
  title: { type: String, required: true },
  count: { type: Number, default: 0 }
})

const emit = defineEmits(['update', 'close'])

function handleClick() {
  emit('update', props.count + 1)
}
</script>

<template>
  <h2>{{ title }}</h2>
  <button @click="handleClick">Tambah</button>
</template>
```

---

## 5. Komponen

### Komunikasi Parent → Child (Props)

```vue
<!-- Parent.vue -->
<template>
  <ChildComponent :message="msg" />
</template>

<script setup>
import ChildComponent from './ChildComponent.vue'
import { ref } from 'vue'
const msg = ref('Halo dari parent')
</script>
```

```vue
<!-- ChildComponent.vue -->
<script setup>
defineProps(['message'])
</script>
<template>
  <p>{{ message }}</p>
</template>
```

### Komunikasi Child → Parent (Emits)

```vue
<!-- Child -->
<script setup>
const emit = defineEmits(['saved'])
</script>
<template>
  <button @click="emit('saved', { id: 1 })">Simpan</button>
</template>
```

```vue
<!-- Parent -->
<template>
  <Child @saved="onSaved" />
</template>
<script setup>
function onSaved(data) {
  console.log(data)
}
</script>
```

### `v-model` pada komponen kustom

```vue
<!-- Custom Input -->
<script setup>
defineProps(['modelValue'])
defineEmits(['update:modelValue'])
</script>
<template>
  <input :value="modelValue" @input="$emit('update:modelValue', $event.target.value)" />
</template>
```

```vue
<CustomInput v-model="username" />
```

### Dynamic Components

```vue
<component :is="currentTab" />
```

---

## 6. Computed & Watchers

### `computed`

```js
import { ref, computed } from 'vue'

const firstName = ref('Budi')
const lastName = ref('Santoso')

const fullName = computed(() => `${firstName.value} ${lastName.value}`)
```

`computed` bersifat **cached** — hanya dihitung ulang saat dependensinya berubah.

### `watch`

```js
import { ref, watch } from 'vue'

const question = ref('')

watch(question, (newVal, oldVal) => {
  console.log('Pertanyaan berubah:', newVal)
})

// watch multiple sources
watch([a, b], ([newA, newB], [oldA, oldB]) => { /* ... */ })

// watch dengan opsi deep
watch(someObject, (newVal) => { /* ... */ }, { deep: true, immediate: true })
```

### `watchEffect`

Menjalankan fungsi segera dan melacak dependensi secara otomatis.

```js
import { watchEffect } from 'vue'

watchEffect(() => {
  console.log(`Nilai count saat ini: ${count.value}`)
})
```

Gunakan `watch` saat butuh kontrol lebih (nilai lama, lazy, sumber spesifik). Gunakan `watchEffect` untuk efek samping sederhana yang otomatis melacak dependensi.

---

## 7. Lifecycle Hooks

| Options API | Composition API |
|---|---|
| `created` | (langsung di `setup()`) |
| `mounted` | `onMounted` |
| `updated` | `onUpdated` |
| `unmounted` | `onUnmounted` |
| `beforeMount` | `onBeforeMount` |
| `beforeUpdate` | `onBeforeUpdate` |
| `beforeUnmount` | `onBeforeUnmount` |

```vue
<script setup>
import { onMounted, onUnmounted } from 'vue'

onMounted(() => {
  console.log('Komponen sudah ter-mount')
})

onUnmounted(() => {
  console.log('Komponen dihancurkan, bersihkan listener/timer di sini')
})
</script>
```

---

## 8. Directives Bawaan

```vue
<!-- Conditional rendering -->
<p v-if="isVisible">Tampil</p>
<p v-else-if="isLoading">Loading...</p>
<p v-else>Tidak tampil</p>

<!-- v-show (tetap di DOM, hanya toggle CSS display) -->
<p v-show="isVisible">Tampil/Sembunyi</p>

<!-- Looping -->
<li v-for="item in items" :key="item.id">{{ item.name }}</li>

<!-- Binding attribute/class/style -->
<div :class="{ active: isActive, error: hasError }"></div>
<div :style="{ color: activeColor, fontSize: size + 'px' }"></div>

<!-- Event handling -->
<button @click="handleClick">Klik</button>
<button @click="count++">+1</button>
<input @keyup.enter="submit" />

<!-- Two-way binding -->
<input v-model="text" />

<!-- Render HTML mentah (hati-hati XSS) -->
<div v-html="rawHtml"></div>
```

**Catatan `key` pada `v-for`:** selalu gunakan `key` unik (bukan index jika data bisa berubah urutan) agar Vue bisa melacak identitas elemen dengan benar saat re-render.

---

## 9. Forms & v-model

```vue
<script setup>
import { ref } from 'vue'
const text = ref('')
const checked = ref(false)
const picked = ref('one')
const selected = ref('')
</script>

<template>
  <input v-model="text" placeholder="Ketik sesuatu" />
  <input type="checkbox" v-model="checked" />
  <input type="radio" value="one" v-model="picked" />
  <select v-model="selected">
    <option value="a">A</option>
    <option value="b">B</option>
  </select>
</template>
```

Modifiers berguna: `.lazy` (update saat blur, bukan saat input), `.number` (konversi otomatis ke angka), `.trim` (hapus spasi).

```vue
<input v-model.trim.lazy="username" />
```

---

## 10. Slots

### Slot dasar

```vue
<!-- Card.vue -->
<template>
  <div class="card">
    <slot>Konten default jika tidak diisi</slot>
  </div>
</template>
```

```vue
<Card>
  <p>Ini konten yang disisipkan</p>
</Card>
```

### Named Slots

```vue
<!-- Layout.vue -->
<template>
  <header><slot name="header" /></header>
  <main><slot /></main>
  <footer><slot name="footer" /></footer>
</template>
```

```vue
<Layout>
  <template #header><h1>Judul</h1></template>
  <p>Isi utama</p>
  <template #footer>Copyright 2026</template>
</Layout>
```

### Scoped Slots

```vue
<!-- List.vue -->
<template>
  <li v-for="item in items" :key="item.id">
    <slot :item="item" />
  </li>
</template>
```

```vue
<List :items="items">
  <template #default="{ item }">
    <strong>{{ item.name }}</strong>
  </template>
</List>
```

---

## 11. Provide/Inject

Berguna untuk berbagi data lintas komponen tanpa "prop drilling".

```vue
<!-- Ancestor.vue -->
<script setup>
import { provide, ref } from 'vue'
const theme = ref('dark')
provide('theme', theme)
</script>
```

```vue
<!-- Descendant.vue (level manapun di bawahnya) -->
<script setup>
import { inject } from 'vue'
const theme = inject('theme', 'light') // 'light' = default value
</script>
```

Untuk keamanan tipe & menghindari typo string key, gunakan Symbol sebagai key di proyek besar.

---

## 12. Composables (Reusable Logic)

Composable adalah fungsi yang memanfaatkan Composition API untuk mengenkapsulasi & menggunakan kembali logika stateful.

```js
// composables/useCounter.js
import { ref } from 'vue'

export function useCounter(initial = 0) {
  const count = ref(initial)
  function increment() { count.value++ }
  function decrement() { count.value-- }
  return { count, increment, decrement }
}
```

```vue
<script setup>
import { useCounter } from '@/composables/useCounter'
const { count, increment } = useCounter(10)
</script>
```

Contoh lain yang umum: `useFetch`, `useLocalStorage`, `useMouse`, `useDebounce`. Library **VueUse** menyediakan puluhan composable siap pakai.

---

## 13. Vue Router

```bash
npm install vue-router@4
```

```js
// router/index.js
import { createRouter, createWebHistory } from 'vue-router'
import Home from '@/views/Home.vue'
import About from '@/views/About.vue'

const routes = [
  { path: '/', component: Home },
  { path: '/about', component: About },
  { path: '/user/:id', component: () => import('@/views/User.vue') }, // lazy load
]

const router = createRouter({
  history: createWebHistory(),
  routes,
})

export default router
```

```vue
<!-- App.vue -->
<template>
  <nav>
    <RouterLink to="/">Home</RouterLink>
    <RouterLink to="/about">About</RouterLink>
  </nav>
  <RouterView />
</template>
```

### Mengakses parameter route

```vue
<script setup>
import { useRoute, useRouter } from 'vue-router'

const route = useRoute()
const router = useRouter()

console.log(route.params.id)
router.push('/about')
</script>
```

### Navigation Guards

```js
router.beforeEach((to, from) => {
  if (to.meta.requiresAuth && !isLoggedIn()) {
    return '/login'
  }
})
```

---

## 14. Pinia (State Management)

Pinia adalah pengganti resmi Vuex untuk Vue 3.

```bash
npm install pinia
```

```js
// stores/counter.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)
  const doubleCount = computed(() => count.value * 2)

  function increment() {
    count.value++
  }

  return { count, doubleCount, increment }
})
```

```vue
<script setup>
import { useCounterStore } from '@/stores/counter'
const counter = useCounterStore()
</script>

<template>
  <p>{{ counter.count }} / {{ counter.doubleCount }}</p>
  <button @click="counter.increment">+</button>
</template>
```

Gaya di atas disebut **Setup Store** (mirip `<script setup>`). Ada juga gaya **Options Store** yang mirip Vuex (`state`, `getters`, `actions`).

---

## 15. TypeScript dengan Vue 3

```vue
<script setup lang="ts">
import { ref } from 'vue'

interface User {
  id: number
  name: string
}

const user = ref<User | null>(null)

const props = defineProps<{
  title: string
  count?: number
}>()

const emit = defineEmits<{
  update: [value: number]
  close: []
}>()
</script>
```

Vue 3 SFC mendukung tipe generik penuh untuk `defineProps`, `defineEmits`, dan `ref<T>`.

---

## 16. Performance & Best Practices

- **Gunakan `key` yang stabil** pada `v-for`, hindari index sebagai key jika daftar bisa berubah.
- **Lazy-load route/komponen besar** dengan `() => import(...)`.
- **`v-once`** untuk konten statis yang tidak pernah berubah setelah render pertama.
- **`v-memo`** untuk skip re-render pada bagian template tertentu berdasarkan dependensi.
- **Hindari watcher `deep: true`** pada objek besar jika tidak perlu — mahal secara performa.
- **Pisahkan logika ke composables** agar komponen tetap kecil dan mudah diuji.
- **Gunakan `shallowRef`/`shallowReactive`** untuk objek besar yang tidak butuh reaktivitas mendalam.
- **Hindari mutasi props langsung** — props bersifat read-only dari sisi child.
- Struktur folder berbasis fitur (feature-based) lebih scalable untuk aplikasi besar dibanding berbasis tipe file.

---

## 17. Testing

### Unit test komponen (Vitest + Vue Test Utils)

```bash
npm install -D vitest @vue/test-utils jsdom
```

```js
// Counter.test.js
import { mount } from '@vue/test-utils'
import { describe, it, expect } from 'vitest'
import Counter from '@/components/Counter.vue'

describe('Counter', () => {
  it('increments on click', async () => {
    const wrapper = mount(Counter)
    await wrapper.find('button').trigger('click')
    expect(wrapper.text()).toContain('1')
  })
})
```

---

## 18. Referensi Cepat (Cheat Sheet)

| Kebutuhan | API |
|---|---|
| State reaktif primitif/objek | `ref()` |
| State reaktif objek/array saja | `reactive()` |
| Nilai turunan (cached) | `computed()` |
| Efek samping saat data berubah | `watch()` / `watchEffect()` |
| Hook saat komponen mount | `onMounted()` |
| Hook saat komponen dihapus | `onUnmounted()` |
| Kirim data ke child | `props` (`defineProps`) |
| Kirim event ke parent | `emit` (`defineEmits`) |
| Binding dua arah | `v-model` |
| Berbagi data lintas level | `provide()` / `inject()` |
| Logika reusable | Composable (fungsi `useXxx()`) |
| Routing | `vue-router` |
| Global state | `pinia` |
| Render elemen di luar DOM tree | `<Teleport>` |
| Menangani komponen async | `<Suspense>` |

---

## Urutan Belajar yang Disarankan

1. Dasar template, `ref`/`reactive`, event handling, directives (bagian 3, 8).
2. Komponen: props, emits, slots (bagian 5, 10).
3. Computed & watchers, lifecycle (bagian 6, 7).
4. Composables (bagian 12) — titik balik penting untuk kode yang rapi.
5. Vue Router & Pinia (bagian 13–14) — untuk aplikasi multi-halaman dengan state global.
6. TypeScript & testing (bagian 15, 17) — untuk proyek production-grade.

**Sumber resmi untuk pendalaman:** https://vuejs.org/guide/introduction.html (dokumentasi resmi, selalu paling akurat untuk versi terbaru).
