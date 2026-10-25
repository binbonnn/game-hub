# Status Verifikasi

Ringkas dan jujur: apa yang sudah dibuktikan lewat pemeriksaan nyata, dan apa yang belum. Semua pemeriksaan otomatis dijalankan di Chromium (Playwright) dengan Firestore **tiruan**, bukan Firebase asli.

## Sudah diverifikasi

| Hal | Hasil | Cara |
| --- | --- | --- |
| Pemecahan `script.js` (M1-M4, P3, P5) hanya memindahkan kode | Gabungan semua file pecahan sama persis dengan `script.js` asli (SHA-256 `9366457c65a5a47adb5df02034606d6480e6a00e6fe6f5c41aee0b629b310bbc`) sampai sebelum P6 | Perbandingan byte-per-byte pada setiap langkah |
| Pemindahan ke folder (P4) | Isi 18 file identik (SHA-256); hanya path di `index.html` yang berubah | Perbandingan hash |
| Urutan muat dan nama global | 42 dari 42 nama global ada; 0 error halaman; 0 permintaan file gagal | Tes kontrak di peramban |
| Pendaftaran tombol saat halaman dimuat | 280 pendaftaran, urutan identik sebelum dan sesudah pemecahan | Perekaman `addEventListener` |
| Aturan Game 1-3 (urutan papan, batas 7/10 besar, poin, streak, penalti 60/180/300 detik, hint, soal hangus) | 54 dari 54 lulus pada kode asli dan kode terbaru | `game_rules.js` (tidak ikut di repo, butuh alat bantu lokal); terbukti peka lewat uji mutasi |
| Perbaikan P6-1 avatar | Sebelum: 3 dari 15 gagal (skrip tersuntik); sesudah: 15 dari 15 lulus | `avatar_xss.js` |
| Perbaikan P6-2 dialog Back | Back kedua setelah 200 ms gagal 8/8 sebelum, 0/8 sesudah; setelah 450 ms gagal 4/8 sebelum, 0/8 sesudah; `nav1` lulus 10 dari 10 | `nav_modal_back.js`, `nav1.js` |
| Perbaikan P6-3 catatan konsol | Sebelum: 5 dari 13 gagal; sesudah: 13 dari 13 lulus; baris sisipan dihapus, file sama persis dengan sebelumnya | `catch_log.js`, perbandingan byte |
| Perbaikan P6-4 data Game 4 (Firebase atau tidak sama sekali) | Sebelum (kode lama): 9 dari 16 pemeriksaan `mig1.js` gagal, termasuk munculnya "sesi menunggu disimpan"; sesudah: 23 dari 23 lulus (data lama dipindah, profil akun lain dilepas, tidak ada tulis ke server). `cloud2` (24 pemeriksaan): Tamu tidak menyimpan apa pun, offline → "Skor tidak tersimpan" + Coba lagi, tanpa antrean, keluar layar = sesi dibuang. `cloud3` (19): duel dengan Tamu, pencapaian dihitung di server. Tes `cloud2`, `cloud3`, `mm5` **diubah** agar sesuai aturan baru (versi lama disimpan sebagai `*_lama.js`) | `mig1.js`, `cloud1-3.js`, `mm5.js` dengan Firestore tiruan |
| Perbaikan P7 tampilan HP | Pada 360 px: area ketuk <44 px 33 → 2; jenis teks <12 px 20 → 11; overflow-x 0 → 0; 0 error halaman; hanya 3 file berubah (2 CSS + index.html), semua file JS identik SHA-256 dengan sebelumnya | `ux_audit.js`, `ux_audit2.js`, `ux_audit3.js` (tangkapan layar + pengukuran), regresi penuh |
| Perubahan gaya bahasa P8 | Hanya isi string/template yang berubah (perbandingan AST: selisih struktur 0 untuk semua file JS); kerangka HTML identik; regresi penuh dijalankan ulang | `ast_text_diff.js`, regresi penuh, `ux_audit*.js` |
| Game 4 (Memo Mayhem) dan sinkron cloud tiruan | `cloud1`, `cloud2`, `nav4`, `nav5` lulus; `memo-core.test.js` jalan | Tes otomatis |

## Belum diverifikasi

| Hal | Alasan |
| --- | --- |
| Firebase asli (baca/tulis, Firestore Rules aktif) | Tidak boleh menulis ke Firebase asli; Rules tidak ada di repo. Termasuk: apakah Rules mengizinkan transaksi gabungan simpan-sesi + pencapaian dari P6-4 |
| Duel antar dua perangkat (Game 1, 2, 3), termasuk rematch dan penentuan pemenang | Butuh dua perangkat nyata |
| Hint yang berjalan dan ronde 60 detik Game 2 secara penuh | Hanya fungsi aturan yang diuji, bukan alur penuh |
| Tampilan di HP nyata (320-390 px, landscape, keyboard virtual) | Sudah diukur dan dipotret di Chromium berukuran HP (P7), tetapi belum di perangkat/peramban HP sungguhan; pada layar setinggi 568 px tombol Kirim Memo di sebagian ronde masih perlu digulir |
| Gestur Back sungguhan di HP | Tes memakai perintah Back peramban otomatis |
| Aksesibilitas (pembaca layar, kontras) | Belum diaudit |

## Masalah yang diketahui

- Tes `cloud3` (mode Endless Game 4) kadang timeout di `cloud3.js:26`; sudah begitu sebelum pemecahan kode dan lulus bila diulang.
- `nameToDocId` terdefinisi dua kali dengan isi sama (`game2-core.js:144`, `game3-core.js:57`).
- Duel Game 3 bisa gagal bila Firestore Rules aktif belum memuat koleksi `advmath_duels`.
- State dan pembuat soal Game 1 masih di `js/shared/shared.js`.
- `js/unused/ui.js` dan `assets/mascot` tidak dipakai.
