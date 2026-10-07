# Implementation Plan - Rencana Pembuatan Web HRMS (Human Resource Management System)

### Ringkasan & Tujuan
Membangun aplikasi web **HRMS (Sistem Manajemen Sumber Daya Manusia)** berbasis **CodeIgniter (PHP)** yang sudah menjadi fondasi proyek `Hrms.Nbim` (`index.php` = front controller). Web akan mencakup modul inti HR: autentikasi & otorisasi, data karyawan, absensi, cuti/izin, penggajian ringkas, serta dashboard laporan — dengan tampilan responsif dan keamanan standar (CSRF, XSS filtering, role-based access).

### Berkas yang Dibuat / Dimodifikasi
**Konfigurasi:**
- `application/config/config.php` — base_url, encryption_key, CSRF aktif
- `application/config/database.php` — koneksi database aktif
- `application/config/routes.php` — routing default (`login`, `dashboard`)
- `application/config/autoload.php` — autoload library `session`, `form_validation`, helper `url`, `form`, `security`

**Modul Autentikasi:**
- `application/controllers/Auth.php` — login, logout, ganti password
- `application/models/Auth_model.php` — verifikasi user, hash password (bcrypt)
- `application/views/auth/login.php`

**Modul Karyawan:**
- `application/controllers/Karyawan.php` — CRUD karyawan + pagination
- `application/models/Karyawan_model.php`
- `application/views/karyawan/index.php`, `karyawan/form.php`

**Modul Absensi:**
- `application/controllers/Absensi.php` — check-in/out, rekap harian
- `application/models/Absensi_model.php`
- `application/views/absensi/index.php`, `absensi/rekap.php`

**Modul Cuti/Izin:**
- `application/controllers/Cuti.php` — pengajuan, persetujuan (approval workflow)
- `application/models/Cuti_model.php`
- `application/views/cuti/index.php`, `cuti/form.php`

**Modul Penggajian (ringkas):**
- `application/controllers/Gaji.php` — rekap gaji bulanan
- `application/models/Gaji_model.php`
- `application/views/gaji/index.php`

**Dashboard & Layout:**
- `application/views/layout/header.php`, `layout/sidebar.php`, `layout/footer.php`
- `application/views/dashboard/index.php` — statistik karyawan, absensi hari ini
- `assets/css/style.css`, `assets/js/app.js` — styling & interaksi

**Database:**
- `database/hrms.sql` — skema tabel: `users`, `roles`, `karyawan`, `absensi`, `cuti`, `gaji`

### Tahapan Pekerjaan (Tasks Checklist)
- [ ] 1. Siapkan environment: pastikan `ENVIRONMENT` sesuai (`development`), koneksi database aktif, buat skema DB `hrms`
- [ ] 2. Buat struktur folder modul (`controllers`, `models`, `views/...`) dan konfigurasi dasar (routes, autoload, base_url, CSRF)
- [ ] 3. Bangun modul Auth: halaman login, session management, role-based guard (`is_logged_in()`), logout
- [ ] 4. Bangun layout bersama (header/sidebar/footer) + dashboard placeholder
- [ ] 5. Bangun modul Karyawan: CRUD, validasi form (`form_validation`), upload foto opsional, pagination & pencarian
- [ ] 6. Bangun modul Absensi: form check-in/check-out, validasi lokasi/waktu, rekap harian per karyawan
- [ ] 7. Bangun modul Cuti/Izin: pengajuan oleh karyawan, persetujuan oleh atasan/HR, riwayat status
- [ ] 8. Bangun modul Gaji: rekap bulanan (gaji pokok + tunjangan - potongan), ekspor ringkas
- [ ] 9. Dashboard: kartu statistik (total karyawan, hadir hari ini, cuti menunggu), chart sederhana
- [ ] 10. Keamanan: filtering XSS, escaping output `html_escape()`, prepared statement (query builder), rate-limit login sederhana
- [ ] 11. Uji fungsional seluruh alur (login → CRUD → absensi → cuti → gaji)

### Rencana Verifikasi & Pengujian
- [ ] **Syntax check** — `php -l` pada setiap file PHP yang dibuat/diubah
- [ ] **Unit/feature test** — uji manual atau `phpunit` untuk Auth_model & Karyawan_model
- [ ] **Browser test** — alur end-to-end: login → tambah karyawan → absensi → ajukan cuti → approve → rekap gaji
- [ ] **Keamanan** — verifikasi CSRF token aktif, cek proteksi route (user belum login tidak bisa akses modul), uji SQL injection dasar
- [ ] **Responsivitas** — cek tampilan di mobile & desktop
