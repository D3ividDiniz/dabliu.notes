import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dabliu.notes",
  description: "A quiet place to capture what matters.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
