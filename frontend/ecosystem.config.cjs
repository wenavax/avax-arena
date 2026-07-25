// PM2 config. CRITICAL: these apps use better-sqlite3 (a single-writer embedded
// DB), so they MUST run in FORK mode with exactly ONE instance. Cluster mode /
// multiple instances = multiple concurrent SQLite writers = DB lock errors and
// corruption. Do NOT change exec_mode to 'cluster' or instances above 1.
module.exports = {
  apps: [
    {
      name: 'frostbite-testnet',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/opt/frostbite/testnet/frontend',
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
    },
    {
      name: 'frostbite-mainnet',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/opt/frostbite/mainnet/frontend',
      exec_mode: 'fork',
      instances: 1,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
