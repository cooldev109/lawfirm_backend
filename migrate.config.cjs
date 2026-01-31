const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '.env') });

module.exports = {
  databaseUrl: {
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'lawyer_system',
    user: process.env.DB_USER || 'postgres',
    password: String(process.env.DB_PASSWORD || ''),
  },
  dir: 'migrations',
  direction: 'up',
  migrationsTable: 'pgmigrations',
  verbose: true,
};
