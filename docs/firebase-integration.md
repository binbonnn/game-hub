# Integrasi Firebase — Game Hub v2

Dokumen ini menjelaskan bagaimana aplikasi statis ini terhubung ke proyek Firebase **multgame-9f7e6** (Cloud Firestore + Auth anonim), apa saja yang disinkronkan, dan bagaimana status koneksi ditampilkan kepada pemain. Identitas pemain kini terpusat: satu UID Firebase untuk beranda dan semua game, dengan mode tamu yang tidak pernah menulis data permanen.

Berkas terkait:

- [`js/core/firebase-config.js`](../js/core/firebase-config.js) — konfigurasi web + versi SDK.
- [`js/core/cloud.js`](../js/core/cloud.js) — adapter Firestore, status koneksi, profil `players/{uid}`, `gameStats`, dan papan.
- [`js/core/store.js`](../js/core/store.js) — state memori tab + hook Firestore (`user_data/{uid}`, skor, statistik).
- [`js/core/identity.js`](../js/core/identity.js) — satu sumber keadaan tamu/terdaftar + UID Firebase.
- [`js/core/profile-ui.js`](../js/core/profile-ui.js) — dialog Create Profile/aktivasi/profil yang sama di semua halaman.
- [`js/core/room.js`](../js/core/room.js) — adapter room duel online G1–G3 (kode 5 karakter, `onSnapshot`, slot UID).
- [`firestore.rules`](../firestore.rules) — aturan keamanan server.
- [`docs/firebase-security-rules.md`](firebase-security-rules.md) — detail aturan dan policy data.

---

## 1. Prinsip

1. **Firestore-only.** Tidak ada `localStorage` maupun `sessionStorage` untuk data user. Pemain tamu hanya menyimpan keadaan di memori tab dan tidak pernah membuat dokumen Firestore. Setelah pendaftaran, semua data user masuk ke Firestore.
2. **Satu identitas, satu UID.** Firebase Auth anonim dibuat hanya saat pemain menekan *Create Profile*. Nama bukan kunci identitas. Perubahan profil langsung tersinkron ke beranda dan game yang sedang berjalan tanpa refresh/restart.
3. **Satu-satunya penyimpanan permanen.** Profil, preferensi, riwayat, papan pribadi, skor, dan room duel online berada di Firestore. Kegagalan cloud tidak menghalangi permainan, tetapi perubahan hanya hidup selama tab terbuka.
4. **Tidak ada data uji produksi.** Verifikasi hanya memakai uji baca dan uji penolakan aturan. Tidak ada dokumen contoh/dummy yang sengaja ditulis.
5. **Tanpa iklan dan tanpa Analytics.** `measurementId` disimpan sebagai bagian dari konfigurasi tetapi Firebase Analytics **sengaja tidak dimuat**.
6. **SDK dimuat belakangan.** Skrip Firebase baru diunduh setelah frame pertama, sehingga render awal tidak menunggu jaringan.

Konfigurasi web Firebase bersifat publik dan memang dikirim ke peramban. Keamanan data bergantung pada Firestore Security Rules, bukan pada kerahasiaan `apiKey`.

---

## 2. Konfigurasi

```js
GH.firebaseConfig = {
  apiKey: 'AIzaSyBWuk5aC5rt_EQaHh9Ofm0jVuu1VrUKOjw',
  authDomain: 'multgame-9f7e6.firebaseapp.com',
  projectId: 'multgame-9f7e6',
  storageBucket: 'multgame-9f7e6.firebasestorage.app',
  messagingSenderId: '812456927291',
  appId: '1:812456927291:web:af920785c9080e9eb17c1e',
  measurementId: 'G-15TJ5ZTNST' // tidak dipakai
};
```

SDK yang dimuat dari CDN (compat, kompatibel dengan skrip klasik tanpa build):

- `https://www.gstatic.com/firebasejs/10.14.1/firebase-app-compat.js`
- `https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore-compat.js`
- `https://www.gstatic.com/firebasejs/10.14.1/firebase-auth-compat.js` — saat sesi dipulihkan, saat *Create Profile* ditekan, atau saat papan Memo ditulis.

### Domain Auth

Anonymous Auth harus diaktifkan di **Firebase Console → Authentication → Sign-in method → Anonymous**. Domain tempat aplikasi di-host juga harus masuk daftar **Authorized domains** (Firebase Console → Authentication → Settings). `localhost` sudah diizinkan secara default; domain produksi perlu ditambahkan manual. Jika tidak, pendaftaran profil dan penulisan skor gagal dengan kode `auth/unauthorized-domain`, tetapi permainan tetap berjalan sebagai tamu.

---

## 3. Apa yang tersinkron

