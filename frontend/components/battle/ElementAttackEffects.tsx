'use client';

import { motion } from 'framer-motion';

/* ---------------------------------------------------------------------------
 * Element Attack Effects — unique visual for each element
 * 0:Fire, 1:Water, 2:Wind, 3:Earth, 4:Lightning, 5:Ice, 6:Shadow, 7:Light
 * ------------------------------------------------------------------------- */

interface AttackProps {
  direction: 'lr' | 'rl'; // left-to-right or right-to-left
  yPos: number;           // vertical position %
  delay: number;          // animation delay
  color: string;          // neon color
}

/* ─── Fire: blazing fireballs with ember trail ─────────────────────────── */
function FireAttack({ direction, yPos, delay, color }: AttackProps) {
  const isLR = direction === 'lr';
  return (
    <>
      {/* Main fireball */}
      <motion.div
        className="absolute"
        style={{
          [isLR ? 'left' : 'right']: '8%',
          top: `${yPos}%`,
          width: 28, height: 28,
          borderRadius: '50%',
          background: `radial-gradient(circle, #fff 0%, ${color} 40%, #ff4400 80%, transparent 100%)`,
          boxShadow: `0 0 20px ${color}, 0 0 40px #ff4400, 0 0 60px #ff440066`,
          filter: 'blur(0.5px)',
        }}
        initial={{ [isLR ? 'x' : 'x']: 0, opacity: 0, scale: 0.3 }}
        animate={{
          x: isLR ? [0, 600, 650] : [0, -600, -650],
          opacity: [0, 1, 1, 0],
          scale: [0.3, 1.2, 1.4, 0.5],
        }}
        transition={{
          duration: 1.0,
          delay,
          repeat: Infinity,
          repeatDelay: 2.8,
          times: [0, 0.7, 0.9, 1],
          ease: 'easeIn',
        }}
      />
      {/* Ember trail particles */}
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={`ember-${direction}-${i}`}
          className="absolute rounded-full"
          style={{
            [isLR ? 'left' : 'right']: '8%',
            top: `${yPos + (i % 2 === 0 ? -1 : 1) * (1 + i)}%`,
            width: 4 + (i % 3),
            height: 4 + (i % 3),
            background: i % 2 === 0 ? '#ffaa00' : '#ff6600',
            boxShadow: `0 0 6px ${i % 2 === 0 ? '#ffaa00' : '#ff6600'}`,
          }}
          initial={{ opacity: 0 }}
          animate={{
            x: isLR ? [0, 400 + i * 40] : [0, -400 - i * 40],
            y: [(i % 2 === 0 ? -1 : 1) * 5, (i % 2 === 0 ? -1 : 1) * (15 + i * 5)],
            opacity: [0, 0.8, 0],
            scale: [1, 0.3],
          }}
          transition={{
            duration: 0.8,
            delay: delay + 0.05 + i * 0.06,
            repeat: Infinity,
            repeatDelay: 3.0,
          }}
        />
      ))}
    </>
  );
}

/* ─── Water: wave surge with splash droplets ──────────────────────────── */
function WaterAttack({ direction, yPos, delay, color }: AttackProps) {
  const isLR = direction === 'lr';
  return (
    <>
      {/* Wave body */}
      <motion.div
        className="absolute"
        style={{
          [isLR ? 'left' : 'right']: '10%',
          top: `${yPos - 2}%`,
          width: '70%',
          height: 20,
          background: `linear-gradient(${isLR ? '90deg' : '270deg'}, transparent 0%, ${color}66 20%, ${color} 50%, #fff 60%, ${color}66 80%, transparent 100%)`,
          borderRadius: '50%',
          filter: 'blur(2px)',
          transformOrigin: isLR ? 'left center' : 'right center',
        }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{
          scaleX: [0, 1.2, 0],
          opacity: [0, 0.7, 0],
        }}
        transition={{
          duration: 1.2,
          delay,
          repeat: Infinity,
          repeatDelay: 2.6,
          ease: 'easeOut',
        }}
      />
      {/* Splash droplets on impact */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <motion.div
          key={`drop-${direction}-${i}`}
          className="absolute rounded-full"
          style={{
            [isLR ? 'right' : 'left']: `${12 + i * 2}%`,
            top: `${yPos}%`,
            width: 5 - (i % 3),
            height: 5 - (i % 3),
            background: i % 2 === 0 ? '#fff' : color,
            boxShadow: `0 0 4px ${color}`,
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            y: [(i % 2 === 0 ? -1 : 1) * 5, (i % 2 === 0 ? -1 : 1) * (30 + i * 8)],
            x: [(i % 3 - 1) * 5, (i % 3 - 1) * 20],
            opacity: [0, 1, 0],
            scale: [0, 1, 0.3],
          }}
          transition={{
            duration: 0.6,
            delay: delay + 0.9,
            repeat: Infinity,
            repeatDelay: 3.2,
          }}
        />
      ))}
    </>
  );
}

