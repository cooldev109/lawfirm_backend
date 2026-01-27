import fs from 'fs';
import path from 'path';
import { pool } from '../config/database';
import { logger } from '../utils/logger';

async function initializeDatabase() {
  const client = await pool.connect();

  try {
    logger.info('Starting database initialization...');

    // Read the migration file
    const migrationPath = path.resolve(__dirname, '../../migrations/001_initial_schema.sql');
    const migrationSQL = fs.readFileSync(migrationPath, 'utf-8');

    // Execute the migration
    await client.query(migrationSQL);

    logger.info('Database schema created successfully!');

  } catch (error: any) {
    if (error.code === '42710') {
      logger.info('Database schema already exists (types already created)');
    } else {
      logger.error('Error initializing database:', error);
      throw error;
    }
  } finally {
    client.release();
    await pool.end();
  }
}

initializeDatabase()
  .then(() => {
    logger.info('Database initialization completed.');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Database initialization failed:', error);
    process.exit(1);
  });