| Kunci data | Koleksi Firestore | Jenis | Keterangan |
|---|---|---|---|
| profil terdaftar | `players/{uid}` | identitas | satu dokumen per UID Auth, owner-only |
| data hub pemain | `user_data/{uid}` | privat | preferensi, riwayat, streak, harian, papan pribadi |
| statistik per game | `players/{uid}/gameStats/{gameId}` | ringkasan | `lastScore`, `bestScore`, `plays`, owner-only |
| `multiply:10` | `records_10` | waktu | urutan `time` naik |
| `multiply:20` | `records_20` | waktu | urutan `time` naik |
| `multiply:30` | `records_30` | waktu | urutan `time` naik |
| `knowledge` | `knowledge_records` | skor | ronde 60 detik, `score` turun |
| `advmath:10` | `advmath_records_10` | waktu | `time` naik |
| `advmath:20` | `advmath_records_20` | waktu | `time` naik |
| `advmath:30` | `advmath_records_30` | waktu | `time` naik |
| `multiply:duel` | `multiply_duel_wins` | kemenangan duel G1 online | `FieldValue.increment(1)` |
| `knowledge:duel` | `knowledge_duel_wins` | kemenangan duel G2 online | `FieldValue.increment(1)` |
| `advmath:duel` | `advmath_duel_wins` | kemenangan | `FieldValue.increment(1)` |
| `memo` | `memo_boards/memo_all/entries` | skor | butuh Auth anonim |
| `memo:daily` | `memo_boards/memo_daily/entries` | skor | butuh Auth anonim |
| room G1 | `duels/{code}` | progres 1v1 | sementara, kode 5 karakter, wajib Auth |
| room G2 | `knowledge_duels/{code}` | progres 1v1 | sementara, kode 5 karakter, wajib Auth |
| room G3 | `advmath_duels/{code}` | progres 1v1 | sementara, kode 5 karakter, wajib Auth |
| room G4 | `memo_duels/{code}` | progres 1v1 | ronde deterministik, kode 5 karakter, wajib Auth |

Room hanya dipakai selama pertandingan dan dihapus oleh pembersih setelah 24 jam. Kedua slot memakai `uid` Auth (bukan nama); tuan room satu-satunya yang mengubah `status`, `startAtMillis`, dan `winner`.

**Semua data user tersimpan di Firestore**, termasuk setelan, riwayat sesi, papan pribadi, data Memo, dan Nusantara Sirna. **Tamu:** semua data hanya ada di memori tab; tidak ada `players/{uid}`, `user_data/{uid}`, atau tulisan Firestore lainnya. Duel lokal sudah dihapus; yang tersisa adalah duel room online G1–G4.

Bentuk payload mengikuti validasi rules (`uid` selalu UID Auth pemilik, opsional hanya untuk kompatibilitas rekor lama):

- Data hub: `{ uid, version, createdAt, updatedAt, settings, boards, activity, sessions, lastPlayed, daily, duelWins, memo, nusantara }`
- Profil: `{ uid, displayName, name, avatar, createdAt, updatedAt }`
- GameStat: `{ uid, gameId, lastScore, bestScore, plays, progress, achievements, statistics, lastMeta, lastPlayedAt, createdAt, updatedAt }`
- G1: `{ name, time, mistakes, avatar, uid }`
- G2: `{ name, score, correct, hints, burned, avatar, uid }`
- G3: `{ name, time, mistakes, hints, burned, avatar, uid }`
- Duel G1/G2/G3 online: `{ name, avatar, wins: increment(1), updatedAt, uid }`
- Memo: `{ pid, owner, name, icon, score, accP, total, sid, ts, uid }`
- Room G1/G3: `{ uid, name, avatar, progress, mistakes, correct, burned, hints, penaltySec, time, finishedAt, lastSeen }`
- Room G2: `{ uid, name, avatar, score, correct, burned, hints, accuracy, finishedAt, lastSeen }`

Rekor solo memakai `id` rekor yang dibuat klien sebagai ID dokumen Firestore. Rules hanya mengizinkan `create`, sehingga pengiriman ulang dokumen yang sudah ada ditolak dan adapter menganggapnya sukses bila dokumen memang ada. Skor Memo 0 tidak dikirim karena rules mensyaratkan `score >= 1`.

---

## 4. Status yang terlihat pemain

Status dibaca dari `GH.cloud.getStatus()` dan disiarkan lewat `GH.cloud.onChange(fn)`.

| Phase | Label chip | Arti |
|---|---|---|
| `idle` | Menyiapkan… | modul belum mulai |
| `connecting` | Menghubungkan… | sedang mengunduh SDK / memeriksa izin |
| `online` | **Global aktif** | Firestore terbaca; skor baru ikut dikirim |
| `degraded` | Global terganggu | server tidak terjangkau/aturan menolak |
| `offline` | Offline · lokal | perangkat offline |
| `disabled` | Mode lokal | konfigurasi tidak tersedia |
| `error` | Global gagal | inisialisasi gagal |

Tempat tampil:

