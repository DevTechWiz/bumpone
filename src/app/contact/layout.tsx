import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact & Merchant Support',
  description:
    'Official contact desk, merchant disclosure, billing inquiries, and developer support for BumpOne.lol.',
  alternates: {
    canonical: 'https://bumpone.lol/contact',
  },
};

export default function ContactLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
