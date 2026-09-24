"use client";

/**
 * TEMPORARY size-ladder test page (delete after eyeballing).
 * #1 pinned at center; all other cards surround it in concentric rings.
 * Photo-standard 4:3 / 3:4, one scale value k(rank) strictly decreasing.
 */
import React, { useEffect, useRef } from 'react';
function mulberry32(a: number) {
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface Band {
  min: number;
  max: number;
  k: number;
  tint: string;
  border: string;
  label: string;
}

const BANDS: Band[] = [
  { min: 1, max: 1, k: 64, tint: 'bg-amber-500/20', border: 'border-amber-400/60', label: 'KING' },
  { min: 2, max: 13, k: 40, tint: 'bg-white/[0.08]', border: 'border-white/25', label: 'ELITE' },
  { min: 14, max: 30, k: 28, tint: 'bg-zinc-700/30', border: 'border-zinc-500/40', label: 'LORD' },
  { min: 31, max: 54, k: 20, tint: 'bg-white/[0.04]', border: 'border-white/[0.12]', label: 'MID' },
  { min: 55, max: 99, k: 14, tint: 'bg-white/[0.02]', border: 'border-white/[0.08]', label: 'LOW' },
  { min: 100, max: 100, k: 10, tint: 'bg-rose-950/40', border: 'border-rose-500/50', label: 'BRINK' },
];

function bandFor(rank: number): Band {
  return BANDS.find((b) => rank >= b.min && rank <= b.max) ?? BANDS[BANDS.length - 1];
}

const CANVAS = 2200;
const CX = CANVAS / 2;
const CY = CANVAS / 2;
const GAP = 1; // THE gap: exact-solved below, no margins anywhere

interface Placed {
  rank: number;
  band: Band;
  portrait: boolean;
  w: number;
  h: number;
  area: number;
  x: number;
  y: number;
}

export default function TestCardsPage() {
  // Drag-to-pan refs (scroll container pans natively on touch/wheel).
  const scroller = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; sl: number; st: number } | null>(null);

  useEffect(() => {
    // Start centered on #1.
    const el = scroller.current;
    if (el) {
      el.scrollLeft = (el.scrollWidth - el.clientWidth) / 2;
      el.scrollTop = (el.scrollHeight - el.clientHeight) / 2;
    }
  }, []);

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scroller.current;
    if (!el) return;
    drag.current = { x: e.clientX, y: e.clientY, sl: el.scrollLeft, st: el.scrollTop };
    el.style.cursor = 'grabbing';
  };
  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = scroller.current;
    const d = drag.current;
    if (!el || !d) return;
    el.scrollLeft = d.sl - (e.clientX - d.x);
    el.scrollTop = d.st - (e.clientY - d.y);
  };
  const endDrag = () => {
    drag.current = null;
    if (scroller.current) scroller.current.style.cursor = 'grab';
  };
  const cards: Placed[] = [];
  const byId = new Map<number, Placed>();

  // #1 dead center.
  const kingBand = BANDS[0];
  const kingPortrait = mulberry32(1 * 2654435761)() < 0.5;
  const kingW = kingPortrait ? kingBand.k * 3 : kingBand.k * 4;
  const kingH = kingPortrait ? kingBand.k * 4 : kingBand.k * 3;
  const king = {
    rank: 1, band: kingBand, portrait: kingPortrait,
    w: kingW, h: kingH, area: kingW * kingH,
    x: CX - kingW / 2, y: CY - kingH / 2,
  };
  cards.push(king);
  byId.set(1, king);
  let prevOuter = Math.hypot(kingW / 2, kingH / 2); // center's reach
  let minGap = Infinity;

  // Rings 1..5: exact 1px solve. Cards are axis-aligned: project half-extents
  // onto tangent (angular fit) and radial (ring stacking). Tightest pair = GAP.
  for (let b = 1; b < BANDS.length; b++) {
    const band = BANDS[b];
    const ranks: number[] = [];
    for (let r = band.min; r <= band.max; r++) ranks.push(r);
    const n = ranks.length;
    const start = mulberry32(9000 + b)() * 2 * Math.PI; // seeded offset
    const items = ranks.map((rank, i) => {
      const portrait = mulberry32(rank * 2654435761)() < 0.5;
      const w = portrait ? band.k * 3 : band.k * 4;
      const h = portrait ? band.k * 4 : band.k * 3;
      const a = start + (i / n) * 2 * Math.PI;
      const sin = Math.abs(Math.sin(a)), cos = Math.abs(Math.cos(a));
      return {
        rank, portrait, w, h, a,
        tangent: (w / 2) * sin + (h / 2) * cos,
        radial: (w / 2) * cos + (h / 2) * sin,
      };
    });
    let ringR: number;
    if (n === 1) {
      ringR = prevOuter + items[0].radial + GAP;
    } else {
      const denom = 2 * Math.sin(Math.PI / n);
      let need = 0;
      for (let i = 0; i < n; i++) {
        const t = items[i].tangent + items[(i + 1) % n].tangent + GAP;
        if (t > need) need = t;
      }
      ringR = need / denom;
      const maxRadial = Math.max(...items.map((d) => d.radial));
      ringR = Math.max(ringR, prevOuter + maxRadial + GAP);
      const ch = 2 * ringR * Math.sin(Math.PI / n);
      for (let i = 0; i < n; i++) {
        const g = ch - items[i].tangent - items[(i + 1) % n].tangent;
        if (g < minGap) minGap = g;
      }
    }
    let ringOuter = 0;
    items.forEach((d) => {
      const x = CX + ringR * Math.cos(d.a) - d.w / 2;
      const y = CY + ringR * Math.sin(d.a) - d.h / 2;
      const reach = ringR + d.radial;
      if (reach > ringOuter) ringOuter = reach;
      const clearance = ringR - d.radial - prevOuter;
      if (clearance < minGap) minGap = clearance;
      const p: Placed = {
        rank: d.rank, band, portrait: d.portrait,
        w: d.w, h: d.h, area: d.w * d.h, x, y,
      };
      cards.push(p);
      byId.set(d.rank, p);
    });
    prevOuter = ringOuter;
  }

  // Self-checks: strict size rule + pairwise overlap.
  let violations = 0;
  const ordered = [...cards].sort((a, b) => a.rank - b.rank);
  for (let i = 1; i < ordered.length; i++) {
    if (ordered[i].area > ordered[i - 1].area) violations++;
  }
  let overlaps = 0;
  for (let i = 0; i < cards.length; i++) {
    for (let j = i + 1; j < cards.length; j++) {
      const a = cards[i], b = cards[j];
      if (a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y) {
        overlaps++;
      }
    }
  }

  const badge = (ok: boolean, text: string) => (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-mono font-bold border ${
        ok
          ? 'bg-emerald-950/40 text-emerald-300 border-emerald-500/40'
          : 'bg-rose-950/40 text-rose-300 border-rose-500/40'
      }`}
    >
      {text}
    </span>
  );

  return (
    <div className="min-h-screen w-full bg-[#121316] text-neutral-100 p-6">
      <div className="max-w-6xl mx-auto flex flex-col gap-4">
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-bold text-white">Size ladder test — #1 centered, rings around it</h1>
          {badge(violations === 0, `STRICT RULE: ${violations === 0 ? 'PASS (0 violations)' : `FAIL (${violations})`}`)}
          {badge(overlaps === 0, `OVERLAP: ${overlaps === 0 ? '0' : overlaps}`)}
          {badge(minGap >= 0.99, `MIN GAP: ${minGap.toFixed(1)}px`)}
          <span className="text-xs font-mono text-neutral-400">
            k: 64 &gt; 40 &gt; 28 &gt; 20 &gt; 14 &gt; 10 — canvas {CANVAS}×{CANVAS}, scroll to explore
          </span>
        </div>
        <div
          ref={scroller}
          onMouseDown={onMouseDown}
          onMouseMove={onMouseMove}
          onMouseUp={endDrag}
          onMouseLeave={endDrag}
          style={{ cursor: 'grab' }}
          className="overflow-auto rounded-2xl border border-white/[0.1] select-none"
        >
          <div className="relative shrink-0" style={{ width: CANVAS, height: CANVAS }}>
            {ordered.map((c) => (
              <div
                key={c.rank}
                style={{ left: c.x, top: c.y, width: c.w, height: c.h }}
                title={`#${c.rank} ${c.band.label} ${c.portrait ? '3:4 portrait' : '4:3 landscape'} ${c.w}x${c.h}`}
                className={`absolute rounded-lg border ${c.band.tint} ${c.band.border} flex flex-col items-center justify-center overflow-hidden select-none`}
              >
                <span className="font-bold text-white leading-none" style={{ fontSize: Math.max(9, c.band.k / 2.5) }}>
                  #{c.rank}
                </span>
                {c.band.k >= 14 && (
                  <span className="font-mono text-neutral-400 leading-none mt-1" style={{ fontSize: Math.max(7, c.band.k / 5) }}>
                    {c.w}×{c.h}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
        <p className="text-xs font-mono text-neutral-500">
          TEMP route — delete web/src/app/test-cards after review. Orientation is seeded per rank (stable across reloads).
        </p>
      </div>
    </div>
  );
}
