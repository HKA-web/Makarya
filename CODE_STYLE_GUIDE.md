# Pedoman Penulisan Kode untuk Agent

> **Untuk siapa file ini:** AI agent (Claude Code, Cursor, dll), BUKAN untuk diisi manusia.
> **Tujuan:** standar kualitas kode yang harus dipatuhi setiap kali agent menulis atau mengedit kode, terlepas dari bahasa pemrograman atau project yang sedang dikerjakan.
> **Prinsip dasar:** kode ditulis untuk dibaca manusia (termasuk diri sendiri di masa depan), eksekusi oleh komputer hanya efek samping.

---

## 1. Penamaan (Naming)

### Aturan Umum
- **Selalu pakai Bahasa Inggris** untuk semua identifier (variabel, fungsi, class, file, folder) — meskipun komentar/dokumentasi ditulis dalam Bahasa Indonesia untuk tim lokal.
- **Jangan menyingkat**, kecuali singkatan tersebut sudah jadi konvensi universal di industri (lihat daftar pengecualian di bawah).
- Nama harus **menjelaskan maksud/isi**, bukan tipe data atau implementasi.
- Konsisten: kalau sudah pakai `user`, jangan campur dengan `usr` di tempat lain untuk konsep yang sama.

### Contoh Salah vs Benar

| Salah | Benar | Kenapa |
|---|---|---|
| `usr` | `user` | Tidak perlu disingkat, tidak menghemat apa pun secara berarti |
| `data` | `orderList`, `userProfile` | `data` tidak menjelaskan apa isinya |
| `tmp` | `pendingInvoice`, `unsavedChanges` | Jelaskan isi/tujuan variabel, bukan sifatnya yang "sementara" saja |
| `flg` | `isActive`, `hasPermission` | Gunakan nama utuh + prefix boolean yang jelas |
| `arr` | `productList`, `orderItems` | Nama harus menjelaskan isi array, bukan tipe datanya |
| `x`, `y`, `val`, `res` | `totalPrice`, `apiResponse` | Nama satu huruf/generik tidak menjelaskan apa pun |
| `calc()` | `calculateTotalPrice()` | Fungsi harus menjelaskan aksi + objek secara spesifik |
| `mgr`, `svc`, `ctrl` | `manager`, `service`, `controller` | Singkatan struktural pun sebaiknya ditulis penuh kecuali sudah jadi konvensi framework (mis. `ctrl` di beberapa CLI tool) |

### Pengecualian yang Boleh Disingkat

Singkatan berikut boleh dipakai karena sudah jadi konvensi universal dan justru lebih jelas daripada versi panjangnya:
- `id` (identifier), `url`, `uri`, `api`, `db` (database, khusus di konteks yang sudah jelas), `http`, `json`, `html`, `css`, `sql`
- Loop counter pendek (`i`, `j`, `k`) **hanya** untuk loop numerik sangat pendek dan lokal (misal loop 3 baris) — untuk loop dengan body panjang atau nested, tetap pakai nama deskriptif (`orderIndex`, `rowIndex`)
- Konvensi matematika/fisika kalau memang domainnya (mis. `dx`, `dy` untuk delta koordinat)

### Konvensi Penamaan per Jenis Identifier

| Jenis | Konvensi umum | Contoh |
|---|---|---|
| Variabel/fungsi (JS/TS/Java/dll) | `camelCase` | `getUserProfile`, `totalItemCount` |
| Variabel/fungsi (Python/Rust/Ruby) | `snake_case` | `get_user_profile`, `total_item_count` |
| Class/Type/Interface | `PascalCase` | `UserRepository`, `OrderStatus` |
| Konstanta global/enum value | `UPPER_SNAKE_CASE` | `MAX_RETRY_COUNT`, `DEFAULT_TIMEOUT_MS` |
| Boolean | Prefix `is`/`has`/`can`/`should` | `isLoading`, `hasError`, `canEdit`, `shouldRetry` |
| Fungsi | Kata kerja + objek | `fetchUserData`, `validateEmailFormat`, `calculateDiscount` |
| File/folder | Ikuti konvensi framework/project yang sedang dipakai — cek file lain di project sebelum menebak | — |

