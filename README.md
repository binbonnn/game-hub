# Game Hub (Game Perkalian Seru)

Kumpulan game belajar berbasis web: HTML, CSS, dan JavaScript biasa (tanpa framework dan tanpa build). Data papan peringkat dan duel disimpan di Firebase Firestore; bila Firebase tidak tersedia, papan peringkat memakai localStorage sebagai cadangan.

## Game

| Game | Isi | File utama |
| --- | --- | --- |
| Game 1 | Perkalian 1-10 Dasar | `js/games/game1/game1-*.js` (5 file) |
| Game 2 | Pengetahuan Dasar (bank 2.000 soal) | `js/games/game2/game2-*.js` (5 file), `data/knowledge-questions.js` |
| Game 3 | Perkalian 1-10 Lanjutan (bank 2.000 soal) | `js/games/game3/game3-*.js` (5 file), `data/advmath-questions.js` |
| Game 4 | Memo Mayhem: Cosmic Recall | folder `js/games/memo/` (`memo-core.js`, `memo-data.js`, `memo-cloud.js`, `memo.js`, `memo-ui.js`), `css/memo.css` |

## Menjalankan

Tidak ada instalasi. Buka `index.html` di peramban, atau unggah semua file ke GitHub Pages. Untuk pengembangan lokal sebaiknya jalankan server statis sederhana (misalnya `python3 -m http.server`) di folder ini lalu buka alamat yang ditampilkan.

Bootstrap 5.3.1, font Baloo 2, dan Firebase 10.12.2 (compat) dimuat dari CDN, jadi perlu koneksi internet.

## Konfigurasi Firebase

`js/shared/firebase-config.js` berisi pengenal project Firebase (`multgame-9f7e6`). Nilai di dalamnya bukan rahasia; keamanan data dijaga oleh Firestore Rules yang diatur di Firebase Console. Repo ini tidak berisi file Rules, jadi Rules aktif harus dicek langsung di Console.

Bila `js/shared/firebase-config.js` kosong atau berisi placeholder, game memakai localStorage.

## Urutan muat skrip (jangan diubah)

Semua skrip adalah skrip biasa yang berbagi satu cakupan global. Urutan di `index.html` adalah kontraknya:

`js/shared/firebase-config.js` > `data/knowledge-questions.js` > `data/advmath-questions.js` > `js/shared/shared.js` > `js/hub/hub.js` > `js/games/game1/game1-dashboard.js` > `game1-play.js` > `game1-record.js` > `game1-controls.js` > `game1-duel.js` > `js/games/game2/game2-core.js` > `game2-storage.js` > `game2-dashboard.js` > `game2-play.js` > `game2-duel.js` > `js/games/game3/game3-core.js` > `game3-storage.js` > `game3-dashboard.js` > `game3-play.js` > `game3-duel.js` > `js/hub/hub-init.js` > `js/games/memo/memo-core.js` > `memo-data.js` > `memo-cloud.js` > `memo.js` > `memo-ui.js` > `js/hub/nav.js`

Setiap kali file JS atau CSS diubah, naikkan satu nomor `?v=` bersama pada semua tag lokal di `index.html` agar peramban tidak memakai cache lama.

## Pengujian

Pengujian otomatis di repo hanya `tests/memo-core.test.js` (logika Game 4, jalankan `node tests/memo-core.test.js`). Pengujian manual ada di `docs/MANUAL_TESTING_CHECKLIST.md`.

## Dokumentasi lain

- `docs/ARCHITECTURE.md`: struktur file, tanggung jawab, dan data bersama.
- `docs/CHANGELOG.md`: perubahan penting.
- `docs/VERIFICATION.md`: apa yang sudah dan belum diverifikasi.
- `docs/MANUAL_TESTING_CHECKLIST.md`: skenario uji manual dan format laporan masalah.

## File yang belum terpakai

`js/unused/ui.js` tidak dimuat oleh `index.html`, dan folder `assets/mascot` tidak dirujuk oleh kode. Keduanya dibiarkan apa adanya.
