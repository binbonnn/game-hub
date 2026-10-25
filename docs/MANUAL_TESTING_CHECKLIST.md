# Checklist Pengujian Manual

Gunakan setelah mengunggah versi baru ke GitHub Pages. Isi kolom **Aktual**, **Status**, dan **Catatan** langsung di file ini (atau salin tabelnya ke spreadsheet).

## Persiapan

1. Buka situs dengan refresh keras (Ctrl+Shift+R) atau jendela privat agar tidak memakai cache lama.
2. Pakai nama pemain **TES** untuk semua pengujian. Catatan penting: bila Firebase aktif, skor, duel, dan profil TES **tersimpan di database asli**. Hapus data TES lewat Firebase Console setelah selesai.
3. Siapkan dua perangkat (dua HP, atau HP dan laptop) untuk skenario duel.
4. Buka konsol peramban (F12, tab Console) bila memungkinkan dan catat error merah.
5. Status: **PASS** (sesuai harapan), **FAIL** (tidak sesuai), **BLOCKED** (tidak bisa dijalankan), **NOT TESTED** (belum dicoba).

## Prioritas

- **P0 Critical:** aplikasi tidak bisa dibuka, game tidak bisa dimainkan, data rusak, mekanisme inti gagal.
- **P1 High:** fitur utama gagal, skor salah, timer bermasalah, navigasi penting rusak.
- **P2 Medium:** masalah usability, responsive, atau inkonsistensi yang mengganggu.
- **P3 Low:** masalah kosmetik.

## A. Navigasi dan halaman utama

| ID | Pri | Langkah | Hasil yang diharapkan | Aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- |
| A01 | P0 | Buka situs | Hub tampil dengan kartu empat game, tanpa layar kosong, tanpa error merah "is not defined" di konsol | | | |
| A02 | P1 | Pilih avatar di Hub | Avatar terpilih tampil dan tetap terpilih saat masuk game | | | |
| A03 | P1 | Buka tiap game (1, 2, 3, 4) dari Hub | Dasbor game tampil | | | |
| A04 | P1 | Dari dasbor tiap game, kembali ke Hub | Hub tampil lagi | | | |
| A05 | P2 | Tekan tombol Back browser dari dasbor game | Kembali ke Hub, bukan keluar dari situs | | | |
| A06 | P2 | Tekan Forward setelah Back | Kembali ke dasbor game tadi | | | |
| A07 | P2 | Klik kartu game yang bertanda "segera hadir" (bila ada) | Muncul pemberitahuan singkat, tidak error | | | |
| A08 | P1 | Refresh halaman di tengah game | Kembali ke Hub tanpa layar rusak | | | |

## B. Mekanisme game 1, 2, dan 3

Ulangi blok ini untuk Game 1, Game 2, dan Game 3 (tulis game di kolom Catatan).

| ID | Pri | Langkah | Hasil yang diharapkan | Aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- |
| B01 | P0 | Isi nama TES, pilih jumlah soal (bila ada), mulai | Hitung mundur lalu soal pertama tampil | | | |
| B02 | P0 | Jawab benar | Ada umpan balik benar; skor atau progres bertambah sesuai aturan di layar Aturan | | | |
| B03 | P0 | Jawab salah | Ada umpan balik salah dan jawaban benar; penalti sesuai aturan | | | |
| B04 | P1 | Buka Hint (bila ada) | Hint tampil, soal tetap terlihat, timer sesuai aturan | | | |
| B05 | P1 | Tekan tombol Jeda (bila ada) | Permainan berhenti; lanjut kembali normal | | | |
| B06 | P1 | Selesaikan semua soal | Layar hasil tampil dengan waktu, skor, dan kesalahan yang masuk akal | | | |
| B07 | P1 | Simpan rekor | Dialog simpan rekor berfungsi; peringkat muncul di papan | | | |
| B08 | P1 | Tekan Main Lagi | Ronde baru dimulai dari awal, skor direset | | | |
| B09 | P2 | Tekan tombol jawaban dua kali dengan cepat | Hanya satu jawaban terhitung | | | |
| B10 | P2 | Buka layar Aturan/Bantuan | Teks terbaca dan bisa ditutup | | | |

