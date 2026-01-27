// Script to run only the new migrations (004 and 005)
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

    // Run migration 004 - inactivity tracking
    console.log('\n--- Running 004_inactivity_tracking.sql ---');
    const migration004 = fs.readFileSync(
      path.join(__dirname, 'migrations', '004_inactivity_tracking.sql'),
      'utf8'
    );

    try {
      await client.query(migration004);
      console.log('✓ 004_inactivity_tracking.sql completed');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('✓ 004_inactivity_tracking.sql - already applied (skipped)');
      } else {
        throw err;
      }
    }

    // Run migration 005 - email templates
    console.log('\n--- Running 005_email_templates.sql ---');
    const migration005 = fs.readFileSync(
      path.join(__dirname, 'migrations', '005_email_templates.sql'),
      'utf8'
    );

    try {
      await client.query(migration005);
      console.log('✓ 005_email_templates.sql completed');
    } catch (err) {
      if (err.message.includes('already exists')) {
        console.log('✓ 005_email_templates.sql - already applied (skipped)');
      } else {
        throw err;
      }
    }

    console.log('\n=== All migrations completed successfully! ===');

    // Verify tables exist
    console.log('\nVerifying tables...');

    const { rows: tables } = await client.query(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name
    `);

    console.log('Tables in database:');
    tables.forEach(t => console.log(`  - ${t.table_name}`));

  } catch (err) {
    console.error('\n✗ Migration failed:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

runMigrations().catch(err => {
  process.exit(1);
});
