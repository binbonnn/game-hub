# Firestore Security Rules — Game Hub

Berkas aturan: [`firestore.rules`](../firestore.rules)
Alat validasi lokal: [`tools/validate-rules.js`](../tools/validate-rules.js)

Dokumen ini menjelaskan **apa yang dilindungi**, **bentuk data yang diterima**, cara memasang, dan **batas keamanan yang jujur**. Aturan kini mencakup profil terpusat `players/{uid}` dan `gameStats` dengan kepemilikan UID, selain papan-papan lama.

---

## 1. Ringkasan status

| Hal | Status |
|---|---|
| Aplikasi Game Hub v2 di folder ini | **Statis + Firestore-only**: tidak ada localStorage/sessionStorage; tamu hanya memori tab |
| Aturan keamanan Firestore | **Versi lama sudah dipasang**; revisi `players/{uid}`, `gameStats`, Auth wajib, **dan room duel wajib UID belum di-deploy** — perlu Publish ulang |
| Basis data yang dipakai | **Cloud Firestore** (bukan Realtime Database) |
| Validasi sintaks lokal | Lolos `node tools/validate-rules.js` |
| Uji Firestore Emulator | **Belum dijalankan** (butuh Firebase CLI + Java, tidak tersedia di mesin ini) |
| Uji integrasi ke aplikasi | **Sudah** — baca `records_10` sukses, baca koleksi di luar aturan ditolak (`permission-denied`) |
| Multiplayer room daring G1–G3 | **Sudah di klien** (`js/core/room.js`) — wajib profil; menunggu rules revisi terpasang sebelum bisa dipakai |

> **Penting:** aturan di sini mengamankan sisi server. Sisi klien ada di [`js/core/cloud.js`](../js/core/cloud.js), [`js/core/identity.js`](../js/core/identity.js), dan detail pemakaiannya ada di [`docs/firebase-integration.md`](firebase-integration.md). Status koneksi ditampilkan langsung di header dan banner hub. **Tamu tidak menulis Firestore sama sekali; `players/{uid}` dan `user_data/{uid}` hanya dibuat setelah pendaftaran dengan Auth anonim.**

Skema mengikuti aplikasi rujukan `game-hub-g5-fase8f-kode`, yang memang memakai **Firestore** (tidak ada `databaseURL` maupun `firebase.database()` di proyek itu). Karena itu tidak ada aturan Realtime Database di sini.

---

## 2. Kebijakan per kelompok data

### 2.0 Profil pemain terpusat — owner-only

Koleksi: `players/{uid}` dan `players/{uid}/gameStats/{gameId}`.

- Path `uid` = Firebase Auth UID; tidak pernah diambil dari `displayName`/`name`.
- `get` hanya untuk UID yang sama dengan `request.auth.uid`; `list` ditolak agar profil tidak bisa dipanen massal.
- `create` mensyaratkan login, `uid == request.auth.uid`, payload `uid` sama, field hanya `uid, displayName, name, avatar, createdAt, updatedAt`, dan `createdAt`/`updatedAt` berupa angka.
- `update` juga mengunci `uid`, `createdAt`, dan `resource.data.uid`; `updatedAt` boleh berubah.
- `delete: false`.
- `gameStats`: `create`/`update` hanya oleh UID pemilik, `gameId` sesuai path, `plays` 1–10.000.000, `lastScore`/`bestScore` −1.000.000…100.000.000, map `progress/achievements/statistics/lastMeta` wajib ada, `createdAt` tidak boleh berubah pada update. `delete: false`.
- Klien menulis statistik ini lewat `GH.cloud.saveGameStat()` setelah `S.addScore()`/`S.addDuelWin()`; tamu tidak memanggilnya sama sekali.

### 2.1 Papan peringkat solo — buat saja, tidak bisa diubah

Koleksi: `records_10`, `records_20`, `records_30`, `knowledge_records`, `advmath_records_10`, `advmath_records_20`, `advmath_records_30`.

- `read: true` — papan bersifat publik.
- `create` — wajib login (`request.auth != null`), bentuk data valid, dan `uid` (bila dikirim) harus sama dengan UID penulis.
- `update`, `delete: false` — skor lama tidak bisa ditimpa atau dihapus.
- ID dokumen boleh ditentukan klien (adapter memakai `id` rekor lokal) agar pengiriman ulang bersifat idempoten; dokumen lama tetap tidak bisa diubah.

