import type { Metadata, Viewport } from "next";
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

export const viewport: Viewport = {
  themeColor: "#0A0B0E",
  width: "device-width",
  initialScale: 1,
  maximumScale: 5,
};

export const metadata: Metadata = {
  metadataBase: new URL("https://bumpone.lol"),
  title: {
    default: "BumpOne.lol - The 100-Slot Digital Billboard & Attention Grid",
    template: "%s | BumpOne.lol",
  },
  description:
    "A dynamic 100-slot digital billboard where active value rules the grid. Live showcase for modern software, developer tools, indie startups, and web apps. Conquer Rank #1 Center King.",
  keywords: [
    "BumpOne",
    "bumpone.lol",
    "digital billboard",
    "developer billboard",
    "attention grid",
    "tech showcase",
    "SaaS directory",
    "indie hacker projects",
    "software launchpad",
    "developer tools showcase",
    "million dollar homepage modern",
    "live tech leaderboard",
    "curated software billboard",
  ],
  authors: [{ name: "BumpOne", url: "https://bumpone.lol" }],
  creator: "BumpOne",
  publisher: "BumpOne",
  formatDetection: {
    email: false,
    address: false,
    telephone: false,
  },
  alternates: {
    canonical: "https://bumpone.lol",
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    url: "https://bumpone.lol",
    siteName: "BumpOne.lol",
    title: "BumpOne.lol - The 100-Slot Digital Billboard & Attention Grid",
    description:
      "A dynamic 100-slot attention grid where active value rules the billboard. Live developer showcase, ranking leaderboard, and curated tech directory.",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "BumpOne.lol - The 100-Slot Digital Billboard & Attention Grid",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "BumpOne.lol - The 100-Slot Digital Billboard & Attention Grid",
    description:
      "A dynamic 100-slot attention grid where active value rules the billboard. Live developer showcase, ranking leaderboard, and curated tech directory.",
    creator: "@bumpone",
    site: "@bumpone",
    images: ["/opengraph-image"],
  },
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
    ],
    apple: [
      { url: "/apple-icon.svg", type: "image/svg+xml" },
    ],
    shortcut: ["/icon.svg"],
  },
  manifest: "/manifest.webmanifest",
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-video-preview": -1,
      "max-image-preview": "large",
      "max-snippet": -1,
    },
  },
  category: "technology",
};

const jsonLd = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "WebSite",
      "@id": "https://bumpone.lol/#website",
      "url": "https://bumpone.lol",
      "name": "BumpOne.lol",
      "alternateName": ["BumpOne", "Bump One", "BumpOne Billboard", "BumpOne Attention Grid"],
      "description": "A dynamic 100-slot digital billboard where active value rules the grid. Live showcase for modern software, developer tools, indie startups, and web apps.",
      "publisher": {
        "@id": "https://bumpone.lol/#organization",
      },
      "potentialAction": {
        "@type": "SearchAction",
        "target": {
          "@type": "EntryPoint",
          "urlTemplate": "https://bumpone.lol/?q={search_term_string}",
        },
        "query-input": "required name=search_term_string",
      },
      "inLanguage": "en-US",
    },
    {
      "@type": "Organization",
      "@id": "https://bumpone.lol/#organization",
      "name": "BumpOne",
      "url": "https://bumpone.lol",
      "logo": {
        "@type": "ImageObject",
        "url": "https://bumpone.lol/icon.svg",
        "width": 512,
        "height": 512,
        "caption": "BumpOne Logo",
      },
      "sameAs": [
        "https://x.com/bumpone",
        "https://github.com/DevTechWiz/bumpone",
      ],
      "contactPoint": {
        "@type": "ContactPoint",
        "contactType": "customer support",
        "email": "support@bumpone.lol",
        "url": "https://bumpone.lol/contact",
      },
    },
    {
      "@type": "WebApplication",
      "@id": "https://bumpone.lol/#application",
      "name": "BumpOne Digital Billboard",
      "url": "https://bumpone.lol",
      "applicationCategory": "BusinessApplication",
      "operatingSystem": "All",
      "browserRequirements": "Requires JavaScript. Requires HTML5.",
      "offers": {
        "@type": "Offer",
        "price": "10.00",
        "priceCurrency": "USD",
        "availability": "https://schema.org/InStock",
      },
      "description": "Competitive 100-slot real-time attention billboard for modern software applications, developers, and tech creators.",
    },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://images.unsplash.com" crossOrigin="anonymous" />
        <link rel="dns-prefetch" href="https://images.unsplash.com" />
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
      </head>
      <body className={`${jakarta.variable} ${jetbrains.variable}`} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
