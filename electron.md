# Panduan Belajar Electron.js untuk Agent

> **Untuk siapa file ini:** AI agent (Claude Code, Cursor, dll), BUKAN untuk diisi manusia.
> **Tujuan:** memastikan agent punya pemahaman yang benar tentang arsitektur & praktik keamanan Electron sebelum menulis kode — terutama karena banyak contoh Electron lama di internet memakai pola yang sekarang dianggap tidak aman (`nodeIntegration: true`, tanpa `contextIsolation`).

---

## Langkah 0 — Cek Konteks Project (kalau ada project existing)

1. Cek versi Electron di `package.json` (`"electron": "..."`). Electron rilis cepat (mengikuti versi Chromium), jadi API/behavior bisa berbeda signifikan antar major version.
2. Cek apakah project pakai boilerplate/tooling tertentu: Electron Forge, Electron Builder, Vite (`electron-vite`), atau setup manual. Ini menentukan struktur file & cara build.
3. Kalau ragu soal API terbaru, fetch dokumentasi resmi: https://www.electronjs.org/docs/latest/

## Langkah 1 — Pahami Konsep Inti (Wajib Sebelum Coding)

| Topik | Yang harus dipahami |
|---|---|
| Process Model | Electron = Chromium (multi-proses) + Node.js. Ada **main process** (satu-satunya, entry point, akses penuh Node.js) dan **renderer process** (satu per window/`BrowserWindow`, defaultnya sandboxed seperti tab browser biasa) |
| Main process | Mengelola lifecycle app, membuat `BrowserWindow`, akses native OS (menu, tray, dialog, filesystem), satu-satunya tempat yang boleh dianggap "trusted" |
| Renderer process | Menjalankan UI (HTML/CSS/JS), by default **tidak** punya akses Node.js/OS langsung — ini bukan bug, ini fitur keamanan |
| Preload script | Jembatan antara main dan renderer; dijalankan sebelum halaman web di-load, punya akses terbatas ke Node.js APIs, dipakai untuk expose fungsi tertentu via `contextBridge` |
| IPC (Inter-Process Communication) | `ipcMain` (di main) ↔ `ipcRenderer` (di renderer, biasanya lewat preload) untuk komunikasi dua arah |
| Utility Process | Proses tambahan (`UtilityProcess`) untuk kerja berat di background tanpa membebani main process |

## Langkah 2 — Pahami Model Keamanan (Kritis, Jangan Skip)

Electron API lama & banyak tutorial di internet menunjukkan pola yang sekarang **tidak direkomendasikan**. Agent harus tahu default yang benar per versi modern:

| Setting | Default aman (modern) | Kenapa |
|---|---|---|
| `nodeIntegration` | `false` | Kalau `true`, renderer bisa jalankan kode Node.js langsung → kalau renderer ke-compromise (mis. lewat XSS atau load remote content), attacker dapat akses penuh OS |
| `contextIsolation` | `true` | Memisahkan "dunia JS" preload script dari "dunia JS" halaman web, supaya halaman web tidak bisa manipulasi objek yang di-expose preload |
| `sandbox` | `true` (per window) | Renderer berjalan dengan batasan OS-level tambahan, mirip sandbox Chrome biasa |

Pola yang benar untuk expose fungsi ke renderer:

```javascript
// preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  readConfig: () => ipcRenderer.invoke('read-config'),
  onUpdate: (callback) => ipcRenderer.on('update-available', callback),
})
```

```javascript
// renderer.js (tidak punya require, hanya bisa pakai yang di-expose)
const config = await window.electronAPI.readConfig()
```

```javascript
// main.js
const { app, BrowserWindow, ipcMain } = require('electron')
const path = require('node:path')

app.whenReady().then(() => {
  const win = new BrowserWindow({
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  })
  win.loadFile('index.html')
})

ipcMain.handle('read-config', async () => {
  // logic yang butuh akses filesystem/OS taruh di sini, BUKAN di renderer
})
```

**Aturan keras:** jangan pernah set `nodeIntegration: true` untuk window yang me-load remote content (URL eksternal). Kalau menemukan pola ini di project existing, catat sebagai risiko keamanan, jangan dianggap normal.

## Langkah 3 — Pahami Struktur Project Umum

```
my-app/
├── src/
│   ├── main/             # kode main process
│   │   └── index.js (atau .ts)
│   ├── preload/          # preload script(s)
│   │   └── index.js
│   └── renderer/         # kode UI (React/Vue/vanilla, dll)
├── package.json          # field "main" menunjuk entry point main process
├── electron-builder.yml  # (kalau pakai electron-builder) config packaging
└── forge.config.js       # (kalau pakai Electron Forge) config packaging
```

Catatan: kalau pakai `electron-vite` atau Forge template, struktur bisa sedikit beda — cek dokumentasi tooling terkait sebelum berasumsi.

## Langkah 4 — Pahami API Penting yang Sering Dipakai

Pelajari cukup dalam untuk bisa dipakai tanpa membuka dokumentasi tiap saat:

- **`app`** — lifecycle app (`whenReady`, `on('window-all-closed')`, `on('activate')`, quit behavior beda antara macOS vs Windows/Linux)
- **`BrowserWindow`** — membuat & mengatur window, opsi `webPreferences`
- **`ipcMain` / `ipcRenderer`** — komunikasi; pahami beda `invoke/handle` (request-response, return Promise) vs `send/on` (fire-and-forget)
- **`Menu`, `Tray`, `dialog`, `shell`, `Notification`** — integrasi native OS
- **`autoUpdater`** — auto-update aplikasi (biasanya dikombinasi dengan electron-builder/electron-forge publish config)
- **Context Bridge (`contextBridge`)** — satu-satunya cara aman expose API custom ke renderer

## Langkah 5 — Pahami Build & Packaging

- Dua tooling utama saat ini: **Electron Forge** dan **electron-builder** — keduanya menghasilkan installer native (`.exe`/`.msi`, `.dmg`, `.deb`/`.AppImage`/`.rpm`).
- Code signing & notarization (khusus macOS) perlu setup terpisah kalau target distribusi resmi (bukan cuma testing lokal).
- Auto-update biasanya butuh server/provider terpisah (GitHub Releases, S3, dll) — cek dokumentasi `autoUpdater` atau tooling terkait sebelum implementasi.

## Langkah 6 — Verifikasi Pemahaman Sebelum Lanjut ke Task

- [ ] Bisa jelaskan kenapa renderer process tidak boleh langsung akses Node.js/filesystem?
- [ ] Tahu cara yang benar meng-expose fungsi custom dari main ke renderer (lewat apa, bukan lewat apa)?
- [ ] Paham beda `ipcRenderer.invoke` vs `ipcRenderer.send`, dan kapan pakai yang mana?
- [ ] Tahu bahaya `nodeIntegration: true` dan kapan (kalau pernah) itu dianggap "boleh"?
- [ ] Paham beda main process vs utility process vs renderer process?

## Catatan Tambahan

- Electron rilis versi baru dengan cepat (mengikuti Chromium) — selalu **fetch dokumentasi resmi terbaru** (electronjs.org/docs/latest) untuk API spesifik, jangan hanya andalkan contoh di file ini.
- Kalau project existing memakai pola lama/tidak aman (nodeIntegration true, tanpa contextIsolation, dsb), itu bukan berarti pola tersebut benar — catat sebagai technical debt/risiko yang perlu diperbaiki saat rebuild, kecuali user secara eksplisit minta dipertahankan persis.
