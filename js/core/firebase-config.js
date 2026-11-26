/* =========================================================
   Game Hub v2 · Konfigurasi Firebase (web, publik)
   ---------------------------------------------------------
   Nilai di bawah adalah konfigurasi web Firebase yang memang
   bersifat publik (aman ditampilkan di klien). Keamanan data
   dijaga oleh Firestore Security Rules + Auth, bukan oleh
   kerahasiaan apiKey.

   Analytics sengaja TIDAK dipakai: aplikasi ini tanpa iklan
   dan tanpa pelacakan, jadi tidak ada kebutuhan mengirim data
   penggunaan ke Google Analytics.
   ========================================================= */
(function () {
  'use strict';
  var GH = window.GH = window.GH || {};

  GH.firebaseConfig = {
    apiKey: 'AIzaSyBWuk5aC5rt_EQaHh9Ofm0jVuu1VrUKOjw',
    authDomain: 'multgame-9f7e6.firebaseapp.com',
    projectId: 'multgame-9f7e6',
    storageBucket: 'multgame-9f7e6.firebasestorage.app',
    messagingSenderId: '812456927291',
    appId: '1:812456927291:web:af920785c9080e9eb17c1e',
    measurementId: 'G-15TJ5ZTNST'
  };

  GH.firebaseOptions = {
    // Versi Firebase JS SDK (compat, agar cocok dengan skrip klasik tanpa build).
    sdk: '10.14.1',
    // Nama koleksi untuk uji baca status koneksi.
    probeCollection: 'records_10'
  };
})();