## C. Keluar dan konfirmasi (Game 1, 2, 3)

| ID | Pri | Langkah | Hasil yang diharapkan | Aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- |
| C01 | P1 | Di tengah game tekan tombol X | Dialog konfirmasi keluar muncul | | | |
| C02 | P1 | Pilih Tetap main | Dialog tertutup, game lanjut | | | |
| C03 | P1 | Pilih Keluar | Kembali ke dasbor, game berhenti | | | |
| C04 | P2 | Tekan Esc saat game berjalan | Perilaku sama dengan tombol X | | | |
| C05 | P2 | Tekan Back browser saat game berjalan | Dialog konfirmasi yang sama muncul | | | |
| C06 | P2 | Dengan dialog terbuka, tekan Back lagi | Dialog tertutup dan game lanjut. Diperbaiki di P6-2 (sebelumnya dialog kadang tidak menutup bila Back ditekan saat dialog baru muncul); catat bila masih terjadi | | | |

## D. Papan peringkat dan data

| ID | Pri | Langkah | Hasil yang diharapkan | Aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- |
| D01 | P1 | Buka papan peringkat Game 1, 2, 3 | Podium dan daftar tampil; ada pesan "Memuat" lalu isi, atau pesan kosong yang jelas | | | |
| D02 | P2 | Pindah tab jumlah soal (bila ada) | Isi papan berganti sesuai tab | | | |
| D03 | P1 | Setelah D01, simpan rekor TES lalu buka papan | Rekor TES muncul dan ditandai sebagai milik sendiri | | | |
| D04 | P1 | Refresh halaman lalu buka papan | Rekor TES masih ada | | | |
| D05 | P2 | Matikan internet, mainkan satu ronde, simpan rekor | Game tetap bisa dimainkan; ada pemberitahuan yang jelas, tidak layar rusak | | | |
| D06 | P2 | Nyalakan internet lagi, buka papan | Papan memuat normal | | | |

## E. Duel dua perangkat (Game 1, 2, 3)

Ulangi untuk setiap game. Perangkat A membuat ruang, perangkat B bergabung. Pakai nama TES1 dan TES2 agar bisa dibedakan.

| ID | Pri | Langkah | Hasil yang diharapkan | Aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- |
| E01 | P1 | A: buat ruang duel | Kode ruang 4 karakter tampil dan ruang menunggu | | | |
| E02 | P1 | B: masukkan kode ruang | B bergabung; A dan B melihat lawan | | | |
| E03 | P1 | Mainkan duel sampai selesai | Kedua pemain mendapat soal yang sama; skor lawan terlihat; hasil akhir sama di kedua sisi | | | |
| E04 | P2 | Minta rematch | Permintaan muncul di lawan; bila diterima, ronde baru mulai | | | |
| E05 | P2 | B keluar di tengah duel | A melihat pemberitahuan lawan keluar | | | |
| E06 | P2 | Masukkan kode ruang yang salah | Pesan kesalahan yang jelas, tidak layar rusak | | | |
| E07 | P1 | Game 3 saja: buat ruang duel | Bila gagal, catat pesan persis. Duel Game 3 bisa gagal bila aturan Firebase aktif belum memuat koleksi `advmath_duels`; itu bukan akibat pemecahan kode | | | |

## F. Game 4 (Memo Mayhem)

