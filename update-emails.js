const { Pool } = require('pg');

const pool = new Pool({
  host: 'localhost',
  port: 5432,
  database: 'lawyer_system',
  user: 'postgres',
  password: 'future',
});

async function updateEmails() {
  try {
    // First, change the conflicting client emails to something else temporarily
    await pool.query(
      `UPDATE users SET email = 'old_' || email WHERE email IN ('henryzhang0109@gmail.com', 'mazenabass991@gmail.com', 'mazenbass991@gmail.com')`
    );
    console.log('Moved conflicting emails');

    // Update Maria Garcia's email (96e54cbd-b5a2-4627-8935-09672337b5ec)
    await pool.query(
      `UPDATE users SET email = $1 WHERE id = (SELECT user_id FROM lawyers WHERE id = $2)`,
      ['henryzhang0109@gmail.com', '96e54cbd-b5a2-4627-8935-09672337b5ec']
    );
    console.log('Updated Maria Garcia email to henryzhang0109@gmail.com');

    // Update John Smith's email (098042d5-ce34-42e2-94ae-47369ea430a9)
    await pool.query(
      `UPDATE users SET email = $1 WHERE id = (SELECT user_id FROM lawyers WHERE id = $2)`,
      ['mazenabass991@gmail.com', '098042d5-ce34-42e2-94ae-47369ea430a9']
    );
    console.log('Updated John Smith email to mazenabass991@gmail.com');

    // Verify
    const result = await pool.query(
      `SELECT u.email, u.first_name, u.last_name FROM users u JOIN lawyers l ON l.user_id = u.id`
    );
    console.log('\nCurrent lawyer emails:');
    result.rows.forEach(row => {
      console.log(`  ${row.first_name} ${row.last_name}: ${row.email}`);
    });

    await pool.end();
  } catch (err) {
    console.error('Error:', err);
    await pool.end();
  }
}

updateEmails();
