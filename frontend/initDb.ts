// initDb.ts
import { open } from 'sqlite';
import sqlite3 from 'sqlite3';

async function initDb() {
  const db = await open({
    filename: './knowit?.db',
    driver: sqlite3.Database,
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS quizzes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      description TEXT,
      questions TEXT NOT NULL,
      difficulty TEXT,
      estimatedTime INTEGER,
      rewards TEXT,
      source TEXT,
      createdAt TEXT,
      rewardType TEXT,
      rewardAmount INTEGER,
      nftMetadata TEXT
    )
  `);

  console.log('Database initialized');
  await db.close();
}

initDb().catch(console.error);