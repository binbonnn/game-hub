/* Firestore palsu di memori untuk uji (get/set/update path titik/onSnapshot + orderBy/limit/get pada koleksi). Bukan bagian game. */
const DEL = { __del: true };
function fakeDb() {
    const docs = {}, ls = {}, clone = o => o === undefined ? undefined : JSON.parse(JSON.stringify(o));
    const notify = id => (ls[id] || []).forEach(f => f({ exists: id in docs, data: () => clone(docs[id]) }));
    const getPath = (o, p) => p.split('.').reduce((a, k) => (a === undefined || a === null ? undefined : a[k]), o);
    function docRef(col, id) { const key = col + '/' + id; return {
        get: async () => ({ exists: key in docs, data: () => clone(docs[key]) }),
        set: async o => { docs[key] = clone(o); notify(key); },
        delete: async () => { delete docs[key]; notify(key); },
        update: async o => { if (!(key in docs)) throw new Error('NOT_FOUND');
            Object.keys(o).forEach(p => { const parts = p.split('.'); let cur = docs[key]; for (let i = 0; i < parts.length - 1; i++) { if (typeof cur[parts[i]] !== 'object' || cur[parts[i]] === null) cur[parts[i]] = {}; cur = cur[parts[i]]; }
                const last = parts[parts.length - 1]; if (o[p] === DEL) delete cur[last]; else cur[last] = clone(o[p]); }); notify(key); },
        onSnapshot: f => { (ls[key] = ls[key] || []).push(f); f({ exists: key in docs, data: () => clone(docs[key]) }); return () => { ls[key] = ls[key].filter(x => x !== f); }; } }; }
    function snapRows(rows) { const out = rows.map(d => ({ data: () => d })); return { forEach: f => out.forEach(f), size: out.length }; }
    function colRef(col) { const q = { doc: id => docRef(col, id),
        orderBy: (field, dir) => ({ limit: n => ({ get: async () => { const rows = Object.keys(docs).filter(k => k.indexOf(col + '/') === 0).map(k => clone(docs[k])).filter(d => getPath(d, field) !== undefined);
            rows.sort((a, b) => (dir === 'desc' ? -1 : 1) * (getPath(a, field) - getPath(b, field))); return snapRows(rows.slice(0, n)); } }) }) };
        q.limit = n => ({ get: async () => { const rows = Object.keys(docs).filter(k => k.indexOf(col + '/') === 0).slice(0, n).map(k => clone(docs[k])); return snapRows(rows); } });
        return q; }
    return { docs: docs, collection: colRef };
}
module.exports = { fakeDb: fakeDb, DEL: DEL };
