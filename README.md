# alo monitoring

Prototipe monitoring stok strapping band pada tiga gudang: Taman Tekno, Pluit,
dan Larangan. Dibuat untuk Capstone Project Sistem Informasi Universitas Budi Luhur.

Preview: https://nuugo25.github.io/alo-monitoring/

## Fitur

- Dashboard stok dan status per gudang, pencarian produk dan spesifikasi.
- Tambah produk, kode otomatis, catatan dan peringatan produk kembar.
- Barang masuk, keluar, pindah gudang; penolakan stok negatif.
- Catatan bebas opsional, Riwayat dengan kalender tanggal tunggal atau rentang.
- Laporan bulanan, tambah transaksi, koreksi dengan alasan, pembatalan dan jejak.
- Unduh Excel bulanan dua sheet, seluruh hasil filter, langsung dari browser.
- Hapus produk stok nol tanpa transaksi; arsip dengan riwayat setelah unduh rekap wajib.
- Buka Arsip, unduh rekap seluruh periode, pulihkan kode/riwayat yang sama dengan stok nol.
- Pemeriksaan versi edit dan penyimpanan bergiliran antar-tab pada browser yang sama.

## Batas prototipe

Produk dan angka stok adalah data contoh. Data disimpan pada browser/perangkat ini
dan tidak dibagikan ke staf lain. Belum ada login atau database bersama. Menghapus
data browser dapat menghilangkan catatan. Ekspor bukan backup database yang dapat
diimpor kembali. Memulai unduhan tidak membuktikan file sudah tersimpan di disk.

Koreksi transaksi produk arsip meminta pemulihan dahulu. Kebijakan penutupan bulan,
nomor surat jalan dan akun individual belum tersedia. Maksimal 10.000 baris per
ekspor. Panel Atur kondisi demo dapat mengosongkan atau mengembalikan data contoh;
gunakan setelah menyimpan rekap yang diperlukan.

## Menjalankan

Layani folder ini dengan server HTTP lokal, misalnya `python -m http.server 5500`,
lalu buka http://localhost:5500. Chrome atau Edge terbaru direkomendasikan untuk
Web Locks. Tidak memerlukan XAMPP, server Node atau database untuk preview ini.

HTML/CSS/JavaScript biasa. JSZip 3.10.1 dimuat saat ekspor, lisensi di vendor/.
Workbook template dibuat menggunakan artifact-tool pada tahap development.
Versi UI: `20261017-arsip-1`.