| ID | Pri | Langkah | Hasil yang diharapkan | Aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- |
| F01 | P0 | Buka Game 4 dari Hub | Layar utama Memo Mayhem tampil | | | |
| F02 | P0 | Mulai satu ronde normal sampai selesai | Hasil tampil dengan skor | | | |
| F03 | P1 | Coba mode Daily, Boss, dan Endless (bila tersedia) | Tiap mode bisa dimulai dan diselesaikan atau dihentikan | | | |
| F04 | P1 | Buka Statistik, Pencapaian, Pengaturan, Bantuan | Semua layar tampil dan bisa ditutup | | | |
| F05 | P1 | Daftarkan nama TES, selesaikan ronde, buka papan | Layar hasil menulis "Tersimpan di server"; skor TES muncul di papan | | | |
| F06 | P2 | Tombol kembali ke Hub dari Game 4 | Hub tampil | | | |
| F07 | P2 | Refresh di tengah ronde | Kembali ke layar aman, profil terdaftar masih terpilih | | | |
| F08 | P0 | Main sebagai Tamu (belum daftar) sampai selesai | Layar hasil: "Bermain sebagai Tamu — skor tidak disimpan"; tidak ada tulisan "menunggu disimpan" di mana pun | | | |
| F09 | P0 | Matikan internet, selesaikan ronde sebagai pemain terdaftar | "Skor tidak tersimpan" + tombol Coba lagi; nyalakan internet, tekan Coba lagi → "Tersimpan di server" | | | |
| F10 | P1 | Ulangi F09 tetapi keluar dari layar hasil sebelum Coba lagi | Sesi itu hilang (tidak ada antrean, tidak terkirim belakangan) | | | |
| F11 | P1 | Buka Statistik, Riwayat, Profil, Pencapaian sebagai Tamu | Pesan "tidak disimpan" + tombol Daftarkan; tidak ada data lokal | | | |
| F12 | P1 | Buka Memo Mayhem di HP yang dulu punya profil lama | Bila profilnya milik akun anonim lain: pemberitahuan lalu bermain sebagai Tamu; tidak ada "sesi menunggu" | | | |

## G. Responsive dan keterbacaan

Ukuran yang disarankan: 320, 360, 390 (portrait), 844x390 (landscape), 768, dan 1280 piksel.

| ID | Pri | Langkah | Hasil yang diharapkan | Aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- |
| G01 | P2 | Buka Hub di tiap ukuran | Tidak ada konten melewati lebar layar atau terpotong | | | |
| G02 | P2 | Buka dasbor dan layar game tiap game di 360 dan 390 | Soal, timer, skor, dan tombol terbaca dan mudah disentuh | | | |
| G03 | P2 | Buka keyboard virtual saat mengisi nama atau jawaban | Kolom isian tidak tertutup keyboard | | | |
| G04 | P2 | Putar ke landscape saat bermain | Tombol penting tetap terjangkau, tidak ada loncatan tata letak | | | |
| G05 | P3 | Buka dialog (Aturan, Hint, Hasil) di layar sempit | Isi dialog bisa digulir dan ditutup | | | |
| G06 | P3 | Gunakan Tab dan Enter di desktop | Fokus terlihat dan tombol bisa dioperasikan | | | |

## H. Regresi (pastikan tidak berubah)

| ID | Pri | Langkah | Hasil yang diharapkan | Aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- |
| H01 | P1 | Bandingkan aturan skor di layar Aturan dengan hasil satu ronde yang Anda mainkan | Hasil sesuai aturan yang tertulis | | | |
| H02 | P1 | Mainkan Game 1, lalu Game 2, lalu Game 3, lalu Game 4 berurutan tanpa refresh | Satu game tidak merusak game lain | | | |
| H03 | P2 | Nyalakan dan matikan suara | Pengaturan tersimpan setelah refresh | | | |
| H04 | P1 | Periksa konsol setelah semua pengujian | Tidak ada error merah baru | | | |

## I. Perbaikan P6 (perubahan perilaku)

| ID | Pri | Langkah | Hasil yang diharapkan | Aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- |
| I01 | P1 | Buka papan peringkat Game 1, 2, 3 yang berisi rekor dengan avatar | Avatar tampil sebagai emoji seperti biasa | | | |
| I02 | P2 | Tekan Back dua kali berturut-turut dengan cepat saat game berjalan (dialog keluar muncul lalu Back lagi) | Dialog tertutup (mungkin setelah jeda sekejap) dan game lanjut | | | |
| I03 | P3 | Buka konsol (F12) saat bermain duel, lalu keluar dari duel | Tidak ada error merah baru; peringatan kuning berawalan `[Duel ...]` hanya muncul bila operasi ke server gagal | | | |
| I04 | P1 | Duel Lokal: satu pemain terdaftar lawan Tamu | Hanya sesi pemain terdaftar tersimpan; ada catatan "Pemain Tamu tidak disimpan" | | | |

