# Changelog

Hanya perubahan struktur yang tercatat di sini. Tidak ada perubahan perilaku game pada tahap ini.

## Modularisasi `script.js` (M1-M4)

Setiap langkah memindahkan satu segmen kode apa adanya (tanpa mengubah satu karakter pun) ke file baru, menambah satu tag `<script>` di `index.html`, dan menaikkan satu nomor `?v=` bersama. Setiap langkah dibuktikan dengan perbandingan byte-per-byte: gabungan semua file pecahan sama dengan `script.js` asli (SHA-256 `9366457c65a5a47adb5df02034606d6480e6a00e6fe6f5c41aee0b629b310bbc`).

| Langkah | File baru | Isi | Baris | `?v=` |
| --- | --- | --- | --- | --- |
| M1 | `hub-init.js` | Inisialisasi (avatar, aturan skor Game 2 dan 3) | 25 | 20261030 |
| M2 | `game3.js` | Game 3 Perkalian Lanjutan | 1.655 | 20261031 |
| M3 | `game2.js` | Game 2 Pengetahuan Dasar | 1.487 | 20261032 |
| M4 | `game1.js` | Game 1: dasbor, papan peringkat, permainan, duel | 1.136 | 20261033 |

`script.js` setelah M4: 461 baris (Hub dan utilitas bersama).

## P3: pemisahan Hub

Baris 400-461 `script.js` (pindah layar dan tombol kartu game) dipindah apa adanya ke `hub.js` (62 baris). `script.js` kini 399 baris. `hub.js` dimuat tepat setelah `script.js`. `?v=` naik ke 20261034. Bukti: gabungan 6 file (`script.js`, `hub.js`, `game1.js`, `game2.js`, `game3.js`, `hub-init.js`) sama persis dengan `script.js` asli.

Urutan muat sekarang: `script.js`, `hub.js`, `game1.js`, `game2.js`, `game3.js`, `hub-init.js`, `memo-core.js`, `memo-data.js`, `memo-cloud.js`, `memo.js`, `memo-ui.js`, `nav.js`.

### Pemeriksaan yang dijalankan tiap langkah

Pemeriksaan kontrak 42 nama global, tes regresi dengan Firestore tiruan, dan pemeriksaan tidak ada permintaan skrip lokal yang gagal. Pemeriksaan di Chromium dengan Firestore tiruan; duel antarperangkat dan Firebase asli diuji manual.

### Diketahui sejak awal dan tidak diubah

- Tes `nav1` kadang gagal pada dua pernyataan: "Back saat dialog terbuka, Stay" dan "Back lagi, konfirmasi lagi".
- Tes `cloud3` tidak stabil (gagal sesekali di mode Endless Game 4), baik sebelum maupun sesudah pemecahan.
- `nameToDocId` terdefinisi dua kali (`game2.js`, `game3.js`).
- `ui.js` dan `assets/mascot` tidak terpakai.

## P4: struktur folder

Semua file dipindah ke folder (lihat `docs/ARCHITECTURE.md`). `script.js` diganti nama menjadi `js/shared/shared.js`. Isi setiap file tidak berubah (SHA-256 identik); yang berubah hanya path di `index.html` dan satu baris `require` di `tests/memo-core.test.js`. Urutan muat sama. `?v=` naik ke 20261035. Alamat file lama (`/script.js`, `/game1.js`, dst.) tidak berlaku lagi, jadi file lama di root repo harus dihapus.

## P5 (Game 3): pemecahan per lapisan

`game3.js` (1.655 baris) dipecah menjadi 5 file berurutan tanpa mengubah satu karakter pun: `game3-core.js` (1-169), `game3-storage.js` (170-276), `game3-dashboard.js` (277-485), `game3-play.js` (486-1141), `game3-duel.js` (1142-1655). Gabungan kelima file sama persis dengan `game3.js` lama dan dengan `script.js` asli. Urutan pendaftaran 280 listener tombol identik sebelum dan sesudah. `?v=` naik ke 20261036. File `js/games/game3/game3.js` lama harus dihapus dari repo.

## P5 (Game 2): pemecahan per lapisan

`game2.js` (1.487 baris) dipecah menjadi 5 file berurutan tanpa mengubah satu karakter pun: `game2-core.js` (1-276), `game2-storage.js` (277-378), `game2-dashboard.js` (379-576), `game2-play.js` (577-981), `game2-duel.js` (982-1487). Gabungan kelima file sama persis dengan `game2.js` lama dan dengan `script.js` asli. Urutan pendaftaran 280 listener tombol identik. `?v=` naik ke 20261037. File `js/games/game2/game2.js` lama harus dihapus dari repo.

