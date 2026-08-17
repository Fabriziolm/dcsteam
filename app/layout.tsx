import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DCS | Control Operativo",
  description: "Plataforma de gestión operativa y gerencial de DCS",
  manifest: "/dcsteam/manifest.webmanifest",
  appleWebApp: { capable: true, title: "DCS", statusBarStyle: "default" },
  icons: { icon: "/dcsteam/dcs-app-icon.svg", apple: "/dcsteam/dcs-app-icon.svg" },
};

export const viewport: Viewport = {
  themeColor: "#10253f",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
