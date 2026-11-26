# Game Hub

Lima game edukasi dan hiburan dalam satu halaman statis:

- **Perkalian 1–10** (10/20/30 soal, timed & 60 detik)
- **Pengetahuan Dasar** (60 detik)
- **Perkalian Lanjutan** (10/20/30 soal)
- **Memo Mayhem** (6 mode, tantangan harian, papan global)
- **Nusantara Sirna** (solo, arena & senapati, papan mingguan)

Duel tersedia lewat **room online** (kode 5 karakter) untuk G1–G4. Duel lokal sudah dihapus.

## Penyimpanan

Firestore adalah **satu-satunya** tempat penyimpanan data user. Tidak ada
`localStorage` maupun `sessionStorage` untuk profil, skor, riwayat, atau
preferensi. Pemain tamu hanya menyimpan keadaan di memori tab dan tidak
menulis dokumen apa pun.

Data tersimpan di:

- `players/{uid}` — profil & statistik game
- `user_data/{uid}` — preferensi, riwayat sesi, penanda harian, papan pribadi
- `records_*`, `knowledge_records`, `advmath_records_*` — rekor solo
- `multiply_duel_wins`, `knowledge_duel_wins`, `advmath_duel_wins` — kemenangan duel online
- `duels`, `knowledge_duels`, `advmath_duels`, `memo_duels` — room duel online
- `memo_*`, `ns_*` — data Memo Mayhem & Nusantara Sirna

Aturan keamanan ada di [`firestore.rules`](firestore.rules). File tersebut
**belum dipublish** ke Firebase; publikasi perlu dilakukan secara eksplisit
setelah ditinjau dan diuji dengan Firestore Emulator.

## Menjalankan

Aplikasi ini statis. Sajikan folder ini lewat server HTTP statis apa pun, lalu
buka `index.html`. Contoh dengan Node:

```bash
npx serve .
```

Firebase SDK dimuat malas dari CDN saat koneksi dibutuhkan. Konfigurasi proyek
ada di `js/core/firebase-config.js`.

## Verifikasi lokal

```bash
node tools/validate-rules.js
node tools/test-memo-core.js
node tools/test-ns-core.js
```

`harness-g1g3.html` memakai stub Firestore/Auth di browser (tanpa menulis data
produksi) untuk uji alur terdaftar/tamu.