## P5 (Game 1): pemecahan per lapisan

`game1.js` (1.136 baris) dipecah menjadi 5 file berurutan tanpa mengubah satu karakter pun: `game1-dashboard.js` (1-151), `game1-play.js` (152-422), `game1-record.js` (423-508), `game1-controls.js` (509-571), `game1-duel.js` (572-1136). Gabungan kelima file sama persis dengan `game1.js` lama dan dengan `script.js` asli. Urutan pendaftaran 280 listener tombol identik. `?v=` naik ke 20261038. File `js/games/game1/game1.js` lama harus dihapus dari repo. State dan pembuat soal Game 1 masih berada di `js/shared/shared.js` (baris 1-35 dan `generateUniqueQuestions`); memindahkannya butuh penataan ulang urutan dan belum dilakukan.

## P6-1 (PERUBAHAN PERILAKU): avatar di-escape

`avatarGlyph` di `js/shared/shared.js` (baris 128) kini memakai `escapeHtml(avatar)`. Sebelumnya avatar dari data (papan peringkat, lawan duel) disisipkan ke HTML apa adanya; avatar berisi HTML bisa menjalankan skrip. Tes `avatar_xss.js`: sebelum perbaikan 3 dari 15 pemeriksaan gagal (skrip `onerror` berjalan), sesudahnya 15 dari 15 lulus. Dua belas avatar resmi tampil persis sama. Ini perubahan perilaku pertama; setelah ini rantai kode tidak lagi sama byte-per-byte dengan `script.js` asli. `?v=` naik ke 20261039.

## P6-2 (PERUBAHAN PERILAKU): Back menutup dialog yang masih animasi

Penyebab (terukur): bila Back ditekan saat dialog (misalnya konfirmasi keluar) masih animasi membuka, Bootstrap mengabaikan `hide()`, sehingga dialog tidak tertutup. Perbaikan di `js/hub/nav.js`: `nav.js` melacak event `show/shown/hidden.bs.modal`; bila dialog masih membuka, penutupan ditunda sampai animasi buka selesai. Dialog yang sudah selesai membuka ditutup seperti biasa. Hasil tes `nav_modal_back.js`: Back kedua setelah 200 ms gagal 8 dari 8 sebelum dan 0 dari 8 sesudah; setelah 450 ms gagal 4 dari 8 sebelum dan 0 dari 8 sesudah. Tes `nav1` lulus 10 dari 10 setelah perbaikan (sebelumnya gagal sesekali). `?v=` naik ke 20261040.

## P6-3 (PERUBAHAN PERILAKU KECIL): blok `catch` kosong kini mencatat di konsol

Pemindaian struktur kode menemukan 15 blok `catch` kosong (hitungan awal 9 kurang). Di 14 tempat ditambahkan satu baris `console.warn('[Konteks] ...', e)`: pembersihan duel Game 1, 2, 3 (reset, tolak rematch, tandai ruang ditinggalkan; 9 tempat), `memo-cloud.js` (2), `memo-data.js` (1), dan `nav.js` (2). Tidak ada perubahan lain: bila semua baris sisipan dihapus, keenam file sama persis dengan versi sebelumnya. Yang tidak diubah: getaran HP di `game2-core.js` (`navigator.vibrate`), yang memang aman diabaikan dan akan berisik di desktop. Tampilan dan alur game tidak berubah; yang baru hanya pesan peringkatan di konsol peramban (F12) bila operasi tersebut gagal, misalnya Firestore Rules menolak. `?v=` naik ke 20261041.

## P6-4 (PERUBAHAN PERILAKU BESAR, hanya Game 4): data hanya di Firebase atau tidak sama sekali

Penyebab (terukur): pesan "2 sesi menunggu disimpan" muncul karena sesi tersimpan di antrean lokal, tetapi profil di perangkat terdaftar oleh akun anonim lain, sehingga pengecekan di `memo-cloud.js` menolak kirim dan antrean tertahan selamanya. Permintaan pemilik: tidak boleh ada lagi sesi tertahan; data pemain hanya di Firebase atau tidak sama sekali.

Aturan baru: (1) Pemain **Tamu** (tanpa nama terdaftar) boleh bermain, tetapi tidak ada yang disimpan, juga tidak di HP. (2) Pemain **terdaftar**: skor, riwayat, statistik, pencapaian, dan peringkat dibaca hanya dari Firebase; di perangkat hanya ada penunjuk profil (id, nama, ikon, pid, pemilik) dan pengaturan suara. (3) Saat sesi selesai, simpan dicoba sekali; bila gagal tampil "Skor tidak tersimpan" dan tombol "Coba lagi" selama layar hasil terbuka. Meninggalkan layar berarti sesi dibuang. Tidak ada antrean.

