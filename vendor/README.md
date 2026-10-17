# Komponen ekspor Excel

JSZip 3.10.1, distribusi browser minified dari dependency yang sudah tersedia.
Lisensi MIT atau GPLv3 tersedia di JSZip-LICENSE.md. Tidak ada instalasi paket baru.
Sumber proyek: https://github.com/Stuk/jszip

Komponen baru dimuat ketika pengguna meminta unduhan. Workbook template dibuat
oleh tools/xlsx/build-templates.mjs memakai artifact-tool. Halaman publik tidak
memerlukan helper Node untuk mengunduh Excel.
