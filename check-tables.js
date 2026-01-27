require('dotenv').config();
const { Pool } = require('pg');
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'lawyer_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema = 'public' ORDER BY table_name")
  .then(r => {
    console.log('Tables in database:');
    r.rows.forEach(t => console.log('  -', t.table_name));
    pool.end();
  })
  .catch(e => { console.error(e); pool.end(); });
