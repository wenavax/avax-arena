/**
 * PM2 ecosystem config — Sweep bot on VPS.
 *
 * Kullanım (VPS'te):
 *   cd /opt/baseworld/sweeper
 *   cp .env.example .env  # SWEEPER_PK, RPC_URL, VAULT_ADDRESS doldur
 *   pnpm install
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 *
 * Modeler:
 *   - "sweeper-watch" → sürekli çalışır, 60sn'de bir kontrol (önerilen, hızlı reaksiyon)
 *   - "sweeper-cron"  → her 5 dk'da bir spawn olur (daha az kaynak, snelt reaksiyon)
 *   - "sweeper-hour"  → her saat (gas tasarrufu, eşik nadir aşılır)
 *
 * Bir tanesini seç, diğerlerini sil veya cron_restart eklemeyerek devre dışı bırak.
 */
module.exports = {
  apps: [
    {
      name: "baseworld-sweeper",
      script: "sweep-bot.mjs",
      cwd: __dirname,
      env: {
        LOOP: "1",
        POLL_SECONDS: "60",
        // SWEEPER_PK, RPC_URL, VAULT_ADDRESS .env'den okunur (pm2 dotenv değil
        // process.env okur — environment .env dosyasından PM2'ye geçirilmeli)
        // Production'da pm2-env veya systemd env yükleyici kullan, ya da
        // env_file:'.env' ekleyen PM2 module'leri.
      },
      max_memory_restart: "100M",
      autorestart: true,
      // Public RPC için bazen rate limit; restart limiti
      max_restarts: 50,
      restart_delay: 5_000,
      log_date_format: "YYYY-MM-DD HH:mm:ss",
    },
  ],
};
