// Script to run the messages migration
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

async function runMessagesMigration() {
  const client = await pool.connect();

  try {
    console.log('Connected to database successfully!');
    console.log(`Database: ${process.env.DB_NAME}`);

    // Check if messages table already exists
    const { rows: tableCheck } = await client.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'messages'
      )
    `);

    if (tableCheck[0].exists) {
      console.log('messages table already exists, skipping migration');
      return;
    }

    console.log('\n--- Running 003_messages.sql ---');
    const migration = fs.readFileSync(
      path.join(__dirname, 'migrations', '003_messages.sql'),
      'utf8'
    );

    await client.query(migration);
    console.log('✓ 003_messages.sql completed');

    // Verify
    const { rows: tables } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('\nTables in database:');
    tables.forEach(t => console.log(`  - ${t.table_name}`));

    console.log('\n=== Migration completed successfully! ===');

  } catch (err) {
    console.error('\n✗ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMessagesMigration().catch(() => process.exit(1));
