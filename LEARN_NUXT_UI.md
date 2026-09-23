# Panduan Belajar Nuxt UI untuk Agent

> **Untuk siapa file ini:** AI agent (Claude Code, Cursor, dll), BUKAN untuk diisi manusia.
> **Tujuan:** memastikan agent paham arsitektur, cara instalasi, sistem theming, dan komponen inti Nuxt UI sebelum menulis kode — termasuk perbedaan penting antar versi (v2 vs v3/v4) yang API & cara theming-nya cukup berbeda.
> **Catatan versi:** per pertengahan 2026, versi aktif adalah **Nuxt UI v3/v4** (dibangun di atas **Reka UI** + **Tailwind CSS v4**), migrasi dari v2 (Tailwind CSS v3 + `ui.config` berbasis JS) sudah lama berjalan. Kalau project existing masih pakai `tailwind.config.ts` dengan `ui.config/` folder gaya lama, itu tanda masih di v2 — jangan asumsikan API v3/v4 berlaku di situ.

---

## Langkah 0 — Cek Versi yang Relevan

1. Cek `package.json` → versi `@nuxt/ui` atau `@nuxt/ui-pro`.
2. Cek `nuxt.config.ts` / `main.css` — kalau ada `@import "tailwindcss"` + `@import "@nuxt/ui"` di file CSS, itu ciri v3/v4 (Tailwind CSS v4, CSS-first config). Kalau masih pakai `tailwind.config.ts` dengan `content`/`theme.extend` gaya lama dan `app.config.ts` berisi `ui: { primary: 'green', gray: 'cool' }`, itu bisa jadi masih v2 dengan API lama.
3. Kalau ragu versi mana yang berlaku, fetch dokumentasi resmi sesuai versi:
   - v3/v4 (aktif): https://ui.nuxt.com
   - v2 (legacy): dokumentasi v2 biasanya masih bisa diakses via branch/tag terpisah di repo GitHub `nuxt/ui`

## Langkah 1 — Pahami Fondasi Nuxt UI

Nuxt UI dibangun dari 3 lapisan:

| Lapisan | Peran |
|---|---|
| **Reka UI** | Menyediakan primitive component *unstyled* dan accessible (fokus manajemen, keyboard nav, ARIA) — ini fondasi behavior/interaksi |
| **Tailwind CSS (v4)** | Sistem styling utility-first, dipakai untuk semua visual styling komponen |
| **Tailwind Variants** | Library untuk mengelola *variant* styling (warna, ukuran, state) secara terstruktur per komponen, termasuk dukungan multi-slot |

Implikasi penting: komponen Nuxt UI **sudah accessible dan sudah punya behavior lengkap** (dari Reka UI) — agent tidak perlu menambah handling keyboard/focus manual untuk komponen seperti dropdown, modal, dsb, kecuali untuk kasus custom yang benar-benar di luar API yang disediakan.

Nuxt UI bisa dipakai dalam 2 mode:
- **Sebagai modul Nuxt** (paling umum) — otomatis auto-import komponen (`UButton`, `UCard`, dll) tanpa perlu import manual.
- **Sebagai library Vue murni** (tanpa Nuxt) — perlu setup manual, komponen tidak auto-import.

## Langkah 2 — Instalasi & Setup Dasar

**Dalam project Nuxt:**
```bash
npx nuxi module add ui
```
atau manual:
```bash
npm install @nuxt/ui
```
```typescript
// nuxt.config.ts
export default defineNuxtConfig({
  modules: ['@nuxt/ui'],
  css: ['~/assets/css/main.css']
})
```
```css
/* app/assets/css/main.css */
@import "tailwindcss";
@import "@nuxt/ui";
```

Setelah setup ini, semua komponen (`UButton`, `UInput`, `UModal`, dll) otomatis tersedia di seluruh project tanpa import manual — **jangan** tulis `import { UButton } from '@nuxt/ui'` secara manual di dalam project Nuxt, itu tidak diperlukan dan bisa jadi tanda kesalahpahaman soal auto-import.

