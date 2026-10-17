/* alo monitoring — prototipe tampilan (versi 3 gudang).
   Tanpa server: data contoh disimpan di localStorage browser. Aturan bisnis di sini
   (cek duplikat KF-03, tolak stok minus KF-08, status per gudang KF-05, pindah gudang KF-11)
   jadi acuan implementasi tahap 2-3. */
(() => {
  'use strict';

  const KUNCI_SIMPAN = 'alo-prototipe-v2';   // v2: stok dipisah per gudang
  const KUNCI_GUDANG = 'alo-gudang-aktif';
  const SATUAN = 'gulungan';                 // ASUMSI A1/A10: belum dikonfirmasi mitra ("roll" atau "gulungan")
  const SELISIH_HAMPIR = 5;                  // ASUMSI A2: hampir habis kalau stok <= minimum + 5
  const SEMUA = 'SEMUA';
  const { normalizeNote, localDateKey, isDateInRange, calendarDays, applyDateSelection } = window.AloPrototypeLogic;

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
      ({ id: t.length - i, kode, jenis, jumlah, gudang, tujuan, catatan, waktu: new Date(now - lalu).toISOString() }));

    return { produk, stok, transaksi, sheets: { status: 'ok', tertunda: 0, terakhir: new Date(now - 2 * MNT).toISOString() } };
  }

  // Data tersimpan yang bentuknya tidak lengkap dulu membuat layar blank (galat di renderSync).
  // Sekarang: data rusak disalin ke kunci cadangan, lalu data contoh dimuat dan staf diberi tahu.
  let dataRusak = false;
  function muat() {
    let raw = null;
    try { raw = localStorage.getItem(KUNCI_SIMPAN); } catch (e) { return dataContoh(); }
    if (!raw) return dataContoh();
    try {
      const d = JSON.parse(raw);
      if (d && Array.isArray(d.produk) && Array.isArray(d.stok) && Array.isArray(d.transaksi)) {
        if (!d.sheets || typeof d.sheets !== 'object') d.sheets = { status: 'ok', tertunda: 0, terakhir: new Date().toISOString() };
        return d;
      }
    } catch (e) { /* JSON rusak: ditangani di bawah */ }
    dataRusak = true;
    try { localStorage.setItem(`${KUNCI_SIMPAN}-rusak`, raw); } catch (e) { /* abaikan */ }
    return dataContoh();
  }

  // Penyimpanan bisa gagal (penuh atau diblokir). Dulu gagal diam-diam; sekarang staf diberi peringatan tetap.
  function simpan() {
    let berhasil = true;
    try { localStorage.setItem(KUNCI_SIMPAN, JSON.stringify(state)); } catch (e) { berhasil = false; }
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
      el.textContent = 'Perubahan terakhir belum tersimpan di browser ini karena penyimpanan penuh atau diblokir. Jangan muat ulang halaman sebelum masalah ini selesai.';
      document.querySelector('main').before(el);
    }
    el.hidden = false;
  }

  // Setiap produk wajib punya satu baris stok di tiap gudang; baris yang hilang dilengkapi (jumlah 0, tidak dipantau).
  function lengkapiStok() {
    const ada = new Set(state.stok.map((s) => `${s.produk}|${s.gudang}`));
    state.produk.forEach((p) => GUDANG.forEach((g) => {
      if (!ada.has(`${p.kode}|${g.kode}`)) state.stok.push({ produk: p.kode, gudang: g.kode, jumlah: 0, min: 0 });
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
  function kodeBerikut(tipe) {
    const awalan = String(tipe).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4) || 'BRG';
    const maks = state.produk
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

  function saringProduk(q) {
    const token = norm(q).split(' ').filter(Boolean);
    if (!token.length) return state.produk.slice();
    return state.produk.filter((p) => {
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

  /* ================= Google Sheets (KF-07, KNF-03) ================= */

  function catatPerubahan() {
    if (state.sheets.status === 'ok') state.sheets.terakhir = new Date().toISOString();
    else state.sheets.tertunda += 1;
    simpan();
    renderSync();
  }
  function waktuRelatif(iso) {
    const menit = (Date.now() - new Date(iso).getTime()) / 60e3;
    if (menit < 1) return 'baru saja';
    if (menit < 60) return `${Math.floor(menit)} menit lalu`;
    if (menit < 1440) return `${Math.floor(menit / 60)} jam lalu`;
    return fTanggal.format(new Date(iso));
  }
  function renderSync() {
    const s = state.sheets;
    const el = $('#syncBtn');
    if (s.status === 'ok') {
      el.className = 'sync';
      el.innerHTML = '<span class="dot" aria-hidden="true"></span><span class="sync-text">Tersalin ke Google Sheets</span><span class="sync-short">Sheets</span>';
      el.setAttribute('aria-label', `Google Sheets tersalin, terakhir ${waktuRelatif(s.terakhir)}`);
    } else {
      el.className = 'sync gagal';
      el.innerHTML = `<span class="dot" aria-hidden="true"></span><span class="sync-text">${s.tertunda} perubahan belum tersalin</span><span class="sync-short">${s.tertunda} belum tersalin</span>`;
      el.setAttribute('aria-label', `${s.tertunda} perubahan belum tersalin ke Google Sheets`);
    }
  }
  function bukaSync() {
    const s = state.sheets;
    const dlg = $('#dlgSync');
    if (s.status === 'ok') {
      $('#syncIsi').innerHTML = `
        <div class="sheet-head"><div><h2 id="syncJudul">Google Sheets sudah tersalin</h2></div>
          <button type="button" class="icon-btn" data-close aria-label="Tutup">&times;</button></div>
        <div class="sheet-body"><p>Semua perubahan produk dan transaksi dari ketiga gudang sudah tersalin ke satu Google Sheets. Terakhir tersalin ${esc(waktuRelatif(s.terakhir))}.</p></div>
        <div class="modal-foot"><button type="button" class="btn btn-secondary" data-close>Tutup</button></div>`;
    } else {
      $('#syncIsi').innerHTML = `
        <div class="sheet-head"><div><h2 id="syncJudul">${s.tertunda} perubahan belum tersalin ke Google Sheets</h2></div>
          <button type="button" class="icon-btn" data-close aria-label="Tutup">&times;</button></div>
        <div class="sheet-body">
          <p>Datanya tetap tersimpan di sistem, jadi stok yang tampil di sini sudah benar. Yang belum ikut berubah hanya salinan di Google Sheets.</p>
          <p class="muted">Biasanya terjadi saat internet kantor putus. Kirim ulang setelah internet tersambung lagi.</p>
        </div>
        <div class="modal-foot">
          <button type="button" class="btn btn-secondary" data-close>Nanti saja</button>
          <button type="button" class="btn btn-primary" id="btnKirimUlang">Kirim ulang sekarang</button>
        </div>`;
      $('#btnKirimUlang').addEventListener('click', () => {
        const n = state.sheets.tertunda;
        state.sheets = { status: 'ok', tertunda: 0, terakhir: new Date().toISOString() };
        simpan(); renderSync(); dlg.close();
        toast(`${n} perubahan sudah tersalin ke Google Sheets.`);
      });
    }
    dlg.showModal();
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
    const txHariIni = transaksiGudang()
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
      state.produk.forEach((p) => gudangTampil().forEach((kg) => {
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

  function viewProduk(main, params) {
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
    batasProduk = LANGKAH_TAMPIL;

    const isi = () => {
      const semuaGudang = gudangAktif === SEMUA;
      const tercatat = state.produk.filter((p) => semuaGudang || disimpanDi(p.kode, gudangAktif));
      const hasil = saringProduk(qProduk)
        .filter((p) => semuaGudang || disimpanDi(p.kode, gudangAktif))
        .filter((p) => {
          if (filterStatus === 'semua') return true;
          if (semuaGudang) return statusGabungan(p.kode) === filterStatus;
          const s = barisStok(p.kode, gudangAktif);
          return s && statusDari(s.jumlah, s.min) === filterStatus;
        })
        .sort((a, b) => a.kode.localeCompare(b.kode));

      $('#produkRingkas').textContent = hasil.length === tercatat.length
        ? `${tercatat.length} produk tercatat${semuaGudang ? ' di seluruh gudang' : ` di ${labelGudang(gudangAktif)}`}.`
        : `Menampilkan ${hasil.length} dari ${tercatat.length} produk.`;

      const wadah = $('#produkIsi');
      if (!state.produk.length) {
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
                <td data-label="Status">${badge(st)}</td>
                <td class="r act"><a class="btn btn-secondary btn-sm" href="#/transaksi?kode=${encodeURIComponent(p.kode)}">Catat transaksi</a></td>
              </tr>`; }).join('')}
            </tbody>
          </table></div>${tombolTampilLagi(Math.min(batasProduk, hasil.length), hasil.length, 'produkTampilLagi')}`;
      }
      $$('[data-tambah]', wadah).forEach((b) => b.addEventListener('click', bukaFormProduk));
    };

    const cariTertunda = tunda(() => { batasProduk = LANGKAH_TAMPIL; isi(); });
    $('#qProduk').addEventListener('input', (e) => { qProduk = e.target.value; cariTertunda(); });
    $('#fStatus').addEventListener('change', (e) => { filterStatus = e.target.value; batasProduk = LANGKAH_TAMPIL; isi(); });
    $('#produkIsi').addEventListener('click', (e) => {
      if (e.target.closest('#produkTampilLagi')) { batasProduk += LANGKAH_TAMPIL; isi(); }
    });
    $('#btnTambah').addEventListener('click', bukaFormProduk);
    isi();

    if (params.get('tambah') === '1') {
      history.replaceState(null, '', '#/produk');
      bukaFormProduk();
    }
  }

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
      $('#dupPakai').href = `#/transaksi?jenis=masuk&kode=${encodeURIComponent(kembar.kode)}&gudang=${encodeURIComponent(v.gudang)}`;
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

  formProduk.addEventListener('submit', (e) => {
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

    const baru = {
      kode: kodeBerikut(v.tipe), tipe: v.tipe,
      lebar: parseAngka(v.lebar), tebal: parseAngka(v.tebal), panjang: parseAngka(v.panjang), berat: parseAngka(v.berat),
      warna: v.warna, merek: v.merek, catatan: v.catatan,
    };
    state.produk.push(baru);
    // Satu baris stok per gudang. Gudang terpilih langsung dipantau; gudang lain menyusul saat ada barang masuk.
    GUDANG.forEach((g) => state.stok.push({ produk: baru.kode, gudang: g.kode, jumlah: 0, min: g.kode === v.gudang ? parseInt(v.min, 10) : 0 }));
    bangunIndeks();
    catatPerubahan();
    $('#dlgProduk').close();
    route();
    toast(`Produk <strong>${esc(baru.kode)}</strong> tersimpan di ${esc(namaGudang(v.gudang))}. Stok awalnya 0 ${SATUAN}.`,
      { href: `#/transaksi?jenis=masuk&kode=${encodeURIComponent(baru.kode)}&gudang=${encodeURIComponent(v.gudang)}`, label: 'Catat barang masuk' });
  });

  /* ================= halaman: catat transaksi ================= */

  function viewTransaksi(main, params) {
    let dipilih = params.get('kode') ? cariProduk(params.get('kode')) || null : null;
    const jenisParam = params.get('jenis');
    const jenisAwal = ['masuk', 'keluar', 'pindah'].includes(jenisParam) ? jenisParam : 'masuk';
    const gudangParam = params.get('gudang');
    const gudangAwal = GUDANG.some((g) => g.kode === gudangParam) ? gudangParam : (gudangAktif === SEMUA ? '' : gudangAktif);

    const opsiGudang = (terpilih) => GUDANG
      .map((g) => `<option value="${g.kode}" ${g.kode === terpilih ? 'selected' : ''}>Gudang ${esc(g.nama)}</option>`).join('');

    main.innerHTML = `
      <div class="page-head">
        <div><h1 tabindex="-1">Catat transaksi</h1><p>Stok langsung diperbarui begitu transaksi disimpan.</p></div>
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
      const daftar = transaksiGudang().sort((a, b) => b.waktu.localeCompare(a.waktu)).slice(0, 6);
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

    f.addEventListener('submit', (e) => {
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

      const n = parseInt(inputJumlah.value, 10);
      const s = stokAsal();
      if ((j === 'keluar' || j === 'pindah') && n > s.jumlah) { renderPreview(); return; }

      if (j === 'masuk') s.jumlah += n;
      else s.jumlah -= n;

      let pesan;
      if (j === 'pindah') {
        const sT = barisStok(dipilih.kode, selTujuan.value);
        sT.jumlah += n;
        // Gudang tujuan yang belum dipantau ikut memakai batas minimum yang sama.
        if (sT.min <= 0) sT.min = Math.max(...stokProduk(dipilih.kode).map((x) => x.min), 0);
        pesan = `Pindah gudang tersimpan. <strong>${esc(dipilih.kode)}</strong> di ${esc(pendekGudang(selGudang.value))} ${nf.format(s.jumlah)}, di ${esc(pendekGudang(selTujuan.value))} ${nf.format(sT.jumlah)} ${SATUAN}.`;
      } else {
        if (j === 'masuk' && s.min <= 0) s.min = Math.max(...stokProduk(dipilih.kode).map((x) => x.min), 0);
        pesan = `${j === 'masuk' ? 'Barang masuk' : 'Barang keluar'} tersimpan. Stok <strong>${esc(dipilih.kode)}</strong> di ${esc(namaGudang(selGudang.value))} sekarang ${nf.format(s.jumlah)} ${SATUAN}.`;
      }

      const id = state.transaksi.reduce((m, t) => Math.max(m, t.id), 0) + 1;
      state.transaksi.push({
        id, kode: dipilih.kode, jenis: j, jumlah: n,
        gudang: selGudang.value, tujuan: j === 'pindah' ? selTujuan.value : '',
        catatan: j === 'masuk' ? '' : normalizeNote(inputCatatan.value),
        waktu: new Date().toISOString(),
      });
      catatPerubahan();
      toast(pesan);

      dipilih = null;
      inputJumlah.value = 1;
      inputCatatan.value = '';
      renderPilihan(); renderPreview(); renderTerakhir();
      const cari = $('#txCari');
      if (cari) cari.focus();
    });

    renderJenis();
    renderPilihan();
    renderPreview();
    renderTerakhir();
  }

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
      const cocokProduk = new Set(saringProduk(rCari).map((p) => p.kode));
      const hasil = transaksiGudang()
        .filter((t) => isDateInRange(t.waktu, rMulai, rAkhir))
        .filter((t) => rJenis === 'semua' || t.jenis === rJenis)
        .filter((t) => !rCari.trim() || cocokProduk.has(t.kode))
        .sort((a, b) => b.waktu.localeCompare(a.waktu));

      const totMasuk = hasil.filter((t) => arahTransaksi(t).tanda === '+').reduce((s, t) => s + t.jumlah, 0);
      const totKeluar = hasil.filter((t) => arahTransaksi(t).tanda === '−').reduce((s, t) => s + t.jumlah, 0);
      const jPindah = hasil.filter((t) => t.jenis === 'pindah').length;
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
            <td data-label="Jenis"><span class="jenis ${a.kelas}">${esc(a.teks)}</span></td>
            <td data-label="Gudang">${tagGudang(a.gudang)}</td>
            <td data-label="Produk" class="stack"><div class="id-line"><span class="kode">${esc(t.kode)}</span>${p ? specHTML(p) : '<span class="muted">produk tidak ditemukan</span>'}</div></td>
            <td data-label="Catatan" class="catatan-cell">${t.catatan ? esc(t.catatan) : '<span class="muted" aria-label="Tidak ada catatan">-</span>'}</td>
            <td data-label="Jumlah" class="r"><span class="qty ${a.kelas}">${a.tanda}${nf.format(t.jumlah)}</span> <span class="muted">${SATUAN}</span></td>
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

  const VIEWS = { dashboard: viewDashboard, produk: viewProduk, transaksi: viewTransaksi, riwayat: viewRiwayat };
  const JUDUL = { dashboard: 'Dashboard', produk: 'Produk', transaksi: 'Catat transaksi', riwayat: 'Riwayat transaksi' };
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

  $('#syncBtn').addEventListener('click', bukaSync);

  $('#pilihGudang').addEventListener('change', (e) => {
    gudangAktif = e.target.value;
    try { localStorage.setItem(KUNCI_GUDANG, gudangAktif); } catch (err) { /* abaikan */ }
    filterDashboard = 'semua';
    route();
    toast(`Sekarang menampilkan <strong>${esc(namaGudang(gudangAktif))}</strong>.`);
  });

  $('#btnDemo').addEventListener('click', () => {
    $$('input[name="demoSheets"]').forEach((r) => { r.checked = r.value === state.sheets.status; });
    $('#dlgDemo').showModal();
  });
  $$('input[name="demoSheets"]').forEach((r) => r.addEventListener('change', () => {
    state.sheets = r.value === 'gagal'
      ? { ...state.sheets, status: 'gagal', tertunda: Math.max(state.sheets.tertunda, 3) }
      : { status: 'ok', tertunda: 0, terakhir: new Date().toISOString() };
    simpan(); renderSync();
  }));
  $('#demoKosong').addEventListener('click', () => {
    state = { produk: [], stok: [], transaksi: [], sheets: state.sheets };
    bangunIndeks();
    simpan(); $('#dlgDemo').close(); route();
    toast('Semua data dikosongkan. Sekarang tampilan kosong bisa dicoba.');
  });
  $('#demoReset').addEventListener('click', () => {
    state = dataContoh();
    bangunIndeks();
    simpan(); renderSync(); $('#dlgDemo').close(); route();
    toast('Data contoh dikembalikan.');
  });

  window.addEventListener('hashchange', route);
  // Mengetuk menu ke halaman yang sedang dibuka tidak memicu hashchange; muat ulang halamannya secara manual.
  document.addEventListener('click', (e) => {
    const a = e.target.closest('a[href^="#/"]');
    if (a && a.getAttribute('href') === location.hash && !e.defaultPrevented) { e.preventDefault(); route(); }
  });
  renderPilihGudang();
  renderSync();
  route();
  if (dataRusak) {
    toast('Data tersimpan di browser ini tidak terbaca, jadi data contoh dimuat. Salinan data lama disimpan terpisah.');
  }
})();
