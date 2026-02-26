import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./providers/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        arena: {
          bg: "#0a0a0f",
          surface: "#12121a",
          card: "#1a1a2e",
          border: "#2a2a3e",
          cyan: "#00f0ff",
          purple: "#7b2ff7",
          pink: "#ff2d87",
          green: "#00ff88",
          orange: "#ff8800",
          red: "#ff3366",
          gold: "#ffd700",
        },
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        display: ["Orbitron", "sans-serif"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "mesh-gradient":
          "radial-gradient(at 40% 20%, #7b2ff7 0px, transparent 50%), radial-gradient(at 80% 0%, #00f0ff 0px, transparent 50%), radial-gradient(at 0% 50%, #ff2d87 0px, transparent 50%)",
      },
      boxShadow: {
        "glow-cyan": "0 0 20px rgba(0, 240, 255, 0.3), 0 0 60px rgba(0, 240, 255, 0.1)",
        "glow-purple": "0 0 20px rgba(123, 47, 247, 0.3), 0 0 60px rgba(123, 47, 247, 0.1)",
        "glow-pink": "0 0 20px rgba(255, 45, 135, 0.3), 0 0 60px rgba(255, 45, 135, 0.1)",
        "glow-green": "0 0 20px rgba(0, 255, 136, 0.3), 0 0 60px rgba(0, 255, 136, 0.1)",
        "glow-gold": "0 0 20px rgba(255, 215, 0, 0.3), 0 0 60px rgba(255, 215, 0, 0.1)",
        glass: "0 8px 32px rgba(0, 0, 0, 0.4)",
      },
      animation: {
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "float": "float 6s ease-in-out infinite",
        "spin-slow": "spin 8s linear infinite",
        "gradient-shift": "gradient-shift 8s ease infinite",
        "shimmer": "shimmer 2s linear infinite",
        "bounce-slow": "bounce 3s infinite",
        "slide-up": "slide-up 0.5s ease-out",
        "slide-in-right": "slide-in-right 0.5s ease-out",
        "fade-in": "fade-in 0.5s ease-out",
        "scale-in": "scale-in 0.3s ease-out",
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.5" },
        },
        float: {
          "0%, 100%": { transform: "translateY(0px)" },
          "50%": { transform: "translateY(-20px)" },
        },
        "gradient-shift": {
          "0%, 100%": { backgroundPosition: "0% 50%" },
          "50%": { backgroundPosition: "100% 50%" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        "slide-up": {
          "0%": { transform: "translateY(20px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        "slide-in-right": {
          "0%": { transform: "translateX(20px)", opacity: "0" },
          "100%": { transform: "translateX(0)", opacity: "1" },
        },
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "scale-in": {
          "0%": { transform: "scale(0.9)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
