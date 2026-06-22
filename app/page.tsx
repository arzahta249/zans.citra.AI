'use client';

import { ChangeEvent, DragEvent, useEffect, useRef, useState } from 'react';
import { siteConfig } from '@/config/site';

type AnalysisResult = {
  nama_tanaman: string;
  status: 'Sehat' | 'Sakit';
  rincian_visual: string;
  identifikasi_penyakit: string;
  tips_perawatan: string;
  rekomendasi_solusi: string;
};

type HistoryItem = {
  id: string;
  createdAt: string;
  imageDataUrl: string;
  fileName: string;
  result: AnalysisResult;
};

type GeminiState = 'idle' | 'active' | 'success' | 'error';

type ChatMessage = {
  id: string;
  role: 'user' | 'model';
  text: string;
  createdAt: string;
};

const MAX_IMAGE_SIZE_MB = 8;
const HISTORY_KEY = 'plant-health-identification-history';
const MAX_HISTORY = 12;

export default function PlantHealthIdentifier() {
  const [isMounted, setIsMounted] = useState(false);
  const [currentTab, setCurrentTab] = useState<'beranda' | 'analisis' | 'tanya-ai' | 'about'>('beranda');

  // States & Refs untuk Analisis Citra
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [geminiState, setGeminiState] = useState<GeminiState>('idle');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // States & Refs untuk Kamera Langsung
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment');
  const [hasMultipleCameras, setHasMultipleCameras] = useState(false);
  const [activeUploadTab, setActiveUploadTab] = useState<'camera' | 'upload'>('camera');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // States & Refs untuk Chatbot Tanya AI
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'model',
      text: 'Halo! Saya asisten pakar kesehatan tanaman **zans.citra.AI**. Ada yang bisa saya bantu hari ini? Anda bisa menanyakan tentang gejala daun tanaman Anda, tips penyiraman, hama, pemupukan organik, atau teknologi pengolahan citra digital di aplikasi ini.',
      createdAt: new Date().toISOString()
    }
  ]);
  const [chatInput, setChatInput] = useState('');
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [chatError, setChatError] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll chat ke bawah
  useEffect(() => {
    if (currentTab === 'tanya-ai') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [chatMessages, currentTab]);

  useEffect(() => {
    setIsMounted(true);
    try {
      const savedHistory = window.localStorage.getItem(HISTORY_KEY);
      const parsedHistory = savedHistory ? JSON.parse(savedHistory) : [];
      if (Array.isArray(parsedHistory)) {
        setHistory(parsedHistory);
      }
    } catch {
      // Ignore parse error
    }
  }, []);

  useEffect(() => {
    if (isMounted) {
      window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
    }
  }, [history, isMounted]);

  // Observer untuk efek scroll fade-in
  useEffect(() => {
    const revealElements = document.querySelectorAll('[data-reveal]');
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-visible');
          }
        });
      },
      { threshold: 0.1, rootMargin: '0px 0px -20px 0px' }
    );

    revealElements.forEach((element) => observer.observe(element));

    return () => observer.disconnect();
  }, [currentTab, result, history, isLoading, chatMessages]);

  useEffect(() => {
    return () => {
      if (previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Cek jumlah kamera
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.enumerateDevices) {
      navigator.mediaDevices.enumerateDevices()
        .then((devices) => {
          const videoDevices = devices.filter((device) => device.kind === 'videoinput');
          setHasMultipleCameras(videoDevices.length > 1);
        })
        .catch((err) => console.error('Error checking cameras:', err));
    }
  }, []);

  // Matikan kamera saat unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  // Pemicu kamera
  const startCamera = async (currentFacingMode = facingMode) => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    
    setErrorMessage('');
    
    try {
      const constraints = {
        video: {
          facingMode: currentFacingMode,
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      };
      
      const stream = await navigator.mediaDevices.getUserMedia(constraints);
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      setIsCameraActive(true);
      setGeminiState('idle');
      
      if (previewUrl?.startsWith('blob:')) {
        URL.revokeObjectURL(previewUrl);
      }
      setImageFile(null);
      setPreviewUrl(null);
      setResult(null);
    } catch (err: unknown) {
      console.error('Gagal mengakses kamera:', err);
      const cameraError = err instanceof DOMException ? err : null;
      let errMsg = 'Gagal mengakses kamera. Pastikan Anda memberikan izin akses kamera.';
      if (cameraError?.name === 'NotAllowedError') {
        errMsg = 'Akses kamera ditolak. Harap izinkan akses kamera pada browser Anda.';
      } else if (cameraError?.name === 'NotFoundError') {
        errMsg = 'Kamera tidak ditemukan di perangkat ini.';
      }
      setErrorMessage(errMsg);
      setGeminiState('error');
      setIsCameraActive(false);
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setIsCameraActive(false);
  };

  const switchCamera = () => {
    const newFacingMode = facingMode === 'environment' ? 'user' : 'environment';
    setFacingMode(newFacingMode);
    if (isCameraActive) {
      startCamera(newFacingMode);
    }
  };

  const capturePhoto = () => {
    if (videoRef.current && isCameraActive && streamRef.current) {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 480;
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        if (facingMode === 'user') {
          ctx.translate(canvas.width, 0);
          ctx.scale(-1, 1);
        }
        
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        
        canvas.toBlob((blob) => {
          if (blob) {
            const file = new File([blob], `kamera-daun-${Date.now()}.jpg`, { type: 'image/jpeg' });
            selectImage(file);
            stopCamera();
          }
        }, 'image/jpeg', 0.95);
      }
    }
  };

  const selectImage = (file: File) => {
    if (!file.type.startsWith('image/')) {
      setErrorMessage('File harus berupa gambar daun.');
      setGeminiState('error');
      return;
    }

    if (file.size > MAX_IMAGE_SIZE_MB * 1024 * 1024) {
      setErrorMessage(`Ukuran gambar maksimal ${MAX_IMAGE_SIZE_MB} MB.`);
      setGeminiState('error');
      return;
    }

    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    setImageFile(file);
    setPreviewUrl(URL.createObjectURL(file));
    setResult(null);
    setErrorMessage('');
    setGeminiState('idle');
  };

  const handleFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      selectImage(file);
    }
  };

  const handleDrop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    setIsDragging(false);

    const file = event.dataTransfer.files?.[0];
    if (file) {
      selectImage(file);
    }
  };

  const resetImage = () => {
    stopCamera();
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    setImageFile(null);
    setPreviewUrl(null);
    setResult(null);
    setErrorMessage('');
    setGeminiState('idle');

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const analyzeImage = async () => {
    if (!imageFile) {
      setErrorMessage('Pilih atau drag gambar daun terlebih dahulu.');
      setGeminiState('error');
      return;
    }

    setIsLoading(true);
    setErrorMessage('');
    setResult(null);
    setGeminiState('active');

    try {
      const formData = new FormData();
      formData.append('image', imageFile);

      const response = await fetch('/api/analyze', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail ? `${data.error} Detail: ${data.detail}` : data.error || 'Analisis gambar gagal diproses.'
        );
      }

      setResult(data);
      setGeminiState('success');

      const imageDataUrl = await fileToDataUrl(imageFile);
      const historyItem: HistoryItem = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        imageDataUrl,
        fileName: imageFile.name,
        result: data,
      };

      setHistory((currentHistory) => [historyItem, ...currentHistory].slice(0, MAX_HISTORY));
    } catch (error) {
      setErrorMessage(
        error instanceof Error ? error.message : 'Terjadi kesalahan yang tidak diketahui.'
      );
      setGeminiState('error');
    } finally {
      setIsLoading(false);
    }
  };

  const openHistoryItem = (item: HistoryItem) => {
    if (previewUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(previewUrl);
    }

    setImageFile(null);
    setPreviewUrl(item.imageDataUrl);
    setResult(item.result);
    setErrorMessage('');
    setGeminiState('success');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const clearHistory = () => {
    setHistory([]);
  };

  // Fungsi Kirim Pesan Tanya AI
  const sendChatMessage = async (customMessage?: string) => {
    const textToSend = customMessage || chatInput;
    if (!textToSend.trim() || isChatLoading) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      text: textToSend,
      createdAt: new Date().toISOString()
    };

    setChatMessages((prev) => [...prev, userMsg]);
    if (!customMessage) setChatInput('');
    setIsChatLoading(true);
    setChatError('');

    try {
      const historyPayload = chatMessages
        .filter((msg) => msg.id !== 'welcome')
        .map((msg) => ({
          role: msg.role,
          text: msg.text
        }));

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: textToSend,
          history: historyPayload
        })
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Gagal memproses konsultasi.');
      }

      const aiMsg: ChatMessage = {
        id: crypto.randomUUID(),
        role: 'model',
        text: data.text,
        createdAt: new Date().toISOString()
      };

      setChatMessages((prev) => [...prev, aiMsg]);
    } catch (err) {
      setChatError(err instanceof Error ? err.message : 'Terjadi kesalahan saat menghubungi server.');
    } finally {
      setIsChatLoading(false);
    }
  };

  // Parser Markdown Sederhana
  const parseMarkdown = (text: string) => {
    let formatted = text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Bold text: **text** -> <strong>text</strong>
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');

    // Code inline: `code`
    formatted = formatted.replace(/`(.*?)`/g, '<code class="px-1.5 py-0.5 rounded bg-black/35 font-mono text-xs border border-white/10 text-[#6fffae]">$1</code>');

    // Bullet items
    formatted = formatted.split('\n').map((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith('- ') || trimmed.startsWith('* ')) {
        return `<li class="ml-4 list-disc my-1 text-[#e2ffe9]">${trimmed.substring(2)}</li>`;
      }
      return line;
    }).join('\n');

    // Line breaks
    formatted = formatted.replace(/\n/g, '<br />');

    return formatted;
  };

  const navItems = [
    { id: 'beranda', name: 'Beranda' },
    { id: 'analisis', name: 'Analisis Citra' },
    { id: 'tanya-ai', name: 'Tanya AI' },
    { id: 'about', name: 'Tentang Kami' }
  ] as const;

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#081611] text-[#e9fff1]">
      {/* Background Neon Elements */}
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_12%_12%,rgba(0,255,157,0.2),transparent_28%),radial-gradient(circle_at_86%_18%,rgba(70,181,255,0.18),transparent_30%),radial-gradient(circle_at_50%_88%,rgba(255,211,91,0.13),transparent_28%),linear-gradient(135deg,#07120f_0%,#10241c_48%,#142217_100%)]" />
      <div className="scanlines pointer-events-none absolute inset-0 opacity-20" />

      <section className="relative mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
        
        {/* Navigation Header Global */}
        <header className="glass-panel futuristic-border mb-6 flex flex-col items-center justify-between gap-4 p-4 md:flex-row md:px-6" data-reveal>
          <div className="flex items-center gap-3">
            {/* Logo Neon Icon */}
            <div className="flex size-10 items-center justify-center rounded-[8px] border border-[#6cffb0]/30 bg-[#0e3020] text-[#6cffb0] shadow-[0_0_15px_rgba(108,255,176,0.2)]">
              <svg className="size-6 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
              </svg>
            </div>
            <div>
              <span className="text-xl font-black tracking-wider text-white">zans.citra.AI</span>
              <p className="text-[9px] font-black uppercase tracking-[0.25em] text-[#71fbb4] mt-0.5">Digital Image Processing</p>
            </div>
          </div>

          {/* Nav Tabs */}
          <nav className="flex flex-wrap justify-center gap-1 rounded-[8px] bg-black/35 p-1 border border-white/5">
            {navItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  stopCamera();
                  setCurrentTab(item.id);
                }}
                className={`rounded-[6px] px-4 py-2 text-xs font-black uppercase tracking-wider transition-all duration-300 ${
                  currentTab === item.id
                    ? 'bg-[#20c978] text-[#06120d] shadow-[0_0_12px_rgba(32,201,120,0.35)]'
                    : 'text-[#8ba796] hover:bg-white/[0.04] hover:text-white'
                }`}
              >
                {item.name}
              </button>
            ))}
          </nav>
        </header>

        {/* ==================== CONTENT TABS ==================== */}
        
        {/* 1. TAB BERANDA (Landing Page) */}
        {currentTab === 'beranda' && (
          <div className="flex-1 space-y-8 py-2">
            
            {/* Hero Banner Section */}
            <section className="glass-panel futuristic-border relative overflow-hidden p-6 text-center sm:p-10" data-reveal>
              <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-[#5cffaa] opacity-[0.04] blur-3xl" />
              <div className="pointer-events-none absolute -left-24 -bottom-24 size-96 rounded-full bg-[#6db3ff] opacity-[0.04] blur-3xl" />
              
              <div className="relative mx-auto max-w-3xl">
                <span className="rounded-full bg-[#20c978]/10 border border-[#20c978]/30 px-4.5 py-1 text-[11px] font-black uppercase tracking-widest text-[#6cffb0] inline-block">
                  Sistem Deteksi Kesehatan Tanaman Cerdas
                </span>
                <h1 className="mt-5 text-3xl font-black leading-tight text-white sm:text-5xl md:text-6xl">
                  Revolusi Analisis Daun bersama <span className="text-[#6cffb0] shadow-sm drop-shadow-[0_0_10px_rgba(108,255,176,0.3)]">zans.citra.AI</span>
                </h1>
                <p className="mt-5 text-sm leading-relaxed text-[#badfc9] sm:text-base md:text-lg">
                  Mengidentifikasi jenis tanaman, mengevaluasi kondisi visual daun (fitur warna & tekstur), mendeteksi penyakit secara presisi, serta berkonsultasi seputar botani secara interaktif dengan asisten cerdas AI.
                </p>
                <div className="mt-8 flex flex-wrap justify-center gap-4">
                  <button
                    type="button"
                    onClick={() => setCurrentTab('analisis')}
                    className="rounded-[8px] bg-[#20c978] px-6 py-3.5 text-xs font-black uppercase tracking-wider text-[#06120d] shadow-[0_0_24px_rgba(32,201,120,0.3)] transition hover:-translate-y-0.5 hover:bg-[#77f5ae]"
                  >
                    Mulai Analisis Citra
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentTab('tanya-ai')}
                    className="rounded-[8px] border border-white/10 bg-white/[0.06] px-6 py-3.5 text-xs font-black uppercase tracking-wider text-white transition hover:bg-white/[0.14]"
                  >
                    Konsultasi Tanya AI
                  </button>
                </div>
              </div>
            </section>

            {/* Hubungan Sistem (Features Grid) */}
            <section className="grid gap-5 md:grid-cols-3">
              
              <div className="glass-panel futuristic-border p-6" data-reveal>
                <div className="mb-4 flex size-12 items-center justify-center rounded-[8px] bg-[#6cffb0]/10 text-[#6cffb0] border border-[#6cffb0]/20 shadow-[0_0_12px_rgba(108,255,176,0.1)]">
                  <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                  </svg>
                </div>
                <h3 className="text-lg font-black text-white">1. Deteksi Visual Cerdas</h3>
                <p className="mt-3 text-xs leading-relaxed text-[#a9cab6]">
                  Ambil foto daun tanaman Anda langsung dari kamera HP atau laptop Anda. Sistem memproses citra daun secara instan dengan input berkekuatan visual AI.
                </p>
              </div>

              <div className="glass-panel futuristic-border p-6" data-reveal>
                <div className="mb-4 flex size-12 items-center justify-center rounded-[8px] bg-[#ffde6a]/10 text-[#ffde6a] border border-[#ffde6a]/20 shadow-[0_0_12px_rgba(255,222,106,0.1)]">
                  <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                  </svg>
                </div>
                <h3 className="text-lg font-black text-white">2. Ekstraksi Warna & Tekstur</h3>
                <p className="mt-3 text-xs leading-relaxed text-[#a9cab6]">
                  Mengevaluasi indikator visual tanaman seperti derajat klorosis (menguning), bercak daun, nekrosis (sel mati), serta kerapatan tekstur urat daun tanaman.
                </p>
              </div>

              <div className="glass-panel futuristic-border p-6" data-reveal>
                <div className="mb-4 flex size-12 items-center justify-center rounded-[8px] bg-[#6ad2ff]/10 text-[#6ad2ff] border border-[#6ad2ff]/20 shadow-[0_0_12px_rgba(106,210,255,0.1)]">
                  <svg className="size-6" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" />
                  </svg>
                </div>
                <h3 className="text-lg font-black text-white">3. Konsultasi Tanya AI</h3>
                <p className="mt-3 text-xs leading-relaxed text-[#a9cab6]">
                  Gunakan fitur Tanya AI terintegrasi untuk berkonsultasi seputar masalah tumbuhan Anda, rekomendasi pupuk organik, tips pencegahan hama, dan perlakuan hortikultura.
                </p>
              </div>

            </section>

            {/* Visi & Misi Section */}
            <section className="grid gap-5 md:grid-cols-5" data-reveal>
              {/* Visi Card */}
              <div className="glass-panel futuristic-border p-6 md:col-span-2 flex flex-col justify-center bg-[#0d2a1f]/35 border-[#20c978]/25">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-[#6cffb0]">Visi Platform</span>
                <h2 className="mt-2 text-2xl font-black text-white">Menuju Pertanian Cerdas Mandiri</h2>
                <p className="mt-4 text-xs leading-relaxed text-[#badbc6]">
                  "Menjadi platform pionir dalam mempermudah akses diagnosis kesehatan tanaman secara instan, akurat, dan gratis bagi petani, akademisi, dan pecinta tanaman hias di mana pun berada."
                </p>
              </div>

              {/* Misi Card */}
              <div className="glass-panel futuristic-border p-6 md:col-span-3">
                <span className="text-xs font-black uppercase tracking-[0.2em] text-[#6cffb0]">Misi Kami</span>
                <h2 className="mt-2 text-2xl font-black text-white">Langkah Nyata Pengembangan</h2>
                
                <div className="mt-5 space-y-4 text-xs leading-relaxed text-[#a2caa9]">
                  <div className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded bg-[#20c978]/15 font-black text-[#6cffb0] border border-[#20c978]/20">1</span>
                    <p className="pt-0.5">
                      Menyediakan teknologi pemrosesan gambar digital (PCD) yang mudah diakses guna mengenali penyakit tanaman sejak dini secara visual.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded bg-[#20c978]/15 font-black text-[#6cffb0] border border-[#20c978]/20">2</span>
                    <p className="pt-0.5">
                      Mengedukasi masyarakat luas tentang taktik perawatan tumbuhan sehat serta penanggulangan alami yang ramah lingkungan melalui Asisten AI.
                    </p>
                  </div>
                  <div className="flex gap-3">
                    <span className="flex size-6 shrink-0 items-center justify-center rounded bg-[#20c978]/15 font-black text-[#6cffb0] border border-[#20c978]/20">3</span>
                    <p className="pt-0.5">
                      Mendukung produktivitas dan keberlanjutan pertanian lokal dengan meminimalisasi risiko gagal panen akibat serangan penyakit pada daun.
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Workflow Banner */}
            <section className="glass-panel futuristic-border p-6" data-reveal>
              <h3 className="text-center text-lg font-black text-white uppercase tracking-wider mb-6">Cara Kerja Aliran Deteksi</h3>
              <div className="grid gap-4 sm:grid-cols-4 text-center text-xs">
                
                <div className="p-3 border border-white/5 bg-white/[0.02] rounded-[8px] relative">
                  <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-[#6cffb0]/15 text-[#6cffb0] font-black border border-[#6cffb0]/30 mb-2">1</div>
                  <span className="block font-black text-white">Unggah / Foto Daun</span>
                  <p className="mt-1.5 text-[11px] text-[#8aa595]">Ambil foto daun segar atau daun yang terindikasi sakit.</p>
                </div>

                <div className="p-3 border border-white/5 bg-white/[0.02] rounded-[8px] relative">
                  <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-[#6cffb0]/15 text-[#6cffb0] font-black border border-[#6cffb0]/30 mb-2">2</div>
                  <span className="block font-black text-white">Pemindaian PCD</span>
                  <p className="mt-1.5 text-[11px] text-[#8aa595]">Algoritma memindai fitur warna daun & anomali permukaan.</p>
                </div>

                <div className="p-3 border border-white/5 bg-white/[0.02] rounded-[8px] relative">
                  <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-[#6cffb0]/15 text-[#6cffb0] font-black border border-[#6cffb0]/30 mb-2">3</div>
                  <span className="block font-black text-white">Inferensi Model AI</span>
                  <p className="mt-1.5 text-[11px] text-[#8aa595]">Kecerdasan buatan Gemini menganalisis jenis patogen daun.</p>
                </div>

                <div className="p-3 border border-white/5 bg-white/[0.02] rounded-[8px] relative">
                  <div className="mx-auto flex size-8 items-center justify-center rounded-full bg-[#6cffb0]/15 text-[#6cffb0] font-black border border-[#6cffb0]/30 mb-2">4</div>
                  <span className="block font-black text-white">Diagnosis & Tips</span>
                  <p className="mt-1.5 text-[11px] text-[#8aa595]">Laporan status daun keluar bersama rekomendasi perlakuan.</p>
                </div>

              </div>
            </section>
            
          </div>
        )}

        {/* 2. TAB ANALISIS (Leaf Disease Identifier Panel) */}
        {currentTab === 'analisis' && (
          <div className="grid flex-1 gap-5 lg:grid-cols-[420px_1fr] py-2">
            
            {/* Sidebar Scanner Upload */}
            <section className="space-y-5">
              <div className="glass-panel futuristic-border flex flex-col gap-4 p-4" data-reveal>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileChange}
                />

                {/* Tab Camera/Upload */}
                <div className="flex border-b border-white/10 pb-2">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveUploadTab('camera');
                      stopCamera();
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 py-2 text-xs font-black uppercase tracking-wider transition ${
                      activeUploadTab === 'camera'
                        ? 'text-[#6cffb0] border-b-2 border-[#6cffb0]'
                        : 'text-[#8ba796] hover:text-white'
                    }`}
                  >
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                    Kamera Langsung
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setActiveUploadTab('upload');
                      stopCamera();
                    }}
                    className={`flex flex-1 items-center justify-center gap-2 py-2 text-xs font-black uppercase tracking-wider transition ${
                      activeUploadTab === 'upload'
                        ? 'text-[#6cffb0] border-b-2 border-[#6cffb0]'
                        : 'text-[#8ba796] hover:text-white'
                    }`}
                  >
                    <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                    </svg>
                    Unggah File
                  </button>
                </div>

                {/* Tab Camera/Upload Content */}
                {activeUploadTab === 'camera' ? (
                  isCameraActive ? (
                    <div className="relative w-full overflow-hidden rounded-[8px] border border-white/15 bg-black">
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className={`aspect-[4/3] w-full object-cover ${facingMode === 'user' ? 'scale-x-[-1]' : ''}`}
                      />
                      
                      <div className="absolute inset-x-0 h-[2.5px] bg-gradient-to-r from-transparent via-[#6cffb0] to-transparent shadow-[0_0_12px_#6cffb0] animate-scan" style={{ top: '0%' }} />
                      
                      <div className="absolute top-3 left-3 flex items-center gap-2 rounded bg-black/60 px-2 py-1 text-[10px] font-black tracking-widest text-[#6cffb0]">
                        <span className="h-2 w-2 animate-ping rounded-full bg-red-500" />
                        LIVE CAMERA
                      </div>
                      
                      <div className="absolute bottom-3 inset-x-0 flex items-center justify-center gap-3 px-3">
                        {hasMultipleCameras && (
                          <button
                            type="button"
                            onClick={switchCamera}
                            className="flex size-10 items-center justify-center rounded-full bg-black/70 border border-white/15 text-white transition hover:bg-black/90 hover:scale-105"
                            title="Ganti Kamera"
                          >
                            <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3m-3-3v12" />
                            </svg>
                          </button>
                        )}
                        
                        <button
                          type="button"
                          onClick={capturePhoto}
                          className="flex h-14 w-14 items-center justify-center rounded-full bg-[#20c978] text-[#06120d] border-4 border-white/20 transition hover:bg-[#77f5ae] hover:scale-105 active:scale-95 shadow-[0_0_15px_rgba(32,201,120,0.5)]"
                          title="Ambil Foto"
                        >
                          <div className="size-5 rounded-full border-2 border-[#06120d] bg-transparent" />
                        </button>

                        <button
                          type="button"
                          onClick={stopCamera}
                          className="flex size-10 items-center justify-center rounded-full bg-red-600/85 border border-white/15 text-white transition hover:bg-red-700 hover:scale-105"
                          title="Matikan Kamera"
                        >
                          <svg className="size-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  ) : previewUrl ? (
                    <div className="relative w-full overflow-hidden rounded-[8px] border border-white/15 bg-black/20">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={previewUrl}
                        alt="Preview jepretan kamera"
                        className="aspect-[4/3] w-full object-cover"
                      />
                      <button
                        type="button"
                        onClick={() => startCamera()}
                        className="absolute bottom-3 right-3 flex items-center gap-1.5 rounded-[6px] border border-white/20 bg-black/75 px-3 py-1.5 text-xs font-black text-[#6cffb0] transition hover:bg-black/90 hover:scale-102"
                      >
                        <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 1121.21 7.89M9 11l3-3 3 3m-3-3v12" />
                        </svg>
                        Ambil Ulang
                      </button>
                    </div>
                  ) : (
                    <div className="flex min-h-[280px] flex-col items-center justify-center rounded-[8px] border border-white/10 bg-white/[0.03] p-6 text-center">
                      <div className="grid size-16 place-items-center rounded-[8px] border border-[#76f7b3]/30 bg-[#0b2419] text-[#76f7b3] shadow-[0_0_20px_rgba(118,247,179,0.1)]">
                        <svg className="size-8 animate-pulse" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3 9a2 2 0 012-2h.93a2 2 0 001.664-.89l.812-1.22A2 2 0 0110.07 4h3.86a2 2 0 011.664.89l.812 1.22A2 2 0 0018.07 7H19a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2V9z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 13a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      </div>
                      <div className="mt-4">
                        <p className="text-lg font-black text-white">Kamera Perangkat</p>
                        <p className="mt-2 text-xs leading-5 text-[#b7d7c5] max-w-xs mx-auto">
                          Ambil foto daun tanaman secara langsung menggunakan kamera depan/belakang laptop atau HP Anda.
                        </p>
                        <button
                          type="button"
                          onClick={() => startCamera()}
                          className="mt-5 inline-flex items-center gap-2 rounded-[8px] bg-[#20c978] px-5 py-2.5 text-xs font-black text-[#06120d] shadow-[0_0_20px_rgba(32,201,120,0.2)] transition hover:-translate-y-0.5 hover:bg-[#77f5ae]"
                        >
                          <svg className="size-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                          Aktifkan Kamera
                        </button>
                      </div>
                    </div>
                  )
                ) : (
                  <div
                    role="button"
                    tabIndex={0}
                    onClick={() => fileInputRef.current?.click()}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        fileInputRef.current?.click();
                      }
                    }}
                    onDragOver={(event) => {
                      event.preventDefault();
                      setIsDragging(true);
                    }}
                    onDragLeave={() => setIsDragging(false)}
                    onDrop={handleDrop}
                    className={`group flex min-h-[280px] cursor-pointer flex-col items-center justify-center rounded-[8px] border border-dashed p-5 text-center transition ${
                      isDragging
                        ? 'border-[#6cffb0] bg-[#123a2b]/80 shadow-[0_0_38px_rgba(108,255,176,0.25)]'
                        : 'border-white/20 bg-white/[0.06] hover:border-[#78f8b6]/70 hover:bg-white/[0.1]'
                    }`}
                  >
                    {previewUrl ? (
                      <div className="w-full overflow-hidden rounded-[8px] border border-white/15 bg-black/20">
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={previewUrl}
                          alt="Preview daun yang akan dianalisis"
                          className="aspect-[4/3] w-full object-cover"
                        />
                      </div>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center gap-4">
                        <div className="grid size-16 place-items-center rounded-[8px] border border-[#76f7b3]/50 bg-[#0b2419] text-3xl font-black text-[#89ffbd] shadow-[0_0_30px_rgba(118,247,179,0.18)]">
                          +
                        </div>
                        <div>
                          <p className="text-lg font-black text-white">Drag gambar daun ke sini</p>
                          <p className="mt-2 text-xs leading-5 text-[#b7d7c5]">
                            atau klik untuk memilih file dari perangkat.
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Buttons controls */}
                <div className="grid gap-3 sm:grid-cols-[1fr_auto] lg:grid-cols-1 xl:grid-cols-[1fr_auto]">
                  <button
                    type="button"
                    onClick={analyzeImage}
                    disabled={!imageFile || isLoading || isCameraActive}
                    className="rounded-[8px] bg-[#20c978] px-5 py-3 text-sm font-black text-[#06120d] shadow-[0_0_34px_rgba(32,201,120,0.28)] transition hover:-translate-y-0.5 hover:bg-[#77f5ae] disabled:cursor-not-allowed disabled:bg-[#516b5c] disabled:text-[#b8c7bd] disabled:shadow-none"
                  >
                    {isLoading ? 'Menganalisis citra...' : 'Analisis daun'}
                  </button>
                  <button
                    type="button"
                    onClick={resetImage}
                    disabled={(!imageFile && !isCameraActive) || isLoading}
                    className="rounded-[8px] border border-white/15 bg-white/[0.08] px-5 py-3 text-sm font-black text-[#d9ffe8] transition hover:bg-white/[0.14] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reset
                  </button>
                </div>

                {imageFile && (
                  <div className="rounded-[8px] border border-white/15 bg-white/[0.07] p-3 text-xs font-semibold text-[#c4e8d2]">
                    <p className="truncate">File: {imageFile.name}</p>
                    <p className="mt-1">Ukuran: {(imageFile.size / 1024 / 1024).toFixed(2)} MB</p>
                  </div>
                )}

                {errorMessage && (
                  <div className="rounded-[8px] border border-[#ff6b6b]/60 bg-[#3a1111]/70 p-4 text-sm leading-6 text-[#ffd4d4] backdrop-blur-xl">
                    <p className="font-black text-[#ff8585]">Analisis belum berhasil</p>
                    <p>{errorMessage}</p>
                  </div>
                )}
              </div>

              {/* History Panel */}
              <HistoryPanel history={history} clearHistory={clearHistory} openHistoryItem={openHistoryItem} isMounted={isMounted} />
            </section>

            {/* Diagnosis Result Bento Grid */}
            <section className="grid min-h-[560px] gap-4">
              {isLoading ? (
                <LoadingPanel />
              ) : result ? (
                <ResultBento result={result} previewUrl={previewUrl} />
              ) : (
                <EmptyPanel previewUrl={previewUrl} />
              )}
            </section>
            
          </div>
        )}

        {/* 3. TAB TANYA AI (Interactive Chatbot Consultation) */}
        {currentTab === 'tanya-ai' && (
          <div className="flex-1 grid gap-5 lg:grid-cols-[280px_1fr] py-2">
            
            {/* Left Quick Questions Suggestions */}
            <section className="glass-panel futuristic-border p-4 flex flex-col gap-4" data-reveal>
              <div>
                <p className="text-xs font-black uppercase tracking-[0.2em] text-[#7df7b5]">Konsultasi Instan</p>
                <h2 className="mt-1 text-sm font-black text-white">Pertanyaan Rekomendasi</h2>
              </div>
              <p className="text-[11px] leading-relaxed text-[#a5c5b2]">
                Klik contoh pertanyaan di bawah ini untuk berkonsultasi seputar penyakit tanaman dengan asisten AI secara otomatis:
              </p>
              
              <div className="flex flex-col gap-2 mt-2">
                {[
                  'Mengapa daun cabai saya mengeriting?',
                  'Bagaimana cara mengatasi busuk akar tanaman hias?',
                  'Apa gejala tanaman kekurangan unsur Nitrogen?',
                  'Bagaimana cara membuat pestisida alami dari bawang putih?',
                  'Berapa kelembapan ideal untuk monstera?'
                ].map((q, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => sendChatMessage(q)}
                    disabled={isChatLoading}
                    className="w-full text-left p-2.5 rounded-[6px] border border-white/5 bg-white/[0.03] hover:bg-white/[0.08] hover:border-[#6cffb0]/40 transition text-xs text-[#d1eedb] font-semibold hover:text-white disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    "{q}"
                  </button>
                ))}
              </div>
            </section>

            {/* Chat Box Container */}
            <section className="glass-panel futuristic-border flex flex-col min-h-[520px] max-h-[640px] md:max-h-none overflow-hidden" data-reveal>
              {/* Chat Header */}
              <div className="flex items-center justify-between border-b border-white/10 p-4 bg-black/20">
                <div className="flex items-center gap-3">
                  <div className="size-2.5 rounded-full bg-[#5cff9d] gemini-live animate-pulse" />
                  <div>
                    <h3 className="text-sm font-black text-white">Obrolan Asisten Pakar</h3>
                    <p className="text-[9px] text-[#7efbb9] tracking-wider font-semibold">Aktif • Didukung Gemini AI</p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setChatMessages([
                    {
                      id: 'welcome',
                      role: 'model',
                      text: 'Halo! Saya asisten pakar kesehatan tanaman **zans.citra.AI**. Ada yang bisa saya bantu hari ini? Anda bisa menanyakan tentang gejala daun tanaman Anda, tips penyiraman, hama, pemupukan organik, atau teknologi pengolahan citra digital di aplikasi ini.',
                      createdAt: new Date().toISOString()
                    }
                  ])}
                  className="rounded-[6px] border border-white/10 bg-white/[0.05] px-2.5 py-1.5 text-[10px] font-black uppercase text-white hover:bg-white/[0.1] transition"
                >
                  Clear Chat
                </button>
              </div>

              {/* Chat Messages Area */}
              <div className="flex-1 overflow-y-auto p-4 space-y-4 smooth-scroll bg-black/[0.05]">
                {chatMessages.map((msg) => {
                  const isModel = msg.role === 'model';
                  return (
                    <div
                      key={msg.id}
                      className={`flex w-full ${isModel ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-[80%] rounded-[10px] px-4 py-3 text-sm leading-relaxed backdrop-blur-md border ${
                          isModel
                            ? 'bg-[#0f2e22]/75 border-[#6cffb0]/20 text-[#e6fbf0]'
                            : 'bg-[#1b3d5c]/65 border-[#6db3ff]/20 text-[#ebf5ff]'
                        }`}
                      >
                        {/* Avatar/Badge */}
                        <div className="text-[9px] font-black uppercase tracking-wider mb-1 opacity-70">
                          {isModel ? 'zans.citra.AI' : 'Anda'}
                        </div>
                        {/* Text Content parsed with simple markdown */}
                        <div
                          dangerouslySetInnerHTML={{ __html: parseMarkdown(msg.text) }}
                          className="prose-chat break-words"
                        />
                      </div>
                    </div>
                  );
                })}

                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="rounded-[10px] bg-[#0f2e22]/75 border border-[#6cffb0]/20 px-4 py-3">
                      <div className="flex gap-1.5 items-center py-1">
                        <span className="size-2 rounded-full bg-[#6cffb0] animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="size-2 rounded-full bg-[#6cffb0] animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="size-2 rounded-full bg-[#6cffb0] animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </div>
                )}

                {chatError && (
                  <div className="rounded-[8px] border border-[#ff6b6b]/45 bg-[#3a1111]/70 p-3.5 text-xs text-[#ffd6d6] text-center">
                    Gagal mengirim: {chatError}. Silakan coba lagi.
                  </div>
                )}
                
                <div ref={chatEndRef} />
              </div>

              {/* Chat Input Area */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  sendChatMessage();
                }}
                className="p-4 border-t border-white/10 bg-black/20 flex gap-2"
              >
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  disabled={isChatLoading}
                  placeholder="Ketik pertanyaan seputar tanaman (misal: pupuk alami untuk jeruk)..."
                  className="flex-1 rounded-[8px] border border-white/10 bg-black/40 px-4 py-3 text-xs text-white placeholder-white/30 focus:border-[#6cffb0]/65 focus:outline-none transition"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || isChatLoading}
                  className="rounded-[8px] bg-[#20c978] px-5 py-3 text-xs font-black uppercase text-[#06120d] shadow-[0_0_15px_rgba(32,201,120,0.2)] hover:bg-[#77f5ae] transition disabled:bg-[#516b5c] disabled:text-[#b8c7bd] disabled:shadow-none disabled:cursor-not-allowed"
                >
                  Kirim
                </button>
              </form>
            </section>
            
          </div>
        )}

        {/* 4. TAB ABOUT (Tentang Proyek) */}
        {currentTab === 'about' && (
          <div className="flex-1 space-y-6 py-2" data-reveal>
            
            {/* About Card 1: PCD & AI */}
            <div className="glass-panel futuristic-border p-6 sm:p-8">
              <span className="text-xs font-black uppercase tracking-[0.2em] text-[#6cffb0]">Latar Belakang Teknologi</span>
              <h2 className="mt-2 text-3xl font-black text-white">Teknologi Di Balik zans.citra.AI</h2>
              <p className="mt-4 text-sm leading-relaxed text-[#bfe8cc]">
                Aplikasi ini dikembangkan dalam rangka mengkaji implementasi praktis **Pengolahan Citra Digital (PCD)** yang bersinergi dengan Kecerdasan Buatan Generatif untuk mendeteksi kesehatan hayati secara non-destruktif.
              </p>

              <div className="grid gap-6 mt-8 md:grid-cols-2">
                
                <div className="p-4 rounded-[8px] border border-white/5 bg-white/[0.02]">
                  <h3 className="text-base font-black text-[#6cffb0] flex items-center gap-2">
                    <span className="size-2 rounded-full bg-[#6cffb0]" />
                    Ekstraksi Fitur Warna & Tekstur
                  </h3>
                  <p className="mt-2.5 text-xs leading-relaxed text-[#a8caa5]">
                    Warna daun merepresentasikan asupan klorofil dan kandungan gizi tanah. Terjadinya perubahan pigmentasi (misal klorosis atau bintik nekrotik) dipindai secara visual. Sementara kerapatan urat daun menentukan perubahan tekstur yang menyusut saat layu atau terjangkit jamur.
                  </p>
                </div>

                <div className="p-4 rounded-[8px] border border-white/5 bg-white/[0.02]">
                  <h3 className="text-base font-black text-[#68beff] flex items-center gap-2">
                    <span className="size-2 rounded-full bg-[#68beff]" />
                    AI Vision & Model Generatif
                  </h3>
                  <p className="mt-2.5 text-xs leading-relaxed text-[#a2bdce]">
                    Integrasi dengan Model Multimodal Gemini API memungkinkan sistem mengenali kecenderungan penyakit daun berdasarkan pola spasial citra yang diunggah secara instan. AI memberikan diagnosis deskriptif serta mengompilasi pustaka tips penanggulangan secara dinamis.
                  </p>
                </div>

              </div>
            </div>

            {/* Specs Card */}
            <div className="glass-panel futuristic-border p-6">
              <h3 className="text-lg font-black text-white mb-4">Informasi Sistem & Lingkungan</h3>
              <div className="overflow-x-auto text-xs">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-[#6cffb0] font-black uppercase tracking-wider">
                      <th className="py-2.5 pr-4">Komponen</th>
                      <th className="py-2.5">Keterangan Spesifikasi</th>
                    </tr>
                  </thead>
                  <tbody className="text-[#a5cab1] font-semibold">
                    <tr className="border-b border-white/5">
                      <td className="py-3 pr-4 text-white font-black">Nama Platform</td>
                      <td className="py-3">zans.citra.AI (PWA & Web App)</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-3 pr-4 text-white font-black">Basis Framework</td>
                      <td className="py-3">Next.js 16 (App Router) & React 19</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-3 pr-4 text-white font-black">API Integrasi</td>
                      <td className="py-3">Google Gemini Generative AI (Model fallback berkala)</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-3 pr-4 text-white font-black">PWA Engine</td>
                      <td className="py-3">Serwist (Service Worker precaching & offline fallback)</td>
                    </tr>
                    <tr className="border-b border-white/5">
                      <td className="py-3 pr-4 text-white font-black">Styling CSS</td>
                      <td className="py-3">Tailwind CSS (Custom Dark HSL Neon Theme)</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
            
          </div>
        )}

        {/* Global Footer */}
        <footer className="mt-8 border-t border-white/5 py-6 text-center text-[10px] font-semibold text-[#668371]" data-reveal>
          <p>© {new Date().getFullYear()} zans.citra.AI • Praktikum Pengolahan Citra Digital • All Rights Reserved.</p>
        </footer>

      </section>
    </main>
  );
}

// ==================== SUB-COMPONENTS ====================

function GeminiIndicator({ state }: { state: GeminiState }) {
  const isError = state === 'error';
  const isOn = state === 'active' || state === 'success';
  const label =
    state === 'active'
      ? 'Gemini aktif'
      : state === 'success'
        ? 'Gemini siap'
        : state === 'error'
          ? 'Gemini error'
          : 'Gemini standby';

  return (
    <div
      className={`flex items-center gap-3 rounded-[8px] border px-4 py-3 text-sm font-black ${
        isError
          ? 'border-[#ff5c5c]/70 bg-[#351010]/70 text-[#ffb4b4]'
          : isOn
            ? 'border-[#5cff9d]/70 bg-[#0e3323]/80 text-[#baffd2]'
            : 'border-white/15 bg-white/[0.07] text-[#cfeadb]'
      }`}
    >
      <span
        className={`size-3 rounded-full ${
          isError
            ? 'bg-[#ff4d4d] shadow-[0_0_18px_rgba(255,77,77,0.95)]'
            : isOn
              ? 'gemini-live bg-[#55ff9d]'
              : 'bg-[#6d8174]'
        }`}
      />
      {label}
    </div>
  );
}

function LoadingPanel() {
  return (
    <div className="glass-panel futuristic-border grid min-h-[560px] place-items-center p-8 text-center" data-reveal>
      <div className="max-w-md">
        <div className="mx-auto grid size-24 place-items-center rounded-[8px] border border-[#7cffb7]/40 bg-[#0b2419] shadow-[0_0_45px_rgba(124,255,183,0.16)]">
          <div className="loading-orbit" />
        </div>
        <h2 className="mt-6 text-2xl font-black text-white">Menganalisis Citra Daun...</h2>
        <p className="mt-3 text-sm leading-6 text-[#b9dac8]">
          Menghubungkan ke Gemini AI untuk mengevaluasi fitur warna daun, perubahan visual pigmentasi, dan tekstur daun secara real-time.
        </p>
      </div>
    </div>
  );
}

function EmptyPanel({ previewUrl }: { previewUrl: string | null }) {
  return (
    <div className="glass-panel futuristic-border grid min-h-[560px] place-items-center p-8 text-center" data-reveal>
      <div className="max-w-lg">
        <p className="text-xs font-black uppercase tracking-[0.24em] text-[#7df7b5]">Hasil Diagnosis</p>
        <h2 className="mt-3 text-3xl font-black text-white">Belum Ada Analisis</h2>
        <p className="mt-4 text-sm leading-7 text-[#bfdcc9]">
          {previewUrl
            ? 'Gambar sudah siap di sidebar. Silakan klik tombol "Analisis daun" di bawah gambar untuk memulai identifikasi kesehatan.'
            : 'Pilih atau ambil foto daun menggunakan menu kamera atau unggah file di sidebar sebelah kiri untuk mendiagnosis penyakit daun.'}
        </p>
      </div>
    </div>
  );
}

function ResultBento({
  result,
  previewUrl,
}: {
  result: AnalysisResult;
  previewUrl: string | null;
}) {
  const isHealthy = result.status === 'Sehat';

  return (
    <div className="grid gap-4 xl:grid-cols-6" data-reveal>
      <article className="glass-panel futuristic-border overflow-hidden xl:col-span-3 xl:row-span-2">
        <div className="aspect-[4/3] bg-black/20">
          {previewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={previewUrl} alt="Daun yang dianalisis" className="h-full w-full object-cover" />
          ) : (
            <div className="grid h-full place-items-center text-sm font-semibold text-[#b5d9c3]">
              Preview tidak tersedia
            </div>
          )}
        </div>
        <div className="p-5">
          <p className="text-xs font-black uppercase tracking-[0.22em] text-[#7df7b5]">Nama tanaman</p>
          <h2 className="mt-2 text-3xl font-black text-white">{result.nama_tanaman}</h2>
        </div>
      </article>

      <article
        className={`glass-panel futuristic-border p-5 xl:col-span-3 ${
          isHealthy ? 'border-[#65ff9f]/60 bg-[#0e3323]/65' : 'border-[#ff9a63]/70 bg-[#381d12]/70'
        }`}
      >
        <p className="text-xs font-black uppercase tracking-[0.22em] text-[#d2f8dc]">Status kesehatan</p>
        <div className="mt-4 flex items-end justify-between gap-4">
          <h3 className={`text-5xl font-black ${isHealthy ? 'text-[#67ff9f]' : 'text-[#ff9d67]'}`}>
            {result.status}
          </h3>
          <span className="rounded-[8px] border border-white/15 bg-white/[0.08] px-3 py-2 text-xs font-black text-[#d9ffe8]">
            Visual AI
          </span>
        </div>
      </article>

      <BentoCard
        className="xl:col-span-3"
        label="Identifikasi penyakit"
        title={isHealthy ? 'Tidak ada penyakit' : 'Terdeteksi penyakit'}
        body={isHealthy ? 'Tidak ditemukan indikasi penyakit dominan pada citra daun.' : result.identifikasi_penyakit}
        icon={
          <svg className="size-5 text-[#ff7b7b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        }
      />

      <BentoCard
        className="xl:col-span-6"
        label="Rincian visual warna dan tekstur"
        title="Analisis PCD"
        body={result.rincian_visual}
        icon={
          <svg className="size-5 text-[#7df7b5]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
          </svg>
        }
      />

      <BentoCard
        className="xl:col-span-3"
        label="Tips perawatan"
        title="Perawatan lanjutan"
        body={result.tips_perawatan}
        icon={
          <svg className="size-5 text-[#ffdf7b]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        }
      />

      <BentoCard
        className="xl:col-span-3"
        label="Rekomendasi solusi"
        title="Tindakan praktis"
        body={result.rekomendasi_solusi}
        icon={
          <svg className="size-5 text-[#7bebff]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
          </svg>
        }
      />
    </div>
  );
}

function BentoCard({
  label,
  title,
  body,
  icon,
  className = '',
}: {
  label: string;
  title: string;
  body: string;
  icon?: React.ReactNode;
  className?: string;
}) {
  return (
    <article className={`glass-panel futuristic-border p-5 ${className}`}>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs font-black uppercase tracking-[0.2em] text-[#7df7b5]">{label}</p>
        {icon}
      </div>
      <h3 className="mt-3 text-xl font-black text-white">{title}</h3>
      <p className="mt-3 text-sm leading-7 text-[#c2dfcd]">{body}</p>
    </article>
  );
}

function HistoryPanel({
  history,
  clearHistory,
  openHistoryItem,
  isMounted,
}: {
  history: HistoryItem[];
  clearHistory: () => void;
  openHistoryItem: (item: HistoryItem) => void;
  isMounted: boolean;
}) {
  return (
    <section className="glass-panel futuristic-border p-4" data-reveal>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.2em] text-[#7df7b5]">Riwayat</p>
          <h2 className="mt-1 text-lg font-black text-white">Diagnosis Terbaru</h2>
        </div>
        <button
          type="button"
          onClick={clearHistory}
          disabled={!isMounted || history.length === 0}
          className="rounded-[8px] border border-[#ff6b6b]/40 bg-[#351010]/55 px-3 py-2 text-xs font-black text-[#ffb7b7] transition hover:bg-[#4a1717] disabled:cursor-not-allowed disabled:opacity-40"
        >
          Hapus
        </button>
      </div>

      {!isMounted || history.length === 0 ? (
        <p className="rounded-[8px] border border-white/10 bg-white/[0.05] p-4 text-sm leading-6 text-[#bddbc8]">
          Belum ada riwayat. Hasil analisis akan tersimpan di browser lengkap dengan tanggal.
        </p>
      ) : (
        <div className="smooth-scroll max-h-[360px] space-y-3 overflow-y-auto pr-1">
          {history.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => openHistoryItem(item)}
              className="group grid w-full grid-cols-[64px_1fr] gap-3 rounded-[8px] border border-white/10 bg-white/[0.055] p-2 text-left transition hover:border-[#7df7b5]/50 hover:bg-white/[0.1]"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={item.imageDataUrl}
                alt={item.result.nama_tanaman}
                className="aspect-square rounded-[6px] object-cover"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm font-black text-white">{item.result.nama_tanaman}</span>
                <span className="mt-1 block text-xs font-semibold text-[#8fffc0]">
                  {formatDateTime(item.createdAt)}
                </span>
                <span className="mt-1 block truncate text-xs text-[#b8d7c4]">
                  {item.result.status} - {item.result.identifikasi_penyakit}
                </span>
              </span>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('Gagal menyimpan gambar ke riwayat.'));
    reader.readAsDataURL(file);
  });
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