**Wajib cek versi Node.js & Nuxt yang kompatibel** sebelum instalasi — fetch dokumentasi resmi kalau ada error kompatibilitas, karena requirement bisa berubah antar rilis minor.

## Langkah 3 — Pahami Sistem Theming (Bagian Paling Sering Salah)

Ada **3 tingkat kustomisasi**, dari global ke paling spesifik — pahami kapan pakai yang mana:

### a. Design tokens via `@theme` (Tailwind CSS v4, level paling global)
```css
/* app/assets/css/main.css */
@import "tailwindcss";
@import "@nuxt/ui";

@theme static {
  --font-sans: 'Public Sans', sans-serif;
  --color-green-500: #00C16A;
}
```
Dipakai untuk override token dasar: warna, font, breakpoint. Ini pengganti `tailwind.config.ts` gaya lama (CSS-first config, bukan JS config).

### b. Alias warna semantik via `app.config.ts` (level tema aplikasi)
```typescript
// app.config.ts
export default defineAppConfig({
  ui: {
    colors: {
      primary: 'green',
      neutral: 'slate'
    }
  }
})
```
Dipakai untuk mengganti warna "peran" (`primary`, `neutral`, dst) tanpa menyentuh komponen satu-satu. Ini yang paling sering dipakai untuk branding cepat.

### c. Override per-komponen via `ui` prop (level paling spesifik)
```vue
<UButton :ui="{ base: 'rounded-full font-bold' }">
  Klik Saya
</UButton>
```
Dipakai untuk kasus satu instance komponen butuh gaya beda dari default — **jangan** override global (`app.config.ts` atau `@theme`) hanya untuk kebutuhan satu tempat pemakaian.

**Aturan penting:** semua metode ini di-*merge* pakai `tailwind-merge` (bukan replace total), jadi agent tidak perlu menulis ulang semua class, cukup class yang mau diubah/ditambah — kecuali strategi override diset eksplisit ke "override penuh".

Kalau butuh detail struktur `theme` per komponen (slot apa saja yang tersedia untuk komponen tertentu), cek bagian "Theme" di halaman dokumentasi komponen terkait — jangan menebak nama slot dari ingatan karena berbeda-beda per komponen.

## Langkah 4 — (Opsional tapi Direkomendasikan) Pasang Skill Resmi Nuxt UI

Nuxt UI menyediakan **skill resmi untuk AI coding agent** (termasuk Claude Code) yang berisi pengetahuan lengkap 125+ komponen beserta props & pola penggunaannya, selalu sinkron dengan versi terbaru. Ini lebih andal dibanding daftar statis mana pun (termasuk daftar di file ini), karena resmi dari tim Nuxt UI dan ter-update otomatis.

```bash
npx skills add nuxt/ui
# atau khusus Claude Code:
claude skill add https://github.com/nuxt/ui/tree/v4/skills/nuxt-ui
```

Setelah terpasang, skill bisa dipanggil dengan `/nuxt-ui` di chat agent. Kalau tersedia opsi ini di environment agent, **prioritaskan pakai skill resmi ini** dibanding hanya mengandalkan daftar komponen manual di bawah. Kalau tidak memungkinkan (mis. agent tidak bisa install skill eksternal), lanjut pakai daftar komponen di Langkah 5 sebagai referensi.

## Langkah 5 — Daftar Lengkap Komponen (Referensi Cadangan)

Berikut seluruh komponen Nuxt UI v4 (`@nuxt/ui` gratis, kecuali ditandai **Pro**), dikelompokkan per kategori. Prefix `U` ditambahkan otomatis saat dipakai di template (mis. komponen `Button` dipakai sebagai `<UButton>`).

