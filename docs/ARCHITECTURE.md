# Arsitektur

Dokumen ini menjelaskan kondisi kode setelah `script.js` dipecah (tahap M1-M4, P3, P4, dan P5). Pemecahan hanyalah pemindahan kode apa adanya; perilaku tidak berubah.

## Prinsip dasar

- Skrip biasa, tanpa ES module, tanpa pembungkus, tanpa `'use strict'` (kecuali `nav.js` dan modul Game 4 yang memakai pembungkus sendiri).
- Semua deklarasi tingkat atas di `shared.js`, `hub.js`, file-file `game1-*.js`, `game2-*.js`, `game3-*.js`, dan `hub-init.js` berada di satu cakupan global. Fungsi dan variabel saling terlihat tanpa import.
- Karena itu urutan muat di `index.html` menentukan apakah suatu fungsi sudah ada saat kode pemuatan berjalan.

## Struktur folder

```
index.html
css/        style.css, memo.css
data/       knowledge-questions.js, advmath-questions.js (bank soal)
js/shared/  firebase-config.js, shared.js (dulu script.js)
js/hub/     hub.js, hub-init.js, nav.js
js/games/   game1/, game2/, game3/ (masing-masing 5 file), memo/ (Game 4)
js/unused/  ui.js (tidak dimuat)
assets/     mascot (tidak dirujuk)
tests/      memo-core.test.js
docs/       ARCHITECTURE.md, CHANGELOG.md, MANUAL_TESTING_CHECKLIST.md
```

Nama file di tabel bawah ditulis tanpa folder; lihat struktur di atas.

## File dan tanggung jawab

| File | Baris | Isi |
| --- | --- | --- |
| `shared.js` (dulu `script.js`) | 399 | Utilitas bersama (modal, escape HTML, penyimpanan lokal), Firebase dan papan peringkat dasar, suara, konfeti, state dan pembuat soal Game 1 |
| `hub.js` | 62 | Hub: `switchView`, `goToHub`, `goToDashboard`, dan tombol kartu game di halaman utama |
| `game1-dashboard.js` | 151 | Game 1: papan peringkat, pemilih avatar (`buildAvatarPicker`), modal bantuan dan pilih jumlah soal |
| `game1-play.js` | 271 | Game 1: hitung mundur (`runCountdown`, `COUNTDOWN_STEPS`), soal, cek jawaban, peringkat, selesai |
| `game1-record.js` | 86 | Game 1: simpan skor, kembali ke dasbor, main lagi |
| `game1-controls.js` | 63 | Stopwatch, keypad, dan toast (`showToast`) |
| `game1-duel.js` | 565 | Game 1: duel 1v1 (juga `generateRoomCode`, `requireFirebaseForDuel`) |
| `game2-core.js` | 276 | Game 2: konstanta, state, bank soal, skor dan streak (termasuk `nameToDocId`, baris 144) |
| `game2-storage.js` | 102 | Game 2: simpan dan baca rekor solo dan kemenangan duel |
| `game2-dashboard.js` | 198 | Game 2: papan peringkat, dasbor, avatar, bantuan |
| `game2-play.js` | 405 | Game 2: alur permainan, hint, selesai, simpan rekor |
| `game2-duel.js` | 506 | Game 2: duel 1v1 |
| `game3-core.js` | 169 | Game 3: konstanta, state, pembuat soal (termasuk `nameToDocId`, baris 57) |
| `game3-storage.js` | 107 | Game 3: simpan dan baca rekor solo dan kemenangan duel |
| `game3-dashboard.js` | 209 | Game 3: papan peringkat, dasbor, avatar |
| `game3-play.js` | 656 | Game 3: alur permainan, hint, selesai, simpan rekor |
| `game3-duel.js` | 514 | Game 3: duel 1v1 |
| `hub-init.js` | 25 | Inisialisasi: pemilih avatar dan aturan skor Game 2 dan 3 |
| `knowledge-questions.js`, `advmath-questions.js` | - | Bank soal (masing-masing 2.000 soal) |
| `memo-*.js`, `memo.js` | - | Game 4: aturan (`memo-core.js`), pengaturan + penunjuk profil di perangkat (`memo-data.js`), semua data pemain di Firebase (`memo-cloud.js`), alur, tampilan |
| `nav.js` | 158 | Tombol Back tingkat hub memakai History API; membungkus `switchView` |
| `style.css`, `memo.css` | - | Gaya Hub dan Game 1-3; gaya Game 4 |

