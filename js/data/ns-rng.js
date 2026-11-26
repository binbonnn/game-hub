/* =====================================================================
   NUSANTARA SIRNA — sim-core: PRNG berbenih. LOGIKA MURNI (tanpa DOM).
   mulberry32 + pencampur FNV-1a. Hanya memakai operasi bilangan bulat 32-bit,
   jadi hasilnya sama persis di semua peramban dan Node.
===================================================================== */
(function (root) {
    'use strict';
    const GH = root.GH = root.GH || {};
    const NS = GH.ns = GH.ns || {};

    /** Campur beberapa bilangan bulat/teks jadi satu benih 32-bit. */
    function mix(parts) {
        let h = 0x811c9dc5;
        for (let i = 0; i < parts.length; i++) {
            const s = String(parts[i]);
            for (let k = 0; k < s.length; k++) { h ^= s.charCodeAt(k); h = Math.imul(h, 0x01000193); }
            h ^= 0x2c; h = Math.imul(h, 0x01000193); // pemisah antar bagian
        }
        return h >>> 0;
    }

    /** Pembuat angka acak berbenih. next() -> [0,1); int(n) -> 0..n-1. */
    function make(seed) {
        let a = seed >>> 0;
        function next() {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
        return { next: next, int: n => Math.floor(next() * n) };
    }

    NS.rng = { make: make, mix: mix };
    GH.ns = NS;
    GH.nsRng = NS.rng;
    if (typeof module !== 'undefined' && module.exports) module.exports = NS;
})(typeof window !== 'undefined' ? window : globalThis);