Efeknya: tamu tidak bisa menulis rekor sama sekali. Pemain terdaftar tidak bisa menaikkan skor lama, tetapi **tetap bisa mengirim skor palsu baru dari UID-nya sendiri**. Ini batas yang tidak bisa ditutup oleh rules saja.

### 2.2 Papan kemenangan duel — penghitung boleh naik

Koleksi: `multiply_duel_wins` (G1 online), `knowledge_duel_wins` (G2 online), `advmath_duel_wins` (G3 online).

- ID dokumen = `nameToDocId(nama)` (`huruf kecil`, spasi/simbol → `_`, maks. 60 karakter, fallback `anon`).
- `create` hanya bila login, `wins == 1`, dan `uid` (bila dikirim) sesuai UID penulis.
- `update` hanya bila login, `name` dan `avatar` tidak berubah, dan `wins` **lebih besar** dari nilai lama. Klien memakai `FieldValue.increment(1)`.
- `delete: false`.
- Kemenangan hanya dikirim untuk sisi pemain terdaftar yang menang; duel lokal sudah dihapus.

### 2.3 Room multiplayer 1v1 — wajib profil terdaftar

Koleksi: `duels` (G1), `knowledge_duels` (G2), `advmath_duels` (G3).

- **Semua akses room mensyaratkan `request.auth != null`.** `get`/`onSnapshot` hanya untuk pemain yang sudah masuk; `list` ditolak. Klien hanya mengambil dokumen berdasarkan kode.
- Kode room harus cocok `^[A-Z0-9]{4,6}$` (klien memakai **5 karakter** dari `U.roomCode()`).
- Saat dibuat: `status == 'waiting'`, `guest == null`, `winner == null`, `rematch == null`, `startAtMillis == null`, dan `host.uid == request.auth.uid`.
- Jumlah soal:
  - `duels`: `questions.size() == count`, `count` ∈ {10, 20, 30}.
  - `knowledge_duels`: 1–120 soal (klien menyiapkan 80 soal untuk ronde 60 detik).
  - `advmath_duels`: `questions.size() == count`, `count` ∈ {10, 20, 30}.
- Setiap slot (`host`/`guest`) menyimpan `uid` Auth (bukan nama) dan field progres sesuai game. `uid` host tidak boleh berubah; `guest` hanya boleh ditambahkan sekali, oleh UID pemain itu sendiri, bersamaan dengan perubahan `status` menjadi `countdown`.
- Saat diupdate:
  - `createdAt`, `count`, dan `questions` tidak boleh berubah (soal identik di kedua perangkat);
  - pemain hanya boleh memperbarui **slotnya sendiri** dan tidak boleh mengubah slot lawan;
  - hanya tuan room yang boleh mengubah `status`, `startAtMillis`, dan `winner`;
  - `host.name`, `host.avatar`, serta nama/avatar `guest` tidak boleh berubah;
  - `status` hanya boleh salah satu dari `waiting`, `countdown`, `playing`, `finished`, `abandoned`;
  - `winner` hanya `null`, `host`, `guest`, atau `draw`.
- `delete` hanya boleh oleh tuan room setelah room berumur **24 jam**.

Tamu tidak pernah menulis room: tombol *Duel online* menolaknya dan membuka dialog Create Profile yang sama seperti di game lain.

### 2.4 Memo Mayhem — memakai Firebase Auth anonim

Koleksi: `memo_names`, `memo_profiles`, `memo_profiles/{pid}/sessions`, `memo_boards/{boardKey}/entries`.

- **Wajib** mengaktifkan `Authentication → Sign-in method → Anonymous`.
- Semua penulisan mensyaratkan `owner == request.auth.uid`.
- `memo_names`: publik hanya untuk `get` (cek ketersediaan nama); `list` ditolak; sekali dibuat tidak bisa diubah/dihapus.
- `memo_profiles`: publik untuk dibaca; pembuatan dan pembaruan hanya oleh pemilik; `v`, `name`, `nameKey`, `createdAt`, dan `owner` tidak boleh berubah.
- `sessions`: hanya bisa dibaca/ditulis oleh pemilik profil; dokumen tidak bisa diubah/dihapus (1 `sid` = 1 sesi, idempoten).
- `entries`: skor terbaik per pemain per kategori; pembaruan hanya oleh pemilik dan **skor tidak boleh turun**.

