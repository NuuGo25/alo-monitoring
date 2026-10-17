# alo monitoring

Prototipe website monitoring stok barang untuk perusahaan produksi strapping band dengan tiga gudang: Taman Tekno, Pluit, dan Larangan.

Dibuat untuk mata kuliah Capstone Project, Program Studi Sistem Informasi, Universitas Budi Luhur.

## Fitur

- Dashboard stok per gudang dengan status Kritis, Hampir habis, dan Normal
- Pencarian produk berdasarkan ukuran, warna, atau merek (misalnya `15mm hijau colson`)
- Data produk dengan atribut terstruktur: tipe, lebar, tebal, panjang, berat, warna, merek
- Kode produk dibuat otomatis, dan sistem memperingatkan bila produk yang sama didaftarkan dua kali
- Pencatatan barang masuk, barang keluar, dan pindah gudang
- Transaksi yang membuat stok minus ditolak
- Riwayat transaksi dengan saring tanggal, jenis, dan produk
- Tampilan untuk komputer, tablet, dan HP

## Status

Ini prototipe tampilan. Belum ada server dan database: semua data disimpan di browser (`localStorage`) dan angka stoknya adalah data contoh. Nama gudang dan merek adalah data asli mitra yang ditampilkan dengan izin.

Panel **Atur kondisi demo** di pita kuning bagian atas dipakai untuk mencoba kondisi seperti Google Sheets gagal tersalin, data kosong, atau mengembalikan data contoh.

## Menjalankan

Tidak perlu instalasi. Dari folder ini:

```bash
python -m http.server 5500
```

Lalu buka `http://localhost:5500` di browser.

## Teknologi

HTML, CSS, dan JavaScript tanpa framework dan tanpa dependensi.
