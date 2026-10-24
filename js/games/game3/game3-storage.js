/* ---- Papan peringkat solo per jumlah soal: urut TOTAL WAKTU terkecil ---- */
function advmathRecordsKey(count) {
    return `advmath_records_${count}`;
}

// Seri waktu: lebih sedikit soal hangus, lalu lebih sedikit hint, lalu lebih sedikit salah
function sortAdvmathRecords(records) {
    return [...records].sort((a, b) => {
        if (a.time !== b.time) return a.time - b.time;
        if ((a.burned || 0) !== (b.burned || 0)) return (a.burned || 0) - (b.burned || 0);
        if ((a.hints || 0) !== (b.hints || 0)) return (a.hints || 0) - (b.hints || 0);
        return (a.mistakes || 0) - (b.mistakes || 0);
    });
}

function getAdvmathRecordsFromLocalStorage(count) {
    try {
        const list = JSON.parse(safeGetLocalStorage(advmathRecordsKey(count), '[]'));
        return sortAdvmathRecords(list.filter(r => typeof r.time === 'number')).slice(0, MAX_ADVMATH_LEADERBOARD);
    } catch (e) {
        return [];
    }
}

async function getAdvmathRecordsForCount(count) {
    if (firebaseReady) {
        try {
            const snapshot = await firestoreDb.collection(advmathRecordsKey(count))
                .orderBy('time', 'asc')
                .limit(MAX_ADVMATH_LEADERBOARD)
                .get();
            return sortAdvmathRecords(snapshot.docs.map(doc => doc.data())).slice(0, MAX_ADVMATH_LEADERBOARD);
        } catch (e) {
            console.warn('[Perkalian 1-10 Lanjutan] Gagal memuat dari Firebase, memakai localStorage.', e);
        }
    }
    return getAdvmathRecordsFromLocalStorage(count);
}

async function saveAdvmathRecord(count, record) {
    if (firebaseReady) {
        try {
            await firestoreDb.collection(advmathRecordsKey(count)).add(record);
            return { online: true, error: null };
        } catch (e) {
            console.warn('[Perkalian 1-10 Lanjutan] Gagal menyimpan ke Firebase, menyimpan ke localStorage saja.', e);
        }
    }
    let records = getAdvmathRecordsFromLocalStorage(count);
    records.push(record);
    records = sortAdvmathRecords(records).slice(0, MAX_ADVMATH_LEADERBOARD);
    safeSetLocalStorage(advmathRecordsKey(count), JSON.stringify(records));
    return { online: false, error: null };
}

/* ---- Papan peringkat duel (kemenangan) -- logika tidak berubah ---- */
function getAdvmathDuelWinsFromLocalStorage() {
    try {
        return JSON.parse(safeGetLocalStorage('advmath_duel_wins', '[]'));
    } catch (e) {
        return [];
    }
}

async function getAdvmathDuelWinsLeaderboard() {
    if (firebaseReady) {
        try {
            const snapshot = await firestoreDb.collection('advmath_duel_wins')
                .orderBy('wins', 'desc')
                .limit(MAX_ADVMATH_DUEL_LEADERBOARD)
                .get();
            return snapshot.docs.map(doc => doc.data());
        } catch (e) {
            console.warn('[Perkalian 1-10 Lanjutan] Gagal memuat papan duel dari Firebase.', e);
        }
    }
    return [...getAdvmathDuelWinsFromLocalStorage()].sort((a, b) => b.wins - a.wins).slice(0, MAX_ADVMATH_DUEL_LEADERBOARD);
}

// Nama yang dipakai konsisten akan terus bertambah jumlah kemenangannya (satu nama = satu baris)
async function recordAdvmathDuelWin(name, avatar) {
    const docId = nameToDocId(name);
    if (firebaseReady) {
        try {
            await firestoreDb.collection('advmath_duel_wins').doc(docId).set({
                name: name,
                avatar: avatar,
                wins: firebase.firestore.FieldValue.increment(1),
                updatedAt: Date.now()
            }, { merge: true });
            return;
        } catch (e) {
            console.warn('[Perkalian 1-10 Lanjutan] Gagal mencatat kemenangan ke Firebase.', e);
        }
    }
    let records = getAdvmathDuelWinsFromLocalStorage();
    let rec = records.find(r => r.docId === docId);
    if (rec) {
        rec.wins = (rec.wins || 0) + 1;
        rec.avatar = avatar;
        rec.name = name;
    } else {
        records.push({ docId, name, avatar, wins: 1 });
    }
    safeSetLocalStorage('advmath_duel_wins', JSON.stringify(records));
}

