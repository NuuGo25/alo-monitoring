(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AloPrototypeLogic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeNote(value, maxLength = 300) {
    return String(value ?? '').trim().slice(0, maxLength);
  }

  function localDateKey(value) {
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return '';

    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function isDateInRange(value, startDate, endDate) {
    const key = localDateKey(value);
    if (!key) return false;
    return (!startDate || key >= startDate) && (!endDate || key <= endDate);
  }

  function isValidDateRange(startDate, endDate) {
    return !startDate || !endDate || startDate <= endDate;
  }

  function calendarDays(year, month) {
    const firstDay = new Date(year, month, 1);
    const mondayOffset = (firstDay.getDay() + 6) % 7;

    return Array.from({ length: 42 }, (_, index) => {
      const date = new Date(year, month, 1 - mondayOffset + index);
      return {
        key: localDateKey(date),
        day: date.getDate(),
        currentMonth: date.getMonth() === month,
      };
    });
  }

  function applyDateSelection(mode, startDate, endDate, selectedDate) {
    if (mode === 'single') {
      return { start: selectedDate, end: selectedDate, complete: true };
    }
    if (!startDate || endDate) {
      return { start: selectedDate, end: '', complete: false };
    }
    return selectedDate < startDate
      ? { start: selectedDate, end: startDate, complete: true }
      : { start: startDate, end: selectedDate, complete: true };
  }

  function transactionEffect(t) {
    const effect = [{ produk: t.kode, gudang: t.gudang, jumlah: t.jenis === 'masuk' ? t.jumlah : -t.jumlah }];
    if (t.jenis === 'pindah') effect.push({ produk: t.kode, gudang: t.tujuan, jumlah: t.jumlah });
    return effect;
  }

  function applyTransaction(state, command, context) {
    const { action, requestId } = command;
    if (!requestId || !['add', 'edit', 'cancel'].includes(action)) throw new Error('Permintaan transaksi tidak valid.');
    if (state.transaksi.some(t => t.requestId === requestId || (t.jejak || []).some(j => j.requestId === requestId))) return state;
    const original = action === 'add' ? null : state.transaksi.find(t => t.id === command.id);
    if (action !== 'add' && !original) throw new Error('Transaksi tidak ditemukan.');
    if (state.produk.find(p => p.kode === (original?.kode || command.kode))?.status === 'arsip') throw new Error('Pulihkan produk dari Arsip sebelum mencatat atau mengoreksi transaksi.');
    if (original?.status === 'dibatalkan') throw new Error('Transaksi sudah dibatalkan. Stok tidak diubah lagi.');
    if (original && command.version != null && (original.version || 0) !== command.version) throw new Error('Transaksi sudah berubah. Tutup lalu buka kembali detailnya.');
    const alasan = String(command.alasan || '').trim();
    if (action !== 'add' && (!alasan || alasan.length > 300)) throw new Error('Isi alasan perubahan, maksimal 300 karakter.');
    const actor = context.actor;
    const waktu = context.now;
    if (!actor || !localDateKey(waktu)) throw new Error('Konteks pencatatan tidak lengkap.');
    const jumlah = command.jumlah;
    if (action !== 'cancel' && (!Number.isSafeInteger(jumlah) || jumlah <= 0)) throw new Error('Isi jumlah dengan angka bulat lebih dari 0.');
    let t;
    if (original) {
      t = { ...original, ...(action === 'edit' ? { jumlah, catatan: normalizeNote(command.catatan) } : {}), status: action === 'cancel' ? 'dibatalkan' : 'aktif', version: (original.version || 0) + 1 };
      if (action === 'edit' && jumlah === original.jumlah && t.catatan === (original.catatan || '')) throw new Error('Tidak ada perubahan untuk disimpan.');
    } else {
      const { kode, gudang, tujuan = '', jenis } = command;
      if (!state.produk.some(p => p.kode === kode) || !['masuk', 'keluar', 'pindah'].includes(jenis)) throw new Error('Pilih produk dan jenis transaksi yang valid.');
      if (jenis === 'pindah' && (!tujuan || tujuan === gudang)) throw new Error('Pilih gudang tujuan yang berbeda dari asal.');
      t = { id: Math.max(0, ...state.transaksi.map(x => x.id)) + 1, kode, gudang, tujuan: jenis === 'pindah' ? tujuan : '', jenis, jumlah, catatan: normalizeNote(command.catatan), waktu: command.waktu || waktu, pencatat: actor, status: 'aktif', version: 0, requestId, jejak: [] };
      if (!localDateKey(t.waktu)) throw new Error('Waktu transaksi tidak valid.');
    }
    const changes = [];
    if (original) changes.push(...transactionEffect(original).map(e => ({ ...e, jumlah: -e.jumlah })));
    if (action !== 'cancel') changes.push(...transactionEffect(t));
    const stok = state.stok.map(s => ({ ...s }));
    for (const change of changes) {
      const s = stok.find(s => s.produk === change.produk && s.gudang === change.gudang);
      if (!s) throw new Error('Gudang produk tidak ditemukan.');
      s.jumlah += change.jumlah;
    }
    // Periksa hasil bersih setelah pembalikan dan koreksi, bukan saldo antara.
    if (stok.some(s => !Number.isSafeInteger(s.jumlah) || s.jumlah < 0)) {
      throw new Error(action === 'cancel'
        ? 'Transaksi tidak bisa dibatalkan karena stoknya sudah digunakan untuk pengeluaran atau perpindahan berikutnya.'
        : 'Stok tidak cukup. Perubahan ini akan membuat stok gudang negatif atau melewati batas angka.');
    }
    if (action !== 'cancel') {
      const tujuan = t.jenis === 'pindah' ? t.tujuan : t.jenis === 'masuk' ? t.gudang : '';
      const s = stok.find(s => s.produk === t.kode && s.gudang === tujuan);
      if (s && s.min <= 0) s.min = Math.max(0, ...stok.filter(x => x.produk === t.kode).map(x => x.min));
    }
    if (original) {
      const snapshot = x => Object.fromEntries(Object.entries(x).filter(([k]) => k !== 'jejak'));
      t.jejak = [...(original.jejak || []), { requestId, tindakan: action === 'cancel' ? 'batal' : 'edit', pelaku: actor, waktu, alasan, sebelum: snapshot(original), sesudah: snapshot(t) }];
    }
    return { ...state, stok, transaksi: original ? state.transaksi.map(x => x.id === t.id ? t : x) : [...state.transaksi, t] };
  }

  function monthlyReport(state, month, gudang = 'SEMUA') {
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return [];
    const [year, m] = month.split('-').map(Number);
    const start = new Date(year, m - 1, 1).getTime();
    const end = new Date(year, m, 1).getTime();
    const baseTime = new Date(state.pembukaan?.waktu).getTime();
    const active = state.transaksi.filter(t => t.status !== 'dibatalkan');
    const effects = active.flatMap(t => transactionEffect(t).map(e => ({ ...e, waktu: new Date(t.waktu).getTime(), jenis: t.jenis })));
    return state.stok.filter(s => gudang === 'SEMUA' || s.gudang === gudang).filter(s => s.min > 0 || s.jumlah > 0 || effects.some(e => e.produk === s.produk && e.gudang === s.gudang)).map(s => {
      const related = effects.filter(e => e.produk === s.produk && e.gudang === s.gudang);
      const period = related.filter(e => e.waktu >= start && e.waktu < end);
      const base = state.pembukaan?.stok.find(b => b.produk === s.produk && b.gudang === s.gudang);
      const awal = base && baseTime <= start ? base.jumlah + related.filter(e => e.waktu >= baseTime && e.waktu < start).reduce((a, e) => a + e.jumlah, 0) : null;
      const sum = fn => period.filter(fn).reduce((a, e) => a + Math.abs(e.jumlah), 0);
      const masuk = sum(e => e.jenis === 'masuk');
      const keluar = sum(e => e.jenis === 'keluar');
      const pindahMasuk = sum(e => e.jenis === 'pindah' && e.jumlah > 0);
      const pindahKeluar = sum(e => e.jenis === 'pindah' && e.jumlah < 0);
      return { kode: s.produk, gudang: s.gudang, awal, masuk, keluar, pindahMasuk, pindahKeluar, akhir: awal == null ? null : awal + masuk + pindahMasuk - keluar - pindahKeluar };
    });
  }

  function reportExportData(state, month, gudang, codes) {
    const wanted = new Set(codes);
    const products = new Map(state.produk.map(p => [p.kode, p]));
    const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(month);
    return {
      rekap: valid ? monthlyReport(state, month, gudang).filter(r => wanted.has(r.kode)).map(r => ({ ...r, produk: { ...products.get(r.kode) } })) : [],
      transaksi: valid ? state.transaksi.filter(t => localDateKey(t.waktu).slice(0, 7) === month && wanted.has(t.kode) && (gudang === 'SEMUA' || t.gudang === gudang || t.tujuan === gudang))
        .sort((a, b) => b.waktu.localeCompare(a.waktu)).map(({ jejak, ...t }) => ({ ...t, produk: { ...products.get(t.kode) } })) : [],
    };
  }

  function productFingerprint(state, kode) {
    return JSON.stringify({ produk: state.produk.find(p => p.kode === kode), stok: state.stok.filter(s => s.produk === kode), transaksi: state.transaksi.filter(t => t.kode === kode) });
  }

  function applyProductAction(state, command, context) {
    const { action, kode, requestId, version } = command;
    if (!requestId || !['archive', 'restore', 'delete'].includes(action) || !context.actor || !localDateKey(context.now)) throw new Error('Permintaan produk tidak valid.');
    if ((state.jejakProduk || []).some(j => j.requestId === requestId)) return state;
    const p = state.produk.find(p => p.kode === kode);
    if (!p) throw new Error('Produk tidak ditemukan.');
    if ((p.version || 0) !== version) throw new Error('Data sudah berubah. Buka versi terbaru sebelum menyimpan.');
    const stocks = state.stok.filter(s => s.produk === kode);
    if (stocks.length !== 3 || !['TEKNO', 'PLUIT', 'LARANGAN'].every(g => stocks.some(s => s.gudang === g)) || stocks.some(s => !Number.isSafeInteger(s.jumlah) || s.jumlah !== 0)) throw new Error('Stok harus nol di ketiga gudang sebelum produk dihapus, diarsipkan atau dipulihkan.');
    const history = state.transaksi.some(t => t.kode === kode);
    if (action === 'restore' && p.status !== 'arsip') throw new Error('Produk sudah aktif.');
    if (action !== 'restore' && p.status === 'arsip') throw new Error('Produk sudah diarsipkan.');
    if (action === 'delete' && history) throw new Error('Produk mempunyai riwayat; gunakan arsip agar transaksi tetap tersimpan.');
    if (action === 'archive' && !history) throw new Error('Produk belum mempunyai riwayat transaksi; gunakan hapus permanen.');
    if (action === 'archive' && command.receipt !== productFingerprint(state, kode)) throw new Error('Unduh rekap terbaru dahulu. Data mungkin sudah berubah.');
    const next = { ...p, status: action === 'restore' ? 'aktif' : 'arsip', version: (p.version || 0) + 1 };
    if (action === 'archive') { next.diarsipkan = context.now; next.pengarsip = context.actor; }
    if (action === 'restore') { next.dipulihkan = context.now; next.pemulih = context.actor; }
    const result = { ...state, produk: action === 'delete' ? state.produk.filter(x => x.kode !== kode) : state.produk.map(x => x.kode === kode ? next : x), jejakProduk: [...(state.jejakProduk || []), { requestId, tindakan: action, pelaku: context.actor, waktu: context.now, produk: { ...p } }] };
    if (action === 'delete') {
      result.stok = state.stok.filter(s => s.produk !== kode);
      if (state.pembukaan) result.pembukaan = { ...state.pembukaan, stok: state.pembukaan.stok.filter(s => s.produk !== kode) };
    }
    return result;
  }

  function productExportData(state, kode) {
    const p = state.produk.find(p => p.kode === kode);
    if (!p) throw new Error('Produk tidak ditemukan.');
    return { kind: 'product', kode, produk: { ...p }, stok: state.stok.filter(s => s.produk === kode).map(s => ({ ...s })), transaksi: state.transaksi.filter(t => t.kode === kode).sort((a, b) => b.waktu.localeCompare(a.waktu)).map(({ jejak, ...t }) => ({ ...t, produk: { ...p } })) };
  }

  return {
    productFingerprint,
    applyProductAction,
    productExportData,
    reportExportData,
    applyTransaction,
    monthlyReport,
    transactionEffect,
    normalizeNote,
    localDateKey,
    isDateInRange,
    isValidDateRange,
    calendarDays,
    applyDateSelection,
  };
});