/* ─── Wind: speed slashes with spiral gusts ───────────────────────────── */
function WindAttack({ direction, yPos, delay, color }: AttackProps) {
  const isLR = direction === 'lr';
  return (
    <>
      {/* Speed lines */}
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.div
          key={`wind-${direction}-${i}`}
          className="absolute"
          style={{
            [isLR ? 'left' : 'right']: '5%',
            top: `${yPos - 4 + i * 2}%`,
            width: `${50 + i * 8}%`,
            height: 1.5 - (i % 2) * 0.5,
            background: `linear-gradient(${isLR ? '90deg' : '270deg'}, transparent, ${color}${i % 2 === 0 ? 'cc' : '66'}, transparent)`,
            transformOrigin: isLR ? 'left center' : 'right center',
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{
            scaleX: [0, 1, 0],
            opacity: [0, 0.6, 0],
          }}
          transition={{
            duration: 0.6,
            delay: delay + i * 0.08,
            repeat: Infinity,
            repeatDelay: 2.8,
            ease: 'easeOut',
          }}
        />
      ))}
      {/* Swirl particles */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={`gust-${direction}-${i}`}
          className="absolute rounded-full"
          style={{
            [isLR ? 'left' : 'right']: '30%',
            top: `${yPos}%`,
            width: 6,
            height: 6,
            background: color,
            boxShadow: `0 0 8px ${color}`,
            filter: 'blur(1px)',
          }}
          animate={{
            x: isLR ? [0, 200 + i * 60] : [0, -200 - i * 60],
            y: [0, Math.sin(i * 2) * 40, -Math.sin(i * 2) * 30, 0],
            opacity: [0, 0.8, 0.4, 0],
            scale: [0.5, 1, 0.3],
          }}
          transition={{
            duration: 1.0,
            delay: delay + 0.2 + i * 0.15,
            repeat: Infinity,
            repeatDelay: 2.6,
          }}
        />
      ))}
    </>
  );
}

/* ─── Earth: rising rock pillars + screen shake dust ──────────────────── */
function EarthAttack({ direction, yPos, delay, color }: AttackProps) {
  const isLR = direction === 'lr';
  const impactX = isLR ? 'right' : 'left';
  return (
    <>
      {/* Boulder projectile */}
      <motion.div
        className="absolute"
        style={{
          [isLR ? 'left' : 'right']: '10%',
          top: `${yPos - 1}%`,
          width: 22, height: 22,
          borderRadius: '30%',
          background: `linear-gradient(135deg, ${color} 0%, #8B4513 40%, #654321 100%)`,
          boxShadow: `0 0 12px ${color}88, 0 2px 8px rgba(0,0,0,0.5)`,
        }}
        animate={{
          x: isLR ? [0, 580] : [0, -580],
          y: [0, -30, -20, 0, 5],
          rotate: isLR ? [0, 720] : [0, -720],
          opacity: [0, 1, 1, 1, 0],
          scale: [0.5, 1.1, 1, 1.2, 0],
        }}
        transition={{
          duration: 1.0,
          delay,
          repeat: Infinity,
          repeatDelay: 2.8,
          times: [0, 0.3, 0.6, 0.9, 1],
        }}
      />
      {/* Impact rock shards */}
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={`shard-${direction}-${i}`}
          className="absolute"
          style={{
            [impactX]: `${12 + (i % 2) * 3}%`,
            top: `${yPos + 2}%`,
            width: 8 - i,
            height: 12 - i * 2,
            background: `linear-gradient(${45 + i * 30}deg, ${color}, #654321)`,
            borderRadius: '20%',
          }}
          initial={{ opacity: 0, scale: 0 }}
          animate={{
            y: [0, -(20 + i * 15)],
            x: [(i - 2) * 3, (i - 2) * 15],
            opacity: [0, 1, 0],
            rotate: [0, (i % 2 === 0 ? 1 : -1) * 90],
            scale: [0, 1, 0.3],
          }}
          transition={{
            duration: 0.5,
            delay: delay + 0.85,
            repeat: Infinity,
            repeatDelay: 3.3,
          }}
        />
      ))}
      {/* Dust cloud */}
      <motion.div
        className="absolute rounded-full"
        style={{
          [impactX]: '10%',
          top: `${yPos}%`,
          width: 60, height: 30,
          background: `radial-gradient(ellipse, ${color}44 0%, transparent 70%)`,
          filter: 'blur(6px)',
        }}
        initial={{ opacity: 0, scale: 0 }}
        animate={{ opacity: [0, 0.6, 0], scale: [0.3, 2, 2.5] }}
        transition={{ duration: 0.8, delay: delay + 0.85, repeat: Infinity, repeatDelay: 3.0 }}
      />
    </>
  );
}

