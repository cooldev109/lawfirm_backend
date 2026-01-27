// Simple script to run migrations with proper env loading
require('dotenv').config();

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'lawyer_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

async function runMigrations() {
  const client = await pool.connect();

  try {
    console.log('Connected to database successfully!');
    console.log(`Database: ${process.env.DB_NAME}`);
    console.log(`Host: ${process.env.DB_HOST}`);

    // Create migrations tracking table if not exists
    await client.query(`
      CREATE TABLE IF NOT EXISTS migrations_history (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL UNIQUE,
        executed_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Get list of migration files
    const migrationsDir = path.join(__dirname, 'migrations');
    const files = fs.readdirSync(migrationsDir)
      .filter(f => f.endsWith('.sql'))
      .sort();

    console.log(`\nFound ${files.length} migration files`);

    // Get already executed migrations
    const { rows: executed } = await client.query(
      'SELECT name FROM migrations_history'
    );
    const executedNames = new Set(executed.map(r => r.name));

    // Run pending migrations
    let count = 0;
    for (const file of files) {
      if (executedNames.has(file)) {
        console.log(`  [SKIP] ${file} (already executed)`);
        continue;
      }

      console.log(`  [RUN]  ${file}`);
      const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');

      await client.query('BEGIN');
      try {
        await client.query(sql);
        await client.query(
          'INSERT INTO migrations_history (name) VALUES ($1)',
          [file]
        );
        await client.query('COMMIT');
        count++;
        console.log(`         ✓ Success`);
      } catch (err) {
        await client.query('ROLLBACK');
        console.error(`         ✗ Failed: ${err.message}`);
        throw err;
      }
    }

    console.log(`\nMigrations complete! (${count} new migrations executed)`);

  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