**Selalu ikuti konvensi bahasa/framework yang sedang dipakai** — jangan paksakan `camelCase` di Python atau `snake_case` di JavaScript hanya karena preferensi pribadi.

## 2. Fungsi & Method

- **Satu fungsi, satu tanggung jawab.** Kalau nama fungsi butuh kata "dan" (`validateAndSave`), pertimbangkan untuk dipecah.
- **Panjang fungsi wajar** — kalau lebih dari ~40-50 baris atau butuh scroll untuk dibaca sekali pandang, pertimbangkan ekstrak ke fungsi lebih kecil.
- **Parameter jangan terlalu banyak** — lebih dari 3-4 parameter positional, pertimbangkan pakai object/struct parameter dengan nama field yang jelas.
- **Hindari flag parameter boolean yang ambigu** di call site, contoh:
  ```javascript
  // Buruk: tidak jelas dari call site apa arti true/false
  createUser(name, email, true)

  // Baik: jelas maksudnya dari nama parameter
  createUser(name, email, { sendWelcomeEmail: true })
  ```
- **Return value konsisten** — fungsi jangan kadang return `null`, kadang `undefined`, kadang throw, untuk kondisi error yang sejenis. Pilih satu pola dan konsisten dalam satu codebase.

## 3. Komentar & Dokumentasi

- **Komentar menjelaskan "kenapa", bukan "apa".** Kode yang baik sudah menjelaskan "apa" lewat nama yang jelas; komentar dipakai untuk konteks yang tidak terlihat dari kode itu sendiri (keputusan desain, workaround, alasan bisnis).
  ```javascript
  // Buruk — cuma mengulang apa yang kode sudah jelas lakukan
  // increment counter by 1
  counter += 1

  // Baik — menjelaskan alasan yang tidak terlihat dari kode
  // Retry counter dimulai dari 1, bukan 0, karena API pihak ketiga
  // menghitung percobaan pertama sebagai retry ke-1 (lihat docs vendor)
  counter += 1
  ```
- **Jangan biarkan komentar basi** — kalau logic berubah tapi komentar tidak diupdate, komentar jadi lebih berbahaya daripada tidak ada komentar sama sekali. Update atau hapus komentar yang sudah tidak relevan.
- **Dokumentasi fungsi publik** (docstring/JSDoc) wajib untuk fungsi/API yang dipakai modul lain — minimal jelaskan: tujuan, parameter, return value, dan efek samping penting (kalau ada).
- **Hindari kode yang di-comment-out** dibiarkan menumpuk — kalau tidak dipakai, hapus (riwayatnya tetap ada di git).
- **Jangan beri komentar di setiap pembuatan hal baru** (variabel, fungsi, class baru) hanya karena itu baru dibuat. Komentar yang menjelaskan hal yang sudah jelas dari nama/struktur kode hanya menambah noise, bukan nilai.
  - **Kecuali:** kode tersebut merepresentasikan sebuah **pilihan/choice** yang sifatnya bisa diganti — misalnya memilih satu library/algoritma/pendekatan dari beberapa opsi yang sama-sama valid, memilih nilai default/threshold tertentu, atau konfigurasi yang mungkin perlu disesuaikan nanti. Untuk kasus ini, beri komentar singkat yang menjelaskan **kenapa opsi ini yang dipilih** dan/atau **apa alternatifnya**, supaya pembaca kode berikutnya (termasuk agent lain) tahu bagian ini boleh diubah kalau kebutuhan berubah.
    ```javascript
    // Buruk — komentar hanya menyatakan hal yang sudah jelas dari kode
    // membuat variabel maxRetryCount
    const maxRetryCount = 3

    // Baik — ini pilihan/nilai yang bisa disesuaikan, komentar menjelaskan kenapa & bahwa ini bisa diganti
    // Dipilih 3x retry sebagai kompromi antara resiliency dan latency;
    // naikkan kalau endpoint upstream sering flaky
    const maxRetryCount = 3

    // Baik — memilih satu library dari beberapa opsi yang setara
    // Pakai date-fns, bukan moment.js (deprecated) atau dayjs,
    // karena project lain di tim ini juga sudah pakai date-fns
    import { format } from 'date-fns'
    ```

