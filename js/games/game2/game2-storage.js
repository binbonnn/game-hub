/* ---- Papan peringkat: data layer (solo & duel-wins) ---- */
function getKnowledgeSoloRecordsFromLocalStorage() {
    try {
        return JSON.parse(safeGetLocalStorage('knowledge_records', '[]'));
    } catch (e) {
        return [];
    }
}

function sortKnowledgeSoloRecords(records) {
    // Skor lebih tinggi = lebih baik; kalau seri, lebih sedikit hint lalu lebih sedikit hangus = lebih baik.
    // Rekor lama (sebelum sistem skor baru, tanpa field "score") tidak ikut karena aturannya tidak sebanding.
    return records.filter(r => typeof r.score === 'number').sort((a, b) => {
        const diff = knowledgeScoreTenthsOf(b) - knowledgeScoreTenthsOf(a);
        if (diff !== 0) return diff;
        if (a.hints !== b.hints) return a.hints - b.hints;
        return a.burned - b.burned;
    });
}

async function getKnowledgeSoloRecords() {
    if (firebaseReady) {
        try {
            const snapshot = await firestoreDb.collection('knowledge_records')
                .orderBy('score', 'desc')
                .limit(MAX_KNOWLEDGE_LEADERBOARD)
                .get();
            return sortKnowledgeSoloRecords(snapshot.docs.map(doc => doc.data())).slice(0, MAX_KNOWLEDGE_LEADERBOARD);
        } catch (e) {
            console.warn('[Pengetahuan Dasar] Gagal memuat dari Firebase, memakai localStorage.', e);
        }
    }
    return sortKnowledgeSoloRecords(getKnowledgeSoloRecordsFromLocalStorage()).slice(0, MAX_KNOWLEDGE_LEADERBOARD);
}

async function saveKnowledgeSoloRecord(record) {
    if (firebaseReady) {
        try {
            await firestoreDb.collection('knowledge_records').add(record);
            return { online: true, error: null };
        } catch (e) {
            console.warn('[Pengetahuan Dasar] Gagal menyimpan ke Firebase, menyimpan ke localStorage saja.', e);
        }
    }
    let records = getKnowledgeSoloRecordsFromLocalStorage();
    records.push(record);
    records = sortKnowledgeSoloRecords(records).slice(0, MAX_KNOWLEDGE_LEADERBOARD);
    safeSetLocalStorage('knowledge_records', JSON.stringify(records));
    return { online: false, error: null };
}

function getKnowledgeDuelWinsFromLocalStorage() {
    try {
        return JSON.parse(safeGetLocalStorage('knowledge_duel_wins', '[]'));
    } catch (e) {
        return [];
    }
}

async function getKnowledgeDuelWinsLeaderboard() {
    if (firebaseReady) {
        try {
            const snapshot = await firestoreDb.collection('knowledge_duel_wins')
                .orderBy('wins', 'desc')
                .limit(MAX_KNOWLEDGE_LEADERBOARD)
                .get();
            return snapshot.docs.map(doc => doc.data());
        } catch (e) {
            console.warn('[Pengetahuan Dasar] Gagal memuat papan duel dari Firebase.', e);
        }
    }
    return [...getKnowledgeDuelWinsFromLocalStorage()].sort((a, b) => b.wins - a.wins).slice(0, MAX_KNOWLEDGE_LEADERBOARD);
}

// Nama yang dipakai konsisten akan terus bertambah jumlah kemenangannya (satu nama = satu baris)
async function recordKnowledgeDuelWin(name, avatar) {
    const docId = nameToDocId(name);
    if (firebaseReady) {
        try {
            await firestoreDb.collection('knowledge_duel_wins').doc(docId).set({
                name: name,
                avatar: avatar,
                wins: firebase.firestore.FieldValue.increment(1),
                updatedAt: Date.now()
            }, { merge: true });
            return;
        } catch (e) {
            console.warn('[Pengetahuan Dasar] Gagal mencatat kemenangan ke Firebase.', e);
        }
    }
    let records = getKnowledgeDuelWinsFromLocalStorage();
    let rec = records.find(r => r.docId === docId);
    if (rec) {
        rec.wins = (rec.wins || 0) + 1;
        rec.avatar = avatar;
        rec.name = name;
    } else {
        records.push({ docId, name, avatar, wins: 1 });
    }
    safeSetLocalStorage('knowledge_duel_wins', JSON.stringify(records));
}

