import { Client } from 'pg';
import { config } from '../config/env';
import { logger } from '../utils/logger';

async function createDatabase() {
  // Connect to default postgres database first
  const client = new Client({
    host: config.db.host,
    port: config.db.port,
    database: 'postgres',
    user: config.db.user,
    password: config.db.password,
  });

  try {
    await client.connect();
    logger.info('Connected to PostgreSQL');

    // Check if database exists
    const res = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [config.db.name]
    );

    if (res.rows.length === 0) {
      await client.query(`CREATE DATABASE ${config.db.name}`);
      logger.info(`Database "${config.db.name}" created successfully!`);
    } else {
      logger.info(`Database "${config.db.name}" already exists.`);
    }
  } catch (error) {
    logger.error('Error creating database:', error);
    throw error;
  } finally {
    await client.end();
  }
}

createDatabase()
  .then(() => {
    logger.info('Done.');
    process.exit(0);
  })
  .catch((error) => {
    logger.error('Failed:', error);
    process.exit(1);
  });
