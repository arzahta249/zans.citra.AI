import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const MAX_IMAGE_SIZE = 8 * 1024 * 1024;

const SYSTEM_PROMPT = `
Anda adalah pakar botani umum dan analis citra visual untuk praktikum Pengolahan Citra Digital.
Tugas Anda adalah menganalisis gambar daun tanaman yang diberikan.

Instruksi wajib:
- Identifikasi jenis tanaman berdasarkan bentuk dan karakter visual daun.
- Evaluasi fitur warna daun secara detail, termasuk warna dominan, perubahan warna, bercak, klorosis, nekrosis, atau pola lain yang terlihat.
- Evaluasi fitur tekstur daun secara detail, termasuk permukaan, urat daun, bercak, lubang, keriting, mengering, jamur, atau gejala visual lain.
- Tentukan "status" hanya dengan nilai "Sehat" atau "Sakit".
- Jika daun sakit, isi "identifikasi_penyakit" dengan nama penyakit atau dugaan penyakit paling mungkin.
- Jika daun sehat, isi "identifikasi_penyakit" dengan "Tidak ada".
- Berikan tips perawatan dan rekomendasi solusi yang praktis.
- Jangan menambahkan markdown, code fence, komentar, atau teks di luar JSON.
- Setiap nilai teks di dalam JSON wajib sangat singkat dan padat (maksimal 1-2 kalimat pendek saja) agar respons tidak terpotong.
- Respons HANYA JSON murni dengan key berikut:
{
  "nama_tanaman": "Nama tanaman yang paling mungkin",
  "status": "Sehat/Sakit",
  "rincian_visual": "Penjelasan sangat singkat (1-2 kalimat) warna & tekstur daun",
  "identifikasi_penyakit": "Nama penyakit jika sakit, atau Tidak ada jika sehat",
  "tips_perawatan": "Tips perawatan sangat ringkas (1-2 kalimat)",
  "rekomendasi_solusi": "Rekomendasi solusi sangat ringkas (1-2 kalimat)"
}
`;

function cleanJson(content) {
  return content
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
}

function extractJsonObject(content) {
  const cleaned = cleanJson(content);

  try {
    return JSON.parse(cleaned);
  } catch {
    // Continue with balanced-brace extraction
  }

  const start = cleaned.indexOf('{');

  if (start === -1) {
    throw new Error('Respons AI tidak berisi objek JSON.');
  }

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let index = start; index < cleaned.length; index += 1) {
    const char = cleaned[index];

    if (escaped) {
      escaped = false;
      continue;
    }

    if (char === '\\') {
      escaped = true;
      continue;
    }

    if (char === '"') {
      inString = !inString;
      continue;
    }

    if (inString) {
      continue;
    }

    if (char === '{') {
      depth += 1;
    }

    if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return JSON.parse(cleaned.slice(start, index + 1));
      }
    }
  }

  throw new Error('Objek JSON dari AI tidak lengkap.');
}

function normalizeResult(parsed) {
  const status = parsed?.status === 'Sakit' ? 'Sakit' : 'Sehat';

  return {
    nama_tanaman:
      typeof parsed?.nama_tanaman === 'string' && parsed.nama_tanaman.trim()
        ? parsed.nama_tanaman.trim()
        : 'Belum dapat dipastikan',
    status,
    rincian_visual:
      typeof parsed?.rincian_visual === 'string' && parsed.rincian_visual.trim()
        ? parsed.rincian_visual.trim()
        : 'Fitur warna dan tekstur belum dapat dipastikan dari gambar.',
    identifikasi_penyakit:
      typeof parsed?.identifikasi_penyakit === 'string' && parsed.identifikasi_penyakit.trim()
        ? parsed.identifikasi_penyakit.trim()
        : status === 'Sakit'
          ? 'Belum dapat dipastikan'
          : 'Tidak ada',
    tips_perawatan:
      typeof parsed?.tips_perawatan === 'string' && parsed.tips_perawatan.trim()
        ? parsed.tips_perawatan.trim()
        : 'Gunakan pencahayaan cukup, penyiraman terukur, dan pantau perubahan daun secara berkala.',
    rekomendasi_solusi:
      typeof parsed?.rekomendasi_solusi === 'string' && parsed.rekomendasi_solusi.trim()
        ? parsed.rekomendasi_solusi.trim()
        : 'Pisahkan daun yang bermasalah, perbaiki sirkulasi udara, dan gunakan perlakuan organik sesuai gejala.',
  };
}

export async function POST(request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY atau API_KEY belum diatur di file .env.' },
        { status: 500 }
      );
    }

    const formData = await request.formData();
    const image = formData.get('image');

    if (!image || typeof image === 'string') {
      return NextResponse.json({ error: 'Gambar daun tidak ditemukan.' }, { status: 400 });
    }

    if (!image.type?.startsWith('image/')) {
      return NextResponse.json({ error: 'File harus berupa gambar.' }, { status: 400 });
    }

    if (image.size > MAX_IMAGE_SIZE) {
      return NextResponse.json({ error: 'Ukuran gambar maksimal 8 MB.' }, { status: 400 });
    }

    const buffer = Buffer.from(await image.arrayBuffer());
    const imagePart = {
      inlineData: {
        data: buffer.toString('base64'),
        mimeType: image.type,
      },
    };

    const genAI = new GoogleGenerativeAI(apiKey);

    // Gunakan fallback model dari environment variable
    const fallbackModelsEnv = process.env.GEMINI_FALLBACK_MODELS || 'gemini-1.5-flash';
    const modelsToTry = fallbackModelsEnv.split(',').map(m => m.trim()).filter(Boolean);

    let aiResponse = '';
    let lastError = null;

    for (const modelName of modelsToTry) {
      try {
        console.log(`Mencoba model: ${modelName}`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          generationConfig: {
            maxOutputTokens: 600,
            responseMimeType: "application/json",
          }
        });

        const prompt = SYSTEM_PROMPT + '\nAnalisis citra daun berikut ini.';

        const result = await model.generateContent([prompt, imagePart]);
        const response = result.response;
        aiResponse = response.text();

        if (aiResponse) {
          // Berhasil mendapatkan respons
          lastError = null;
          break;
        }
      } catch (error) {
        console.error(`Error dengan model ${modelName}:`, error.message || error);
        lastError = error;
        // Lanjutkan ke model berikutnya dalam daftar
      }
    }

    if (lastError || !aiResponse) {
      console.error('Semua model fallback gagal atau respons kosong.');
      return NextResponse.json(
        { error: `Gagal mendapatkan analisis dari AI. Detail: ${lastError?.message || 'Respons kosong'}` },
        { status: 502 }
      );
    }

    try {
      const parsed = extractJsonObject(aiResponse);
      return NextResponse.json(normalizeResult(parsed));
    } catch (parseError) {
      console.error('Gagal mem-parsing JSON dari AI.');
      console.error('Error detail:', parseError.message || parseError);
      console.error('Raw content dari AI:', aiResponse);

      return NextResponse.json(
        {
          error: 'Format respons AI tidak valid. Harap gunakan gambar daun yang terlihat lebih jelas dan fokus.',
          details: aiResponse.slice(0, 400)
        },
        { status: 502 }
      );
    }
  } catch (error) {
    console.error('Gemini analyze error:', error);

    return NextResponse.json(
      { error: 'Terjadi kesalahan saat menghubungi API Gemini.' },
      { status: 500 }
    );
  }
}
