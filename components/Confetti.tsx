'use client';
import { useMemo } from 'react';

export default function Confetti({ colors }: { colors: string[] }) {
  const pieces = useMemo(() =>
    Array.from({ length: 120 }, (_, i) => ({
      left: Math.random() * 100,
      delay: Math.random() * 1.5,
      duration: 2.5 + Math.random() * 2,
      color: colors[i % colors.length],
      spin: Math.random() * 720 - 360,
    })), [colors]);
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden">
      {pieces.map((p, i) => (
        <span key={i}
          className="absolute top-[-2%] block h-3 w-2"
          style={{
            left: `${p.left}%`, background: p.color,
            animation: `confetti-fall ${p.duration}s linear ${p.delay}s forwards`,
            ['--spin' as string]: `${p.spin}deg`,
          }} />
      ))}
      <style>{`@keyframes confetti-fall {
        to { transform: translateY(110vh) rotate(var(--spin)); opacity: 0.9; }
      }`}</style>
    </div>
  );
}
