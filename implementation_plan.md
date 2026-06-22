# Implementation Plan: Sistem Identifikasi Kesehatan Tanaman

## Tujuan
Membangun aplikasi web stateless untuk praktikum Pengolahan Citra Digital (PCD) yang menerima citra daun, mengirimkannya ke Gemini Vision API, lalu menampilkan hasil identifikasi tanaman dan analisis penyakit berdasarkan fitur warna serta tekstur.

## Arsitektur Aplikasi
- `app/page.tsx`
  - Client Component utama.
  - Mengelola state sementara: file gambar, preview URL, drag state, loading, error, dan hasil JSON.
  - Tidak memakai database atau penyimpanan permanen.
  - Mengirim `FormData` berisi field `image` ke `/api/analyze`.
  - Mengurai JSON response dari API dan menampilkannya dalam Bento Grid.
- `app/api/analyze/route.ts`
  - Route Handler App Router dengan runtime Node.js.
  - Menerima `multipart/form-data`.
  - Memvalidasi file gambar dan ukuran maksimum.
  - Mengubah file menjadi base64 inline data untuk Gemini.
  - Memanggil `@google/generative-ai` model `gemini-1.5-flash`.
  - Membersihkan dan memvalidasi respons agar hanya JSON sesuai kontrak yang dikirim kembali ke frontend.
- `app/globals.css`
  - Gaya global, background gradien, animasi loading, dan utilitas glassmorphism ringan.

## Kontrak Data
Gemini harus merespons JSON murni dengan keys:
```json
{
  "nama_tanaman": "Nama tanaman",
  "status": "Sehat/Sakit",
  "rincian_visual": "Analisis warna dan tekstur daun",
  "identifikasi_penyakit": "Nama penyakit atau Tidak ada",
  "tips_perawatan": "Saran perawatan umum",
  "rekomendasi_solusi": "Solusi bila sakit atau pencegahan bila sehat"
}
```

## Alur UI
1. Pengguna drag-and-drop atau memilih gambar daun.
2. Frontend membuat preview dengan `URL.createObjectURL`.
3. Tombol analisis aktif setelah file valid dipilih.
4. Saat submit, UI menampilkan loading state interaktif.
5. API mengembalikan JSON hasil Gemini.
6. Frontend menampilkan:
   - Preview gambar.
   - Nama tanaman.
   - Status sehat/sakit.
   - Rincian warna dan tekstur.
   - Identifikasi penyakit.
   - Tips perawatan.
   - Rekomendasi solusi.

## Prompt Gemini
System prompt menginstruksikan AI sebagai pakar botani umum dengan fokus PCD:
- Identifikasi jenis tanaman dari daun.
- Evaluasi fitur warna dan tekstur visual.
- Tentukan status `Sehat` atau `Sakit`.
- Jika sakit, berikan nama penyakit yang paling mungkin.
- Jika sehat, isi `identifikasi_penyakit` dengan `Tidak ada`.
- Respons wajib berupa JSON murni tanpa markdown.

## Validasi dan Error Handling
- Hanya menerima file `image/*`.
- Ukuran maksimum 8 MB.
- Error API ditampilkan langsung di UI.
- Jika Gemini mengembalikan markdown/code fence, API membersihkan respons sebelum parsing.
- Jika JSON tidak lengkap, API mengembalikan status `502`.

## Styling
- Background gradien halus bernuansa hijau, biru, dan amber.
- Panel upload dan hasil memakai glassmorphism: transparansi, border putih, blur, dan shadow lembut.
- Layout hasil diagnosis memakai Bento Grid responsif.
- Loading state memakai indikator berdenyut dan pesan progres singkat.
