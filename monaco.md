# Panduan Belajar Monaco Editor untuk Agent

> **Untuk siapa file ini:** AI agent (Claude Code, Cursor, dll), BUKAN untuk diisi manusia.
> **Tujuan:** memastikan agent paham arsitektur, cara integrasi, dan jebakan umum Monaco Editor sebelum menulis kode — termasuk perbedaan penting antara pakai Monaco "polos" vs di dalam Tauri/Electron/aplikasi web biasa.

---

## Langkah 0 — Pahami Apa Itu Monaco Editor

Monaco Editor adalah **code editor** yang menjadi basis dari VS Code, dipaketkan sebagai library JS yang bisa ditempel ke halaman web mana pun. Karakteristik penting:

- Murni **client-side**, berjalan di browser (atau webview kalau dipakai di Electron/Tauri).
- Ditulis dalam TypeScript, di-compile ke JS + CSS + worker files.
- Bukan cuma syntax highlighting — punya IntelliSense, diagnostics, multi-cursor, diff view, minimap, dll — tapi fitur "pintar" (autocomplete kontekstual, error checking) untuk kebanyakan bahasa **tidak otomatis ada**, harus disediakan sendiri lewat Language Service/Language Server.
- Beda dengan Monaco versi VS Code asli: **built-in language intelligence yang kaya (mis. TypeScript/JS) hanya jalan penuh kalau web worker-nya ter-setup dengan benar** — banyak masalah integrasi Monaco justru soal worker, bukan soal editor-nya sendiri.

## Langkah 1 — Cek Cara Integrasi yang Relevan untuk Project

Ada beberapa cara pakai Monaco, pilih sesuai konteks project (cek `package.json` kalau project existing):

| Cara | Kapan dipakai | Catatan |
|---|---|---|
| `monaco-editor` (npm, raw) | Vanilla JS/webpack/vite custom setup | Perlu setup worker manual (lihat Langkah 3) |
| `@monaco-editor/react` | Project React | Wrapper populer, sudah handle loading & worker secara default, tapi tetap perlu paham config di baliknya untuk kasus lanjutan |
| CDN loader (`loader.js` dari `vs/`) | Prototyping cepat, tanpa bundler | Load Monaco lewat AMD loader, cocok untuk artifact/HTML standalone |
| Dalam Electron/Tauri (webview) | Desktop code editor app | Monaco tetap jalan di sisi renderer/webview (JS biasa) — akses filesystem/OS tetap harus lewat IPC/command backend, BUKAN langsung dari kode Monaco |

**Penting:** kalau project pakai bundler modern (Vite/Webpack), fetch dokumentasi integrasi resmi untuk bundler tersebut sebelum menulis config — cara handle worker berbeda antara Vite dan Webpack.

## Langkah 2 — Pahami Konsep Inti API

| Konsep | Penjelasan |
|---|---|
| `monaco.editor.create(container, options)` | Cara utama membuat instance editor, butuh DOM element sebagai container |
| **Model** (`monaco.editor.ITextModel`) | Representasi isi teks + bahasa + undo/redo history, **terpisah dari instance editor**. Satu model bisa dipasang ke editor mana pun; ini kunci untuk multi-tab/multi-file editor |
| `monaco.editor.createModel(value, language, uri)` | Membuat model baru; `uri` penting untuk membedakan file (dipakai juga oleh language service, mis. resolusi import TypeScript) |
| Diff Editor (`monaco.editor.createDiffEditor`) | Untuk tampilan side-by-side/inline diff antara dua model (original vs modified) |
| Language registration (`monaco.languages.register`) | Mendaftarkan bahasa baru/custom (untuk DSL, config file custom, dll) |
| `monaco.languages.registerCompletionItemProvider` | Cara menambah autocomplete custom untuk suatu bahasa |
| `monaco.languages.registerHoverProvider` / `registerDefinitionProvider` / dll | Provider-provider untuk fitur IDE-like (hover info, go-to-definition, dsb) — ini yang harus diisi manual kalau mau autocomplete pintar untuk bahasa custom |
| Themes (`monaco.editor.defineTheme`) | Kustomisasi warna syntax highlighting |
| Web Worker | Monaco menjalankan sebagian logic berat (tokenizing, validasi TypeScript/JSON/CSS bawaan) di web worker terpisah — kalau worker gagal load, fitur seperti error-checking diam-diam tidak jalan tanpa error yang jelas |

