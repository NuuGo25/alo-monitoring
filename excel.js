const gudang = { SEMUA: 'Semua gudang', TEKNO: 'Taman Tekno', PLUIT: 'Pluit', LARANGAN: 'Larangan' };
const jenis = { masuk: 'Barang masuk', keluar: 'Keluar customer', pindah: 'Pindah gudang' };
const mime = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
let zipReady;

async function loadZip() {
  if (window.JSZip) return window.JSZip;
  if (!zipReady) zipReady = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = new URL('vendor/jszip.min.js', import.meta.url).href;
    script.onload = () => resolve(window.JSZip);
    script.onerror = () => { script.remove(); zipReady = null; reject(new Error('Komponen Excel gagal dimuat. Periksa koneksi lalu coba lagi.')); };
    document.head.append(script);
  });
  return zipReady;
}

const tags = (root, name) => [...root.getElementsByTagNameNS('*', name)];
const parse = source => {
  const doc = new DOMParser().parseFromString(source, 'application/xml');
  if (tags(doc, 'parsererror').length) throw new Error('Template Excel tidak terbaca. Muat ulang halaman lalu coba lagi.');
  return doc;
};
const serialize = doc => new XMLSerializer().serializeToString(doc);
const wib = iso => new Date(new Date(iso).getTime() + 7 * 3600000);
const spec = p => [p.kode, p.tipe, p.lebar, p.tebal, p.panjang, p.berat, p.warna, p.merek];
const details = rows => rows.map(t => [t.id, wib(t.waktu), ...spec(t.produk), jenis[t.jenis], gudang[t.gudang], t.jenis === 'pindah' ? gudang[t.tujuan] : '', t.jumlah, t.catatan || '', t.pencatat || 'Belum tercatat (data lama)', t.status === 'dibatalkan' ? 'Dibatalkan' : 'Aktif']);

// Template dibuat oleh tools/xlsx/build-templates.mjs. Isi nilai dan klon barisnya;
// struktur paket, gaya, header, tabel dan format tanggal berasal dari template itu.
function value(cell, data, formula) {
  tags(cell, 'f').forEach(f => f.remove());
  const v = tags(cell, 'v')[0];
  if (!v) throw new Error('Sel template Excel tidak lengkap.');
  cell.setAttribute('t', data instanceof Date ? 'd' : typeof data === 'number' ? 'n' : 'str');
  v.textContent = data instanceof Date ? data.toISOString() : String(data ?? '');
  if (formula) {
    const seed = cell.ownerDocument.createElementNS(cell.namespaceURI, 'x:f');
    seed.textContent = formula; cell.insertBefore(seed, v);
  }
}

async function fill(zip, sheetNo, rows, meta, closing = false) {
  const part = `xl/worksheets/sheet${sheetNo}.xml`;
  const doc = parse(await zip.file(part).async('string'));
  const cells = tags(doc, 'c');
  for (const [ref, data] of Object.entries(meta)) {
    const c = cells.find(c => c.getAttribute('r') === ref);
    if (c) value(c, data);
  }
  const seed = tags(doc, 'row').find(r => r.getAttribute('r') === '8');
  const parent = seed.parentNode;
  const lastCol = closing ? 'O' : 'Q';
  const last = Math.max(8, 7 + rows.length);
  const sourceCells = tags(seed, 'c');
  const specStart = closing ? 2 : 4;
  const integerStyle = sourceCells[specStart].getAttribute('s');
  const decimalStyle = sourceCells[specStart + 1].getAttribute('s');
  rows.forEach((values, i) => {
    const row = seed.cloneNode(true), n = i + 8;
    row.setAttribute('r', n);
    if (!closing) row.setAttribute('ht', Math.min(220, Math.max(30, Math.ceil(Math.max(String(values[14]).length, String(values[15]).length) / 40) * 15 + 10)));
    tags(row, 'c').forEach((c, col) => {
      c.setAttribute('r', `${String.fromCharCode(65 + col)}${n}`);
      if (typeof values[col] === 'number' && col >= specStart && col <= specStart + 3) c.setAttribute('s', Number.isInteger(values[col]) ? integerStyle : decimalStyle);
      value(c, values[col], closing && col === 14 && typeof values[9] === 'number' ? `J${n}+K${n}+L${n}-M${n}-N${n}` : '');
    });
    parent.append(row);
  });
  if (!rows.length) {
    const row = seed.cloneNode(true);
    tags(row, 'c').forEach((c, col) => value(c, col ? '' : 'Tidak ada data pada pilihan ini.'));
    parent.append(row);
  }
  seed.remove();
  zip.file(part, serialize(doc));
  const tablePart = `xl/tables/table${sheetNo}.xml`;
  const table = parse(await zip.file(tablePart).async('string'));
  table.documentElement.setAttribute('ref', `A7:${lastCol}${last}`);
  tags(table, 'autoFilter').forEach(f => f.setAttribute('ref', `A7:${lastCol}${last}`));
  zip.file(tablePart, serialize(table));
}

export async function createExcel(data) {
  const product = data.kind === 'product';
  const count = (data.rekap?.length || 0) + (data.transaksi?.length || 0);
  if (!count) throw new Error('Tidak ada data untuk diunduh.');
  if (count > 10000) throw new Error('Maksimal 10.000 baris per unduhan. Persempit pencarian lalu coba lagi.');
  const Zip = await loadZip();
  const response = await fetch(new URL(`templates/${product ? 'product' : 'monthly'}.xlsx`, import.meta.url));
  if (!response.ok) throw new Error('Template Excel gagal dimuat. Periksa koneksi lalu coba lagi.');
  const zip = await Zip.loadAsync(await response.arrayBuffer());
  let filename;
  if (product) {
    const now = wib(new Date());
    const stocks = data.stok.map(s => `${gudang[s.gudang]}: ${s.jumlah}`).join(' · ');
    await fill(zip, 1, details(data.transaksi), { A3: now, C3: data.kode, F3: 'Seluruh periode · waktu WIB', A5: `${data.produk.status === 'arsip' ? 'Arsip' : 'Aktif'} · Stok saat unduh (gulungan): ${stocks}` });
    filename = `alo-rekap-${data.kode}-${now.toISOString().slice(0, 10)}.xlsx`;
  } else {
    const meta = { A3: new Date(`${data.month}-01T00:00:00Z`), C3: gudang[data.gudang], F3: `Pencarian: ${data.search || 'Semua produk'}` };
    await fill(zip, 1, data.rekap.map(r => [...spec(r.produk), gudang[r.gudang], r.awal ?? 'Belum tersedia', r.masuk, r.pindahMasuk, r.keluar, r.pindahKeluar, r.akhir ?? 'Belum tersedia']), meta, true);
    await fill(zip, 2, details(data.transaksi), meta);
    filename = `alo-laporan-${data.month}-${data.gudang.toLowerCase()}.xlsx`;
  }
  return { blob: await zip.generateAsync({ type: 'blob', mimeType: mime, compression: 'DEFLATE' }), filename };
}
