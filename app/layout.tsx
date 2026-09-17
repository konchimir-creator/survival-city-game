import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Survival City — бедный квартал",
  description: "Браузерная 2D survival/economic RPG",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