/* ─── Lightning: zigzag bolt + screen flash ───────────────────────────── */
function LightningAttack({ direction, yPos, delay, color }: AttackProps) {
  const isLR = direction === 'lr';
  // Generate zigzag SVG path
  const segments = 8;
  const w = 500;
  const amp = 12;
  let path = `M 0 ${amp}`;
  for (let i = 1; i <= segments; i++) {
    const x = (w / segments) * i;
    const y = (i % 2 === 0 ? amp : -amp) + (i % 3 === 0 ? 5 : -3);
    path += ` L ${x} ${y + amp}`;
  }

  return (
    <>
      {/* Screen flash */}
      <motion.div
        className="absolute inset-0"
        style={{ background: '#fff', pointerEvents: 'none' }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.4, 0, 0.2, 0] }}
        transition={{ duration: 0.3, delay: delay + 0.1, repeat: Infinity, repeatDelay: 3.5 }}
      />
      {/* Lightning bolt SVG */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          [isLR ? 'left' : 'right']: '10%',
          top: `${yPos - 2}%`,
          width: '70%',
          height: 30,
          transform: isLR ? 'none' : 'scaleX(-1)',
        }}
        initial={{ opacity: 0, scaleX: 0 }}
        animate={{
          opacity: [0, 1, 1, 0],
          scaleX: [0, 1, 1, 0],
        }}
        transition={{
          duration: 0.4,
          delay: delay + 0.1,
          repeat: Infinity,
          repeatDelay: 3.4,
          times: [0, 0.2, 0.7, 1],
        }}
      >
        <svg width="100%" height="30" viewBox={`0 0 ${w} ${amp * 2 + 5}`} preserveAspectRatio="none">
          <path
            d={path}
            fill="none"
            stroke="#fff"
            strokeWidth="3"
            filter={`drop-shadow(0 0 6px ${color}) drop-shadow(0 0 12px ${color})`}
          />
          <path
            d={path}
            fill="none"
            stroke={color}
            strokeWidth="5"
            opacity="0.4"
            filter="blur(3px)"
          />
        </svg>
      </motion.div>
      {/* Electric sparks at impact */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={`spark-${direction}-${i}`}
          className="absolute rounded-full"
          style={{
            [isLR ? 'right' : 'left']: '14%',
            top: `${yPos + (i - 1) * 3}%`,
            width: 3,
            height: 3,
            background: '#fff',
            boxShadow: `0 0 6px ${color}, 0 0 12px ${color}`,
          }}
          animate={{
            x: [(i - 1) * 5, (i - 1) * 25],
            y: [0, (i - 1) * 20],
            opacity: [0, 1, 0],
            scale: [1, 0.3],
          }}
          transition={{
            duration: 0.3,
            delay: delay + 0.35 + i * 0.05,
            repeat: Infinity,
            repeatDelay: 3.5,
          }}
        />
      ))}
    </>
  );
}