### 2.5 Nusantara Sirna — tanpa login

Koleksi: `ns_players`, `ns_secrets`, `ns_scores`, `ns_rooms`.

- `ns_players`: publik dibaca; `v == 2`; tanpa `pinHash`; `tot`, `mode`, `wk` harus map; `createdAt` dan `name` tidak boleh berubah. Field hanya `v, name, createdAt, tot, mode, wk`.
- `ns_secrets`: **hanya `get`, tanpa `list`** agar hash PIN tidak bisa dipanen massal; bentuknya dikunci (`pinHash` 64 hex, `salt` 32 hex, `fails` 0–5, `lockUntil` angka). Pembaruan tidak boleh mengubah `pinHash`/`salt`.
- `ns_scores`: publik dibaca; `create` saja; `score` bilangan bulat > 0; `round >= 3`; `mode` ∈ `solo|duel|party|coop`; ID = `matchId_key`.
- `ns_rooms`: kode `^[A-Z0-9]{4,6}$`; `v == 1`; `lobby.mode` ∈ `duel|party|coop`; **kapasitas pemain: duel ≤ 2, party/co-op ≤ 5**; `createdAt`, `lobby.code`, dan `lobby.mode` tidak boleh berubah; `matchJson` < 900.000 karakter; **tidak boleh dihapus** (belum ada pembersihan otomatis).

Semua koleksi lain ditolak oleh aturan penutup `match /{document=**} { allow read, write: if false; }`. Koleksi baru harus ditambahkan eksplisit.

---

## 3. Peta kunci papan lokal → koleksi cloud

Aplikasi ini memakai kunci data seperti `multiply:10` sebagai kunci logis; semua data user kini berada di Firestore. Pemetaan yang **sedang dipakai adapter** (`js/core/cloud.js`) adalah sebagai berikut:

| Kunci lokal | Koleksi Firestore | Urutan | Ditulis oleh |
|---|---|---|---|
| profil terdaftar | `players/{uid}` | — | `I.register()` / `I.updateProfile()` |
| data hub pemain | `user_data/{uid}` | — | `C.saveUserData()` dari `GH.store` |
| statistik game | `players/{uid}/gameStats/{gameId}` | — | `C.saveGameStat()` (terdaftar saja) |
| `multiply:10` | `records_10` | `time` naik | G1 solo (terdaftar) |
| `multiply:20` | `records_20` | `time` naik | G1 solo |
| `multiply:30` | `records_30` | `time` naik | G1 solo |
| `multiply:duel` | `multiply_duel_wins` | `wins` turun | G1 duel online |
| `knowledge` | `knowledge_records` | `score` turun | G2 solo |
| `knowledge:duel` | `knowledge_duel_wins` | `wins` turun | G2 duel |
| `advmath:10` | `advmath_records_10` | `time` naik | G3 solo |
| `advmath:20` | `advmath_records_20` | `time` naik | G3 solo |
| `advmath:30` | `advmath_records_30` | `time` naik | G3 solo |
| `advmath:duel` | `advmath_duel_wins` | `wins` turun | G3 duel |
| `memo` | `memo_boards/{bk}/entries` | `score` turun | Memo (Auth anonim) |
| `memo:daily` | `memo_boards/{bk-harian}/entries` | `score` turun | Memo (Auth anonim) |
| `nusantara:solo` | `ns_players` (`tot.score` / `mode.solo.score`) | `score` turun | Nusantara |
| `nusantara:duel` | `ns_players` (`mode.duel.score`) | `score` turun | Nusantara |
| `nusantara:party` | `ns_players` (`mode.party.score`) | `score` turun | Nusantara |
| `nusantara:coop` | `ns_players` (`mode.coop.score`) | `score` turun | Nusantara |
| `nusantara:week` | `ns_players` (`wk.score`) | `score` turun | Nusantara |

⚠️ **Catatan G1 duel:** aplikasi rujukan **tidak** punya koleksi `multiply_duel_wins`; papan kemenangan G1 di aplikasi rujukan hanya lokal. Karena itu `firestore.rules` hanya memuat papan kemenangan duel untuk G2 dan G3. Bila ingin papan duel G1 juga online, tambahkan koleksi `multiply_duel_wins` dengan aturan yang identik dengan `knowledge_duel_wins`, lalu sesuaikan adapter.

