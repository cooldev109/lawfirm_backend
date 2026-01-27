const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lawyer_system',
  user: 'postgres',
  password: 'future',
});

async function checkEmails() {
  try {
    // Check all users with these emails
    const result = await pool.query(
      `SELECT u.id, u.email, u.first_name, u.last_name, u.role, l.id as lawyer_id
       FROM users u
       LEFT JOIN lawyers l ON l.user_id = u.id
       ORDER BY u.role, u.email`
    );
    console.log('All users:');
    result.rows.forEach(row => {
      console.log(`  ${row.role}: ${row.first_name} ${row.last_name} - ${row.email} (lawyer_id: ${row.lawyer_id || 'N/A'})`);
    });

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
}

checkEmails();
