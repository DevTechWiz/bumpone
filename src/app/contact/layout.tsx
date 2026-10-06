import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Contact & Merchant Operations - BumpOne.lol',
  description:
    'Contact and operations desk for BumpOne.lol digital billboard bookings, directory listings, and payment assistance with authorized Merchant of Record disclosures.',
  alternates: {
    canonical: 'https://bumpone.lol/contact',
  },
  openGraph: {
    title: 'Contact & Merchant Operations - BumpOne.lol',
    description:
      'Contact and operations desk for BumpOne.lol digital billboard bookings, directory listings, and payment assistance.',
    url: 'https://bumpone.lol/contact',
  },
};

export default function ContactLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