---

## 4. Bentuk data yang diterima

### 4.0 Profil & statistik

```js
// players/{uid}
{ uid: "<auth-uid>", displayName: "Nama", name: "Nama", avatar: "🦊",
  createdAt: 1731234567890, updatedAt: 1731234567890 }

// players/{uid}/gameStats/{gameId}
{ uid: "<auth-uid>", gameId: "multiply", lastScore: 1200, bestScore: 1800,
  plays: 7, progress: {}, achievements: {}, statistics: {}, lastMeta: {},
  lastPlayedAt: 1731234567890, createdAt: 1731234567890, updatedAt: 1731234567890 }
```

### 4.1 Rekor solo

`records_10/20/30` (G1):

```js
{ name: "Pemain", time: 63.5, mistakes: 2, avatar: "🦊", bgColor: "#123456", uid: "<auth-uid>" } // bgColor/uid opsional
```

`knowledge_records` (G2) — skor desimal, boleh negatif:

```js
{ name: "Pemain", score: 7.3, correct: 12, hints: 1, burned: 0, avatar: "🦊", uid: "<auth-uid>" }
```

`advmath_records_10/20/30` (G3):

```js
{ name: "Pemain", time: 713.815, mistakes: 2, hints: 3, burned: 1, avatar: "🦊", uid: "<auth-uid>" }
```

Batas: `name` 1–24 karakter, `avatar` 0–16 karakter, waktu 0–31.536.000 detik, hitungan 0–9.999, `score` −100.000…100.000.

### 4.2 Kemenangan duel

```js
{ name: "Pemain", avatar: "🦊", wins: 4, updatedAt: 1731234567890 }
```

### 4.3 Room

G1 (`duels`):

```js
{
  count: 10,
  questions: [ /* tepat 10 elemen */ ],
  status: "waiting",
  createdAt: 1731234567890,
  startAtMillis: null,
  winner: null,
  rematch: null,
  host: { uid: "<uid Auth>", name, avatar, progress: 0, mistakes: 0,
          correct: 0, burned: 0, hints: 0, penaltySec: 0,
          time: null, finishedAt: null, lastSeen: 1731234567890 },
  guest: null
}
```

G2 (`knowledge_duels`) memakai `host/guest` berbentuk:

```js
{ uid: "<uid Auth>", name, avatar, score: 73, correct: 10, burned: 1,
  hints: 2, accuracy: 83, finishedAt: null, lastSeen: 1731234567890 }
```

G3 (`advmath_duels`) memakai `host/guest` berbentuk:

```js
{ uid: "<uid Auth>", name, avatar, progress: 10, time: 713.8, mistakes: 2,
  correct: 8, burned: 1, hints: 3, penaltySec: 180,
  finishedAt: null, lastSeen: 1731234567890 }
```

### 4.4 Memo

```js
// memo_names/{nameKey}
{ pid, owner, name, createdAt }

// memo_profiles/{pid}
{ v: 1, name, nameKey, owner, icon, createdAt, updatedAt, lastSid, st: {}, ach: {} }

// memo_profiles/{pid}/sessions/{sid}
{ pid, owner, name, type, mode, diff, plannedRounds, total, correct, score,
  accP, totalMs, bestCombo, livesLost, maxSeqLen, done, failed, won,
  dateKey, bk, modesSeen, ts }

// memo_boards/{boardKey}/entries/{pid}
{ pid, owner, name, icon, score, accP, total, sid, ts }
```

### 4.5 Nusantara

```js
// ns_players/{nameKey}
{ v: 2, name, createdAt, tot: { score, matches, best },
  mode: { solo: {...}, duel: {...}, party: {...}, coop: {...} },
  wk: { w, score, matches, best } }

// ns_secrets/{nameKey}
{ salt: "32 hex", pinHash: "64 hex", fails: 0, lockUntil: 0 }

// ns_scores/{matchId_key}
{ name, key, mode, round, hp, score, matchId, at }

// ns_rooms/{code}
{ v: 1, lobby: { code, mode, seed, speed, host, started, players: {...} },
  matchJson: null, round: 0, subs: {}, pub: {}, hb: {...}, last: null, createdAt }
```

---

## 5. Cara memasang

### 5.1 Firebase Console

1. Buka **Firestore Database → Rules**.
2. Tempel seluruh isi `firestore.rules`.
3. **Publish**.
4. Untuk Memo: aktifkan **Authentication → Sign-in method → Anonymous**.