1. **Chip header** (`#cloudChip`) — warna + titik status; diklik untuk membuka dialog detail.
2. **Banner hub** (`[data-cloud-banner]`) — judul, penjelasan, proyek, latensi, dan waktu pemeriksaan terakhir.
3. **Dialog “Penyimpanan global”** — status lengkap, auth, jumlah kiriman, daftar yang tersinkron vs lokal, dan tombol “Periksa ulang koneksi”.
4. **Papan skor** — tiap papan menampilkan bagian **Lokal** dan **Global** terpisah, lengkap dengan keadaan memuat/kosong/gagal.
5. Setelan, Lontar, Tentang, dan profil tidak lagi menyatakan “tanpa Firebase”.

Pembaruan otomatis terjadi saat `online`, `offline`, perubahan visibilitas tab, dan interval 90 detik saat tab terlihat. Warna bukan satu-satunya penanda: setiap status punya teks dan `aria-label`.

---

## 5. Cara kerja singkat

1. `GH.identity.init()` dipanggil di `boot()` setelah UI siap. Modul ini memulihkan Auth, membaca `players/{uid}`, dan menyiarkan keadaan tamu/terdaftar lewat `onChange`.
2. `GH.cloud.start()` memuat SDK, membuat app Firestore, lalu melakukan probe baca:
   `db.collection('records_10').limit(1).get()`.
3. Probe sukses → `online`. Probe gagal → `degraded`/`offline`, tetapi `init()` tetap mengembalikan `true` selama SDK dan `db` siap, agar penulisan bisa dicoba lagi nanti.
4. Tombol *Create Profile* memanggil `I.register()`, yang membuat UID anonim (jika belum ada) lalu dokumen `players/{uid}` sekali saja. Klik ganda/Network lambat tidak membuat profil kedua.
5. `S.addScore()` / `S.addDuelWin()` menyimpan ke sesi (tamu) atau lokal (terdaftar), lalu memanggil hook cloud **hanya bila terdaftar** tanpa menunggu hasilnya. Hook juga menulis `players/{uid}/gameStats/{gameId}`.
6. `fetchBoard(key)` dipakai dialog papan skor untuk mengambil 7–20 rekor teratas sesuai urutan masing-masing papan. Hasil di-cache 60 detik per modal.
7. Tombol **Duel online** di dashboard G1–G3 membuka dialog room yang sama. Tuan room membuat kode 5 karakter dan soal identik; lawan cukup memasukkan kode di perangkatnya. Saat lawan bergabung, tuan room menulis `startAtMillis = Date.now() + 3000`, lalu kedua perangkat memulai balapan bersamaan lewat `UI.countdown`. Progres tiap pemain dikirim ke slotnya sendiri (dibatasi ~1 detik), dan pemenang dihitung lokal dari kedua slot setelah keduanya selesai. Hanya tuan room yang menulis `winner`; kemenangan global dicatat hanya oleh perangkat pemenang (`primary: true`).

---

## 6. Verifikasi yang sudah dilakukan

- `node tools/validate-rules.js` → lolos.
- Peramban `http://localhost:4173/`:
  - chip dan banner berubah dari `Menghubungkan…` menjadi **Global aktif** (probe `records_10` sukses, latensi ~592 ms);
  - dialog “Penyimpanan global” terbuka, tombol periksa ulang bekerja;
  - papan skor menampilkan rekor global nyata untuk `multiply:10/20/30`;
  - baca koleksi di luar aturan → `permission-denied` (rules aktif);
  - simulasi event `offline`/`online` → status lokal/global berubah dan pulih;
  - tidak ada error konsol;
  - alur duel online G1–G3 diverifikasi memakai stub Firestore di dua tab (create → join → countdown → balapan → hasil), tanpa menulis dokumen uji ke produksi.

Tidak ada dokumen uji yang ditulis ke produksi.

> **Perlu tindakan:** `firestore.rules` revisi terbaru — `players/{uid}`, `gameStats`, kewajiban Auth untuk rekor permanen, **dan room duel G1–G3 yang sekarang wajib Auth + UID** — **harus di-publish ulang** ke Firebase Console sebelum profil maupun duel online dipakai. Sebelum itu, tulisan profil/statistik dan room akan ditolak; aplikasi tetap berjalan sebagai tamu untuk mode lokal.

---

## 7. Batas yang masih berlaku

- Duel online G1–G3 sudah punya adapter klien (`js/core/room.js`), tetapi mengharuskan aturan room revisi terbaru terpasang di server. Party/co-op Nusantara masih lokal saja.
- Rekor permanen sekarang mensyaratkan Auth dan UID pemilik. Klien yang dimodifikasi tetap bisa mengirim skor palsu dari UID-nya sendiri; rules tidak bisa memverifikasi hasil permainan tanpa Cloud Function.
- Anonymous Auth terikat profil/peramban: menghapus data peramban akan membuat UID baru dan profil lama tidak bisa dipulihkan lintas perangkat (sesuai keputusan produk).
- Akun tamu sengaja tidak punya pemulihan: menutup tab mengakhiri sesi, dan tidak ada `players/{uid}` yang dibuat sebelum pendaftaran.
- Tidak ada indeks komposit yang diperlukan karena semua kueri memakai satu field.
