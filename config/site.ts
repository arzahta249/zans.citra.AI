export const siteConfig = {
  name: "zans.citra.AI",
  shortName: "zans.citra.AI",
  description: "Sistem cerdas berbasis AI untuk identifikasi jenis tanaman, analisis kesehatan daun, dan konsultasi botani interaktif berbasis Pengolahan Citra Digital.",
  url: process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000",
  themeColor: "#081611",
  backgroundColor: "#081611",
  links: {
    github: "", // bisa diisi jika ada
  },
};

export type SiteConfig = typeof siteConfig;
