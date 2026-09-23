# Instruksi Rebuild Project untuk Agent

> **Untuk siapa file ini:** AI agent (Claude Code, Cursor, dll), BUKAN untuk diisi manusia.
> **Prasyarat:** tahap analisis project sudah selesai dan hasilnya tersedia (misal di `ANALYSIS.md`).
> **Tujuan:** agent membangun ulang (rebuild) project dari nol berdasarkan hasil analisis tersebut, tanpa menyalin file lama secara langsung.

Jalankan langkah-langkah berikut secara berurutan. Jangan lompat ke tahap berikutnya sebelum tahap sebelumnya selesai dan konsisten dengan hasil analisis.

---

## Langkah 0 — Muat Konteks

1. Baca file hasil analisis project (misal `ANALYSIS.md`) secara penuh.
2. Kalau ada hal yang tidak jelas/kontradiktif di hasil analisis, buka ulang source code asli untuk verifikasi — jangan menebak.
3. Buat catatan kerja internal (`REBUILD_LOG.md`) untuk mencatat keputusan yang kamu ambil selama rebuild, terutama saat ada penyesuaian dari desain asli. Update file ini di setiap langkah besar.
4. **Cek ketersediaan file penyerta/referensi tambahan.** Sebelum mulai eksekusi, tanyakan ke user apakah ada dokumen lain yang perlu dijadikan acuan, misalnya:
   - File `.md` lain (design doc, ADR/architecture decision record, style guide, coding convention)
   - Spesifikasi API terpisah (OpenAPI/Swagger, Postman collection)
   - Desain UI/UX (Figma link, screenshot, wireframe)
   - Dokumen requirement/PRD, roadmap, atau daftar prioritas fitur dari stakeholder
   - Konfigurasi khusus deployment/infrastruktur (docker-compose, k8s manifest, CI config) yang belum tercakup di hasil analisis
   - Batasan lisensi/kepatuhan yang harus dipatuhi (misal tidak boleh pakai library tertentu)

   Jika user menyebutkan ada, baca dan gabungkan isinya ke dalam pemahaman sebelum lanjut ke Langkah 1 — jangan mulai membangun sebelum semua referensi relevan sudah diperhitungkan. Jika user bilang tidak ada, lanjutkan berdasarkan hasil analisis yang sudah tersedia.

## Langkah 1 — Tentukan Target Rebuild

Konfirmasi (dari hasil analisis atau dari instruksi user) tiga hal ini sebelum menulis kode apa pun:

- **Stack target**: sama persis dengan project asli, atau ada perubahan (versi lebih baru, bahasa/framework beda)?
- **Cakupan fitur**: full parity dengan yang lama, atau ada fitur yang sengaja di-drop/disederhanakan?
- **Constraint tambahan**: performance, keamanan, atau konvensi coding tertentu yang harus dipatuhi?

Jika salah satu tidak diketahui dan tidak ada default yang wajar, tanyakan ke user sebelum lanjut. Jangan berasumsi diam-diam untuk hal yang berdampak besar (mis. ganti database).

## Langkah 2 — Setup Fondasi Project

1. Inisialisasi project baru dengan stack yang sudah dikonfirmasi (package manager, folder structure, linter, formatter).
2. Siapkan config dasar: environment variables (pakai nama yang sama dengan project asli kalau relevan, isi `.env.example` tanpa secret asli), `README.md` awal, `.gitignore`.
3. Setup CI/testing skeleton di awal, bukan di akhir — supaya tiap fitur yang dibangun langsung bisa diverifikasi.

## Langkah 3 — Bangun Data Layer Lebih Dulu

1. Implementasikan data model/skema database sesuai hasil analisis (bagian "Data Model" di `ANALYSIS.md`).
2. Buat migration/seed data dasar.
3. Verifikasi skema baru bisa merepresentasikan semua relasi yang tercatat di hasil analisis sebelum lanjut ke logic di atasnya.

## Langkah 4 — Rebuild per Fitur, Bukan per File

Untuk setiap fitur di daftar "Fitur & Modul Utama" hasil analisis (urutkan dari yang paling core/paling banyak dipakai fitur lain):

1. **Re-derive, jangan copy-paste.** Pahami *behavior* yang diharapkan dari fitur tersebut (input → proses → output), lalu tulis ulang implementasinya di stack baru — meskipun stack sama persis dengan yang lama. Ini penting supaya rebuild benar-benar bersih dari technical debt lama, bukan cuma port kode.
2. Implementasikan business logic inti fitur.
3. Implementasikan interface-nya (API endpoint / UI / CLI command sesuai hasil analisis bagian 7).
4. Tulis test untuk fitur ini sebelum pindah ke fitur berikutnya (unit test minimal untuk logic inti).
5. Tandai fitur ini selesai di `REBUILD_LOG.md`, catat kalau ada penyimpangan dari perilaku aslinya dan alasannya.

## Langkah 5 — Integrasi Antar Fitur

1. Setelah fitur-fitur individual selesai, sambungkan alur end-to-end sesuai "Arsitektur & Alur Data" di hasil analisis.
2. Jalankan test integrasi / e2e untuk alur-alur utama (contoh: flow login → aksi utama → hasil tersimpan).
3. Bandingkan output rebuild dengan behavior project asli untuk skenario-skenario kunci (kalau project asli masih bisa dijalankan untuk pembanding, lakukan itu).

## Langkah 6 — Tangani Known Issues & Technical Debt

Rujuk bagian "Known Issues / Technical Debt" di hasil analisis:

- Untuk bug lama: putuskan apakah diperbaiki di rebuild ini (biasanya ya, kecuali user minta replikasi persis termasuk bug-nya).
- Untuk code smell: jangan direplikasi. Cari pendekatan yang lebih bersih selama behavior akhirnya tetap sama.
- Untuk fitur yang di-drop: pastikan tidak ada bagian lain yang diam-diam bergantung pada fitur tersebut.

## Langkah 7 — Verifikasi Akhir

1. Jalankan seluruh test suite.
2. Cocokkan checklist fitur wajib (bagian "Fitur yang WAJIB ada" di hasil analisis) — semua harus tercentang.
3. Review `REBUILD_LOG.md`: pastikan semua penyimpangan dari desain asli sudah tercatat dan masuk akal.
4. Tulis ringkasan akhir untuk user: apa yang berhasil direbuild 1:1, apa yang disederhanakan/diubah, dan apa yang masih perlu perhatian manual.

---

## Aturan Umum Selama Proses

- **Jangan** menyalin blok kode besar dari project lama tanpa memahami fungsinya — tujuan rebuild adalah pemahaman, bukan migrasi mekanis.
- **Jangan** menambah fitur baru yang tidak diminta tanpa konfirmasi ke user.
- **Selalu** update `REBUILD_LOG.md` saat mengambil keputusan desain yang tidak eksplisit ada di hasil analisis.
- **Selalu** utamakan kebenaran behavior dibanding kecepatan — lebih baik satu fitur selesai dengan benar daripada semua fitur setengah jadi.
- Jika di tengah jalan ditemukan bahwa hasil analisis ternyata salah/kurang lengkap, perbaiki dulu bagian analisis yang relevan sebelum melanjutkan rebuild di area itu.
