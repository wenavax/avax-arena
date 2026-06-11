'use client';

import type { Pet } from '@/lib/pet-visual';

type Props = {
  pet: Pet;
  size?: number;
  className?: string;
};

export function PetSvg({ pet, size = 120, className }: Props) {
  const [c1, c2, c3] = pet.palette;
  const gradId = `g-${pet.id}`;
  const moodHappy = pet.mood > 60;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-label={`Frost sprite ${pet.name}`}
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={c1} />
          <stop offset="100%" stopColor={c2} />
        </linearGradient>
        <radialGradient id={`hl-${pet.id}`} cx="50%" cy="40%" r="60%">
          <stop offset="0%" stopColor={c3} stopOpacity="0.5" />
          <stop offset="100%" stopColor={c3} stopOpacity="0" />
        </radialGradient>
      </defs>

      {/* Shadow */}
      <ellipse cx="50" cy="92" rx="22" ry="3" fill="#000" opacity="0.25" />

      {/* Body */}
      <ellipse cx="50" cy="55" rx="32" ry="38" fill={`url(#${gradId})`} />
      <ellipse cx="50" cy="48" rx="28" ry="32" fill={`url(#hl-${pet.id})`} />

      {/* Pattern overlay */}
      {pet.pattern === 'dots' && (
        <g opacity="0.4">
          <circle cx="38" cy="65" r="3" fill="#fff" />
          <circle cx="56" cy="72" r="2.5" fill="#fff" />
          <circle cx="46" cy="82" r="2" fill="#fff" />
          <circle cx="62" cy="58" r="1.8" fill="#fff" />
        </g>
      )}
      {pet.pattern === 'stripes' && (
        <g opacity="0.3" stroke="#fff" strokeLinecap="round" fill="none">
          <path d="M 28 65 Q 50 60 72 65" strokeWidth="2.5" />
          <path d="M 28 75 Q 50 70 72 75" strokeWidth="2.5" />
          <path d="M 32 85 Q 50 80 68 85" strokeWidth="2" />
        </g>
      )}
      {pet.pattern === 'sparkles' && (
        <g opacity="0.8" fill="#fff">
          <text x="32" y="50" fontSize="9">✦</text>
          <text x="60" y="62" fontSize="7">✧</text>
          <text x="44" y="82" fontSize="8">✦</text>
          <text x="62" y="78" fontSize="6">✧</text>
        </g>
      )}

      {/* Eyes */}
      {pet.eyeShape === 'round' && (
        <g>
          <circle cx="40" cy="44" r="5.5" fill="#fff" />
          <circle cx="60" cy="44" r="5.5" fill="#fff" />
          <circle cx="41" cy="45" r="2.5" fill="#0c1a3d" />
          <circle cx="61" cy="45" r="2.5" fill="#0c1a3d" />
          <circle cx="40" cy="43" r="0.8" fill="#fff" />
          <circle cx="60" cy="43" r="0.8" fill="#fff" />
        </g>
      )}
      {pet.eyeShape === 'oval' && (
        <g>
          <ellipse cx="40" cy="44" rx="4.5" ry="6.5" fill="#fff" />
          <ellipse cx="60" cy="44" rx="4.5" ry="6.5" fill="#fff" />
          <ellipse cx="41" cy="45" rx="2" ry="3" fill="#0c1a3d" />
          <ellipse cx="61" cy="45" rx="2" ry="3" fill="#0c1a3d" />
        </g>
      )}
      {pet.eyeShape === 'sleepy' && (
        <g fill="none" stroke="#0c1a3d" strokeWidth="2.5" strokeLinecap="round">
          <path d="M 34 46 Q 40 41 46 46" />
          <path d="M 54 46 Q 60 41 66 46" />
        </g>
      )}
      {pet.eyeShape === 'star' && (
        <g>
          <text x="33" y="50" fontSize="11" fill="#fde047">★</text>
          <text x="53" y="50" fontSize="11" fill="#fde047">★</text>
        </g>
      )}

      {/* Mouth — reflects mood */}
      {moodHappy ? (
        <path d="M 44 64 Q 50 68 56 64" stroke="#0c1a3d" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      ) : (
        <path d="M 44 66 Q 50 63 56 66" stroke="#0c1a3d" strokeWidth="1.8" fill="none" strokeLinecap="round" />
      )}

      {/* Cheeks */}
      <circle cx="30" cy="58" r="3.5" fill="#fbb6ce" opacity="0.55" />
      <circle cx="70" cy="58" r="3.5" fill="#fbb6ce" opacity="0.55" />

      {/* Frost crown sparkle for high mood */}
      {pet.mood >= 85 && (
        <g>
          <text x="48" y="22" fontSize="12" fill={c3} opacity="0.9">❄</text>
          <text x="35" y="28" fontSize="8" fill={c3} opacity="0.6">❄</text>
          <text x="62" y="28" fontSize="8" fill={c3} opacity="0.6">❄</text>
        </g>
      )}
    </svg>
  );
}