### Element Dasar
`Avatar`, `AvatarGroup`, `Badge`, `Button`, `ButtonGroup`, `Calendar`, `Chip`, `Icon`, `Kbd`, `Link`, `Separator`, `User`

### Form & Input
`Checkbox`, `CheckboxGroup`, `ColorPicker`, `Form`, `FormField`, `Input`, `InputDate`, `InputMenu`, `InputNumber`, `InputRating`, `InputTags`, `InputTime`, `Listbox`, `PinInput`, `RadioGroup`, `Select`, `SelectMenu`, `Slider`, `Switch`, `Textarea`, `FileUpload`, `AuthForm`, `FieldGroup`

### Overlay
`Modal`, `Slideover`, `Drawer`, `Popover`, `DropdownMenu`, `ContextMenu`, `Tooltip`

### Navigasi
`NavigationMenu`, `Tabs`, `Breadcrumb`, `Pagination`, `CommandPalette`, `Stepper`, `Tree`

### Data Display
`Table`, `Card`, `Accordion`, `Carousel`, `Timeline`, `Collapsible`, `Splitter`, `ScrollArea`, `Marquee`

### Feedback & Status
`Alert`, `Banner`, `Toast` (via composable `useToast()`), `Progress`, `ProgressGroup`, `Skeleton`, `Empty`, `Error`

### Layout & Struktur Halaman
`App`, `Container`, `Main`, `Header`, `Footer`, `FooterColumns`, `Page`, `PageAnchors`, `PageAside`, `PageBody`, `PageCard`, `PageColumns`, `PageCTA`, `PageFeature`, `PageGrid`, `PageHeader`, `PageHero`, `PageLinks`, `PageList`, `PageLogos`, `PageSection`

### Dashboard Layout (umumnya kombinasi Dashboard* untuk membangun layout admin/app)
`DashboardGroup`, `DashboardNavbar`, `DashboardPanel`, `DashboardResizeHandle`, `DashboardSearch`, `DashboardSearchButton`, `DashboardSidebar`, `DashboardSidebarCollapse`, `DashboardSidebarToggle`, `DashboardToolbar`, `Sidebar`

### Chat / AI UI
`Chat`, `ChatMessage`, `ChatMessages`, `ChatPalette`, `ChatPrompt`, `ChatPromptSubmit`, `ChatReasoning`, `ChatShimmer`, `ChatTool`

### Rich Text Editor
`Editor`, `EditorDragHandle`, `EditorEmojiMenu`, `EditorMentionMenu`, `EditorSuggestionMenu`, `EditorToolbar`

### Konten & Blog
`BlogPost`, `BlogPosts`, `ChangelogVersion`, `ChangelogVersions`, `ContentNavigation`, `ContentSearch`, `ContentSearchButton`, `ContentSurround`, `ContentToc`

### Pricing
`PricingPlan`, `PricingPlans`, `PricingTable`

### Warna & Locale
`ColorModeAvatar`, `ColorModeButton`, `ColorModeImage`, `ColorModeSelect`, `ColorModeSwitch`, `LocaleSelect`

### Komponen Typography (khusus dipakai di konten Markdown via Nuxt Content — prefix `Prose`, bukan `U`)
`ProseAccordion`, `ProseBadge`, `ProseCallout`, `ProseCard`, `ProseCardGroup`, `ProseCode` (`Code`), `ProseCodeCollapse`, `ProseCodeGroup`, `ProseCodePreview`, `ProseCodeTree`, `ProseCollapsible`, `ProseField`, `ProseFieldGroup`, `ProseIcon`, `ProseKbd`, `ProsePrompt`, `ProseSteps`, `ProseTabs`

### Composable Penting (bukan komponen, tapi API JS yang menyertai)
`useToast()`, `useOverlay()`, `useScrollShadow()`, `useTour()`, `defineShortcuts()`, `defineLocale()`, `extendLocale()`, `extractShortcuts()`