## 4. Struktur & Organisasi

- **Konsistensi struktur folder** — ikuti pola yang sudah ada di project (feature-based vs layer-based), jangan campur dua pola tanpa alasan kuat.
- **Hindari file raksasa** — kalau satu file sudah menangani terlalu banyak concern berbeda, pisahkan berdasarkan tanggung jawab.
- **Import/dependency terorganisir** — kelompokkan (built-in → third-party → internal) dan hindari import yang tidak dipakai.
- **Magic number/string dihindari** — pakai konstanta bernama:
  ```javascript
  // Buruk
  if (status === 3) { ... }

  // Baik
  const ORDER_STATUS_SHIPPED = 3
  if (status === ORDER_STATUS_SHIPPED) { ... }
  ```

## 5. Error Handling

- **Jangan silent-catch tanpa alasan** — `catch (e) {}` kosong menyembunyikan bug. Minimal log, atau jelaskan lewat komentar kenapa error itu sengaja diabaikan.
- **Error message harus actionable** — jelaskan apa yang salah dan idealnya konteks untuk debug (bukan cuma "Error occurred").
- **Validasi di boundary** — validasi input di titik masuk (API endpoint, form submit, function public), bukan tersebar di banyak tempat internal.

## 6. Konsistensi Gaya

- **Ikuti formatter/linter yang sudah dikonfigurasi project** (Prettier, ESLint, Black, rustfmt, dll) — jangan menulis gaya sendiri yang berbeda dari konfigurasi yang ada.
- **Kalau project belum punya konfigurasi linter/formatter**, pakai default standar komunitas bahasa tersebut, dan sebutkan ke user bahwa menambahkan linter akan membantu konsistensi jangka panjang.
- **Indentasi, kutip string, trailing comma, dll** — ikuti apa yang sudah dominan di codebase existing, bukan preferensi pribadi agent.

## 7. Testability & Maintainability

- **Hindari hidden dependency** — fungsi yang diam-diam bergantung pada global state/waktu saat ini (`Date.now()`, variabel global) lebih sulit ditest; kalau memungkinkan, inject dependency tersebut sebagai parameter.
- **Hindari duplikasi logic** (prinsip DRY) — tapi jangan over-abstract untuk kemiripan yang kebetulan/dangkal (dua kode yang "mirip sekarang" belum tentu harus digabung kalau alasan perubahannya di masa depan berbeda).
- **Kode baru sebaiknya disertai test** untuk logic inti/business rule, terutama edge case yang tidak jelas dari nama fungsi saja.

## 8. Checklist Sebelum Menganggap Kode "Selesai"

- [ ] Semua nama variabel/fungsi/class jelas dan tidak disingkat tanpa alasan kuat
- [ ] Tidak ada nama generik (`data`, `temp`, `val`, `res`, `obj`) untuk hal yang punya makna spesifik
- [ ] Fungsi punya satu tanggung jawab jelas dan panjangnya wajar
- [ ] Tidak ada magic number/string tanpa konstanta bernama
- [ ] Error ditangani dengan jelas, tidak ada silent-catch tanpa alasan
- [ ] Komentar (kalau ada) menjelaskan "kenapa", bukan mengulang "apa" yang sudah jelas dari kode
- [ ] Kode mengikuti gaya/formatter yang sudah ada di project, bukan gaya baru sendiri
- [ ] Tidak ada kode yang di-comment-out dibiarkan menumpuk
- [ ] Kode baru untuk logic penting disertai test dasar

## Catatan

Pedoman ini adalah baseline umum lintas bahasa. Kalau project punya style guide sendiri yang lebih spesifik (mis. Airbnb JS Style Guide, PEP 8, dokumen konvensi internal tim), **style guide project selalu diutamakan** di atas pedoman umum ini kecuali ada konflik yang jelas-jelas kontraproduktif.
