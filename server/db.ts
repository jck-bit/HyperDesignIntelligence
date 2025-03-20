// db.ts
dotenv.config();

import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { readFileSync } from 'fs';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

dotenv.config({ path: path.resolve(__dirname, '.env') });

// Log DATABASE_URL for absolute verification
console.log("DATABASE_URL for postgres.js (db.ts):", process.env.DATABASE_URL);

const client = postgres(process.env.DATABASE_URL || "", {
  ssl: {
    rejectUnauthorized: false, 
  },
  
  connect_timeout: 10, // Connection timeout in seconds
});

export const db = drizzle(client);


export async function initializeConnection() {
  try {
    if (!process.env.DATABASE_URL) {
      console.log("DATABASE_URL not set, using mock database (no real connection initialized)");
      return;
    }

    console.log("Initializing database connection using postgres.js and Drizzle (SSL forced)...");
    console.log("Attempting Drizzle connection (URL redacted in logs): postgresql:[REDACTED]@..."); // Redact password for logging

    console.log("Drizzle connection initialization started (tested in checkTablesExist)");

  } catch (error) {
    console.error("Database connection initialization error (db.ts):", error); // More specific error log in db.ts
    throw error;
  }
}

export async function checkTablesExist() {
  try {
    console.log("Attempting Drizzle query (connection test) in checkTablesExist..."); // Log before Drizzle query
    // Query to check if the 'agents' table exists
    const result = await db.execute(sql`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_schema = 'public'
        AND table_name = 'agents'
      );
    `);

    const existsResult = result[0];
    const exists = existsResult ? existsResult.exists : false;

    console.log("Drizzle query result (connection test):", exists);
    return exists;
  } catch (error) {
    console.error("Drizzle connection test FAILED in checkTablesExist:", error); // More specific error log for Drizzle test failure
    console.error("Error details (checkTablesExist):", error instanceof Error ? error.message : String(error));
    return false;
  }
}

export async function initializeTables() {
  try {
    
    // Read the SQL script
    const sqlScript = readFileSync(path.resolve(__dirname, '../init-db.sql'), 'utf8');

    // Execute the SQL script using db.execute (Drizzle)
    await db.execute(sql`${sqlScript}`);

    console.log("Tables created successfully using Drizzle!");
  } catch (error) {
    console.error("Error initializing tables using Drizzle:", error);
    throw error;
  }
}