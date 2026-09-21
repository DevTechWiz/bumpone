import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

// Self-hosted (was next/font/google): Google Fonts fetches at compile time
// were retrying on slow networks (+15-20s per cold compile). Same files,
// same CSS variables, zero network at build/dev time.
const jakarta = localFont({
  src: "./fonts/jakarta-latin.woff2",
  variable: "--font-jakarta",
  display: "swap",
  weight: "200 800",
});

const jetbrains = localFont({
  src: "./fonts/jetbrains-latin.woff2",
  variable: "--font-jetbrains",
  display: "swap",
  weight: "100 800",
});

export const metadata: Metadata = {
  title: "Bumped.lol - The Shifting Grid",
  description:
    "A living visual arena where profiles compete for position: pay to raise your Active Value, bump the wall, defend your rank.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className={`${jakarta.variable} ${jetbrains.variable}`}>{children}</body>
    </html>
  );
}