## Langkah 3 — Pahami Setup Worker (Sumber Bug Paling Umum)

Kalau pakai `monaco-editor` secara raw (bukan lewat CDN loader), Monaco butuh `MonacoEnvironment.getWorkerUrl`/`getWorker` untuk tahu cara load worker file per bahasa (json, css, html, typescript, editor worker umum). Kalau ini salah setup:
- Editor tetap tampil dan bisa diketik.
- Tapi fitur seperti validasi JSON schema, IntelliSense TypeScript, atau format-on-save diam-diam tidak berfungsi — **tanpa error yang jelas di console**, sering hanya warning samar soal worker.

Sebelum debug fitur yang "tidak jalan", **cek dulu apakah worker ter-load dengan benar** (lihat tab Network/console browser) — ini penyebab paling umum masalah integrasi Monaco yang laporannya membingungkan.

Untuk setup spesifik (Vite plugin, Webpack plugin, atau config CDN), fetch dokumentasi resmi terbaru — cara setup worker sering jadi bagian yang paling sering berubah antar versi bundler:
- Repo resmi: https://github.com/microsoft/monaco-editor
- Contoh integrasi per bundler ada di folder `samples/` repo tersebut.

## Langkah 4 — Pahami Kasus Penggunaan Umum & Pola Terkait

- **Multi-file editor (tab-based):** satu model per file, simpan referensi model di state aplikasi, ganti `editor.setModel(model)` saat pindah tab — jangan destroy & recreate editor instance tiap ganti file (mahal & bikin flicker).
- **Read-only viewer:** `options: { readOnly: true }` saat create, atau `editor.updateOptions({ readOnly: true })`.
- **Custom language/DSL:** kombinasi `monaco.languages.register` + `setMonarchTokensProvider` (untuk syntax highlighting sederhana berbasis regex) atau integrasi Language Server penuh via `monaco-languageclient`/`@volar/monaco` untuk validasi & autocomplete yang lebih canggih.
- **Autosave/dirty state:** dengarkan `model.onDidChangeContent` untuk tahu kapan isi berubah; `model.getAlternativeVersionId()` berguna untuk deteksi "apakah kembali ke state tersimpan" (mis. setelah undo).
- **Resize handling:** Monaco tidak auto-resize mengikuti container; harus manggil `editor.layout()` manual saat container berubah ukuran (mis. lewat `ResizeObserver`).

## Langkah 5 — Verifikasi Pemahaman Sebelum Lanjut ke Task

- [ ] Paham beda antara "editor instance" dan "model", dan kenapa pemisahan ini penting untuk multi-file editor?
- [ ] Tahu bahwa autocomplete/validasi pintar untuk bahasa tertentu (selain built-in) harus disediakan sendiri lewat provider/language service, bukan otomatis dari Monaco?
- [ ] Paham potensi masalah worker dan tahu cara mengecek apakah worker ter-load dengan benar?
- [ ] Tahu kenapa editor tidak auto-resize dan harus manggil `layout()` manual?
- [ ] Kalau konteksnya desktop app (Tauri/Electron): paham bahwa Monaco tetap "hanya" JS di sisi UI, dan akses filesystem tetap harus lewat command/IPC backend, bukan langsung dari kode Monaco?

## Catatan Tambahan

- Cara setup worker & plugin bundler adalah bagian yang paling sering berubah — selalu cek `samples/` di repo resmi microsoft/monaco-editor atau dokumentasi wrapper yang dipakai (mis. `@monaco-editor/react`) untuk versi yang sesuai dengan `package.json` project.
- Kalau project butuh fitur "seperti VS Code" yang kompleks (multi-root workspace, extension system penuh), pertimbangkan apakah kebutuhannya sebenarnya lebih cocok pakai `vscode.dev`/embed VS Code, bukan Monaco standalone — jangan berasumsi semua fitur VS Code otomatis ada di Monaco.
