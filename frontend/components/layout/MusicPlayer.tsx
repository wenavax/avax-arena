'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Volume2, VolumeX, SkipForward, SkipBack, Play, Pause } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

const TRACKS = [
  { src: '/music/track1.mp3', title: 'Track 1' },
  { src: '/music/track2.mp3', title: 'Track 2' },
  { src: '/music/track3.mp3', title: 'Track 3' },
  { src: '/music/track4.mp3', title: 'Track 4' },
];

export function MusicPlayer() {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTrack, setCurrentTrack] = useState(0);
  const [volume, setVolume] = useState(0.3);
  const [isMuted, setIsMuted] = useState(false);
  const [showVolume, setShowVolume] = useState(false);

  // Initialize audio
  useEffect(() => {
    const audio = new Audio(TRACKS[0].src);
    audio.volume = 0.3;
    audio.loop = false;
    audioRef.current = audio;

    audio.addEventListener('ended', () => {
      // Auto play next track
      setCurrentTrack(prev => {
        const next = (prev + 1) % TRACKS.length;
        audio.src = TRACKS[next].src;
        audio.play().catch(() => {});
        return next;
      });
    });

    return () => {
      audio.pause();
      audio.src = '';
    };
  }, []);

  const togglePlay = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
    } else {
      audio.play().then(() => setIsPlaying(true)).catch(() => {});
    }
  }, [isPlaying]);

  const toggleMute = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !isMuted;
    setIsMuted(!isMuted);
  }, [isMuted]);

  const changeVolume = useCallback((val: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = val;
    setVolume(val);
    if (val === 0) setIsMuted(true);
    else setIsMuted(false);
  }, []);

  const nextTrack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const next = (currentTrack + 1) % TRACKS.length;
    setCurrentTrack(next);
    audio.src = TRACKS[next].src;
    if (isPlaying) audio.play().catch(() => {});
  }, [currentTrack, isPlaying]);

  const prevTrack = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const prev = (currentTrack - 1 + TRACKS.length) % TRACKS.length;
    setCurrentTrack(prev);
    audio.src = TRACKS[prev].src;
    if (isPlaying) audio.play().catch(() => {});
  }, [currentTrack, isPlaying]);

  return (
    <div className="fixed bottom-4 left-4 z-50 hidden lg:flex items-center gap-1">
      <motion.div
        className="flex items-center gap-1 bg-[rgb(var(--frost-bg))]/90 backdrop-blur-md border border-white/[0.08] rounded-xl px-2 py-1.5 shadow-lg"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 1, duration: 0.5 }}
      >
        {/* Prev */}
        <button
          onClick={prevTrack}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
          title="Previous track"
        >
          <SkipBack className="w-3 h-3" />
        </button>

        {/* Play/Pause */}
        <button
          onClick={togglePlay}
          className={`w-8 h-8 flex items-center justify-center rounded-lg transition-all ${
            isPlaying
              ? 'bg-frost-primary/20 text-frost-primary hover:bg-frost-primary/30'
              : 'bg-white/[0.06] text-white/50 hover:text-white/80 hover:bg-white/[0.1]'
          }`}
          title={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5 ml-0.5" />}
        </button>

        {/* Next */}
        <button
          onClick={nextTrack}
          className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
          title="Next track"
        >
          <SkipForward className="w-3 h-3" />
        </button>

        {/* Divider */}
        <div className="w-px h-5 bg-white/[0.08] mx-0.5" />

        {/* Track name */}
        <span className="text-[9px] font-pixel text-white/30 px-1 min-w-[48px] text-center">
          {TRACKS[currentTrack].title}
        </span>

        {/* Volume */}
        <div
          className="relative"
          onMouseEnter={() => setShowVolume(true)}
          onMouseLeave={() => setShowVolume(false)}
        >
          <button
            onClick={toggleMute}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-white/30 hover:text-white/60 hover:bg-white/[0.06] transition-all"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted || volume === 0 ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
          </button>

          {/* Volume slider popup */}
          <AnimatePresence>
            {showVolume && (
              <motion.div
                initial={{ opacity: 0, y: 5 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 5 }}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 bg-[rgb(var(--frost-bg))]/95 backdrop-blur-md border border-white/[0.08] rounded-lg p-2 shadow-xl"
              >
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={volume}
                  onChange={(e) => changeVolume(parseFloat(e.target.value))}
                  className="w-20 h-1 appearance-none bg-white/10 rounded-full cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-frost-primary"
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </motion.div>
    </div>
  );
}
