'use client';

import { useRef, useCallback, useState } from 'react';

interface TiltOptions {
  maxTilt?: number;
  scale?: number;
  speed?: number;
}

export function use3DTilt({ maxTilt = 12, scale = 1.03, speed = 400 }: TiltOptions = {}) {
  const ref = useRef<HTMLDivElement>(null);
  const [style, setStyle] = useState<React.CSSProperties>({
    transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)',
    transition: `transform ${speed}ms ease-out`,
  });

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const normalX = (e.clientX - centerX) / (rect.width / 2);
    const normalY = (e.clientY - centerY) / (rect.height / 2);

    setStyle({
      transform: `perspective(1000px) rotateY(${normalX * maxTilt}deg) rotateX(${-normalY * maxTilt}deg) scale(${scale})`,
      transition: `transform ${speed * 0.3}ms ease-out`,
    });
  }, [maxTilt, scale, speed]);

  const handleMouseLeave = useCallback(() => {
    setStyle({
      transform: 'perspective(1000px) rotateX(0deg) rotateY(0deg) scale(1)',
      transition: `transform ${speed}ms ease-out`,
    });
  }, [speed]);

  return { ref, style, onMouseMove: handleMouseMove, onMouseLeave: handleMouseLeave };
}
