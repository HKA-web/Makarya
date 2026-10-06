# Panduan Pengembangan Ekstensi & Plugin Makarya IDE (SDK Guide)

Makarya IDE menyediakan sistem arsitektur plugin modular berkelas enterprise mirip seperti **Antigravity** dan **VS Code**. Dengan SDK `@makarya/sdk`, pengembang eksternal dapat membuat ekstensi mereka sendiri **tanpa perlu memegang atau memodifikasi source code utama IDE**.

---

## 🌟 Fitur Kemampuan SDK (`@makarya/sdk`)

Dengan `@makarya/sdk`, ekstensi dapat:
1. **Mendaftarkan Perintah (Commands)** yang langsung terintegrasi dengan *Command Palette (`Ctrl+K`)* dan shortcut keyboard.
2. **Menambahkan Item Status Bar** di panel bawah IDE (seperti indikator branch Git, jumlah kata/baris, build server, dll).
3. **Mengintegrasikan Alat Kustom ke AI Copilot Agent** (*Antigravity AI Tooling*) sehingga LLM dapat menjalankan fungsi logika bisnis kustom Anda secara otonom.
4. **Manipulasi Editor Monaco** (sisipkan teks, ganti seleksi, baca cursor, dengarkan event simpan berkas `onDidSaveFile`).
5. **Akses Berkas & Workspace** (buka tab baru, baca/tulis berkas, buat folder, pencarian berkas).
6. **Eksekusi Terminal & Command Line** (menjalankan perintah git, npm, php artisan, dll di latar belakang).
7. **Penyimpanan Lokal Terisolasi (Storage API)** untuk menyimpan preferensi ekstensi secara aman per-plugin.

---

## 📦 Struktur Standar Plugin Eksternal

Setiap plugin berdiri sendiri sebagai sebuah package npm / folder:

```
my-custom-plugin/
├── package.json           # Manifest metadata & kontribusi (commands, status bar, dll)
├── tsconfig.json          # Konfigurasi TypeScript
├── src/
│   └── index.ts           # Logika utama aktivasi ekstensi
└── README.md
```

### Contoh `package.json` Manifest:
```json
{
  "name": "my-custom-plugin",
  "displayName": "Alat Produktivitas Kustom",
  "version": "1.0.0",
  "description": "Ekstensi otomatisasi untuk Makarya IDE",
  "author": "Nama Pengembang",
  "main": "dist/index.js",
  "icon": "i-lucide-wrench",
  "category": "tools",
  "contributes": {
    "commands": [
      {
        "id": "myplugin.runAction",
        "title": "Produktivitas: Jalankan Aksi Cepat",
        "icon": "i-lucide-zap",
        "shortcut": "Ctrl+Shift+P"
      }
    ],
    "statusBarItems": [
      {
        "id": "myplugin.status",
        "text": "⚡ Cepat",
        "command": "myplugin.runAction"
      }
    ]
  }
}
```

---

## 💻 Contoh Kode Aktivasi Ekstensi (`src/index.ts`)

```typescript
import { definePlugin, PluginContext } from '@makarya/sdk'

export default definePlugin({
  manifest: {
    id: 'com.developer.productivity',
    name: 'Alat Produktivitas',
    version: '1.0.0',
    description: 'Menambahkan pintasan dan tool AI kustom',
    icon: 'i-lucide-zap',
    category: 'tools'
  },

  async activate(context: PluginContext) {
    // 1. Buat Status Bar Item
    const myStatus = context.ui.createStatusBarItem({
      id: 'prod-status-indicator',
      text: '⚡ Siap',
      tooltip: 'Klik untuk menjalankan aksi cepat',
      command: 'myplugin.runAction',
      alignment: 'left',
      color: '#42b883'
    })
    myStatus.show()
    context.subscriptions.push(myStatus)

    // 2. Daftarkan Perintah (Command)
    context.subscriptions.push(
      context.commands.registerCommand('myplugin.runAction', async () => {
        const activeTab = context.workspace.getActiveTab()
        context.ui.showToast({
          title: 'Aksi Berhasil',
          message: activeTab ? `Berkas aktif: ${activeTab.title}` : 'Tidak ada berkas terbuka',
          type: 'success'
        })
      })
    )

    // 3. Daftarkan Custom AI Tool untuk Copilot Agent (Gaya Antigravity)
    context.subscriptions.push(
      context.agent.registerTool({
        name: 'hitung_pajak_ppn',
        description: 'Menghitung nilai PPN 11% dari nominal transaksi yang diberikan',
        parameters: {
          type: 'object',
          properties: {
            nominal: {
              type: 'number',
              description: 'Jumlah nominal dasar sebelum pajak'
            }
          },
          required: ['nominal']
        },
        execute: async (args) => {
          const ppn = args.nominal * 0.11
          return {
            nominalAwal: args.nominal,
            ppn,
            totalDenganPajak: args.nominal + ppn
          }
        }
      })
    )

    // 4. Dengarkan event simpan berkas
    context.subscriptions.push(
      context.workspace.onDidSaveFile((file) => {
        console.log(`[Plugin] Berkas disimpan: ${file.path}`)
      })
    )
  },

  deactivate(context: PluginContext) {
    // Subscriptions otomatis di-dispose saat ekstensi dinonaktifkan
  }
})
```

---

## 🛠️ Cara Menginstal Plugin ke Makarya IDE

1. **Buka Extension Manager**:
   - Tekan **`Ctrl+Shift+X`** atau klik ikon Puzzle di *Left Activity Bar* / *Status Bar*.
2. **Letakkan Folder Plugin**:
   - Direktori Pengguna: `%APPDATA%/makarya-workspace/plugins/<nama-plugin>/`
   - Direktori Project: `<folder-project>/.makarya/plugins/<nama-plugin>/`
3. Makarya IDE secara otomatis memuat dan mengaktifkan ekstensi tanpa perlu me-restart editor.
