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
  title: "BumpOne.lol - Bump #1 & Rule the Grid",
  description:
    "The internet's live attention arena. Bump #1 to seize the King citadel, defend your turf, and rule the shifting grid.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
      </head>
      <body className={`${jakarta.variable} ${jetbrains.variable}`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
