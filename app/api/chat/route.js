import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

const SYSTEM_PROMPT = `
Anda adalah pakar botani, pertanian cerdas, dan asisten AI ahli kesehatan tanaman bernama zans.citra.AI.
Tugas Anda adalah membantu pengguna menjawab pertanyaan seputar kesehatan tanaman, identifikasi gejala penyakit tanaman (khususnya melalui daun), cara perawatan tanaman, teknik Pengolahan Citra Digital (PCD) yang digunakan untuk mendeteksi tanaman, dan tips hortikultura lainnya.

Instruksi Wajib:
1. Jawablah dengan ramah, ramah, dan profesional menggunakan Bahasa Indonesia yang baik dan mudah dipahami.
2. Gunakan pemformatan Markdown (seperti cetak tebal, daftar bertitik, atau tabel) agar informasi terstruktur rapi dan nyaman dibaca.
3. Berikan saran yang praktis dan aplikatif (misalnya seputar penyiraman, pemupukan organik, pestisida alami, dan kelembapan).
4. Jika pengguna bertanya hal di luar botani, tanaman, pertanian, atau teknologi pengolahan citra tanaman, ingatkan mereka secara sopan bahwa spesialisasi Anda adalah seputar dunia tumbuh-tumbuhan dan teknologi zans.citra.AI.
`;

export async function POST(request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { error: 'GEMINI_API_KEY atau API_KEY belum diatur di file .env.' },
        { status: 500 }
      );
    }

    const { message, history } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Pesan tidak boleh kosong.' }, { status: 400 });
    }

    const genAI = new GoogleGenerativeAI(apiKey);

    // Gunakan fallback model dari environment variable
    const fallbackModelsEnv = process.env.GEMINI_FALLBACK_MODELS || 'gemini-1.5-flash';
    const modelsToTry = fallbackModelsEnv.split(',').map(m => m.trim()).filter(Boolean);

    let chatResponse = '';
    let lastError = null;

    // Memetakan riwayat chat dari client ke format Gemini SDK
    // Format input: [{ role: 'user' | 'model', text: string }]
    // Format Gemini: [{ role: 'user' | 'model', parts: [{ text: string }] }]
    const formattedHistory = (history || []).map(msg => ({
      role: msg.role === 'model' ? 'model' : 'user',
      parts: [{ text: msg.text }]
    }));

    for (const modelName of modelsToTry) {
      try {
        console.log(`Chatbot mencoba model: ${modelName}`);
        const model = genAI.getGenerativeModel({
          model: modelName,
          systemInstruction: SYSTEM_PROMPT,
        });

        const chat = model.startChat({
          history: formattedHistory,
        });

        const result = await chat.sendMessage(message);
        chatResponse = result.response.text();

        if (chatResponse) {
          lastError = null;
          break;
        }
      } catch (error) {
        console.error(`Chatbot error dengan model ${modelName}:`, error.message || error);
        lastError = error;
      }
    }

    if (lastError || !chatResponse) {
      console.error('Chatbot: Semua model fallback gagal atau respons kosong.');
      return NextResponse.json(
        { error: `Gagal mendapatkan jawaban dari AI. Detail: ${lastError?.message || 'Respons kosong'}` },
        { status: 502 }
      );
    }

    return NextResponse.json({ text: chatResponse });
  } catch (error) {
    console.error('Chatbot endpoint error:', error);
    return NextResponse.json(
      { error: 'Terjadi kesalahan internal saat memproses percakapan.' },
      { status: 500 }
    );
  }
}