## J. Tampilan HP (P7)

| ID | Pri | Langkah | Hasil yang diharapkan | Aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- |
| J01 | P1 | Buka Hub di HP (portrait) | Empat kartu game terbaca penuh, judul tidak terpotong | | | |
| J02 | P1 | Game 1: mulai main, lihat stopwatch | Angka waktu terbaca jelas (kapsul putih, makin merah seiring waktu) | | | |
| J03 | P1 | Ketuk tombol "← Semua Game" dan tombol tutup dialog dengan ibu jari | Mudah diketuk, tidak sering meleset | | | |
| J04 | P1 | Memo Mayhem > Statistik | Tiga tab (Peringkat, Riwayat, Profil) terlihat utuh | | | |
| J05 | P2 | Memo Mayhem di HP layar pendek: mainkan Sequence/Copycat sampai tahap jawab | Tombol Kirim bisa dijangkau (boleh menggulir sedikit) | | | |
| J06 | P2 | Putar HP ke landscape saat bermain Game 1 dan Memo | Tidak ada tombol yang tertutup; keypad tetap bisa diketuk | | | |

## K. Gaya bahasa (P8)

| ID | Pri | Langkah | Hasil yang diharapkan | Aktual | Status | Catatan |
| --- | --- | --- | --- | --- | --- | --- |
| K01 | P1 | Hub: baca subjudul, kartu game, tombol aturan | Terasa santai dan jelas, tidak ada teks terpotong di HP | | | |
| K02 | P1 | Game 1/2/3: jawab benar, salah, kosong, waktu habis | Feedback singkat dan jelas; tidak ada kalimat yang membingungkan | | | |
| K03 | P1 | Game 1: selesai main dan lihat ringkasan peringkat | Selisih detik tertulis jelas "lebih cepat/lebih lambat" | | | |
| K04 | P1 | Duel Game 1/2/3: buat room, join, rematch, keluar | Semua status (menunggu, putus, rematch) mudah dimengerti | | | |
| K05 | P1 | Memo Mayhem sebagai Tamu lalu selesai satu sesi | Tertulis jelas skor tidak disimpan; ada ajakan daftar nama | | | |
| K06 | P1 | Memo Mayhem offline/server mati lalu selesai sesi | "Skor tidak tersimpan" + "Coba lagi"; penjelasan jelas bahwa skor hilang bila layar ditutup | | | |
| K07 | P2 | Nama tidak valid, sudah dipakai, terlalu pendek | Pesan galat ramah tapi tetap menyebut alasannya | | | |
| K08 | P2 | Baca seluruh teks di Memo Pengaturan, Duel, Statistik | Konsisten, tidak berlebihan slang/emoji, tidak terdengar seperti dokumen perusahaan | | | |
| K09 | P2 | Cek di layar 320-390 px | Teks baru tidak membuat tombol/kartu meluber | | | |

## Format laporan masalah

Salin blok ini untuk setiap masalah.

```
ID pengujian        :
Halaman / game      :
Perangkat & ukuran  : (contoh: Samsung A14, Chrome, 360x800)
Langkah reproduksi  :
  1.
  2.
Hasil diharapkan    :
Hasil aktual        :
Frekuensi           : (selalu / kadang / sekali)
Screenshot/rekaman  :
Tingkat keparahan   : P0 / P1 / P2 / P3
Catatan tambahan    : (pesan di konsol bila ada)
```

## Cara membedakan jenis masalah

- **Bug fungsional:** sesuatu tidak bekerja atau hasilnya salah (skor keliru, tombol tidak merespons, game macet).
- **Masalah UI/UX:** berfungsi tetapi membingungkan atau tidak nyaman (tombol sulit dibedakan, teks tidak jelas, urutan aneh).
- **Masalah responsive:** hanya muncul di ukuran layar atau orientasi tertentu (terpotong, bertumpuk, tertutup keyboard).
- **Masalah data:** skor atau profil hilang, ganda, salah, atau tidak muncul di perangkat lain setelah disimpan.
