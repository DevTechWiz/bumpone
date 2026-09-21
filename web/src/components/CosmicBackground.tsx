import React, { useEffect, useRef } from 'react';

interface Star {
  x: number;
  y: number;
  size: number;
  baseAlpha: number;
  twinkleSpeed: number;
  phase: number;
  speedX: number;
  speedY: number;
}

interface Meteor {
  x: number;
  y: number;
  length: number;
  speed: number;
  angle: number;
  alpha: number;
  active: boolean;
}

export const CosmicBackground: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const mouseRef = useRef({ x: 0, y: 0, targetX: 0, targetY: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
      initStars();
      updateNebula();
    };

    const handleMouseMove = (e: MouseEvent) => {
      // Normalize mouse coordinates from -1 to 1 for gentle parallax
      mouseRef.current.targetX = (e.clientX / width - 0.5) * 30;
      mouseRef.current.targetY = (e.clientY / height - 0.5) * 30;
    };

    window.addEventListener('resize', handleResize);
    window.addEventListener('mousemove', handleMouseMove);

    // Initialize stars with optimized count
    let stars: Star[] = [];
    const initStars = () => {
      stars = [];
      const starCount = Math.min(80, Math.floor((width * height) / 18000)); // Capped for peak performance
      for (let i = 0; i < starCount; i++) {
        stars.push({
          x: Math.random() * width,
          y: Math.random() * height,
          size: Math.random() * 1.5 + 0.4,
          baseAlpha: Math.random() * 0.6 + 0.2,
          twinkleSpeed: Math.random() * 0.02 + 0.005,
          phase: Math.random() * Math.PI * 2,
          speedX: (Math.random() - 0.5) * 0.04,
          speedY: (Math.random() - 0.5) * 0.04,
        });
      }
    };
    initStars();

    // Cache pre-rendered static nebula gradients on an offscreen canvas
    let nebulaCanvas: HTMLCanvasElement | null = document.createElement('canvas');
    let nebulaCtx = nebulaCanvas.getContext('2d');
    const updateNebula = () => {
      if (!nebulaCanvas || !nebulaCtx) return;
      nebulaCanvas.width = width;
      nebulaCanvas.height = height;

      // Primary neutral atmosphere
      const g1 = nebulaCtx.createRadialGradient(
        width * 0.25,
        height * 0.35,
        50,
        width * 0.25,
        height * 0.35,
        width * 0.65
      );
      g1.addColorStop(0, 'rgba(40, 42, 48, 0.22)');
      g1.addColorStop(0.5, 'rgba(24, 25, 29, 0.12)');
      g1.addColorStop(1, 'rgba(18, 19, 22, 0)');
      nebulaCtx.fillStyle = g1;
      nebulaCtx.fillRect(0, 0, width, height);

      // Secondary neutral atmosphere
      const g2 = nebulaCtx.createRadialGradient(
        width * 0.75,
        height * 0.65,
        30,
        width * 0.75,
        height * 0.65,
        width * 0.55
      );
      g2.addColorStop(0, 'rgba(50, 52, 58, 0.16)');
      g2.addColorStop(0.6, 'rgba(24, 25, 29, 0.08)');
      g2.addColorStop(1, 'rgba(18, 19, 22, 0)');
      nebulaCtx.fillStyle = g2;
      nebulaCtx.fillRect(0, 0, width, height);
    };
    updateNebula();

    // Shooting stars / meteors
    const meteors: Meteor[] = [];
    const spawnMeteor = () => {
      meteors.push({
        x: Math.random() * width * 0.8 + width * 0.1,
        y: Math.random() * height * 0.3,
        length: Math.random() * 90 + 50,
        speed: Math.random() * 7 + 9,
        angle: Math.PI / 4 + (Math.random() - 0.5) * 0.25, // ~45 deg downward
        alpha: 1,
        active: true,
      });
    };

    // Spawn meteor every 4-8 seconds
    let lastMeteorTime = Date.now();
    let nextMeteorDelay = Math.random() * 4000 + 3500;

    let frame = 0;

    const render = () => {
      frame++;
      // Smooth mouse interpolation
      mouseRef.current.x += (mouseRef.current.targetX - mouseRef.current.x) * 0.04;
      mouseRef.current.y += (mouseRef.current.targetY - mouseRef.current.y) * 0.04;

      ctx.clearRect(0, 0, width, height);

      // 1. Blit cached celestial galaxy nebula backdrop
      if (nebulaCanvas) {
        ctx.drawImage(nebulaCanvas, 0, 0);
      }

      // 2. Render Twinkling Stars (throttled & lightweight)
      ctx.fillStyle = 'rgba(226, 232, 240, 0.8)';
      for (let i = 0; i < stars.length; i++) {
        const star = stars[i];
        star.phase += star.twinkleSpeed;
        star.x += star.speedX;
        star.y += star.speedY;

        // Wrap around borders
        if (star.x < 0) star.x = width;
        if (star.x > width) star.x = 0;
        if (star.y < 0) star.y = height;
        if (star.y > height) star.y = 0;

        // Calculate opacity based on twinkle
        const alpha = Math.max(0.1, star.baseAlpha + Math.sin(star.phase) * 0.35);

        // Apply slight parallax according to star size
        const parallaxFactor = (star.size / 2) * 0.4;
        const drawX = star.x + mouseRef.current.x * parallaxFactor;
        const drawY = star.y + mouseRef.current.y * parallaxFactor;

        ctx.globalAlpha = alpha;
        ctx.beginPath();
        ctx.arc(drawX, drawY, star.size, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1.0;

      // 3. Spawn & Render Meteors / Shooting Stars
      const now = Date.now();
      if (now - lastMeteorTime > nextMeteorDelay) {
        spawnMeteor();
        lastMeteorTime = now;
        nextMeteorDelay = Math.random() * 5000 + 4000;
      }

      for (let i = meteors.length - 1; i >= 0; i--) {
        const m = meteors[i];
        if (!m.active) {
          meteors.splice(i, 1);
          continue;
        }

        m.x += Math.cos(m.angle) * m.speed;
        m.y += Math.sin(m.angle) * m.speed;
        m.alpha -= 0.016;

        if (m.alpha <= 0 || m.x > width || m.y > height) {
          m.active = false;
          continue;
        }

        const tailX = m.x - Math.cos(m.angle) * m.length;
        const tailY = m.y - Math.sin(m.angle) * m.length;

        const meteorGrad = ctx.createLinearGradient(tailX, tailY, m.x, m.y);
        meteorGrad.addColorStop(0, 'rgba(255, 255, 255, 0)');
        meteorGrad.addColorStop(0.7, `rgba(225, 228, 235, ${m.alpha * 0.5})`);
        meteorGrad.addColorStop(1, `rgba(255, 255, 255, ${m.alpha})`);

        ctx.strokeStyle = meteorGrad;
        ctx.lineWidth = 1.6;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(tailX, tailY);
        ctx.lineTo(m.x, m.y);
        ctx.stroke();

        // Head sparkle
        ctx.beginPath();
        ctx.arc(m.x, m.y, 1.8, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255, 255, 255, ${m.alpha})`;
        ctx.fill();
      }

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0"
      style={{
        background: 'radial-gradient(ellipse at top, #1c1d22 0%, #121316 100%)',
      }}
    />
  );
};
