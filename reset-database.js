// Script to reset database with clean data
// Keeps: admin, 2 lawyers (mazenabass991@gmail.com, henryzhang0109@gmail.com)
// Adds: 2 seed client users
// Removes: all cases and history
require('dotenv').config();

const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'lawyer_system',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

const SALT_ROUNDS = 10;

async function resetDatabase() {
  const client = await pool.connect();

  try {
    console.log('Connected to database successfully!');
    console.log(`Database: ${process.env.DB_NAME}`);
    console.log('\n=== Starting Database Reset ===\n');

    // Start transaction
    await client.query('BEGIN');

    // Step 1: Delete all case-related data
    console.log('Step 1: Clearing all case-related data...');

    await client.query('DELETE FROM case_events');
    console.log('  ✓ Deleted case_events');

    await client.query('DELETE FROM notifications');
    console.log('  ✓ Deleted notifications');

    await client.query('DELETE FROM emails');
    console.log('  ✓ Deleted emails');

    await client.query('DELETE FROM documents');
    console.log('  ✓ Deleted documents');

    await client.query('DELETE FROM cases');
    console.log('  ✓ Deleted cases');

    // Step 2: Get the users we want to keep
    console.log('\nStep 2: Identifying users to keep...');

    const { rows: usersToKeep } = await client.query(`
      SELECT id, email, role FROM users
      WHERE email IN ('admin@lawfirm.com', 'mazenabass991@gmail.com', 'henryzhang0109@gmail.com')
    `);

    const keepUserIds = usersToKeep.map(u => u.id);
    console.log(`  Found ${usersToKeep.length} users to keep:`);
    usersToKeep.forEach(u => console.log(`    - ${u.email} (${u.role})`));

    // Step 3: Delete clients not in keep list
    console.log('\nStep 3: Cleaning up other users...');

    if (keepUserIds.length > 0) {
      const { rowCount: clientsDeleted } = await client.query(`
        DELETE FROM clients WHERE user_id NOT IN (${keepUserIds.map((_, i) => `$${i + 1}`).join(',')})
      `, keepUserIds);
      console.log(`  ✓ Deleted ${clientsDeleted} client records`);

      const { rowCount: lawyersDeleted } = await client.query(`
        DELETE FROM lawyers WHERE user_id NOT IN (${keepUserIds.map((_, i) => `$${i + 1}`).join(',')})
      `, keepUserIds);
      console.log(`  ✓ Deleted ${lawyersDeleted} lawyer records`);

      const { rowCount: usersDeleted } = await client.query(`
        DELETE FROM users WHERE id NOT IN (${keepUserIds.map((_, i) => `$${i + 1}`).join(',')})
      `, keepUserIds);
      console.log(`  ✓ Deleted ${usersDeleted} user records`);
    }

    // Step 4: Reset lawyer passwords to HJH971109!
    console.log('\nStep 4: Resetting lawyer passwords...');
    const lawyerPasswordHash = await bcrypt.hash('HJH971109!', SALT_ROUNDS);

    await client.query(`
      UPDATE users SET password_hash = $1
      WHERE email IN ('mazenabass991@gmail.com', 'henryzhang0109@gmail.com')
    `, [lawyerPasswordHash]);
    console.log('  ✓ Lawyer passwords reset to HJH971109!');

    // Step 5: Reset admin password to admin123
    console.log('\nStep 5: Resetting admin password...');
    const adminPasswordHash = await bcrypt.hash('admin123', SALT_ROUNDS);

    await client.query(`
      UPDATE users SET password_hash = $1 WHERE email = 'admin@lawfirm.com'
    `, [adminPasswordHash]);
    console.log('  ✓ Admin password reset to admin123');

    // Step 6: Create 2 seed client users
    console.log('\nStep 6: Creating seed client users...');
    const clientPasswordHash = await bcrypt.hash('client123', SALT_ROUNDS);

    // Client 1: Demo Client
    const { rows: client1Result } = await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        phone = EXCLUDED.phone
      RETURNING id, email
    `, ['demo.client@example.com', clientPasswordHash, 'client', 'Demo', 'Client', '+1-555-0200']);

    if (client1Result.length > 0) {
      await client.query(`
        INSERT INTO clients (user_id, company_name, address, city, state, zip_code, country)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id) DO UPDATE SET
          company_name = EXCLUDED.company_name,
          address = EXCLUDED.address,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          zip_code = EXCLUDED.zip_code,
          country = EXCLUDED.country
      `, [client1Result[0].id, 'Demo Company LLC', '123 Main Street', 'New York', 'NY', '10001', 'USA']);
      console.log('  ✓ Created client: demo.client@example.com / client123');
    }

    // Client 2: Test User
    const { rows: client2Result } = await client.query(`
      INSERT INTO users (email, password_hash, role, first_name, last_name, phone)
      VALUES ($1, $2, $3, $4, $5, $6)
      ON CONFLICT (email) DO UPDATE SET
        password_hash = EXCLUDED.password_hash,
        first_name = EXCLUDED.first_name,
        last_name = EXCLUDED.last_name,
        phone = EXCLUDED.phone
      RETURNING id, email
    `, ['test.user@example.com', clientPasswordHash, 'client', 'Test', 'User', '+1-555-0201']);

    if (client2Result.length > 0) {
      await client.query(`
        INSERT INTO clients (user_id, company_name, address, city, state, zip_code, country)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id) DO UPDATE SET
          company_name = EXCLUDED.company_name,
          address = EXCLUDED.address,
          city = EXCLUDED.city,
          state = EXCLUDED.state,
          zip_code = EXCLUDED.zip_code,
          country = EXCLUDED.country
      `, [client2Result[0].id, 'Test Corp', '456 Oak Avenue', 'Los Angeles', 'CA', '90001', 'USA']);
      console.log('  ✓ Created client: test.user@example.com / client123');
    }

    // Commit transaction
    await client.query('COMMIT');

    console.log('\n=== Database Reset Complete ===\n');

    // Display final user list
    const { rows: finalUsers } = await client.query(`
      SELECT u.email, u.role, u.first_name, u.last_name
      FROM users u
      ORDER BY u.role, u.email
    `);

    console.log('Final users in database:');
    console.log('─'.repeat(60));
    console.log('Role     | Email                          | Name');
    console.log('─'.repeat(60));
    finalUsers.forEach(u => {
      const role = u.role.padEnd(8);
      const email = u.email.padEnd(30);
      console.log(`${role} | ${email} | ${u.first_name} ${u.last_name}`);
    });
    console.log('─'.repeat(60));

    console.log('\n📋 Credentials Summary:');
    console.log('─'.repeat(40));
    console.log('Admin:');
    console.log('  Email: admin@lawfirm.com');
    console.log('  Password: admin123');
    console.log('\nLawyers:');
    console.log('  Email: mazenabass991@gmail.com');
    console.log('  Password: HJH971109!');
    console.log('  Email: henryzhang0109@gmail.com');
    console.log('  Password: HJH971109!');
    console.log('\nClients:');
    console.log('  Email: demo.client@example.com');
    console.log('  Password: client123');
    console.log('  Email: test.user@example.com');
    console.log('  Password: client123');
    console.log('─'.repeat(40));

  } catch (err) {
    await client.query('ROLLBACK');
    console.error('\n✗ Error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

resetDatabase().catch(() => process.exit(1));