/* ─── Ice: frost shards + freeze overlay ──────────────────────────────── */
function IceAttack({ direction, yPos, delay, color }: AttackProps) {
  const isLR = direction === 'lr';
  return (
    <>
      {/* Ice shards (triangular) */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={`shard-${direction}-${i}`}
          className="absolute"
          style={{
            [isLR ? 'left' : 'right']: '10%',
            top: `${yPos - 2 + i * 2}%`,
            width: 10 + i * 2,
            height: 18 + i * 3,
            background: `linear-gradient(${isLR ? '90deg' : '270deg'}, #fff, ${color})`,
            clipPath: 'polygon(50% 0%, 0% 100%, 100% 100%)',
            boxShadow: `0 0 10px ${color}`,
            transform: `rotate(${isLR ? 90 : -90}deg)`,
          }}
          animate={{
            x: isLR ? [0, 550 + i * 20] : [0, -550 - i * 20],
            opacity: [0, 1, 1, 0],
            scale: [0.5, 1, 1, 0.3],
          }}
          transition={{
            duration: 0.8,
            delay: delay + i * 0.1,
            repeat: Infinity,
            repeatDelay: 3.0,
            times: [0, 0.2, 0.8, 1],
          }}
        />
      ))}
      {/* Freeze overlay on opponent side */}
      <motion.div
        className="absolute pointer-events-none"
        style={{
          [isLR ? 'right' : 'left']: 0,
          top: 0,
          width: '35%',
          height: '100%',
          background: `radial-gradient(ellipse at ${isLR ? '30%' : '70%'} 50%, ${color}33 0%, transparent 60%)`,
        }}
        initial={{ opacity: 0 }}
        animate={{ opacity: [0, 0.5, 0] }}
        transition={{ duration: 1.0, delay: delay + 0.6, repeat: Infinity, repeatDelay: 2.8 }}
      />
      {/* Frost crystals sparkle */}
      {[0, 1, 2, 3].map((i) => (
        <motion.div
          key={`crystal-${direction}-${i}`}
          className="absolute"
          style={{
            [isLR ? 'right' : 'left']: `${15 + i * 5}%`,
            top: `${yPos - 5 + i * 3}%`,
            width: 4,
            height: 4,
            background: '#fff',
            boxShadow: `0 0 6px ${color}, 0 0 10px #fff`,
            transform: 'rotate(45deg)',
          }}
          animate={{
            opacity: [0, 1, 0],
            scale: [0, 1.5, 0],
          }}
          transition={{
            duration: 0.4,
            delay: delay + 0.7 + i * 0.1,
            repeat: Infinity,
            repeatDelay: 3.2,
          }}
        />
      ))}
    </>
  );
}

/* ─── Shadow: dark tendrils + void expansion ──────────────────────────── */
function ShadowAttack({ direction, yPos, delay, color }: AttackProps) {
  const isLR = direction === 'lr';
  return (
    <>
      {/* Dark tendrils */}
      {[0, 1, 2].map((i) => (
        <motion.div
          key={`tendril-${direction}-${i}`}
          className="absolute"
          style={{
            [isLR ? 'left' : 'right']: '10%',
            top: `${yPos - 3 + i * 3}%`,
            width: '75%',
            height: 4 - i,
            background: `linear-gradient(${isLR ? '90deg' : '270deg'}, ${color} 0%, #1a001a 40%, ${color}88 70%, transparent 100%)`,
            filter: 'blur(1px)',
            transformOrigin: isLR ? 'left center' : 'right center',
          }}
          initial={{ scaleX: 0, opacity: 0 }}
          animate={{
            scaleX: [0, 1, 1, 0],
            opacity: [0, 0.8, 0.6, 0],
          }}
          transition={{
            duration: 1.4,
            delay: delay + i * 0.15,
            repeat: Infinity,
            repeatDelay: 2.4,
            times: [0, 0.4, 0.8, 1],
          }}
        />
      ))}
      {/* Void circles on impact */}
      {[0, 1].map((i) => (
        <motion.div
          key={`void-${direction}-${i}`}
          className="absolute rounded-full pointer-events-none"
          style={{
            [isLR ? 'right' : 'left']: '15%',
            top: `${yPos - 2}%`,
            border: `2px solid ${color}`,
            boxShadow: `0 0 15px ${color}66, inset 0 0 15px ${color}33`,
          }}
          initial={{ width: 0, height: 0, opacity: 0 }}
          animate={{
            width: [0, 50 + i * 30],
            height: [0, 50 + i * 30],
            opacity: [0, 0.7, 0],
          }}
          transition={{
            duration: 0.7,
            delay: delay + 1.0 + i * 0.15,
            repeat: Infinity,
            repeatDelay: 3.1,
          }}
        />
      ))}
      {/* Screen darkening pulse */}
      <motion.div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse, transparent 40%, #0a001a88 100%)' }}
        animate={{ opacity: [0, 0.4, 0] }}
        transition={{ duration: 1.0, delay: delay + 0.5, repeat: Infinity, repeatDelay: 2.8 }}
      />
    </>
  );
}

