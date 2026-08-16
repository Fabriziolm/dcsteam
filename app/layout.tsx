import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DCS | Control Operativo",
  description: "Plataforma de gestión operativa y gerencial de DCS",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
