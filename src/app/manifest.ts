import type { MetadataRoute } from 'next';

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'BumpOne.lol - The 100-Slot Digital Billboard',
    short_name: 'BumpOne',
    description: 'A dynamic 100-slot attention grid where active value rules the billboard. Live developer showcase, ranking leaderboard, and tech project directory.',
    start_url: '/',
    display: 'standalone',
    background_color: '#0A0B0E',
    theme_color: '#F59E0B',
    icons: [
      {
        src: '/icon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
      },
    ],
  };
}