## Penyimpanan data Game 4 (sejak P6-4)

Pemain terdaftar: semua data di Firebase (`memo_names`, `memo_profiles` + `sessions`, `memo_boards`). Pemain Tamu: tidak ada yang disimpan. Perangkat hanya menyimpan pengaturan dan penunjuk profil terdaftar (`memoMayhemCosmicRecall_v1`, skema 2). Tidak ada antrean sesi; simpan dicoba sekali per sesi dan bisa diulang dari layar hasil.

## Hal yang perlu diingat

- File Game 1, 2, dan 3 masing-masing harus dimuat berurutan seperti tercantum di `index.html`. Fungsi di file yang dimuat belakangan tidak boleh dipakai langsung saat pemuatan oleh file sebelumnya.
- `hub.js` harus dimuat tepat setelah `shared.js` (posisi yang sama dengan bagian akhir `script.js` sebelum P3).
- File Game 1 harus dimuat sebelum file Game 2, Game 3, dan `hub-init.js`, karena `buildAvatarPicker` (Game 1) dipakai saat pemuatan oleh ketiganya.
- `nameToDocId` terdefinisi dua kali (`game2-core.js:144` dan `game3-core.js:57`); yang dimuat terakhir menang. Isi keduanya sama pada saat dokumen ini ditulis.
- Game 4 tidak memakai fungsi Game 1-3 secara langsung; satu-satunya titik temu adalah `switchView` (`memo-ui.js`) dan pembungkusnya di `nav.js`.
- `ui.js` tidak dimuat; folder `assets/mascot` tidak dirujuk.

## Layar utama

`hubView`, `memoView`, `dashboardView`, `gameView`, `knowledgeDashboardView`, `knowledgeGameView`, `advmathDashboardView`, `advmathGameView`. Perpindahan lewat `switchView(viewName)`.

## Data

### Firestore (koleksi yang dipanggil kode)

| Koleksi | Dipakai oleh |
| --- | --- |
| `records_<jumlah soal>` | Game 1: papan peringkat (`getRecordsKey`, `shared.js:70`) |
| `duels` | Game 1: duel |
| `knowledge_records`, `knowledge_duel_wins`, `knowledge_duels` | Game 2 |
| `advmath_records_<jumlah soal>`, `advmath_duel_wins`, `advmath_duels` | Game 3 |
| `memo_names`, `memo_profiles` (subkoleksi `sessions`), `memo_boards` (subkoleksi `entries`) | Game 4 |

Auth anonim hanya dipakai Game 4 (`memo-cloud.js`). Game 1-3 menyimpan nama (teks), avatar, dan angka tanpa identitas pengguna.

### localStorage

`soundEnabled`, `lastGameBackgroundColor`, `knowledgeRulesCollapsed`, `advmathRulesCollapsed`, kunci papan peringkat cadangan (`records_<n>`, `knowledge_records`, `knowledge_duel_wins`, `advmath_duel_wins`, dan sejenisnya), serta `memoMayhemCosmicRecall_v1` untuk Game 4.

## Aturan perubahan

1. Tambah atau pindahkan kode hanya bila urutan muat tetap aman; periksa dengan skrip kontrak (typeof pada nama global bersama) dan jalankan skenario manual.
2. Jangan mengubah nama koleksi, ID dokumen, atau skema tanpa memeriksa Firestore Rules di Console.
3. Naikkan satu nomor `?v=` bersama di `index.html` setiap kali file diunggah.
4. Satu perubahan perilaku (perbaikan bug) per langkah, terpisah dari pemindahan kode.

## Temuan

Diperbaiki: avatar tanpa escape (P6-1) dan dialog keluar yang tidak menutup bila Back ditekan saat dialog masih animasi membuka (P6-2). Blok `catch` kosong kini mencatat peringatan di konsol (P6-3); satu yang dibiarkan: getaran HP di `game2-core.js`.
