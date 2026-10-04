import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const alt = 'BumpOne.lol - The 100-Slot Digital Billboard & Attention Grid';
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = 'image/png';

export default async function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          height: '100%',
          width: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#090A0E',
          backgroundImage:
            'radial-gradient(circle at 50% 10%, rgba(245, 158, 11, 0.18), transparent 60%), radial-gradient(circle at 90% 90%, rgba(225, 29, 72, 0.12), transparent 50%)',
          fontFamily: 'sans-serif',
          color: '#FFFFFF',
          padding: '60px 80px',
          position: 'relative',
        }}
      >
        {/* Subtle grid pattern border */}
        <div
          style={{
            position: 'absolute',
            inset: 24,
            borderRadius: 24,
            border: '1px solid rgba(255, 255, 255, 0.1)',
            display: 'flex',
          }}
        />

        {/* Top Badge */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '8px 20px',
            borderRadius: 999,
            backgroundColor: 'rgba(245, 158, 11, 0.12)',
            border: '1px solid rgba(245, 158, 11, 0.3)',
            marginBottom: 28,
          }}
        >
          <div
            style={{
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: '#10B981',
            }}
          />
          <span
            style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#FBBF24',
              letterSpacing: 2,
              textTransform: 'uppercase',
            }}
          >
            Live Attention Grid &bull; 100 Slots
          </span>
        </div>

        {/* Brand Main Title */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            fontSize: 72,
            fontWeight: 900,
            letterSpacing: -2,
            marginBottom: 16,
          }}
        >
          <span style={{ color: '#FFFFFF' }}>BumpOne</span>
          <span style={{ color: '#F59E0B' }}>.lol</span>
        </div>

        {/* Subtitle / Tagline */}
        <div
          style={{
            fontSize: 28,
            fontWeight: 500,
            color: '#94A3B8',
            textAlign: 'center',
            maxWidth: 820,
            lineHeight: 1.4,
            marginBottom: 44,
          }}
        >
          The Curated Digital Billboard Where Active Value Rules The Grid.
          Conquer Rank #1 Center King.
        </div>

        {/* Metric / Feature Highlights */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 24,
          }}
        >
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '12px 28px',
              borderRadius: 16,
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <span style={{ fontSize: 28, fontWeight: 800, color: '#FBBF24' }}>100</span>
            <span style={{ fontSize: 13, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 }}>Exclusive Slots</span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '12px 28px',
              borderRadius: 16,
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <span style={{ fontSize: 28, fontWeight: 800, color: '#F43F5E' }}>#1 King</span>
            <span style={{ fontSize: 13, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 }}>Prime Centerpiece</span>
          </div>

          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              padding: '12px 28px',
              borderRadius: 16,
              backgroundColor: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <span style={{ fontSize: 28, fontWeight: 800, color: '#38BDF8' }}>Realtime</span>
            <span style={{ fontSize: 13, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: 1 }}>Dynamic Displacement</span>
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    }
  );
}