### 5.2 Firebase CLI

Buat `firebase.json` di root proyek:

```json
{
  "firestore": {
    "rules": "firestore.rules"
  }
}
```

Lalu:

```bash
npm.cmd install -g firebase-tools   # sekali saja
firebase login
firebase use <project-id>
firebase deploy --only firestore:rules
```

### 5.3 Uji di emulator (disarankan sebelum produksi)

Emulator Firestore membutuhkan **Java (JDK 11+)**.

```bash
firebase init emulators          # pilih Firestore
firebase emulators:start --only firestore
```

Jalankan uji minimal berikut:

| Skenario | Harapan |
|---|---|
| `add` ke `records_10` dengan bentuk valid **tanpa Auth** | **ditolak** |
| `add` ke `records_10` dengan bentuk valid + Auth, `uid` sesuai | **diterima** |
| `add` ke `records_10` dengan `uid` milik Auth lain | **ditolak** |
| `update` dokumen `records_10` | **ditolak** |
| `set` `players/{uid}` milik sendiri dengan Auth | **diterima** |
| `set` `players/{uid}` milik orang lain | **ditolak** |
| `list` koleksi `players` | **ditolak** |
| `set` `players/{uid}/gameStats/{gameId}` dengan `uid` beda | **ditolak** |
| `add` ke `records_10` dengan `time: "cepat"` | **ditolak** |
| `add` ke `knowledge_records` dengan `score: 7.3` | **diterima** |
| `set` `knowledge_duel_wins/{id}` dengan `wins: 1` | **diterima** (create) |
| `update` `wins` menjadi lebih kecil | **ditolak** |
| `add` ke `knowledge_duels` dengan 80 soal + Auth, `host.uid` sesuai | **diterima** |
| `add` ke `knowledge_duels` dengan 200 soal | **ditolak** |
| `add` ke `knowledge_duels` tanpa Auth | **ditolak** |
| `add` ke `duels` dengan 9 soal untuk `count: 10` | **ditolak** |
| `update` `duels` mengubah `host.name` | **ditolak** |
| `update` `duels` mengubah `questions` | **ditolak** |
| `update` `duels` menambah `guest` dengan `status: 'waiting'` | **ditolak** |
| `update` `duels` menambah `guest` dengan `uid` orang lain | **ditolak** |
| pemain tamu (`guest`) mengubah `status`/`winner` | **ditolak** |
| `guest` mengubah slot `host` | **ditolak** |
| `delete` `duels` yang baru dibuat | **ditolak** |
| `add` ke `memo_names` tanpa Auth | **ditolak** |
| `add` ke `memo_profiles` dengan Auth, `owner == uid` | **diterima** |
| `update` `memo_profiles` milik uid lain | **ditolak** |
| `update` `memo_boards/.../entries/{pid}` menurunkan skor | **ditolak** |
| `create ns_rooms` mode `duel` dengan 3 pemain | **ditolak** |
| `create ns_rooms` mode `party` dengan 5 pemain | **diterima** |
| `list` koleksi `ns_secrets` | **ditolak** (hanya `get`) |
| `update` `ns_secrets` mengubah `pinHash` | **ditolak** |
| `update` `ns_scores` | **ditolak** |
| tulis ke koleksi tak terdaftar (mis. `coba_coba`) | **ditolak** |

---

## 6. Batas keamanan yang perlu diketahui

