module.exports = {
  apps: [
    {
      name: 'frostbite-testnet',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/opt/frostbite/testnet/frontend',
      exec_mode: 'cluster',
      instances: 2,
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
      exec_mode: 'cluster',
      instances: 'max',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
