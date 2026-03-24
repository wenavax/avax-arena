import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./providers/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        frost: {
          bg: "rgb(var(--frost-bg) / <alpha-value>)",
          surface: "rgb(var(--frost-surface) / <alpha-value>)",
          card: "rgb(var(--frost-card) / <alpha-value>)",
          border: "rgb(var(--frost-border) / <alpha-value>)",
          primary: "rgb(var(--frost-primary) / <alpha-value>)",
          secondary: "rgb(var(--frost-secondary) / <alpha-value>)",
          accent: "rgb(var(--frost-accent) / <alpha-value>)",
          // Aliases — mevcut frost-cyan/purple/pink class'ları otomatik çalışır
          cyan: "rgb(var(--frost-primary) / <alpha-value>)",
          purple: "rgb(var(--frost-secondary) / <alpha-value>)",
          pink: "rgb(var(--frost-accent) / <alpha-value>)",
          // Status / game colors (CSS var driven for theme support)
          green: "var(--frost-green)",
          orange: "var(--frost-orange)",
          red: "var(--frost-red)",
          gold: "var(--frost-gold)",
        },
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "Fira Code", "monospace"],
        display: ["Orbitron", "sans-serif"],
        pixel: ["Silkscreen", "monospace"],
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
      boxShadow: {
        "glow-cyan": "0 0 20px rgb(var(--frost-primary) / 0.3), 0 0 60px rgb(var(--frost-primary) / 0.1)",
        "glow-purple": "0 0 20px rgb(var(--frost-secondary) / 0.3), 0 0 60px rgb(var(--frost-secondary) / 0.1)",
        "glow-pink": "0 0 20px rgb(var(--frost-accent) / 0.2), 0 0 60px rgb(var(--frost-accent) / 0.06)",
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