1. **Rules bukan anti-cheat.** Rekor permanen G1–G4, Memo, profil, **dan room duel G1–G3** sekarang mensyaratkan Auth + UID pemilik, jadi tamu tidak bisa menulis. Pemain terdaftar masih bisa mengirim progres/skor palsu dari UID-nya sendiri; rules hanya menolak bentuk salah, field asing, nilai di luar rentang, penulisan ulang soal, dan akses ke slot/profil orang lain. Data Nusantara lama tetap tanpa login.
2. **Skor dihitung di klien.** Tidak ada Cloud Function yang memverifikasi hasil permainan. Untuk papan kompetitif, pindahkan validasi skor ke server (Cloud Functions/Cloud Run) dan wajibkan Auth.
3. **PIN Nusantara dikelola klien.** `fails` dan `lockUntil` ditulis oleh klien, jadi pembatasan percobaan PIN bisa dilewati dengan memodifikasi klien. Hash PIN tidak bisa dibaca massal (`list` ditolak), tetapi brute-force per nama masih mungkin. Mitigasi jangka panjang: verifikasi PIN di Cloud Function + App Check.
4. **Kode room bukan rahasia.** Siapa pun yang mengetahui kode dan memiliki profil terdaftar bisa membaca room serta bergabung jika slot `guest` masih kosong. Aturan mengunci UID ke slot masing-masing dan mencegah perubahan identitas/soal, tetapi tidak memverifikasi bahwa pemain benar-benar menjawab sendiri.
5. **Room tidak dibersihkan otomatis.** `ns_rooms` tidak bisa dihapus; `duels`/`knowledge_duels`/`advmath_duels` baru boleh dihapus setelah 24 jam. Sediakan job pembersihan (TTL/Cloud Scheduler) bila koleksi mulai menumpuk.
6. **Tidak ada aturan Realtime Database.** Proyek rujukan memakai Firestore; aturan RTDB terpisah hanya diperlukan bila nanti ada fitur yang benar-benar memakai RTDB.
7. **Batas ukuran dokumen.** Firestore membatasi 1 MiB per dokumen. `matchJson` di `ns_rooms` dibatasi 900.000 karakter agar tidak menyentuh batas tersebut.

Untuk keamanan penuh, langkah yang disarankan:

- Auth anonim sudah dipakai untuk semua rekor permanen (todo: verifikasi di emulator);
- tambahkan klaim/UID pemilik pada dokumen skor dan room;
- pindahkan perhitungan skor ke server;
- gunakan App Check untuk menolak klien yang bukan aplikasi resmi.

---

## 7. Indeks

Semua kueri memakai **satu field** (`orderBy('time')`, `orderBy('score')`, `orderBy('wins')`, `orderBy('wk.score')`, `orderBy('mode.solo.score')`), sehingga **tidak perlu indeks komposit**. Firestore membuat indeks satu-field otomatis.

Bila nanti ditambahkan filter + urutan bersamaan (mis. `where('mode','==',...)` + `orderBy('score')`), indeks komposit perlu dibuat lewat Console atau `firestore.indexes.json`.

---

## 8. Validasi lokal tanpa Firebase CLI

Karena emulator butuh Java, sediakan pemeriksaan struktur:

```bash
node tools/validate-rules.js
```

Yang diperiksa:

- kurung kurawal, kurung biasa, dan kurung siku seimbang (komentar & string diabaikan);
- `rules_version = '2'` dan `service cloud.firestore` ada;
- setiap `allow` berada di dalam blok `match`;
- setiap fungsi dideklarasikan sebelum dipakai dan tidak duplikat;
- semua nama fungsi yang dipanggil dikenal;
- pola berisiko seperti perbandingan `field != null`.

Ini **bukan** pengganti emulator: kesalahan semantik (tipe field, path, `get()` lintas dokumen) hanya terbukti saat diuji di emulator atau setelah publish.

---

## 9. Checklist deploy

- [ ] `node tools/validate-rules.js` lolos.
- [ ] Uji skenario di tabel bagian 5.3 pada emulator.
- [ ] Auth anonim diaktifkan (wajib untuk profil dan semua rekor permanen).
- [ ] **Publish ulang** `firestore.rules` agar `players/{uid}` dan `gameStats` aktif sebelum fitur profil dipakai.
- [ ] `firebase.json` menunjuk `firestore.rules`.
- [ ] Deploy ke project **non-produksi** lebih dulu.
- [ ] Pastikan tidak ada penulisan data uji ke produksi.
- [ ] Siapkan pembersihan room lama (`ns_rooms`, room duel > 24 jam).
- [ ] Catat batas keamanan di bagian 6 pada dokumentasi produk.

---

## 10. Berkas terkait

| Berkas | Isi |
|---|---|
| `firestore.rules` | Aturan lengkap semua koleksi |
| `tools/validate-rules.js` | Pemeriksa struktur tanpa dependensi |
| `js/data/knowledge.js` | Bank 2.000 soal G2 (dipakai klien) |
| `js/data/advmath.js` | Bank 2.000 soal G3 (dipakai klien) |
| `tools/build-banks.js` | Normalisasi bank soal dari berkas sumber |
| `docs/firebase-security-rules.md` | Dokumen ini |
