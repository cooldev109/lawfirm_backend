// PM2 Ecosystem Configuration
// Use: pm2 start ecosystem.config.js

module.exports = {
  apps: [
    {
      name: 'lawyer-system-api',
      script: 'dist/index.js',
      instances: 'max', // Use all available CPU cores
      exec_mode: 'cluster', // Enable cluster mode for load balancing
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'development',
        PORT: 3000,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      // Logging
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      error_file: './logs/pm2-error.log',
      out_file: './logs/pm2-out.log',
      merge_logs: true,
      // Graceful shutdown
      kill_timeout: 30000, // 30 seconds for graceful shutdown
      wait_ready: true,
      listen_timeout: 10000,
      // Restart behavior
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
      min_uptime: '10s',
    },
  ],

  // Deployment configuration (optional)
  deploy: {
    production: {
      user: 'deploy',
      host: ['your-server-ip'],
      ref: 'origin/main',
      repo: 'git@github.com:your-username/lawyer-system.git',
      path: '/var/www/lawyer-system',
      'pre-deploy-local': '',
      'post-deploy': 'cd backend && npm install && npm run build && pm2 reload ecosystem.config.js --env production',
      'pre-setup': '',
    },
  },
};
