import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'pro.frostbite.world',
  appName: 'Frostbite World',
  webDir: 'public',
  server: {
    // Load from production URL — no static export needed
    url: 'https://frostbite.pro/world',
    cleartext: false,
  },
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 2000,
      backgroundColor: '#0a0e1a',
      showSpinner: true,
      spinnerColor: '#00e5ff',
    },
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#0a0e1a',
    },
  },
  android: {
    allowMixedContent: false,
    backgroundColor: '#0a0e1a',
  },
};

export default config;
