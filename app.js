/* alo monitoring — prototipe tampilan (versi 3 gudang).
   Data contoh disimpan di localStorage browser; Excel dibuat saat diminta. Aturan bisnis di sini
   (cek duplikat KF-03, tolak stok minus KF-08, status per gudang KF-05, pindah gudang KF-11)
   jadi acuan implementasi tahap 2-3. */
(() => {
  'use strict';

  const KUNCI_SIMPAN = 'alo-prototipe-v2';   // v2: stok dipisah per gudang
  const KUNCI_GUDANG = 'alo-gudang-aktif';
  const SATUAN = 'gulungan';                 // ASUMSI A1/A10: belum dikonfirmasi mitra ("roll" atau "gulungan")
  const SELISIH_HAMPIR = 5;                  // ASUMSI A2: hampir habis kalau stok <= minimum + 5
  const SEMUA = 'SEMUA';
  const { normalizeNote, localDateKey, isDateInRange, calendarDays, applyDateSelection, applyTransaction, monthlyReport, transactionEffect, reportExportData, productFingerprint, applyProductAction, productExportData } = window.AloPrototypeLogic;
  const PELAKU_DEMO = 'Staf demo (simulasi)';
  const idPermintaan = () => crypto.randomUUID();

  // Data gudang dan merek: dari mitra, 20 Sep 2026 (docs/01-masalah/temuan-awal.md).
  // Daftar merek dipakai sebagai urutan saran, bukan larangan.
  const GUDANG = [
    { kode: 'TEKNO', nama: 'Taman Tekno', pendek: 'Tekno', merek: ['TOYO', 'YAMA'] },
    { kode: 'PLUIT', nama: 'Pluit', pendek: 'Pluit', merek: ['SOLTA'] },
    { kode: 'LARANGAN', nama: 'Larangan', pendek: 'Larangan', merek: ['TOYO', 'YAMA', 'SOLTA', 'COLSON', 'PSJ', 'MUTIARA', 'HLPACK'] },
  ];

  const nf = new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 });
  const fTanggal = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const fJam = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit' });
  const fTanggalPendek = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short' });
  const fTanggalRingkas = new Intl.DateTimeFormat('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
  const fBulanTahun = new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' });

  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
  const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const tanggalDariKey = (key) => {
    const [tahun, bulan, hari] = key.split('-').map(Number);
    return new Date(tahun, bulan - 1, hari);
  };

  const IKON = {
    masuk: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3v12m0 0-4-4m4 4 4-4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>',
    keluar: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 15V3m0 0L8 7m4-4 4 4"/><path d="M4 15v4a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-4"/></svg>',
    pindah: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8h15m0 0-4-4m4 4-4 4"/><path d="M20 16H5m0 0 4-4m-4 4 4 4"/></svg>',
  };

  /* ================= data contoh ================= */

  function dataContoh() {
    const P = (kode, lebar, tebal, panjang, berat, warna, merek, catatan = '') =>
      ({ kode, tipe: 'FA', lebar, tebal, panjang, berat, warna, merek, catatan });
    // Tipe "FA", ukuran, dan daftar merek mengikuti data nyata dari mitra. Angka stok = data contoh.
    const produk = [
      P('FA-0001', 5, 0.42, 6000, 10, 'Putih', 'TOYO'),
      P('FA-0002', 5, 0.42, 6000, 10, 'Hitam', 'TOYO'),
      P('FA-0003', 9, 0.6, 3000, 15, 'Putih', 'YAMA'),
      P('FA-0004', 12, 0.8, 2500, 20, 'Biru', 'SOLTA'),
      P('FA-0005', 15, 0.8, 1500, 18, 'Kuning', 'SOLTA'),
      P('FA-0006', 15, 0.8, 1500, 18, 'Hijau', 'COLSON', 'Sisa gulungan pesanan lama'),
      P('FA-0007', 5, 0.42, 6000, 10, 'Putih', 'PSJ'),
      P('FA-0008', 9, 0.6, 3000, 15, 'Merah', 'MUTIARA'),
      P('FA-0009', 12, 0.8, 2500, 20, 'Putih', 'HLPACK'),
    ];
    // [kode produk, kode gudang, jumlah, stok minimum]. Minimum 0 = produk tidak disimpan di gudang itu.
    const isiStok = [
      ['FA-0001', 'TEKNO', 24, 10], ['FA-0001', 'LARANGAN', 12, 10],
      ['FA-0002', 'TEKNO', 8, 10], ['FA-0002', 'LARANGAN', 30, 10],
      ['FA-0003', 'TEKNO', 13, 10], ['FA-0003', 'LARANGAN', 40, 12],
      ['FA-0004', 'PLUIT', 3, 8], ['FA-0004', 'LARANGAN', 21, 12],
      ['FA-0005', 'PLUIT', 30, 10], ['FA-0005', 'LARANGAN', 16, 12],
      ['FA-0006', 'LARANGAN', 0, 5],
      ['FA-0007', 'LARANGAN', 55, 10],
      ['FA-0008', 'LARANGAN', 18, 15],
      ['FA-0009', 'LARANGAN', 7, 6],
    ];
    const stok = [];
    produk.forEach((p) => GUDANG.forEach((g) => {
      const baris = isiStok.find(([kp, kg]) => kp === p.kode && kg === g.kode);
      stok.push({ produk: p.kode, gudang: g.kode, jumlah: baris ? baris[2] : 0, min: baris ? baris[3] : 0 });
    }));

    const now = Date.now();
    const MNT = 60e3, JAM = 60 * MNT, HARI = 24 * JAM;
    // [kode, jenis, jumlah, gudang asal, gudang tujuan, berapa lama lalu, catatan opsional]
    const t = [
      ['FA-0001', 'keluar', 6, 'TEKNO', '', 25 * MNT, 'Kirim ke pelanggan area Tangerang'],
      ['FA-0004', 'keluar', 4, 'PLUIT', '', JAM + 10 * MNT],
      ['FA-0001', 'pindah', 5, 'LARANGAN', 'TEKNO', 2 * JAM + 40 * MNT, 'Penyesuaian stok untuk pengiriman besok'],
      ['FA-0007', 'masuk', 20, 'LARANGAN', '', 3 * JAM],
      ['FA-0006', 'keluar', 2, 'LARANGAN', '', HARI + 2 * JAM],
      ['FA-0002', 'keluar', 5, 'TEKNO', '', HARI + 5 * JAM],
      ['FA-0005', 'masuk', 20, 'PLUIT', '', HARI + 7 * JAM],
      ['FA-0003', 'masuk', 30, 'LARANGAN', '', 2 * HARI + 3 * JAM],
      ['FA-0004', 'pindah', 6, 'LARANGAN', 'PLUIT', 3 * HARI + JAM],
      ['FA-0008', 'keluar', 3, 'LARANGAN', '', 4 * HARI + 4 * JAM],
      ['FA-0001', 'masuk', 15, 'TEKNO', '', 6 * HARI + 2 * JAM],
      ['FA-0009', 'keluar', 6, 'LARANGAN', '', 9 * HARI],
    ];
    const transaksi = t.map(([kode, jenis, jumlah, gudang, tujuan, lalu, catatan = ''], i) =>
      ({ id: t.length - i, kode, jenis, jumlah, gudang, tujuan, catatan, waktu: new Date(now - lalu).toISOString(), pencatat: PELAKU_DEMO, status: 'aktif', jejak: [] }));
    // Saldo pembuka hanya untuk fixture contoh baru, bukan migrasi saldo historis milik browser lama.
    const palingAwal = new Date(Math.min(...transaksi.map(t => new Date(t.waktu).getTime())));
    const pembukaan = {
      waktu: new Date(palingAwal.getFullYear(), palingAwal.getMonth(), 1).toISOString(),
      stok: stok.map(s => ({ produk: s.produk, gudang: s.gudang, jumlah: s.jumlah - transaksi.flatMap(transactionEffect).filter(e => e.produk === s.produk && e.gudang === s.gudang).reduce((a, e) => a + e.jumlah, 0) })),
    };
    return { produk, stok, transaksi, pembukaan };
  }

  // Data tersimpan yang bentuknya tidak lengkap dulu membuat layar blank.
  // Sekarang: data rusak disalin ke kunci cadangan, lalu data contoh dimuat dan staf diberi tahu.
  let dataRusak = false;
  function muat() {
    let raw = null;
    try { raw = localStorage.getItem(KUNCI_SIMPAN); } catch (e) { return dataContoh(); }
    if (!raw) return dataContoh();
    try {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.produk) && Array.isArray(d.stok) && Array.isArray(d.transaksi)) {
        return d;
      }
    } catch (e) { /* JSON rusak: ditangani di bawah */ }
    dataRusak = true;
    try { localStorage.setItem(`${KUNCI_SIMPAN}-rusak`, raw); } catch (e) { /* abaikan */ }
    return dataContoh();
  }

  // Penyimpanan bisa gagal (penuh atau diblokir). Dulu gagal diam-diam; sekarang staf diberi peringatan tetap.
  function simpan(data = state) {
    let berhasil = true;
    try { localStorage.setItem(KUNCI_SIMPAN, JSON.stringify(data)); } catch (e) { berhasil = false; }
    tampilkanPeringatanSimpan(!berhasil);
    return berhasil;
  }
  function tampilkanPeringatanSimpan(tampil) {
    let el = document.getElementById('peringatanSimpan');
    if (!tampil) { if (el) el.hidden = true; return; }
    if (!el) {
      el = document.createElement('div');
      el.id = 'peringatanSimpan';
      el.className = 'peringatan-simpan';
      el.setAttribute('role', 'alert');
      el.textContent = 'Perubahan belum tersimpan karena penyimpanan browser penuh atau diblokir. Data sebelumnya tetap digunakan. Periksa penyimpanan sebelum mencoba lagi.';
      document.querySelector('main').before(el);
    }
    el.hidden = false;
  }

  // Setiap produk wajib punya satu baris stok di tiap gudang; baris yang hilang dilengkapi (jumlah 0, tidak dipantau).
  function lengkapiStok(data = state) {
    const ada = new Set(data.stok.map((s) => `${s.produk}|${s.gudang}`));
    data.produk.forEach((p) => GUDANG.forEach((g) => {
      if (!ada.has(`${p.kode}|${g.kode}`)) data.stok.push({ produk: p.kode, gudang: g.kode, jumlah: 0, min: 0 });
    }));
  }

  // Indeks: pencarian produk/stok dulu menyisir seluruh daftar di dalam perulangan (waktu naik kuadrat).
  // Dibangun ulang hanya saat produk atau baris stok bertambah/berganti; perubahan jumlah memakai objek yang sama.
  const indeks = { produk: new Map(), stok: new Map(), stokPerProduk: new Map(), teksCari: new Map() };
  function bangunIndeks() {
    indeks.produk = new Map(state.produk.map((p) => [p.kode, p]));
    indeks.stok = new Map(state.stok.map((s) => [`${s.produk}|${s.gudang}`, s]));
    indeks.stokPerProduk = new Map();
    state.stok.forEach((s) => {
      if (!indeks.stokPerProduk.has(s.produk)) indeks.stokPerProduk.set(s.produk, []);
      indeks.stokPerProduk.get(s.produk).push(s);
    });
    indeks.teksCari = new Map();
  }
  function muatGudangAktif() {
    try {
      const g = localStorage.getItem(KUNCI_GUDANG);
      if (g === SEMUA || GUDANG.some((x) => x.kode === g)) return g;
    } catch (e) { /* abaikan */ }
    return SEMUA;
  }

  let state = muat();
  let gudangAktif = muatGudangAktif();
  lengkapiStok();
  bangunIndeks();

  /* ================= helper data ================= */

  const cariProduk = (kode) => indeks.produk.get(kode);
  const infoGudang = (kode) => GUDANG.find((g) => g.kode === kode);
  const namaGudang = (kode) => (kode === SEMUA ? 'Semua gudang' : (infoGudang(kode) || {}).nama || kode);
  const pendekGudang = (kode) => (infoGudang(kode) || {}).pendek || kode;
  // Dipakai di judul dan kalimat: selalu "Gudang Pluit", bukan "pluit".
  const labelGudang = (kode) => (kode === SEMUA ? 'Semua gudang' : `Gudang ${namaGudang(kode)}`);
  const tagGudang = (kode) => `<span class="tag-gudang">${esc(pendekGudang(kode))}</span>`;
  const barisStok = (kodeProduk, kodeGudang) => indeks.stok.get(`${kodeProduk}|${kodeGudang}`);
  const stokProduk = (kodeProduk) => indeks.stokPerProduk.get(kodeProduk) || [];
  const totalStok = (kodeProduk) => stokProduk(kodeProduk).reduce((a, s) => a + s.jumlah, 0);
  const gudangTampil = () => (gudangAktif === SEMUA ? GUDANG.map((g) => g.kode) : [gudangAktif]);

  // KF-05. Minimum 0 berarti produk tidak dipantau di gudang itu.
  function statusDari(jumlah, min) {
    if (!min || min <= 0) return 'nonaktif';
    if (jumlah <= min) return 'kritis';
    if (jumlah <= min + SELISIH_HAMPIR) return 'hampir';
    return 'normal';
  }
  const URUT_STATUS = { kritis: 0, hampir: 1, normal: 2, nonaktif: 3 };
  const LABEL_STATUS = { kritis: 'Kritis', hampir: 'Hampir habis', normal: 'Normal', nonaktif: 'Tidak disimpan' };
  const badge = (s) => `<span class="badge ${s}">${LABEL_STATUS[s]}</span>`;

  function statusGabungan(kodeProduk) {
    return stokProduk(kodeProduk)
      .map((s) => statusDari(s.jumlah, s.min))
      .sort((a, b) => URUT_STATUS[a] - URUT_STATUS[b])[0] || 'nonaktif';
  }
  const disimpanDi = (kodeProduk, kodeGudang) => {
    const s = barisStok(kodeProduk, kodeGudang);
    return !!s && (s.min > 0 || s.jumlah > 0);
  };

  const parseAngka = (s) => (String(s).trim() === '' ? NaN : Number(String(s).trim().replace(',', '.')));
  const angkaPositif = (s) => { const n = parseAngka(s); return Number.isFinite(n) && n > 0; };
  const norm = (s) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
  const kapital = (s) => s.replace(/\s+/g, ' ').replace(/^./, (c) => c.toUpperCase());

  // KF-03: identitas produk = 7 atribut. Catatan sengaja tidak ikut.
  const kunciProduk = (p) => [norm(p.tipe), Number(p.lebar), Number(p.tebal), Number(p.panjang), Number(p.berat), norm(p.warna), norm(p.merek)].join('|');

  // KF-02: kode otomatis, satu identitas untuk semua gudang.
  function kodeBerikut(tipe, data = state) {
    const awalan = String(tipe).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'BRG';
    const maks = [...data.produk, ...(data.jejakProduk || []).map(j => j.produk)]
      .filter((p) => p.kode.startsWith(`${awalan}-`))
      .reduce((m, p) => Math.max(m, parseInt(p.kode.split('-')[1], 10) || 0), 0);
    return `${awalan}-${String(maks + 1).padStart(4, '0')}`;
  }

  const SEGMEN = [['tipe', ''], ['lebar', 'mm'], ['tebal', 'mm'], ['panjang', 'm'], ['berat', 'kg'], ['warna', ''], ['merek', '']];

  function specTeks(p) {
    return SEGMEN
      .filter(([k]) => p[k] !== '' && p[k] != null)
      .map(([k, unit]) => (unit ? `${nf.format(Number(p[k]))} ${unit}` : p[k]))
      .join(' ');
  }
  function specHTML(p) {
    const isi = SEGMEN.map(([k, unit]) => {
      const v = p[k];
      if (v === '' || v == null) return '<span class="empty">–</span>';
      return `<span>${unit ? `${nf.format(Number(v))}<small>${unit}</small>` : esc(v)}</span>`;
    }).join('');
    const label = specTeks(p) || 'spesifikasi belum diisi';
    return `<span class="spec" role="img" aria-label="${esc(label)}">${isi}</span>`;
  }

  // Teks yang dicari per produk disusun sekali lalu disimpan di indeks (produk tidak pernah diubah setelah dibuat).
  function teksCariProduk(p) {
    let teks = indeks.teksCari.get(p.kode);
    if (teks === undefined) {
      // Bentuk rapat seperti di label ("15mm", "0,8mm", "1.500m", "18kg") ikut dicari,
      // supaya staf bisa mengetik persis seperti yang mereka lihat.
      const rapat = [[p.lebar, 'mm'], [p.tebal, 'mm'], [p.panjang, 'm'], [p.berat, 'kg']]
        .filter(([v]) => v !== '' && v != null)
        .flatMap(([v, unit]) => [`${nf.format(Number(v))}${unit}`, `${v}${unit}`]);
      teks = norm([p.kode, specTeks(p), p.lebar, p.tebal, p.panjang, p.berat, ...rapat, p.catatan].join(' '));
      indeks.teksCari.set(p.kode, teks);
    }
    return teks;
  }

  function saringProduk(q, termasukArsip = false) {
    const token = norm(q).split(' ').filter(Boolean);
    return state.produk.filter(p => termasukArsip || p.status !== 'arsip').filter((p) => {
      const tumpukan = teksCariProduk(p);
      return token.every((t) => tumpukan.includes(t));
    });
  }

  // Daftar panjang ditampilkan bertahap supaya ringan di HP murah: 50 dulu, lalu "Tampilkan lebih banyak".
  const LANGKAH_TAMPIL = 50;
  function tombolTampilLagi(tampil, total, id) {
    if (tampil >= total) return '';
    const berikut = Math.min(LANGKAH_TAMPIL, total - tampil);
    return `<div class="tampil-lagi"><p class="muted small">Menampilkan ${nf.format(tampil)} dari ${nf.format(total)}.</p><button type="button" class="btn btn-secondary" id="${id}">Tampilkan ${nf.format(berikut)} lagi</button></div>`;
  }

  // Menunda pekerjaan sampai staf berhenti mengetik sebentar, supaya tidak menggambar ulang di setiap huruf.
  function tunda(fn, ms = 150) {
    let timer;
    return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), ms); };
  }

  const rincianStok = (kodeProduk) => stokProduk(kodeProduk)
    .filter((s) => s.jumlah > 0 || s.min > 0)
    .map((s) => `${esc(pendekGudang(s.gudang))} ${nf.format(s.jumlah)}`)
    .join(' · ') || 'belum ada stok';

  function dataTerbaru() {
    let raw;
    try { raw = localStorage.getItem(KUNCI_SIMPAN); }
    catch (err) { throw new Error('Penyimpanan browser tidak dapat dibaca. Data tidak diubah.'); }
    if (!raw) return state;
    const data = JSON.parse(raw);
    if (!data || !Array.isArray(data.produk) || !Array.isArray(data.stok) || !Array.isArray(data.transaksi)) throw new Error('Data browser tidak terbaca. Perubahan tidak disimpan.');
    lengkapiStok(data);
    return data;
  }

  async function simpanPerubahan(transform, resetDemo = false) {
    if (!navigator.locks) throw new Error('Browser ini belum mendukung penyimpanan aman antar-tab. Buka prototipe melalui Chrome atau Edge terbaru.');
    return navigator.locks.request(KUNCI_SIMPAN, () => {
      const latest = resetDemo ? state : dataTerbaru();
      const next = transform(latest);
      if (next !== latest) {
        next._revision = (latest._revision || 0) + 1;
        if (!simpan(next)) throw new Error('Tidak bisa menyimpan di browser. Data tidak diubah. Coba lagi setelah penyimpanan tersedia.');
      }
      state = next; bangunIndeks();
      return next;
    });
  }

  async function simpanTransaksi(command) {
    return simpanPerubahan(latest => applyTransaction(latest, command, { actor: PELAKU_DEMO, now: new Date().toISOString() }));
  }

  async function unduhExcel(data) {
    const { createExcel } = await import('./excel.js?v=20261017-arsip');
    const { blob, filename } = await createExcel(data);
    const url = URL.createObjectURL(blob), a = document.createElement('a');
    a.href = url; a.download = filename;
    try { document.body.append(a); a.click(); }
    finally { a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000); }
  }

  /* ================= toast ================= */

  let toastTimer;
  function toast(pesanHTML, aksi) {
    const el = $('#toast');
    el.innerHTML = `<span>${pesanHTML}</span>${aksi ? `<a href="${aksi.href}">${esc(aksi.label)}</a>` : ''}`;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 6000);
  }

  /* ================= pemilih gudang (KF-10) ================= */

  function renderPilihGudang() {
    const sel = $('#pilihGudang');
    sel.innerHTML = [`<option value="${SEMUA}">Semua gudang</option>`]
      .concat(GUDANG.map((g) => `<option value="${g.kode}">Gudang ${esc(g.nama)}</option>`)).join('');
    sel.value = gudangAktif;
  }
  const judulGudang = () => ` — ${labelGudang(gudangAktif)}`;

  /* ================= halaman: dashboard ================= */

  let filterDashboard = 'semua';
  let qDashboard = '';
  let batasDashboard = LANGKAH_TAMPIL;

  // Kerangka halaman digambar sekali; mengetik dan menyaring hanya menggambar ulang daftar (maks. 50 baris per tahap).
  function viewDashboard(main) {
    batasDashboard = LANGKAH_TAMPIL;
    const hariIni = localDateKey(new Date());
    const txHariIni = transaksiGudang().filter(t => t.status !== 'dibatalkan')
      .filter((t) => localDateKey(t.waktu) === hariIni)
      .sort((a, b) => b.waktu.localeCompare(a.waktu));

    main.innerHTML = `
      <div class="page-head">
        <div><h1 tabindex="-1">Stok hari ini<span class="judul-gudang">${esc(judulGudang())}</span></h1><p id="dashRingkas"></p></div>
      </div>
      <div class="dash-grid">
        <section class="panel" aria-labelledby="hPerlu">
          <div class="panel-head">
            <h2 id="hPerlu">${gudangAktif === SEMUA ? 'Stok semua gudang' : `Stok ${esc(labelGudang(gudangAktif))}`}</h2>
            <div class="chips" role="group" aria-label="Saring menurut status">
              ${[['semua', 'Semua'], ['kritis', 'Kritis'], ['hampir', 'Hampir habis'], ['normal', 'Normal']].map(([v, l]) =>
                `<button type="button" class="chip" data-filter="${v}" aria-pressed="${filterDashboard === v}">${l}</button>`).join('')}
            </div>
          </div>
          <div class="toolbar">
            <div class="search">
              <label class="sr-only" for="qDashboard">Cari stok</label>
              <input class="input" type="search" id="qDashboard" autocomplete="off" placeholder="Cari ukuran, warna, merek…" value="${esc(qDashboard)}">
              <p class="hasil-cari muted small" id="dashInfoCari" hidden></p>
            </div>
          </div>
          <div id="dashDaftar"></div>
        </section>
        <section class="panel" aria-labelledby="hHariIni">
          <div class="panel-head"><h2 id="hHariIni">Transaksi hari ini</h2><span class="muted num">${txHariIni.length}</span></div>
          ${txHariIni.length
            ? `<ul class="feed">${txHariIni.slice(0, 8).map(barisFeed).join('')}</ul>`
            : `<div class="empty-state compact"><p>Belum ada transaksi hari ini di ${esc(labelGudang(gudangAktif))}.</p><a class="btn btn-quiet" href="#/transaksi">Catat transaksi</a></div>`}
          <div class="panel-foot"><a href="#/riwayat">Lihat semua riwayat</a></div>
        </section>
      </div>`;

    const daftar = $('#dashDaftar', main);
    const infoCari = $('#dashInfoCari', main);

    function renderDaftar() {
      const cocok = qDashboard.trim() ? new Set(saringProduk(qDashboard).map((p) => p.kode)) : null;
      const baris = [];
      state.produk.filter(p => p.status !== 'arsip').forEach((p) => gudangTampil().forEach((kg) => {
        const s = barisStok(p.kode, kg);
        if (!s) return;
        const st = statusDari(s.jumlah, s.min);
        // Semua status ikut ditampilkan, termasuk Normal, supaya staf tidak mengira produknya hilang.
        if (st !== 'nonaktif') baris.push({ p, s, st, gudang: kg });
      }));

      const jKritis = baris.filter((b) => b.st === 'kritis').length;
      const jHampir = baris.filter((b) => b.st === 'hampir').length;
      const jNormal = baris.filter((b) => b.st === 'normal').length;
      const jDipantau = baris.length;

      let ringkas;
      if (!jDipantau) ringkas = `Belum ada produk yang disimpan di ${labelGudang(gudangAktif)}.`;
      else if (!jKritis && !jHampir) ringkas = `Semua ${jDipantau} catatan stok aman, di atas batas minimum.`;
      else ringkas = `${[jKritis && `${jKritis} kritis`, jHampir && `${jHampir} hampir habis`, jNormal && `${jNormal} normal`].filter(Boolean).join(', ')} dari ${jDipantau} catatan stok.`;
      $('#dashRingkas', main).textContent = ringkas;

      const perlu = baris
        .filter((b) => filterDashboard === 'semua' || b.st === filterDashboard)
        .filter((b) => !cocok || cocok.has(b.p.kode))
        .sort((a, b) => (a.st === b.st
          ? a.s.jumlah / (a.s.min || 1) - b.s.jumlah / (b.s.min || 1)
          : URUT_STATUS[a.st] - URUT_STATUS[b.st]));

      infoCari.hidden = !(qDashboard.trim() && perlu.length);
      infoCari.textContent = `Menampilkan ${perlu.length} dari ${jDipantau} catatan stok.`;

      if (perlu.length) {
        daftar.innerHTML = `<ul class="restock">${perlu.slice(0, batasDashboard).map(barisRestock).join('')}</ul>${tombolTampilLagi(Math.min(batasDashboard, perlu.length), perlu.length, 'dashTampilLagi')}`;
      } else if (!state.produk.length) {
        daftar.innerHTML = `<div class="empty-state"><h3>Belum ada produk</h3><p>Tambahkan produk dulu. Stok tiap produk akan muncul di sini.</p><a class="btn btn-quiet" href="#/produk?tambah=1">Tambah produk</a></div>`;
      } else if (!jDipantau) {
        daftar.innerHTML = `<div class="empty-state"><h3>Belum ada produk di gudang ini</h3><p>Produk muncul di sini setelah barangnya dicatat masuk ke ${esc(labelGudang(gudangAktif))}.</p><a class="btn btn-quiet" href="#/transaksi?jenis=masuk">Catat barang masuk</a></div>`;
      } else if (qDashboard.trim()) {
        daftar.innerHTML = `<div class="empty-state"><h3>Tidak ada produk yang cocok</h3><p>Tidak ada stok yang cocok dengan “${esc(qDashboard.trim())}”${filterDashboard === 'semua' ? '' : ` berstatus ${LABEL_STATUS[filterDashboard].toLowerCase()}`} di ${esc(labelGudang(gudangAktif))}. Periksa ejaan, atau coba satu kata kunci saja.</p><button type="button" class="btn btn-secondary" id="dashHapusCari">Hapus pencarian</button></div>`;
      } else {
        daftar.innerHTML = `<div class="empty-state"><p>Tidak ada produk berstatus ${LABEL_STATUS[filterDashboard].toLowerCase()} di ${esc(labelGudang(gudangAktif))}.</p></div>`;
      }
    }

    $$('[data-filter]', main).forEach((b) => b.addEventListener('click', () => {
      filterDashboard = b.dataset.filter;
      batasDashboard = LANGKAH_TAMPIL;
      $$('[data-filter]', main).forEach((c) => c.setAttribute('aria-pressed', String(c === b)));
      renderDaftar();
    }));

    const cariTertunda = tunda(() => { batasDashboard = LANGKAH_TAMPIL; renderDaftar(); });
    $('#qDashboard', main).addEventListener('input', (e) => { qDashboard = e.target.value; cariTertunda(); });

    daftar.addEventListener('click', (e) => {
      if (e.target.closest('#dashTampilLagi')) {
        batasDashboard += LANGKAH_TAMPIL;
        renderDaftar();
      } else if (e.target.closest('#dashHapusCari')) {
        qDashboard = '';
        $('#qDashboard', main).value = '';
        renderDaftar();
        $('#qDashboard', main).focus();
      }
    });

    renderDaftar();
  }

  function barisRestock({ p, s, st, gudang }) {
    const persen = Math.min(s.jumlah / ((s.min || 1) * 2), 1) * 100;
    let teks;
    if (s.jumlah === 0) teks = `<strong>Habis</strong>, minimum ${nf.format(s.min)} ${SATUAN}`;
    else if (st === 'normal') teks = `<strong>${nf.format(s.jumlah)}</strong> ${SATUAN}, aman di atas minimum ${nf.format(s.min)}`;
    else teks = `<strong>${nf.format(s.jumlah)}</strong> ${SATUAN} tersisa, minimum ${nf.format(s.min)}`;
    // Produk aman tidak perlu diisi ulang, jadi tombolnya netral.
    const aksi = st === 'normal'
      ? { href: `#/transaksi?kode=${encodeURIComponent(p.kode)}&gudang=${encodeURIComponent(gudang)}`, label: 'Catat transaksi' }
      : { href: `#/transaksi?jenis=masuk&kode=${encodeURIComponent(p.kode)}&gudang=${encodeURIComponent(gudang)}`, label: 'Catat barang masuk' };
    return `
      <li>
        <div>
          <div class="kepala"><span class="kode">${esc(p.kode)}</span>${tagGudang(gudang)}${badge(st)}</div>
          ${specHTML(p)}
          <div class="meter" aria-hidden="true"><span class="meter-fill ${st}" style="width:${persen}%"></span><span class="meter-min" style="left:50%"></span></div>
          <p class="meter-text num">${teks}</p>
        </div>
        <a class="btn btn-quiet" href="${aksi.href}">${aksi.label}</a>
      </li>`;
  }

  // Transaksi yang relevan dengan gudang aktif. Pindah gudang muncul di gudang asal dan tujuan.
  function transaksiGudang() {
    if (gudangAktif === SEMUA) return state.transaksi.slice();
    return state.transaksi.filter((t) => t.gudang === gudangAktif || t.tujuan === gudangAktif);
  }

  // Arah transaksi dari sudut pandang gudang yang sedang dilihat.
  function arahTransaksi(t) {
    if (t.jenis === 'masuk') return { tanda: '+', kelas: 'masuk', teks: 'Masuk', gudang: t.gudang };
    if (t.jenis === 'keluar') return { tanda: '−', kelas: 'keluar', teks: 'Keluar', gudang: t.gudang };
    if (gudangAktif === t.tujuan) return { tanda: '+', kelas: 'masuk', teks: `Pindah dari ${pendekGudang(t.gudang)}`, gudang: t.tujuan };
    if (gudangAktif === t.gudang) return { tanda: '−', kelas: 'keluar', teks: `Pindah ke ${pendekGudang(t.tujuan)}`, gudang: t.gudang };
    return { tanda: '', kelas: 'pindah', teks: `${pendekGudang(t.gudang)} → ${pendekGudang(t.tujuan)}`, gudang: t.gudang };
  }

  function barisFeed(t) {
    const p = cariProduk(t.kode);
    const a = arahTransaksi(t);
    const hariIni = new Date(t.waktu).toDateString() === new Date().toDateString();
    const waktu = hariIni ? fJam.format(new Date(t.waktu)) : fTanggalPendek.format(new Date(t.waktu));
    return `
      <li>
        <span class="muted num">${waktu}</span>
        <span><span class="kode">${esc(t.kode)}</span> ${tagGudang(a.gudang)}<span class="desc">${esc(p ? specTeks(p) : 'produk tidak ditemukan')}</span>${t.catatan ? `<span class="desc feed-note"><strong>Catatan:</strong> ${esc(t.catatan)}</span>` : ''}</span>
        <span class="qty ${a.kelas}">${a.tanda}${nf.format(t.jumlah)}</span>
      </li>`;
  }

  /* ================= halaman: produk ================= */

  let qProduk = '';
  let filterStatus = 'semua';
  let batasProduk = LANGKAH_TAMPIL;
  let produkArsip = false;

  function viewProduk(main, params) {
    if (params.get('arsip') === '1') produkArsip = true;
    main.innerHTML = `
      <div class="page-head">
        <div><h1 tabindex="-1">Produk<span class="judul-gudang">${esc(judulGudang())}</span></h1><p id="produkRingkas"></p></div>
        <button type="button" class="btn btn-primary" id="btnTambah">Tambah produk</button>
      </div>
      <section class="panel">
        <div class="toolbar">
          <div class="search">
            <label class="sr-only" for="qProduk">Cari produk</label>
            <input class="input" type="search" id="qProduk" placeholder="Cari kode, ukuran, warna…" value="${esc(qProduk)}">
          </div>
          <div class="toolbar-select"><label class="sr-only" for="produkMode">Daftar produk</label><select class="input" id="produkMode"><option value="aktif">Produk aktif</option><option value="arsip">Arsip produk</option></select></div>
          <div class="toolbar-select">
            <label class="sr-only" for="fStatus">Status stok</label>
            <select class="input" id="fStatus">
              <option value="semua">Semua status</option>
              <option value="kritis">Kritis</option>
              <option value="hampir">Hampir habis</option>
              <option value="normal">Normal</option>
            </select>
          </div>
        </div>
        <div id="produkIsi"></div>
      </section>`;

    $('#fStatus').value = filterStatus;
    $('#produkMode').value = produkArsip ? 'arsip' : 'aktif';
    $('#fStatus').disabled = produkArsip;
    batasProduk = LANGKAH_TAMPIL;

    const isi = () => {
      const semuaGudang = produkArsip || gudangAktif === SEMUA;
      const tercatat = state.produk.filter(p => (p.status === 'arsip') === produkArsip).filter((p) => semuaGudang || disimpanDi(p.kode, gudangAktif));
      const hasil = saringProduk(qProduk, true).filter(p => (p.status === 'arsip') === produkArsip)
        .filter((p) => semuaGudang || disimpanDi(p.kode, gudangAktif))
        .filter((p) => {
          if (produkArsip || filterStatus === 'semua') return true;
          if (semuaGudang) return statusGabungan(p.kode) === filterStatus;
          const s = barisStok(p.kode, gudangAktif);
          return s && statusDari(s.jumlah, s.min) === filterStatus;
        })
        .sort((a, b) => a.kode.localeCompare(b.kode));

      $('#produkRingkas').textContent = produkArsip ? `${hasil.length} produk arsip di seluruh gudang. Identitas dan riwayat tetap tersimpan.` : hasil.length === tercatat.length
        ? `${tercatat.length} produk tercatat${semuaGudang ? ' di seluruh gudang' : ` di ${labelGudang(gudangAktif)}`}.`
        : `Menampilkan ${hasil.length} dari ${tercatat.length} produk.`;

      const wadah = $('#produkIsi');
      if (produkArsip && !tercatat.length) {
        wadah.innerHTML = '<div class="empty-state"><h3>Belum ada produk arsip</h3><p>Produk yang diarsipkan dapat dibuka dan dipulihkan dari sini.</p></div>';
      } else if (!state.produk.length) {
        wadah.innerHTML = `<div class="empty-state"><h3>Belum ada produk</h3><p>Tambahkan produk pertama supaya stoknya bisa dicatat.</p><button type="button" class="btn btn-primary" data-tambah>Tambah produk</button></div>`;
      } else if (!tercatat.length) {
        wadah.innerHTML = `<div class="empty-state"><h3>Belum ada produk di ${esc(labelGudang(gudangAktif))}</h3><p>Produk muncul di sini setelah barangnya dicatat masuk ke gudang ini.</p><a class="btn btn-quiet" href="#/transaksi?jenis=masuk&gudang=${esc(gudangAktif)}">Catat barang masuk</a></div>`;
      } else if (!hasil.length) {
        wadah.innerHTML = `<div class="empty-state"><h3>Tidak ada produk yang cocok</h3><p>Periksa ejaan, atau cari pakai kode produk seperti FA-0001.</p><button type="button" class="btn btn-secondary" id="btnHapusCari">Hapus pencarian</button></div>`;
        $('#btnHapusCari').addEventListener('click', () => {
          qProduk = ''; filterStatus = 'semua';
          $('#qProduk').value = ''; $('#fStatus').value = 'semua';
          isi(); $('#qProduk').focus();
        });
      } else {
        const kolomStok = semuaGudang ? 'Stok semua gudang' : `Stok ${pendekGudang(gudangAktif)}`;
        wadah.innerHTML = `
          <div class="table-wrap"><table class="data">
            <thead><tr><th scope="col">Kode</th><th scope="col">Spesifikasi</th><th scope="col" class="r">${esc(kolomStok)}</th><th scope="col" class="r">Minimum</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Aksi</span></th></tr></thead>
            <tbody>${hasil.slice(0, batasProduk).map((p) => {
              const s = semuaGudang ? null : barisStok(p.kode, gudangAktif);
              const st = semuaGudang ? statusGabungan(p.kode) : statusDari(s.jumlah, s.min);
              const kolomJumlah = semuaGudang
                ? `<strong>${nf.format(totalStok(p.kode))}</strong> <span class="muted">${SATUAN}</span><p class="rincian num">${rincianStok(p.kode)}</p>`
                : `<strong>${nf.format(s.jumlah)}</strong> <span class="muted">${SATUAN}</span>`;
              const kolomMin = semuaGudang ? '<span class="muted">per gudang</span>' : (s.min > 0 ? nf.format(s.min) : '<span class="muted">–</span>');
              return `
              <tr>
                <td data-label="Kode"><span class="kode">${esc(p.kode)}</span></td>
                <td data-label="Spesifikasi" class="stack">${specHTML(p)}${p.catatan ? `<p class="catatan"><strong>Catatan:</strong> ${esc(p.catatan)}</p>` : ''}</td>
                <td data-label="${esc(kolomStok)}" class="r num">${kolomJumlah}</td>
                <td data-label="Minimum" class="r num">${kolomMin}</td>
                <td data-label="Status">${produkArsip ? `<span class="tx-status cancelled">Arsip</span><p class="small muted">${esc(waktuLengkap(p.diarsipkan))}</p>` : badge(st)}</td>
                <td class="r act"><div class="product-actions">${produkArsip ? '' : `<a class="btn btn-secondary btn-sm" href="#/transaksi?kode=${encodeURIComponent(p.kode)}">Catat transaksi</a>`}<button type="button" class="btn ${produkArsip ? 'btn-secondary' : 'btn-quiet'} btn-sm" data-product="${esc(p.kode)}" aria-label="${produkArsip ? 'Buka arsip' : 'Hapus produk'} ${esc(p.kode)}">${produkArsip ? 'Buka arsip' : 'Hapus'}</button></div></td>
              </tr>`; }).join('')}
            </tbody>
          </table></div>${tombolTampilLagi(Math.min(batasProduk, hasil.length), hasil.length, 'produkTampilLagi')}`;
      }
      $$('[data-tambah]', wadah).forEach((b) => b.addEventListener('click', bukaFormProduk));
    };

    const cariTertunda = tunda(() => { batasProduk = LANGKAH_TAMPIL; isi(); });
    $('#qProduk').addEventListener('input', (e) => { qProduk = e.target.value; cariTertunda(); });
    $('#fStatus').addEventListener('change', (e) => { filterStatus = e.target.value; batasProduk = LANGKAH_TAMPIL; isi(); });
    $('#produkMode').addEventListener('change', e => {
      produkArsip = e.target.value === 'arsip';
      history.replaceState(null, '', '#/produk');
      viewProduk(main, new URLSearchParams()); $('#produkMode').focus();
    });
    $('#produkIsi').addEventListener('click', (e) => {
      if (e.target.closest('#produkTampilLagi')) { batasProduk += LANGKAH_TAMPIL; isi(); }
      const action = e.target.closest('[data-product]');
      if (action) bukaProdukAksi(action.dataset.product);
    });
    $('#btnTambah').addEventListener('click', bukaFormProduk);
    isi();

    if (params.get('tambah') === '1') {
      history.replaceState(null, '', '#/produk');
      bukaFormProduk();
    }
  }

  let produkAksiAktif;
  function bukaProdukAksi(kode, batas = 20) {
    try { state = dataTerbaru(); bangunIndeks(); }
    catch (err) { toast(esc(err.message)); return; }
    const p = cariProduk(kode);
    if (!p) { toast('Produk sudah berubah atau dihapus. Buka daftar terbaru.'); route(); return; }
    produkAksiAktif = kode;
    const archived = p.status === 'arsip';
    const tx = state.transaksi.filter(t => t.kode === kode).sort((a, b) => b.waktu.localeCompare(a.waktu));
    const zero = stokProduk(kode).length === 3 && stokProduk(kode).every(s => s.jumlah === 0);
    const dlg = $('#dlgProdukAksi'), host = $('#produkAksiIsi');
    const requestId = idPermintaan();
    let receipt = '', busy = false;
    host.innerHTML = `<div class="sheet-head"><div><h2 id="produkAksiJudul" tabindex="-1">${archived ? 'Arsip produk' : tx.length ? 'Unduh rekap sebelum mengarsipkan' : 'Hapus produk'}</h2><p class="small muted">${esc(kode)}</p></div><button type="button" class="icon-btn" data-close aria-label="Tutup produk">&times;</button></div>
      <div class="sheet-body"><div class="id-line"><strong class="kode">${esc(kode)}</strong>${specHTML(p)}</div>${p.catatan ? `<p class="catatan">Catatan: ${esc(p.catatan)}</p>` : ''}
        <div class="archive-info"><p><strong>Stok seluruh gudang</strong></p><p class="num">${GUDANG.map(g => `${esc(g.nama)}: ${nf.format(barisStok(kode, g.kode)?.jumlah || 0)}`).join(' · ')} ${SATUAN}</p>
        <p>${archived ? `Diarsipkan ${esc(waktuLengkap(p.diarsipkan))} oleh ${esc(p.pengarsip)}. Pulihkan untuk mencatat atau mengoreksi transaksi pada produk yang sama.` : !zero ? 'Produk belum bisa dihapus atau diarsipkan. Stok harus nol di ketiga gudang. Selesaikan pencatatan barang sesuai kondisi fisik terlebih dahulu.' : tx.length ? 'Riwayat produk tetap tersimpan setelah diarsipkan. Unduh rekap seluruh periode terlebih dahulu, lalu pilih Arsipkan.' : 'Produk ini belum pernah mempunyai transaksi. Penghapusan bersifat permanen.'}</p></div>
        <p class="small muted">Rekap memuat tanggal/jam WIB, produk, gudang, jumlah, catatan, pencatat, dan status. Transaksi dibatalkan tetap disertakan.</p>
        <p class="small" id="produkAksiStatus" role="status"></p><p class="field-error" id="produkAksiError" role="alert" tabindex="-1" hidden></p>
        <h3>Riwayat transaksi (${tx.length})</h3><ol class="archive-history">${tx.slice(0, batas).map(t => `<li><strong>${esc(waktuLengkap(t.waktu))} · ${esc(jenisLabel(t))}</strong><p>${esc(lokasiTransaksi(t))} · ${nf.format(t.jumlah)} ${SATUAN} · ${statusTransaksi(t)}</p><p class="small muted">${esc(t.catatan || 'Tanpa catatan')} · ${esc(pelakuTransaksi(t))}</p></li>`).join('')}</ol>${tx.length > batas ? '<button type="button" class="btn btn-secondary" id="produkRiwayatLagi">Tampilkan riwayat berikutnya</button>' : !tx.length ? '<p class="muted small">Belum ada transaksi.</p>' : ''}
      </div><div class="sheet-foot"><button type="button" class="btn btn-secondary" data-close>Batal</button>${tx.length ? '<button type="button" class="btn btn-secondary" id="produkUnduh">Unduh rekap</button>' : ''}${zero ? `<button type="button" class="btn ${archived ? 'btn-primary' : 'btn-danger'}" id="produkKonfirmasi" ${!archived && tx.length ? 'disabled' : ''}>${archived ? 'Pulihkan produk' : tx.length ? 'Arsipkan' : 'Hapus permanen'}</button>` : ''}</div>`;
    const error = message => { const box = $('#produkAksiError'); box.textContent = message; box.hidden = false; box.focus(); };
    const confirm = $('#produkKonfirmasi'), download = $('#produkUnduh');
    const current = () => dlg.open && $('#produkAksiIsi') === host && host.dataset.request === requestId;
    host.dataset.request = requestId;
    download?.addEventListener('click', async () => {
      if (busy) return; busy = true; download.disabled = true;
      if (confirm) confirm.disabled = true;
      $('#produkAksiError').hidden = true;
      try {
        const snapshot = dataTerbaru();
        const stamp = productFingerprint(snapshot, kode);
        await unduhExcel(productExportData(snapshot, kode));
        if (!current()) return;
        receipt = stamp;
        $('#produkAksiStatus').textContent = 'Unduhan sudah dimulai. Pastikan file tersimpan sebelum melanjutkan. Jika data berubah, unduh rekap terbaru.';
      } catch (err) { if (current()) error(err.message); }
      finally {
        busy = false;
        if (current()) { download.disabled = false; if (confirm) confirm.disabled = !archived && tx.length > 0 && !receipt; }
      }
    });
    confirm?.addEventListener('click', async () => {
      if (busy || confirm.disabled) return;
      busy = true; confirm.disabled = true; if (download) download.disabled = true;
      try {
        await simpanPerubahan(latest => applyProductAction(latest, { action: archived ? 'restore' : tx.length ? 'archive' : 'delete', kode, version: p.version || 0, requestId, receipt }, { actor: PELAKU_DEMO, now: new Date().toISOString() }));
        if (current()) dlg.close();
        route(); toast(archived ? 'Produk dipulihkan. Kode dan riwayat tetap sama; stok tetap nol.' : tx.length ? 'Produk diarsipkan. Buka Arsip produk untuk melihat riwayat atau memulihkannya.' : 'Produk tanpa transaksi dihapus permanen.');
      } catch (err) {
        if (current()) { receipt = ''; error(err.message); confirm.disabled = !archived && tx.length > 0; if (download) download.disabled = false; }
      } finally { busy = false; }
    });
    $('#produkRiwayatLagi')?.addEventListener('click', () => bukaProdukAksi(kode, batas + 20));
    if (!dlg.open) dlg.showModal();
    $('#produkAksiJudul').focus();
  }

  $('#dlgProdukAksi').addEventListener('close', () => {
    const trigger = $$('[data-product]').find(b => b.dataset.product === produkAksiAktif) || $('#produkMode');
    trigger?.focus({ preventScroll: true });
  });

  /* ================= form tambah produk ================= */

  const formProduk = $('#formProduk');
  const ATURAN_PRODUK = [
    ['tipe', (v) => (v.tipe ? '' : 'Isi tipe produk, contoh FA.')],
    ['lebar', (v) => (angkaPositif(v.lebar) ? '' : 'Isi lebar dalam mm, contoh 5.')],
    ['tebal', (v) => (angkaPositif(v.tebal) ? '' : 'Isi tebal dalam mm, contoh 0,42.')],
    ['panjang', (v) => (angkaPositif(v.panjang) ? '' : 'Isi panjang gulungan dalam meter, contoh 6000.')],
    ['berat', (v) => (angkaPositif(v.berat) ? '' : 'Isi berat gulungan dalam kg, contoh 10.')],
    ['warna', (v) => (v.warna ? '' : 'Isi warna, contoh Putih.')],
    ['merek', (v) => (v.merek ? '' : 'Isi merek, contoh TOYO.')],
    ['min', (v) => (/^\d+$/.test(v.min) && Number(v.min) > 0 ? '' : 'Isi stok minimum dengan angka bulat lebih dari 0, contoh 10.')],
  ];

  function nilaiForm() {
    const g = (n) => formProduk.elements[n].value.trim();
    return {
      tipe: g('tipe').toUpperCase().replace(/\s+/g, ''),
      lebar: g('lebar'), tebal: g('tebal'), panjang: g('panjang'), berat: g('berat'),
      warna: kapital(g('warna')), merek: g('merek').toUpperCase(), catatan: g('catatan'),
      gudang: g('gudang'), min: g('min'),
    };
  }
  const angkaAtauKosong = (s) => (angkaPositif(s) ? parseAngka(s) : '');

  function perbaruiPratinjau() {
    const v = nilaiForm();
    const calon = { ...v, lebar: angkaAtauKosong(v.lebar), tebal: angkaAtauKosong(v.tebal), panjang: angkaAtauKosong(v.panjang), berat: angkaAtauKosong(v.berat) };
    $('#pratinjauSpec').innerHTML = specHTML(calon);
    $('#pratinjauKode').textContent = v.tipe ? kodeBerikut(v.tipe) : 'kode menunggu tipe';

    const lengkap = calon.tipe && calon.warna && calon.merek && [calon.lebar, calon.tebal, calon.panjang, calon.berat].every((x) => x !== '');
    const kembar = lengkap ? state.produk.find((p) => kunciProduk(p) === kunciProduk(calon)) : null;
    const box = $('#dupBox');
    if (kembar) {
      const baruMuncul = box.hidden;
      box.hidden = false;
      if (baruMuncul) {
        const halus = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        box.scrollIntoView({ block: 'nearest', behavior: halus ? 'smooth' : 'auto' });
      }
      $('#dupIsi').innerHTML = `<div class="id-line"><span class="kode">${esc(kembar.kode)}</span>${specHTML(kembar)}</div><p class="small num">Stok saat ini: ${rincianStok(kembar.kode)}.</p>`;
      $('#dupPakai').href = kembar.status === 'arsip' ? '#/produk?arsip=1' : `#/transaksi?jenis=masuk&kode=${encodeURIComponent(kembar.kode)}&gudang=${encodeURIComponent(v.gudang)}`;
      $('#dupPakai').textContent = kembar.status === 'arsip' ? 'Buka Arsip untuk memulihkan produk ini' : 'Catat barang masuk ke produk ini';
    } else {
      box.hidden = true;
      $('#dupOverride').checked = false;
      $('#dupPesan').hidden = true;
    }
  }

  function isiDatalist() {
    const gudangForm = formProduk.elements.gudang.value;
    const merekGudang = (infoGudang(gudangForm) || {}).merek || [];
    const merekLain = [...new Set(state.produk.map((p) => p.merek).concat(GUDANG.flatMap((g) => g.merek)))]
      .filter((m) => m && !merekGudang.includes(m)).sort();
    const unik = (k) => [...new Set(state.produk.map((p) => p[k]).filter(Boolean))].sort();
    $('#dlTipe').innerHTML = unik('tipe').map((v) => `<option value="${esc(v)}">`).join('');
    $('#dlWarna').innerHTML = unik('warna').map((v) => `<option value="${esc(v)}">`).join('');
    // Merek yang ada di gudang terpilih ditaruh paling atas: saran, bukan larangan.
    $('#dlMerek').innerHTML = merekGudang.concat(merekLain).map((v) => `<option value="${esc(v)}">`).join('');
  }

  function bukaFormProduk() {
    formProduk.reset();
    $('button[type="submit"]', formProduk).disabled = false;
    $('#produkSimpanError').hidden = true;
    $$('.field-error', formProduk).forEach((e) => { e.hidden = true; });
    $$('[aria-invalid]', formProduk).forEach((e) => e.removeAttribute('aria-invalid'));
    const selGudang = formProduk.elements.gudang;
    selGudang.innerHTML = GUDANG.map((g) => `<option value="${g.kode}">Gudang ${esc(g.nama)}</option>`).join('');
    selGudang.value = gudangAktif === SEMUA ? GUDANG[0].kode : gudangAktif;
    isiDatalist();
    perbaruiPratinjau();
    $('#dlgProduk').showModal();
    $('#fTipe').focus();
  }

  formProduk.addEventListener('input', (e) => {
    const nama = e.target.name;
    if (nama && e.target.getAttribute('aria-invalid')) {
      e.target.removeAttribute('aria-invalid');
      const err = $(`#err-${nama}`);
      if (err) err.hidden = true;
    }
    if (e.target.id === 'dupOverride') $('#dupPesan').hidden = true;
    perbaruiPratinjau();
  });
  formProduk.addEventListener('change', (e) => {
    if (e.target.name === 'gudang') { isiDatalist(); perbaruiPratinjau(); }
  });
  $('#dupPakai').addEventListener('click', () => $('#dlgProduk').close());

  formProduk.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = nilaiForm();
    let salahPertama = null;
    ATURAN_PRODUK.forEach(([nama, cek]) => {
      const pesan = cek(v);
      const input = formProduk.elements[nama];
      const err = $(`#err-${nama}`);
      if (pesan) {
        err.textContent = pesan; err.hidden = false;
        input.setAttribute('aria-invalid', 'true');
        salahPertama = salahPertama || input;
      } else {
        err.hidden = true; input.removeAttribute('aria-invalid');
      }
    });
    if (salahPertama) { salahPertama.focus(); return; }

    if (!$('#dupBox').hidden && !$('#dupOverride').checked) {
      $('#dupPesan').hidden = false;
      $('#dupOverride').focus();
      return;
    }

    const submit = $('button[type="submit"]', formProduk);
    if (submit.disabled) return;
    submit.disabled = true;
    const baru = {
      tipe: v.tipe,
      lebar: parseAngka(v.lebar), tebal: parseAngka(v.tebal), panjang: parseAngka(v.panjang), berat: parseAngka(v.berat),
      warna: v.warna, merek: v.merek, catatan: v.catatan,
    };
    try {
      await simpanPerubahan(latest => {
        const duplicate = latest.produk.some(p => kunciProduk(p) === kunciProduk(baru));
        if (duplicate && !$('#dupOverride').checked) throw new Error('Produk dengan spesifikasi ini sudah ada. Periksa daftar terbaru sebelum menyimpan.');
        baru.kode = kodeBerikut(v.tipe, latest);
        return { ...latest, produk: [...latest.produk, baru], stok: [...latest.stok, ...GUDANG.map(g => ({ produk: baru.kode, gudang: g.kode, jumlah: 0, min: g.kode === v.gudang ? parseInt(v.min, 10) : 0 }))] };
      });
    } catch (err) {
      $('#produkSimpanError').textContent = err.message; $('#produkSimpanError').hidden = false; submit.disabled = false;
      return;
    }
    $('#dlgProduk').close();
    route();
    toast(`Produk <strong>${esc(baru.kode)}</strong> tersimpan di ${esc(namaGudang(v.gudang))}. Stok awalnya 0 ${SATUAN}.`,
      { href: `#/transaksi?jenis=masuk&kode=${encodeURIComponent(baru.kode)}&gudang=${encodeURIComponent(v.gudang)}`, label: 'Catat barang masuk' });
  });

  /* ================= halaman: catat transaksi ================= */

  function viewTransaksi(main, params) {
    const dariLaporan = params.get('laporan') === '1';
    const requestId = idPermintaan();
    let dipilih = params.get('kode') ? cariProduk(params.get('kode')) || null : null;
    if (dipilih?.status === 'arsip') { dipilih = null; toast('Pulihkan produk dari Arsip sebelum mencatat transaksi.'); }
    const jenisParam = params.get('jenis');
    const jenisAwal = ['masuk', 'keluar', 'pindah'].includes(jenisParam) ? jenisParam : 'masuk';
    const gudangParam = params.get('gudang');
    const gudangAwal = GUDANG.some((g) => g.kode === gudangParam) ? gudangParam : (gudangAktif === SEMUA ? '' : gudangAktif);

    const opsiGudang = (terpilih) => GUDANG
      .map((g) => `<option value="${g.kode}" ${g.kode === terpilih ? 'selected' : ''}>Gudang ${esc(g.nama)}</option>`).join('');

    main.innerHTML = `
      <div class="page-head">
        <div>${dariLaporan ? '<h2 id="laporanFormJudul">Tambah transaksi dari Laporan</h2>' : '<h1 tabindex="-1">Catat transaksi</h1>'}<p>Data contoh lokal. Pencatat: ${PELAKU_DEMO}.</p></div>
        ${dariLaporan ? '<button type="button" class="icon-btn" data-close aria-label="Tutup">&times;</button>' : ''}
      </div>
      <div class="tx-layout">
        <form class="panel tx-form" id="txForm" novalidate>
          <fieldset class="seg seg-3">
            <legend>Jenis transaksi</legend>
            <label><input type="radio" name="jenis" value="masuk" ${jenisAwal === 'masuk' ? 'checked' : ''}><span>${IKON.masuk}Barang masuk</span></label>
            <label><input type="radio" name="jenis" value="keluar" ${jenisAwal === 'keluar' ? 'checked' : ''}><span>${IKON.keluar}Barang keluar</span></label>
            <label><input type="radio" name="jenis" value="pindah" ${jenisAwal === 'pindah' ? 'checked' : ''}><span>${IKON.pindah}Pindah gudang</span></label>
          </fieldset>

          <div class="form-grid">
            <div class="field">
              <label for="txGudang" id="lblGudang">Gudang</label>
              <select class="input" id="txGudang" aria-describedby="err-gudang">
                <option value="">Pilih gudang…</option>
                ${opsiGudang(gudangAwal)}
              </select>
              <p class="field-error" id="err-gudang" hidden>Pilih gudang dulu.</p>
            </div>
            <div class="field" id="txTujuanField" hidden>
              <label for="txTujuan">Ke gudang</label>
              <select class="input" id="txTujuan" aria-describedby="err-tujuan">
                <option value="">Pilih gudang tujuan…</option>
                ${opsiGudang('')}
              </select>
              <p class="field-error" id="err-tujuan" hidden></p>
            </div>
          </div>

          <div class="field">
            <label for="txCari">Produk</label>
            <div id="txPilihan"></div>
            <p class="field-error" id="err-produk" hidden>Pilih produk dulu. Ketik kode atau ukurannya, lalu klik produknya.</p>
          </div>

          <div class="field">
            <label for="txJumlah">Jumlah</label>
            <div class="stepper">
              <button type="button" data-step="-1" aria-label="Kurangi satu">−</button>
              <input class="input num" id="txJumlah" inputmode="numeric" value="1" autocomplete="off" aria-describedby="err-jumlah">
              <span class="unit">${SATUAN}</span>
              <button type="button" data-step="1" aria-label="Tambah satu">+</button>
            </div>
            <p class="field-error" id="err-jumlah" hidden></p>
          </div>

          <div class="field" id="txCatatanField" hidden>
            <label for="txCatatan">Catatan <span class="opt">(boleh kosong)</span></label>
            <textarea class="input" id="txCatatan" name="catatan" rows="3" maxlength="300" placeholder="Contoh: kirim ke pelanggan atau alasan pindah gudang" aria-describedby="txCatatanBantuan"></textarea>
            <p class="muted small" id="txCatatanBantuan">Maksimal 300 karakter. Catatan akan tampil di riwayat transaksi.</p>
          </div>

          <div id="txPreview" aria-live="polite"></div>
          <p class="field-error" id="txSimpanError" role="alert" hidden></p>

          <div class="form-foot">
            <p class="muted small">Waktu transaksi dicatat otomatis saat disimpan.</p>
            <button type="submit" class="btn btn-primary btn-lg" id="txSubmit">Simpan barang masuk</button>
          </div>
        </form>

        <section class="panel" aria-labelledby="hTerakhir">
          <div class="panel-head"><h2 id="hTerakhir">Baru dicatat</h2></div>
          <div id="txTerakhir"></div>
          <div class="panel-foot"><a href="#/riwayat">Lihat semua riwayat</a></div>
        </section>
      </div>`;

    const f = $('#txForm');
    const inputJumlah = $('#txJumlah');
    const inputCatatan = $('#txCatatan');
    const selGudang = $('#txGudang');
    const selTujuan = $('#txTujuan');
    const jenis = () => f.elements.jenis.value;
    const jumlahValid = () => /^\d+$/.test(inputJumlah.value.trim()) && parseInt(inputJumlah.value, 10) > 0;
    const stokAsal = () => (dipilih && selGudang.value ? barisStok(dipilih.kode, selGudang.value) : null);

    function renderJenis() {
      const pindah = jenis() === 'pindah';
      const bisaCatat = jenis() === 'keluar' || pindah;
      $('#txTujuanField').hidden = !pindah;
      $('#txCatatanField').hidden = !bisaCatat;
      inputCatatan.placeholder = pindah
        ? 'Contoh: dipindah untuk persiapan pengiriman besok'
        : 'Contoh: dikirim ke pelanggan area Tangerang';
      $('#lblGudang').textContent = pindah ? 'Dari gudang' : 'Gudang';
      $('#txSubmit').textContent = { masuk: 'Simpan barang masuk', keluar: 'Simpan barang keluar', pindah: 'Simpan pindah gudang' }[jenis()];
    }

    function renderPilihan() {
      const wadah = $('#txPilihan');
      if (dipilih) {
        const s = stokAsal();
        wadah.innerHTML = `
          <div class="picked">
            <div>
              <div class="id-line"><span class="kode">${esc(dipilih.kode)}</span>${specHTML(dipilih)}</div>
              <p class="muted small num">${s ? `Stok ${esc(pendekGudang(selGudang.value))} sekarang ${nf.format(s.jumlah)} ${SATUAN}` : `Stok semua gudang: ${rincianStok(dipilih.kode)}`}</p>
            </div>
            <button type="button" class="btn btn-secondary btn-sm" id="txGanti">Ganti produk</button>
          </div>`;
        $('#txGanti').addEventListener('click', () => {
          dipilih = null; renderPilihan(); renderPreview(); $('#txCari').focus();
        });
        return;
      }
      wadah.innerHTML = `
        <input class="input" id="txCari" type="search" autocomplete="off" placeholder="Ketik kode, ukuran, warna…" aria-describedby="err-produk">
        <ul class="results" id="txHasil" aria-label="Hasil pencarian produk"></ul>`;
      const cari = $('#txCari');
      const hasilEl = $('#txHasil');
      const tampil = () => {
        if (!cari.value.trim()) { hasilEl.innerHTML = ''; return; }
        const hasil = saringProduk(cari.value).slice(0, 6);
        hasilEl.innerHTML = hasil.length
          ? hasil.map((p) => {
              const s = selGudang.value ? barisStok(p.kode, selGudang.value) : null;
              const ket = s ? `stok ${pendekGudang(selGudang.value)} ${nf.format(s.jumlah)}` : rincianStok(p.kode);
              return `<li><button type="button" data-kode="${esc(p.kode)}"><span class="id-line"><span class="kode">${esc(p.kode)}</span>${specHTML(p)}</span><span class="muted small num">${esc(ket)}</span></button></li>`;
            }).join('')
          : '<li class="no-result">Tidak ada produk yang cocok. Belum terdaftar? <a href="#/produk?tambah=1">Tambah produk</a></li>';
      };
      cari.addEventListener('input', tampil);
      cari.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); const b = $('button', hasilEl); if (b) b.click(); }
        if (e.key === 'ArrowDown') { e.preventDefault(); const b = $('button', hasilEl); if (b) b.focus(); }
      });
      hasilEl.addEventListener('keydown', (e) => {
        const tombol = $$('button', hasilEl);
        const i = tombol.indexOf(document.activeElement);
        if (e.key === 'ArrowDown' && i < tombol.length - 1) { e.preventDefault(); tombol[i + 1].focus(); }
        if (e.key === 'ArrowUp') { e.preventDefault(); (i > 0 ? tombol[i - 1] : cari).focus(); }
      });
      hasilEl.addEventListener('click', (e) => {
        const b = e.target.closest('button[data-kode]');
        if (!b) return;
        dipilih = cariProduk(b.dataset.kode);
        $('#err-produk').hidden = true;
        renderPilihan(); renderPreview();
        inputJumlah.focus(); inputJumlah.select();
      });
    }

    // KF-08 + KF-11: keluar dan pindah ditolak kalau stok gudang asal tidak cukup.
    function renderPreview() {
      const box = $('#txPreview');
      const j = jenis();
      let tolak = false;

      if (!dipilih || !jumlahValid() || !selGudang.value || (j === 'pindah' && !selTujuan.value)) {
        box.className = 'preview';
        box.innerHTML = '<p class="muted">Lengkapi gudang, produk, dan jumlahnya untuk melihat stok setelah transaksi.</p>';
      } else if (j === 'pindah' && selTujuan.value === selGudang.value) {
        tolak = true;
        box.className = 'preview error';
        box.innerHTML = '<p class="preview-title">Gudang tujuan sama dengan gudang asal</p><p>Pilih gudang tujuan yang berbeda.</p>';
      } else {
        const n = parseInt(inputJumlah.value, 10);
        const s = stokAsal();
        const sesudah = j === 'masuk' ? s.jumlah + n : s.jumlah - n;
        if (sesudah < 0) {
          tolak = true;
          box.className = 'preview error';
          box.innerHTML = `<p class="preview-title">Stok tidak cukup</p><p>${esc(dipilih.kode)} di ${esc(namaGudang(selGudang.value))} tinggal ${nf.format(s.jumlah)} ${SATUAN}, sedangkan jumlah ${j === 'pindah' ? 'yang dipindah' : 'keluar'} ${nf.format(n)}. Kurangi jumlahnya, atau cek dulu stok fisik di gudang.</p>`;
        } else if (j === 'pindah') {
          const sT = barisStok(dipilih.kode, selTujuan.value);
          box.className = 'preview';
          box.innerHTML = `
            <p class="muted small">Stok ${esc(dipilih.kode)} setelah dipindah</p>
            <p class="flow">${esc(pendekGudang(selGudang.value))} ${nf.format(s.jumlah)} <span class="arrow" aria-hidden="true">→</span> ${nf.format(sesudah)}</p>
            <p class="flow">${esc(pendekGudang(selTujuan.value))} ${nf.format(sT.jumlah)} <span class="arrow" aria-hidden="true">→</span> ${nf.format(sT.jumlah + n)} <span class="unit">${SATUAN}</span></p>
            <p class="small muted">Total stok produk ini tidak berubah, hanya berpindah tempat.</p>`;
        } else {
          const sBaru = statusDari(sesudah, s.min);
          box.className = 'preview';
          box.innerHTML = `
            <p class="muted small">Stok ${esc(dipilih.kode)} di ${esc(namaGudang(selGudang.value))} setelah disimpan</p>
            <p class="flow">${nf.format(s.jumlah)} <span class="arrow" aria-hidden="true">→</span><span class="sr-only">menjadi</span> ${nf.format(sesudah)} <span class="unit">${SATUAN}</span></p>
            ${sBaru === 'kritis' || sBaru === 'hampir' ? `<p class="small">Status setelah transaksi ini ${badge(sBaru)}</p>` : ''}`;
        }
      }
      $('#txSubmit').disabled = tolak;
    }

    function renderTerakhir() {
      const daftar = transaksiGudang().filter(t => t.status !== 'dibatalkan').sort((a, b) => b.waktu.localeCompare(a.waktu)).slice(0, 6);
      $('#txTerakhir').innerHTML = daftar.length
        ? `<ul class="feed">${daftar.map(barisFeed).join('')}</ul>`
        : '<div class="empty-state compact"><p>Belum ada transaksi. Transaksi yang kamu simpan akan muncul di sini.</p></div>';
    }

    $$('[data-step]', f).forEach((b) => b.addEventListener('click', () => {
      inputJumlah.value = Math.max(1, (parseInt(inputJumlah.value, 10) || 0) + Number(b.dataset.step));
      $('#err-jumlah').hidden = true;
      inputJumlah.removeAttribute('aria-invalid');
      renderPreview();
    }));
    inputJumlah.addEventListener('input', () => {
      $('#err-jumlah').hidden = true;
      inputJumlah.removeAttribute('aria-invalid');
      renderPreview();
    });
    $$('input[name="jenis"]', f).forEach((r) => r.addEventListener('change', () => { renderJenis(); renderPreview(); }));
    selGudang.addEventListener('change', () => { $('#err-gudang').hidden = true; renderPilihan(); renderPreview(); });
    selTujuan.addEventListener('change', () => { $('#err-tujuan').hidden = true; renderPreview(); });

    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const j = jenis();
      let salah = null;
      if (!selGudang.value) { $('#err-gudang').hidden = false; salah = selGudang; }
      if (j === 'pindah') {
        const err = $('#err-tujuan');
        if (!selTujuan.value) { err.textContent = 'Pilih gudang tujuan dulu.'; err.hidden = false; salah = salah || selTujuan; }
        else if (selTujuan.value === selGudang.value) { err.textContent = 'Gudang tujuan harus berbeda dari gudang asal.'; err.hidden = false; salah = salah || selTujuan; }
      }
      if (!dipilih) { $('#err-produk').hidden = false; salah = salah || $('#txCari'); }
      if (!jumlahValid()) {
        const err = $('#err-jumlah');
        err.textContent = 'Isi jumlah dengan angka bulat lebih dari 0.';
        err.hidden = false;
        inputJumlah.setAttribute('aria-invalid', 'true');
        salah = salah || inputJumlah;
      }
      if (salah) { salah.focus(); return; }

      const submit = $('#txSubmit');
      if (submit.disabled) return;
      submit.disabled = true;
      try {
        await simpanTransaksi({ action: 'add', requestId, kode: dipilih.kode, jenis: j, jumlah: Number(inputJumlah.value), gudang: selGudang.value, tujuan: selTujuan.value, catatan: j === 'masuk' ? '' : inputCatatan.value });
      } catch (err) {
        const box = $('#txSimpanError'); box.textContent = err.message; box.hidden = false;
        submit.disabled = false;
        return;
      }
      toast('Transaksi tersimpan di browser ini. Stok dan laporan diperbarui.');
      if (dariLaporan) { $('#dlgLaporanForm').close(); viewLaporan($('#view')); return; }

      dipilih = null;
      inputJumlah.value = 1;
      inputCatatan.value = '';
      renderPilihan(); renderPreview(); renderTerakhir();
      const cari = $('#txCari');
      if (cari) cari.focus();
      // Form berikutnya mendapat ID permintaan baru; event kedua dari form lama tidak dapat mencatat ulang.
      viewTransaksi(main, params);
    });

    renderJenis();
    renderPilihan();
    renderPreview();
    renderTerakhir();
  }

  /* ================= laporan dan detail transaksi (KF-16–18) ================= */

  let bulanLaporan = localDateKey(new Date()).slice(0, 7);
  let cariLaporan = '';
  let batasLaporan = LANGKAH_TAMPIL;
  let detailAktif = null;
  const jenisLabel = t => ({ masuk: 'Barang masuk', keluar: 'Keluar customer', pindah: 'Pindah gudang' }[t.jenis] || t.jenis);
  const statusTransaksi = t => t.status === 'dibatalkan' ? 'Dibatalkan' : 'Aktif';
  const waktuLengkap = iso => `${fTanggalRingkas.format(new Date(iso))}, ${fJam.format(new Date(iso))}`;
  const lokasiTransaksi = t => t.jenis === 'pindah' ? `${namaGudang(t.gudang)} → ${namaGudang(t.tujuan)}` : namaGudang(t.gudang);
  const pelakuTransaksi = t => t.pencatat || 'Belum tercatat (data lama)';
  const statusHTML = t => `<span class="tx-status ${t.status === 'dibatalkan' ? 'cancelled' : ''}">${statusTransaksi(t)}</span>`;

  function viewLaporan(main) {
    let downloading = false;
    main.innerHTML = `
      <div class="page-head">
        <div><h1 tabindex="-1">Laporan<span class="judul-gudang">${esc(judulGudang())}</span></h1><p>Rekap stok bulanan dan transaksi dari catatan yang sama.</p></div>
        <div class="report-head-actions"><button type="button" class="btn btn-secondary" id="laporanExcel" aria-describedby="laporanDownloadInfo">Unduh Excel</button><button type="button" class="btn btn-secondary" id="laporanKeTransaksi">Lihat transaksi</button><button type="button" class="btn btn-primary" id="laporanTambah">Tambah transaksi</button></div>
      </div>
      <section class="panel report-filters" aria-label="Filter laporan">
        <div class="toolbar">
          <div class="field"><label for="laporanBulan">Bulan laporan</label><input type="month" class="input" id="laporanBulan" value="${bulanLaporan}"></div>
          <div class="field search"><label for="laporanCari">Cari produk</label><input type="search" class="input" id="laporanCari" value="${esc(cariLaporan)}" placeholder="Kode, ukuran, warna, merek…"></div>
          <button type="button" class="btn btn-secondary" id="laporanReset">Reset filter</button>
        </div>
        <p class="report-context small muted" id="laporanKonteks" aria-live="polite"></p>
        <p class="report-context small muted" id="laporanDownloadInfo">Excel memuat Rekap Bulanan dan Detail Transaksi, mengikuti semua hasil filter.</p>
        <p class="report-context field-error" id="laporanExcelError" role="alert" hidden></p>
      </section>
      <section class="panel report-section" aria-labelledby="rekapJudul">
        <div class="panel-head"><h2 id="rekapJudul">Rekap stok bulanan</h2><span class="small muted">Satuan: gulungan</span></div>
        <p class="report-context small muted">Stok awal dan akhir mengikuti periode laporan. Stok saat ini tersedia di Dashboard. Pindahan dicatat terpisah dari keluar ke customer.</p>
        <div id="laporanRekap"></div>
        <p class="report-context small muted">Data contoh. Rekap memakai transaksi aktif beserta koreksi yang tersimpan sekarang. Aturan koreksi bulan lampau masih dibahas.</p>
      </section>
      <section class="panel report-section" aria-labelledby="detailDaftarJudul">
        <div class="panel-head"><h2 id="detailDaftarJudul" tabindex="-1">Detail Transaksi</h2><span class="small muted" id="laporanJumlah"></span></div>
        <p class="report-context small muted">Buka transaksi untuk melihat catatan, pencatat, serta jejak edit dan pembatalannya.</p>
        <div id="laporanTransaksi"></div>
      </section>
      <p class="report-limit small muted">Prototipe lokal di browser ini; belum menggunakan akun atau database bersama. Jejak perubahan dapat dibaca melalui Detail Transaksi di website.</p>`;

    function isi() {
      const cocok = new Set(saringProduk(cariLaporan, true).map(p => p.kode));
      const valid = /^\d{4}-(0[1-9]|1[0-2])$/.test(bulanLaporan) && bulanLaporan <= localDateKey(new Date()).slice(0, 7);
      const rows = valid ? monthlyReport(state, bulanLaporan, gudangAktif).filter(r => cocok.has(r.kode)) : [];
      const tx = valid ? transaksiGudang().filter(t => localDateKey(t.waktu).slice(0, 7) === bulanLaporan && cocok.has(t.kode)).sort((a, b) => b.waktu.localeCompare(a.waktu)) : [];
      $('#laporanExcel').disabled = downloading || (!rows.length && !tx.length);
      const periode = valid ? fBulanTahun.format(tanggalDariKey(`${bulanLaporan}-01`)) : 'Pilih bulan yang sudah berlangsung';
      $('#laporanKonteks').textContent = `${periode} · ${labelGudang(gudangAktif)}${cariLaporan.trim() ? ` · pencarian “${cariLaporan.trim()}”` : ''}.`;
      const saldo = n => n == null ? '<span class="muted small">Belum tersedia</span>' : nf.format(n);
      $('#laporanRekap').innerHTML = rows.length ? `<div class="table-wrap" tabindex="0" role="region" aria-label="Tabel rekap stok, geser untuk melihat semua kolom"><table class="data report-table rekap-table">
        <thead><tr><th scope="col">Produk</th><th scope="col">Gudang</th>${['Stok awal', 'Masuk', 'Pindah masuk', 'Keluar customer', 'Pindah keluar', 'Stok akhir'].map(s => `<th scope="col" class="r">${s}</th>`).join('')}</tr></thead>
        <tbody>${rows.slice(0, batasLaporan).map(r => `<tr><td data-label="Produk"><span class="kode">${esc(r.kode)}</span><p class="small muted">${esc(specTeks(cariProduk(r.kode)))}</p></td><td data-label="Gudang">${tagGudang(r.gudang)}</td>${[['awal', 'Stok awal'], ['masuk', 'Masuk'], ['pindahMasuk', 'Pindah masuk'], ['keluar', 'Keluar customer'], ['pindahKeluar', 'Pindah keluar'], ['akhir', 'Stok akhir']].map(([k, label]) => `<td class="r num" data-label="${label}">${saldo(r[k])}</td>`).join('')}</tr>`).join('')}</tbody>
        </table></div>${tombolTampilLagi(Math.min(batasLaporan, rows.length), rows.length, 'rekapLagi')}` : '<div class="empty-state compact"><h3>Tidak ada rekap di pilihan ini</h3><p>Ubah bulan, gudang, atau pencarian. Gunakan Reset filter untuk kembali ke bulan ini dan semua gudang.</p></div>';
      $('#laporanJumlah').textContent = `${tx.length} transaksi`;
      $('#laporanTransaksi').innerHTML = tx.length ? `<div class="table-wrap"><table class="data report-transactions">
        <thead><tr><th scope="col">Tanggal / jam</th><th scope="col">Produk</th><th scope="col">Jenis / gudang</th><th scope="col" class="r">Jumlah</th><th scope="col">Status</th><th scope="col">Detail</th></tr></thead>
        <tbody>${tx.slice(0, batasLaporan).map(t => `<tr>
          <td data-label="Waktu" class="small">${esc(waktuLengkap(t.waktu))}</td>
          <td data-label="Produk"><span class="kode">${esc(t.kode)}</span><p class="small muted">${esc(specTeks(cariProduk(t.kode) || {}))}</p></td>
          <td data-label="Transaksi">${esc(jenisLabel(t))}<p class="small muted">${esc(lokasiTransaksi(t))}</p></td>
          <td data-label="Jumlah" class="r num"><strong>${nf.format(t.jumlah)}</strong> <span class="small muted">${SATUAN}</span></td>
          <td data-label="Status">${statusHTML(t)}</td>
          <td class="act"><button type="button" class="btn btn-secondary btn-sm" data-detail="${t.id}" aria-label="Buka transaksi ${t.id}, ${esc(t.kode)}">Buka detail</button></td>
        </tr>`).join('')}</tbody></table></div>${tombolTampilLagi(Math.min(batasLaporan, tx.length), tx.length, 'transaksiLagi')}` : '<div class="empty-state compact"><h3>Tidak ada transaksi yang cocok</h3><p>Belum ada transaksi untuk bulan, gudang, dan pencarian ini.</p></div>';
    }
    $('#laporanBulan').addEventListener('change', e => { bulanLaporan = e.target.value; batasLaporan = LANGKAH_TAMPIL; isi(); });
    const cariTertunda = tunda(isi);
    $('#laporanCari').addEventListener('input', e => { cariLaporan = e.target.value; batasLaporan = LANGKAH_TAMPIL; cariTertunda(); });
    $('#laporanReset').addEventListener('click', () => {
      bulanLaporan = localDateKey(new Date()).slice(0, 7); cariLaporan = ''; gudangAktif = SEMUA; batasLaporan = LANGKAH_TAMPIL;
      try { localStorage.setItem(KUNCI_GUDANG, gudangAktif); } catch (err) { /* hanya preferensi */ }
      renderPilihGudang(); viewLaporan(main); $('#laporanBulan').focus();
    });
    $('#laporanTambah').addEventListener('click', () => {
      viewTransaksi($('#laporanFormIsi'), new URLSearchParams({ laporan: '1' }));
      $('#dlgLaporanForm').showModal();
    });
    $('#laporanKeTransaksi').addEventListener('click', () => {
      $('#detailDaftarJudul').scrollIntoView({ block: 'start' }); $('#detailDaftarJudul').focus({ preventScroll: true });
    });
    $('#laporanExcel').addEventListener('click', async () => {
      if (downloading) return;
      const button = $('#laporanExcel');
      const errorBox = $('#laporanExcelError');
      downloading = true; button.disabled = true; button.textContent = 'Membuat Excel…'; errorBox.hidden = true;
      try {
        state = dataTerbaru(); bangunIndeks();
        const data = { ...reportExportData(state, bulanLaporan, gudangAktif, saringProduk(cariLaporan, true).map(p => p.kode)), month: bulanLaporan, gudang: gudangAktif, search: cariLaporan };
        await unduhExcel(data);
        toast('Unduhan Excel dimulai, mengikuti filter saat tombol ditekan. Pastikan file tersimpan.');
      } catch (error) {
        errorBox.textContent = error.message; errorBox.hidden = false;
      } finally {
        downloading = false; button.textContent = 'Unduh Excel';
        if (button.isConnected) isi();
      }
    });
    function onKlikLaporan(e) {
      const detail = e.target.closest('[data-detail]');
      if (detail) bukaDetail(Number(detail.dataset.detail));
      if (e.target.closest('#rekapLagi, #transaksiLagi')) { batasLaporan += LANGKAH_TAMPIL; isi(); }
    }
    $('#laporanTransaksi').addEventListener('click', onKlikLaporan);
    $('#laporanRekap').addEventListener('click', onKlikLaporan);
    isi();
  }

  function bukaDetail(id, mode = '', batasJejak = 20) {
    const t = state.transaksi.find(t => t.id === id);
    if (!t) return;
    detailAktif = id;
    const dlg = $('#dlgDetail');
    const p = cariProduk(t.kode);
    const jejak = [...(t.jejak || [])].reverse();
    const dibatalkan = t.status === 'dibatalkan';
    if (p?.status === 'arsip') mode = '';
    $('#detailIsi').innerHTML = `
      <div class="sheet-head"><div><h2 id="detailJudul" tabindex="-1">Transaksi #${t.id}</h2><p class="small muted">${esc(jenisLabel(t))} · ${esc(waktuLengkap(t.waktu))}</p></div><button type="button" class="icon-btn" data-close aria-label="Tutup detail">&times;</button></div>
      <div class="sheet-body">
        <div class="id-line"><strong class="kode">${esc(t.kode)}</strong>${statusHTML(t)}</div>
        ${p ? `<p class="detail-spec">${specHTML(p)}</p>${p.status === 'arsip' ? '<p class="archive-info">Produk diarsipkan. Pulihkan dari Arsip produk sebelum mengoreksi transaksi.</p>' : ''}` : '<p>Produk tidak ditemukan.</p>'}
        <dl class="detail-fields"><div><dt>Gudang</dt><dd>${esc(lokasiTransaksi(t))}</dd></div><div><dt>Jumlah</dt><dd class="num">${nf.format(t.jumlah)} ${SATUAN}</dd></div><div><dt>Catatan</dt><dd>${esc(t.catatan || 'Tidak ada catatan')}</dd></div><div><dt>Pencatat</dt><dd>${esc(pelakuTransaksi(t))}</dd></div></dl>
        ${mode ? `<form id="detailForm" class="detail-editor" novalidate>
          <h3>${mode === 'edit' ? 'Edit transaksi' : 'Batalkan transaksi'}</h3>
          ${mode === 'edit' ? `<p class="small muted">Koreksi jumlah atau catatan pada transaksi yang sama. Produk, gudang, dan waktu tetap.</p><div class="field"><label for="detailJumlah">Jumlah (${SATUAN})</label><input class="input" id="detailJumlah" inputmode="numeric" value="${t.jumlah}" aria-describedby="detailError"></div><div class="field"><label for="detailCatatan">Catatan <span class="opt">(boleh kosong)</span></label><textarea class="input" id="detailCatatan" maxlength="300" rows="3">${esc(t.catatan)}</textarea></div>` : '<p>Pengaruh stok transaksi ini akan dikembalikan. Catatan dan jejaknya tetap tersimpan.</p>'}
          <div class="field"><label for="detailAlasan">Alasan ${mode === 'edit' ? 'edit' : 'pembatalan'} <span class="opt">(wajib)</span></label><textarea class="input" id="detailAlasan" maxlength="300" rows="3" aria-describedby="detailError" required></textarea></div>
          <p class="field-error" id="detailError" role="alert" tabindex="-1" hidden></p>
          <div class="detail-actions"><button type="button" class="btn btn-secondary" id="detailUrungkan">Kembali</button><button type="submit" class="btn ${mode === 'edit' ? 'btn-primary' : 'btn-danger'}">${mode === 'edit' ? 'Simpan perubahan' : 'Ya, batalkan transaksi'}</button></div>
        </form>` : ''}
        <section class="audit-section" aria-labelledby="jejakJudul"><h3 id="jejakJudul">Jejak perubahan <span class="muted">(${jejak.length})</span></h3>
          ${jejak.length ? `<ol class="audit-list">${jejak.slice(0, batasJejak).map(j => `<li><strong>${j.tindakan === 'batal' ? 'Dibatalkan' : 'Diedit'} oleh ${esc(j.pelaku)}</strong><p class="small muted">${esc(waktuLengkap(j.waktu))}</p><p><strong>Alasan:</strong> ${esc(j.alasan)}</p><dl class="audit-values"><div><dt>Sebelum</dt><dd>${nf.format(j.sebelum.jumlah)} ${SATUAN} · ${statusTransaksi(j.sebelum)}<p class="small">Catatan: ${esc(j.sebelum.catatan || 'Tidak ada')}</p></dd></div><div><dt>Sesudah</dt><dd>${nf.format(j.sesudah.jumlah)} ${SATUAN} · ${statusTransaksi(j.sesudah)}<p class="small">Catatan: ${esc(j.sesudah.catatan || 'Tidak ada')}</p></dd></div></dl></li>`).join('')}</ol>${jejak.length > batasJejak ? '<button type="button" class="btn btn-secondary" id="jejakLagi">Baca jejak berikutnya</button>' : ''}` : '<p class="small muted">Belum ada edit atau pembatalan tercatat.</p>'}
        </section>
      </div>
      <div class="sheet-foot">${!mode && !dibatalkan && p?.status !== 'arsip' ? '<button type="button" class="btn btn-secondary" id="detailEdit">Edit</button><button type="button" class="btn btn-danger" id="detailBatalkan">Batalkan transaksi</button>' : '<button type="button" class="btn btn-secondary" data-close>Tutup detail</button>'}</div>`;
    if (!dlg.open) dlg.showModal();
    $('#detailEdit')?.addEventListener('click', () => bukaDetail(id, 'edit'));
    $('#detailBatalkan')?.addEventListener('click', () => bukaDetail(id, 'cancel'));
    $('#detailUrungkan')?.addEventListener('click', () => bukaDetail(id));
    $('#jejakLagi')?.addEventListener('click', () => bukaDetail(id, mode, batasJejak + 20));
    const f = $('#detailForm');
    if (f) {
      const requestId = idPermintaan();
      f.addEventListener('submit', async e => {
        e.preventDefault();
        const b = $('button[type="submit"]', f);
        if (b.disabled) return;
        b.disabled = true;
        try {
          await simpanTransaksi({ action: mode, id, version: t.version || 0, requestId, jumlah: mode === 'edit' ? Number($('#detailJumlah').value) : undefined, catatan: mode === 'edit' ? $('#detailCatatan').value : '', alasan: $('#detailAlasan').value });
          viewLaporan($('#view')); bukaDetail(id);
          toast(mode === 'edit' ? 'Perubahan tersimpan. Stok dan seluruh tampilan memakai catatan yang sama.' : 'Transaksi dibatalkan. Pengaruh stok dikembalikan satu kali.');
        } catch (err) {
          $('#detailError').textContent = err.message; $('#detailError').hidden = false; b.disabled = false;
          const reason = $('#detailAlasan');
          (reason.value.trim() ? $('#detailError') : reason).focus();
        }
      });
      (mode === 'edit' ? $('#detailJumlah') : $('#detailAlasan')).focus();
    } else $('#detailJudul').focus();
  }

  $('#dlgDetail').addEventListener('close', () => {
    const trigger = $(`[data-detail="${detailAktif}"]`) || $('#laporanTambah');
    if (trigger) trigger.focus({ preventScroll: true });
  });
  $('#dlgLaporanForm').addEventListener('close', () => {
    $('#laporanFormIsi').innerHTML = '';
    $('#laporanTambah')?.focus({ preventScroll: true });
  });
  [$('#dlgDetail'), $('#dlgLaporanForm'), $('#dlgProdukAksi')].forEach(dlg => dlg.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return;
    const targets = $$('button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]', dlg)
      .filter(el => el.getClientRects().length > 0);
    if (!targets.length) return;
    const first = targets[0], last = targets[targets.length - 1];
    if (!targets.includes(document.activeElement) || (e.shiftKey && document.activeElement === first) || (!e.shiftKey && document.activeElement === last)) {
      e.preventDefault(); (e.shiftKey ? last : first).focus();
    }
  }));

  /* ================= halaman: riwayat ================= */

  let rJenis = 'semua';
  let rMulai = '';
  let rAkhir = '';
  let rCari = '';
  let rModeTanggal = 'single';
  let bersihkanKalender = () => {};
  let batasRiwayat = LANGKAH_TAMPIL;

  function viewRiwayat(main) {
    bersihkanKalender();
    main.innerHTML = `
      <div class="page-head">
        <div><h1 tabindex="-1">Riwayat transaksi<span class="judul-gudang">${esc(judulGudang())}</span></h1><p id="rRingkas"></p></div>
      </div>
      <section class="panel history-panel">
        <div class="toolbar history-toolbar">
          <div class="history-primary">
            <div class="search">
              <label class="sr-only" for="rCari">Cari produk</label>
              <input class="input" type="search" id="rCari" placeholder="Cari kode atau spesifikasi produk" value="${esc(rCari)}">
            </div>
            <div class="toolbar-select">
              <label class="sr-only" for="rJenis">Jenis transaksi</label>
              <select class="input" id="rJenis">
                <option value="semua">Semua jenis</option>
                <option value="masuk">Barang masuk</option>
                <option value="keluar">Barang keluar</option>
                <option value="pindah">Pindah gudang</option>
              </select>
            </div>
          </div>
          <div class="date-toolbar">
            <div class="calendar-shell">
              <span class="date-toolbar-label">Tanggal transaksi</span>
              <button type="button" class="date-trigger" id="rTanggalTrigger" aria-haspopup="dialog" aria-expanded="false" aria-controls="rKalender">
                <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3v3m12-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z"/></svg>
                <span id="rTanggalValue" aria-live="polite">Semua tanggal</span>
                <svg class="chevron" viewBox="0 0 24 24" aria-hidden="true"><path d="m8 10 4 4 4-4"/></svg>
              </button>
              <div class="calendar-popover" id="rKalender" role="dialog" aria-label="Pilih tanggal transaksi" hidden>
                <div class="calendar-mode" role="group" aria-label="Cara memilih tanggal">
                  <button type="button" data-date-mode="single">Satu tanggal</button>
                  <button type="button" data-date-mode="range">Rentang tanggal</button>
                </div>
                <div class="calendar-head">
                  <button type="button" class="calendar-nav" id="rBulanSebelum" aria-label="Bulan sebelumnya">‹</button>
                  <strong id="rBulan" aria-live="polite"></strong>
                  <button type="button" class="calendar-nav" id="rBulanBerikut" aria-label="Bulan berikutnya">›</button>
                </div>
                <div class="calendar-weekdays" aria-hidden="true"><span>Sen</span><span>Sel</span><span>Rab</span><span>Kam</span><span>Jum</span><span>Sab</span><span>Min</span></div>
                <div class="calendar-grid" id="rTanggalGrid" role="grid" aria-labelledby="rBulan"></div>
                <p class="calendar-hint" id="rTanggalHint">Pilih satu tanggal.</p>
                <div class="calendar-foot">
                  <button type="button" class="btn btn-quiet btn-sm" id="rHariIni">Hari ini</button>
                  <button type="button" class="btn btn-secondary btn-sm" id="rTutupKalender">Tutup</button>
                </div>
              </div>
            </div>
            <button type="button" class="btn btn-secondary toolbar-clear" id="rHapusTanggal">Hapus tanggal</button>
          </div>
        </div>
        <div id="rIsi"></div>
      </section>`;

    $('#rJenis').value = rJenis;
    batasRiwayat = LANGKAH_TAMPIL;
    const btnHapusTanggal = $('#rHapusTanggal');
    const triggerTanggal = $('#rTanggalTrigger');
    const kalender = $('#rKalender');
    const gridTanggal = $('#rTanggalGrid');
    let tampilanBulan = rMulai ? tanggalDariKey(rMulai) : new Date();
    let draftMulai = rMulai;
    let draftAkhir = rAkhir;

    const labelTanggal = () => {
      if (!rMulai) return 'Semua tanggal';
      const mulai = fTanggalRingkas.format(tanggalDariKey(rMulai));
      if (!rAkhir || rMulai === rAkhir) return mulai;
      return `${mulai} sampai ${fTanggalRingkas.format(tanggalDariKey(rAkhir))}`;
    };

    const sinkronTanggal = () => {
      $('#rTanggalValue').textContent = labelTanggal();
      btnHapusTanggal.disabled = !rMulai && !rAkhir;
    };

    const renderKalender = (focusKey = '') => {
      $('#rBulan').textContent = fBulanTahun.format(tampilanBulan);
      $$('[data-date-mode]', kalender).forEach((button) => {
        button.setAttribute('aria-pressed', String(button.dataset.dateMode === rModeTanggal));
      });
      $('#rTanggalHint').textContent = rModeTanggal === 'single'
        ? 'Pilih satu tanggal untuk langsung menyaring riwayat.'
        : (draftMulai && !draftAkhir ? 'Sekarang pilih tanggal akhir.' : 'Pilih tanggal awal, lalu tanggal akhir.');

      const daftarHari = calendarDays(tampilanBulan.getFullYear(), tampilanBulan.getMonth());
      const semuaKey = new Set(daftarHari.map((hari) => hari.key));
      const hariIni = localDateKey(new Date());
      let keyAktif = focusKey || draftAkhir || draftMulai;
      if (!semuaKey.has(keyAktif)) keyAktif = semuaKey.has(hariIni) ? hariIni : daftarHari.find((hari) => hari.currentMonth).key;

      gridTanggal.innerHTML = daftarHari.map((hari) => {
        const diRentang = draftMulai && draftAkhir && hari.key >= draftMulai && hari.key <= draftAkhir;
        const tepiRentang = hari.key === draftMulai || hari.key === draftAkhir;
        const kelas = [
          'calendar-day',
          hari.currentMonth ? '' : 'outside',
          diRentang ? 'in-range' : '',
          tepiRentang ? 'selected' : '',
          hari.key === hariIni ? 'today' : '',
        ].filter(Boolean).join(' ');
        return `<button type="button" class="${kelas}" data-date="${hari.key}" role="gridcell" tabindex="${hari.key === keyAktif ? '0' : '-1'}" aria-label="${esc(fTanggal.format(tanggalDariKey(hari.key)))}" aria-pressed="${tepiRentang}">${hari.day}</button>`;
      }).join('');

      if (focusKey) {
        const fokus = $(`[data-date="${focusKey}"]`, gridTanggal);
        if (fokus) fokus.focus({ preventScroll: true });
      }
    };

    const onKlikLuarKalender = (event) => {
      if (!kalender.hidden && !event.target.closest('.calendar-shell')) tutupKalender(false);
    };

    function tutupKalender(kembalikanFokus = false) {
      kalender.hidden = true;
      document.body.classList.remove('riwayat-calendar-open');
      triggerTanggal.setAttribute('aria-expanded', 'false');
      document.removeEventListener('click', onKlikLuarKalender);
      bersihkanKalender = () => {};
      if (kembalikanFokus) triggerTanggal.focus();
    }

    const bukaKalender = () => {
      draftMulai = rMulai;
      draftAkhir = rAkhir;
      tampilanBulan = rMulai ? tanggalDariKey(rMulai) : new Date();
      renderKalender();
      kalender.hidden = false;
      document.body.classList.add('riwayat-calendar-open');
      triggerTanggal.setAttribute('aria-expanded', 'true');
      document.addEventListener('click', onKlikLuarKalender);
      bersihkanKalender = () => {
        document.removeEventListener('click', onKlikLuarKalender);
        document.body.classList.remove('riwayat-calendar-open');
      };
      const fokus = $('[tabindex="0"]', gridTanggal);
      if (fokus) fokus.focus({ preventScroll: true });
    };

    const pilihTanggal = (key) => {
      const pilihan = applyDateSelection(rModeTanggal, draftMulai, draftAkhir, key);
      draftMulai = pilihan.start;
      draftAkhir = pilihan.end;
      tampilanBulan = tanggalDariKey(key);
      if (pilihan.complete) {
        rMulai = pilihan.start;
        rAkhir = pilihan.end;
        batasRiwayat = LANGKAH_TAMPIL;
        sinkronTanggal();
        isi();
        tutupKalender(true);
      } else {
        renderKalender(key);
      }
    };

    const isi = () => {
      const cocokProduk = new Set(saringProduk(rCari, true).map((p) => p.kode));
      const hasil = transaksiGudang()
        .filter((t) => isDateInRange(t.waktu, rMulai, rAkhir))
        .filter((t) => rJenis === 'semua' || t.jenis === rJenis)
        .filter((t) => !rCari.trim() || cocokProduk.has(t.kode))
        .sort((a, b) => b.waktu.localeCompare(a.waktu));

      const aktif = hasil.filter(t => t.status !== 'dibatalkan');
      const totMasuk = aktif.filter((t) => arahTransaksi(t).tanda === '+').reduce((s, t) => s + t.jumlah, 0);
      const totKeluar = aktif.filter((t) => arahTransaksi(t).tanda === '−').reduce((s, t) => s + t.jumlah, 0);
      const jPindah = aktif.filter((t) => t.jenis === 'pindah').length;
      $('#rRingkas').textContent = hasil.length
        ? `${hasil.length} transaksi: ${nf.format(totMasuk)} ${SATUAN} masuk, ${nf.format(totKeluar)} ${SATUAN} keluar${jPindah ? `, termasuk ${jPindah} pindah gudang` : ''}.`
        : 'Tidak ada transaksi di pilihan ini.';

      const wadah = $('#rIsi');
      if (!state.transaksi.length) {
        wadah.innerHTML = '<div class="empty-state"><h3>Belum ada transaksi</h3><p>Barang masuk, keluar, dan pindah gudang yang dicatat akan tampil di sini, lengkap dengan waktunya.</p><a class="btn btn-primary" href="#/transaksi">Catat transaksi</a></div>';
        return;
      }
      if (!hasil.length) {
        wadah.innerHTML = '<div class="empty-state"><h3>Tidak ada transaksi yang cocok</h3><p>Coba ubah tanggal, jenis transaksi, atau hapus pencarian.</p><button type="button" class="btn btn-secondary" id="rTampilSemua">Tampilkan semua transaksi</button></div>';
        $('#rTampilSemua').addEventListener('click', () => {
          rJenis = 'semua'; rMulai = ''; rAkhir = ''; rCari = '';
          rModeTanggal = 'single'; draftMulai = ''; draftAkhir = '';
          $('#rJenis').value = rJenis; $('#rCari').value = '';
          batasRiwayat = LANGKAH_TAMPIL;
          sinkronTanggal(); isi();
        });
        return;
      }

      let tanggalSebelum = '';
      const baris = hasil.slice(0, batasRiwayat).map((t) => {
        const w = new Date(t.waktu);
        const tgl = fTanggal.format(w);
        const p = cariProduk(t.kode);
        const a = arahTransaksi(t);
        const kepala = tgl !== tanggalSebelum ? `<tr class="group"><th colspan="6" scope="colgroup">${tgl}</th></tr>` : '';
        tanggalSebelum = tgl;
        return `${kepala}
          <tr>
            <td data-label="Jam" class="num">${fJam.format(w)}</td>
            <td data-label="Jenis"><span class="jenis ${a.kelas}">${esc(a.teks)}</span>${t.status === 'dibatalkan' ? `<br>${statusHTML(t)}` : ''}</td>
            <td data-label="Gudang">${tagGudang(a.gudang)}</td>
            <td data-label="Produk" class="stack"><div class="id-line"><span class="kode">${esc(t.kode)}</span>${p ? specHTML(p) : '<span class="muted">produk tidak ditemukan</span>'}</div></td>
            <td data-label="Catatan" class="catatan-cell">${t.catatan ? esc(t.catatan) : '<span class="muted" aria-label="Tidak ada catatan">-</span>'}</td>
            <td data-label="Jumlah" class="r"><span class="qty ${a.kelas}">${t.status === 'dibatalkan' ? '' : a.tanda}${nf.format(t.jumlah)}</span> <span class="muted">${SATUAN}</span></td>
          </tr>`;
      }).join('');

      wadah.innerHTML = `
        <div class="table-wrap"><table class="data">
          <thead><tr><th scope="col">Jam</th><th scope="col">Jenis</th><th scope="col">Gudang</th><th scope="col">Produk</th><th scope="col">Catatan</th><th scope="col" class="r">Jumlah</th></tr></thead>
          <tbody>${baris}</tbody>
        </table></div>${tombolTampilLagi(Math.min(batasRiwayat, hasil.length), hasil.length, 'riwayatTampilLagi')}`;
    };

    const cariTertunda = tunda(() => { batasRiwayat = LANGKAH_TAMPIL; isi(); });
    $('#rCari').addEventListener('input', (e) => { rCari = e.target.value; cariTertunda(); });
    $('#rJenis').addEventListener('change', (e) => { rJenis = e.target.value; batasRiwayat = LANGKAH_TAMPIL; isi(); });
    $('#rIsi').addEventListener('click', (e) => {
      if (e.target.closest('#riwayatTampilLagi')) { batasRiwayat += LANGKAH_TAMPIL; isi(); }
    });
    triggerTanggal.addEventListener('click', () => {
      if (kalender.hidden) bukaKalender();
      else tutupKalender(true);
    });
    $$('[data-date-mode]', kalender).forEach((button) => button.addEventListener('click', () => {
      rModeTanggal = button.dataset.dateMode;
      draftMulai = rMulai;
      draftAkhir = rAkhir;
      renderKalender();
    }));
    $('#rBulanSebelum').addEventListener('click', () => {
      tampilanBulan = new Date(tampilanBulan.getFullYear(), tampilanBulan.getMonth() - 1, 1);
      renderKalender();
    });
    $('#rBulanBerikut').addEventListener('click', () => {
      tampilanBulan = new Date(tampilanBulan.getFullYear(), tampilanBulan.getMonth() + 1, 1);
      renderKalender();
    });
    gridTanggal.addEventListener('click', (event) => {
      const button = event.target.closest('[data-date]');
      if (button) {
        event.stopPropagation();
        pilihTanggal(button.dataset.date);
      }
    });
    gridTanggal.addEventListener('keydown', (event) => {
      const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7 }[event.key];
      const button = event.target.closest('[data-date]');
      if (!button || !delta) return;
      event.preventDefault();
      const berikut = tanggalDariKey(button.dataset.date);
      berikut.setDate(berikut.getDate() + delta);
      const keyBerikut = localDateKey(berikut);
      tampilanBulan = new Date(berikut.getFullYear(), berikut.getMonth(), 1);
      renderKalender(keyBerikut);
    });
    kalender.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') { event.preventDefault(); tutupKalender(true); }
    });
    $('#rHariIni').addEventListener('click', () => pilihTanggal(localDateKey(new Date())));
    $('#rTutupKalender').addEventListener('click', () => tutupKalender(true));
    btnHapusTanggal.addEventListener('click', () => {
      rMulai = ''; rAkhir = ''; draftMulai = ''; draftAkhir = ''; rModeTanggal = 'single';
      batasRiwayat = LANGKAH_TAMPIL;
      tutupKalender(); sinkronTanggal(); isi(); triggerTanggal.focus();
    });
    sinkronTanggal();
    isi();
  }

  /* ================= router ================= */

  const VIEWS = { dashboard: viewDashboard, produk: viewProduk, transaksi: viewTransaksi, riwayat: viewRiwayat, laporan: viewLaporan };
  const JUDUL = { dashboard: 'Dashboard', produk: 'Produk', transaksi: 'Catat transaksi', riwayat: 'Riwayat transaksi', laporan: 'Laporan' };
  let renderPertama = true;

  function route() {
    bersihkanKalender();
    const [jalur, qs] = location.hash.replace(/^#\/?/, '').split('?');
    const nama = VIEWS[jalur] ? jalur : 'dashboard';
    VIEWS[nama]($('#view'), new URLSearchParams(qs || ''));
    $$('[data-nav]').forEach((a) => {
      if (a.dataset.nav === nama) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    document.title = `${JUDUL[nama]} – alo monitoring (prototipe)`;
    if (!renderPertama) {
      window.scrollTo(0, 0);
      const h1 = $('#view h1');
      if (h1) h1.focus();
    }
    renderPertama = false;
  }

  /* ================= dialog umum & panel demo ================= */

  document.addEventListener('click', (e) => {
    const tutup = e.target.closest('[data-close]');
    if (tutup) tutup.closest('dialog').close();
  });
  $$('dialog').forEach((d) => d.addEventListener('click', (e) => { if (e.target === d) d.close(); }));

  $('#pilihGudang').addEventListener('change', (e) => {
    gudangAktif = e.target.value;
    try { localStorage.setItem(KUNCI_GUDANG, gudangAktif); } catch (err) { /* abaikan */ }
    filterDashboard = 'semua';
    route();
    toast(`Sekarang menampilkan <strong>${esc(namaGudang(gudangAktif))}</strong>.`);
  });

  $('#btnDemo').addEventListener('click', () => {
    $('#dlgDemo').showModal();
  });
  async function aturDemo(empty) {
    try {
      await simpanPerubahan(() => empty ? { produk: [], stok: [], transaksi: [] } : dataContoh(), true);
      $('#dlgDemo').close(); route();
      toast(empty ? 'Data demo dikosongkan.' : 'Data contoh dikembalikan.');
    } catch (err) { toast(esc(err.message)); }
  }
  $('#demoKosong').addEventListener('click', () => aturDemo(true));
  $('#demoReset').addEventListener('click', () => aturDemo(false));

  window.addEventListener('storage', e => {
    if (e.key !== KUNCI_SIMPAN) return;
    try {
      state = dataTerbaru(); bangunIndeks();
      if (!$('dialog[open]') && !$('#txForm')) route();
      toast('Data diperbarui di tab lain. Form yang terbuka tetap diperiksa versinya saat disimpan.');
    } catch (err) { toast(esc(err.message)); }
  });

  window.addEventListener('hashchange', route);
  // Mengetuk menu ke halaman yang sedang dibuka tidak memicu hashchange; muat ulang halamannya secara manual.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (a && a.getAttribute('href') === location.hash && !e.defaultPrevented) { e.preventDefault(); route(); }
  });
  renderPilihGudang();
  route();
  if (dataRusak) {
    toast('Data tersimpan di browser ini tidak terbaca, jadi data contoh dimuat. Salinan data lama disimpan terpisah.');
  }
})();