/* ─── Light: holy beam + radial starburst ─────────────────────────────── */
function LightAttack({ direction, yPos, delay, color }: AttackProps) {
  const isLR = direction === 'lr';
  return (
    <>
      {/* Holy beam */}
      <motion.div
        className="absolute"
        style={{
          [isLR ? 'left' : 'right']: '10%',
          top: `${yPos - 1}%`,
          width: '75%',
          height: 6,
          background: `linear-gradient(${isLR ? '90deg' : '270deg'}, transparent 0%, ${color} 10%, #fff 50%, ${color} 90%, transparent 100%)`,
          boxShadow: `0 0 15px ${color}, 0 0 30px ${color}88, 0 0 50px ${color}44`,
          filter: 'blur(0.5px)',
          transformOrigin: isLR ? 'left center' : 'right center',
        }}
        initial={{ scaleX: 0, opacity: 0 }}
        animate={{
          scaleX: [0, 1, 1, 0],
          opacity: [0, 1, 0.8, 0],
        }}
        transition={{
          duration: 0.8,
          delay,
          repeat: Infinity,
          repeatDelay: 3.0,
          times: [0, 0.3, 0.7, 1],
          ease: 'easeOut',
        }}
      />
      {/* Starburst rays at impact */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <motion.div
          key={`ray-${direction}-${i}`}
          className="absolute"
          style={{
            [isLR ? 'right' : 'left']: '14%',
            top: `${yPos}%`,
            width: 2,
            height: 20 + (i % 3) * 8,
            background: `linear-gradient(to top, ${color}, transparent)`,
            transformOrigin: 'bottom center',
            transform: `rotate(${i * 60}deg)`,
            boxShadow: `0 0 4px ${color}`,
          }}
          initial={{ opacity: 0, scaleY: 0 }}
          animate={{
            opacity: [0, 1, 0],
            scaleY: [0, 1, 0.5],
          }}
          transition={{
            duration: 0.5,
            delay: delay + 0.6 + i * 0.04,
            repeat: Infinity,
            repeatDelay: 3.3,
          }}
        />
      ))}
      {/* Lens flare */}
      <motion.div
        className="absolute rounded-full pointer-events-none"
        style={{
          [isLR ? 'right' : 'left']: '13%',
          top: `${yPos - 1}%`,
          width: 20,
          height: 20,
          background: `radial-gradient(circle, #fff 0%, ${color}88 40%, transparent 70%)`,
          boxShadow: `0 0 20px #fff, 0 0 40px ${color}`,
        }}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: [0, 2.5, 0], opacity: [0, 0.9, 0] }}
        transition={{ duration: 0.6, delay: delay + 0.6, repeat: Infinity, repeatDelay: 3.2 }}
      />
    </>
  );
}

/* ─── Element Attack Dispatcher ───────────────────────────────────────── */
const ATTACK_MAP: Record<number, React.FC<AttackProps>> = {
  0: FireAttack,
  1: WaterAttack,
  2: WindAttack,
  3: EarthAttack,
  4: LightningAttack,
  5: IceAttack,
  6: ShadowAttack,
  7: LightAttack,
};

interface ElementAttackEffectsProps {
  myElement: number;
  opponentElement: number;
  myColor: string;
  opponentColor: string;
  beamCount: number; // 1 for 1v1, 3 for 3v3
}

export default function ElementAttackEffects({
  myElement,
  opponentElement,
  myColor,
  opponentColor,
  beamCount,
}: ElementAttackEffectsProps) {
  const MyAttack = ATTACK_MAP[myElement] ?? FireAttack;
  const OpponentAttack = ATTACK_MAP[opponentElement] ?? FireAttack;

  return (
    <div className="absolute inset-0 pointer-events-none z-20 overflow-hidden">
      {/* My attacks (left → right) */}
      {Array.from({ length: beamCount }).map((_, bi) => {
        const yPos = beamCount === 1 ? 48 : 20 + bi * 28;
        return (
          <MyAttack
            key={`my-${bi}`}
            direction="lr"
            yPos={yPos}
            delay={0.5 + bi * 0.2}
            color={myColor}
          />
        );
      })}
      {/* Opponent attacks (right → left) */}
      {Array.from({ length: beamCount }).map((_, bi) => {
        const yPos = beamCount === 1 ? 52 : 22 + bi * 28;
        return (
          <OpponentAttack
            key={`opp-${bi}`}
            direction="rl"
            yPos={yPos}
            delay={1.8 + bi * 0.2}
            color={opponentColor}
          />
        );
      })}
    </div>
  );
}