Perubahan kode: `memo-data.js` ditulis ulang (skema 2, tanpa outbox/sesi/papan lokal); `memo-cloud.js` (kirim sekali lewat `saveSession`, pencapaian dihitung di server dalam transaksi yang sama, `uid()`); `memo-ui.js` (layar beranda, pemilih profil, pendaftaran, hasil, statistik, pencapaian, pengaturan, duel). Data lama (skema 1) dipindahkan sekali: hanya profil terdaftar yang jadi penunjuk, antrean/statistik lokal dibuang, dan salinan mentahnya disimpan di kunci `memoMayhemCosmicRecall_v1_v1_lama`. Penunjuk yang pemiliknya bukan akun anonim saat ini dilepas dan pemain diberi tahu, lalu kembali sebagai Tamu.

Fitur yang hilang dengan sengaja: statistik/pencapaian/riwayat Daily/tab Duel lokal, dan profil lokal. Game 1-3 tidak diubah. `?v=` naik ke 20261042.

## P7 (PERUBAHAN TAMPILAN SAJA): ukuran area ketuk dan keterbacaan di HP

Diukur otomatis di Chromium (lebar 320/360/390 px dan landscape 640x320, 740x360) pada 35 layar Game 1-4. Pada 360 px sebelum perbaikan: 33 area ketuk di bawah 44 px dan 20 jenis teks di bawah 12 px; sesudah: 2 area ketuk (kotak centang Pengaturan Memo, yang berada di dalam baris yang bisa diketuk penuh) dan 11 jenis teks 9,9-11,8 px (label huruf kapital kecil). Tidak ada layar yang meluber ke samping.

Hanya `css/style.css`, `css/memo.css`, dan `index.html` (`?v=` naik ke 20261047) yang berubah; tidak ada file JS yang diubah (dibuktikan dengan perbandingan SHA-256 seluruh file). Perubahan: (1) tombol "← Semua Game/Kembali" dan tombol tutup dialog minimal 44 px; (2) teks kartu hub, status papan peringkat, dan label HUD Memo dinaikkan; (3) kartu game di hub pada HP sempit (≤400 px): ikon di kiri, judul dan keterangan di kanan sehingga "Perkalian 1-10" tidak terpotong; (4) tab Statistik Memo muat tiga kolom (sebelumnya tab "Profil" terpotong di 320 px); (5) judul layar Statistik/Pencapaian/Pengaturan/Bantuan Memo ditumpuk di HP sempit; (6) **stopwatch Game 1**: warna merah transparan yang diisi kode membuat angka hampir tak terbaca di latar gelap; kini ada lapisan putih di belakangnya sehingga putih lalu memerah seperti maksud kode (logika stopwatch tidak diubah); (7) HP landscape: tombol keypad minimal 44 px; (8) layar pendek (≤640 px): jarak vertikal Memo dirapatkan.

## P8 (PERUBAHAN TEKS SAJA): gaya bahasa santai (Indonesia + Inggris natural)

Microcopy untuk pemain (tombol, status, feedback, tooltip, pesan galat, dialog) di Hub dan Game 1-4 diubah ke gaya santai ala Gen Z. Tidak ada aturan, mekanik, nama variabel, key database, field API, ID, atau kelas CSS yang diubah. `?v=` naik ke 20261048.

Dijaga dengan alat pembanding AST (`ast_text_diff`): untuk setiap file JS, struktur kode harus identik dan hanya isi string/template yang berbeda; `index.html` dibandingkan kerangkanya (tag dan atribut) terpisah dari teksnya.

Glosarium gaya (supaya konsisten): "nggak/udah/bakal/kesimpen/dipakai" untuk Indonesia santai; Inggris hanya pada frasa pendek yang natural (Time's up, Not quite, GG, Rematch, Personal best, Leaderboard, Practice Lab). Pesan galat teknis tetap menyebut penyebab yang sama (server tidak terjangkau, aturan keamanan menolak, nama sudah dipakai, dst.).

Sengaja TIDAK diubah: isi soal dan penjelasan edukatif (`data/*.js`, prompt dan penjelasan di `memo-core.js`), `aria-label` teknis, pesan `console.warn`, deskripsi pencapaian di `memo-data.js`, serta semua teks yang dipakai logika program. Tes `cloud3` dan `mig1` menyesuaikan dua kalimat yang dicocokkan (salinan lama: `*_lama.js`).