**Catatan penting:**
- Daftar di atas adalah komponen **gratis** (`@nuxt/ui`). Sebagian layout kompleks siap-pakai (dashboard/docs template lengkap) dan komponen tambahan lain berada di **`@nuxt/ui-pro`** (berbayar) — kalau project tidak install `@nuxt/ui-pro`, jangan gunakan komponen yang khusus ada di paket itu.
- Daftar ini bisa bertambah seiring rilis baru. Kalau butuh kepastian 100% terkini (props terbaru, komponen baru pasca file ini dibuat), fetch langsung: https://ui.nuxt.com/sitemap.md (index semua halaman, termasuk semua komponen) atau https://ui.nuxt.com/llms-full.txt (dokumentasi lengkap format LLM-friendly).
- Untuk detail props/slot/theme tiap komponen, buka halaman spesifiknya: `https://ui.nuxt.com/docs/components/<nama-komponen-kebab-case>` (mis. `.../components/dropdown-menu`).

## Langkah 6 — Pahami Pola Penggunaan Umum

- **Form dengan validasi:**
  ```vue
  <UForm :schema="schema" :state="state" @submit="onSubmit">
    <UFormField label="Email" name="email">
      <UInput v-model="state.email" />
    </UFormField>
  </UForm>
  ```
  `schema` biasanya berupa Zod schema; error otomatis muncul di `UFormField` terkait tanpa perlu wiring manual.

- **Notifikasi via composable, bukan komponen langsung di template:**
  ```typescript
  const toast = useToast()
  toast.add({ title: 'Berhasil disimpan', color: 'success' })
  ```

- **Icon:** Nuxt UI terintegrasi dengan Iconify — pakai nama icon set (mis. `i-lucide-check`) sebagai string, bukan import komponen icon satu-satu.

- **Dark mode:** terintegrasi dengan `@nuxtjs/color-mode` — komponen otomatis merespons dark/light tanpa styling manual tambahan, kecuali ada custom styling yang perlu varian dark eksplisit (`dark:` prefix Tailwind).

## Langkah 7 — Verifikasi Pemahaman Sebelum Lanjut ke Task

- [ ] Tahu cara membedakan project pakai Nuxt UI v2 (legacy) vs v3/v4 (aktif) dari config yang ada?
- [ ] Paham 3 tingkat kustomisasi styling (`@theme` token global → `app.config.ts` alias warna → `ui` prop per instance) dan kapan pakai masing-masing?
- [ ] Tahu bahwa komponen auto-import di project Nuxt, tidak perlu import manual?
- [ ] Tahu perbedaan komponen yang tersedia gratis (`@nuxt/ui`) vs yang butuh lisensi Pro (`@nuxt/ui-pro`)?
- [ ] Paham cara pakai `useToast()` sebagai composable, bukan komponen template langsung?
- [ ] Tahu bahwa styling override digabung (merge) lewat `tailwind-merge`, bukan replace total, kecuali strategi diset override penuh?
- [ ] Tahu kalau tersedia, prioritaskan pakai skill resmi Nuxt UI (`/nuxt-ui`) dibanding hanya mengandalkan daftar komponen manual di file ini?
- [ ] Kalau butuh komponen yang tidak ada di daftar Langkah 5 (kemungkinan rilis baru), tahu harus fetch `ui.nuxt.com/sitemap.md` untuk verifikasi, bukan menebak nama komponen?

## Catatan Tambahan

- Nuxt UI masih berkembang aktif dan dokumentasi resminya (https://ui.nuxt.com) adalah sumber kebenaran utama untuk detail props/slot/theme tiap komponen — file ini memberi peta konsep, bukan pengganti dokumentasi lengkap per komponen.
- Kalau menemukan campuran pola v2 dan v3/v4 di satu project (misal `tailwind.config.ts` lama tapi `@nuxt/ui` versi baru), catat sebagai temuan yang perlu diklarifikasi/dibersihkan, jangan dianggap konfigurasi normal.
