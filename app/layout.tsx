import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Выживание: Бедный квартал",
  description:
    "2D survival/economic RPG: начни с 0 $ в бедном городском квартале — работа, магазин, ночлежка, энергия и голод.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
