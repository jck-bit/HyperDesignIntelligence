import express, { type Request, Response, NextFunction } from "express";
import { registerRoutes } from "./routes";
import { setupVite, serveStatic, log } from "./vite";
import * as dotenv from 'dotenv';
import net from 'net';
import { exec } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { db, initializeConnection, checkTablesExist, initializeTables } from './db'; // Updated imports from db.ts

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config({ path: path.resolve(__dirname, '.env') });
console.log("DATABASE_URL from process.env:", process.env.DATABASE_URL ? "Found" : "Not found");

// Function to check if tables exist and initialize them if not (using functions from db.ts)
async function initializeDatabase() {
  try {
    if (!process.env.DATABASE_URL) {
      console.log("DATABASE_URL not set, using mock database (no real database initialization)");
      return;
    }

    console.log("Initializing database connection...");
    await initializeConnection(); // Using initializeConnection from db.ts

    console.log("Checking database connection and tables...");

    // Check if tables exist using checkTablesExist from db.ts
    const tablesExist = await checkTablesExist();

    if (!tablesExist) {
      console.log("Tables don't exist, initializing database...");
      await initializeTables(); // Using initializeTables from db.ts
      console.log("Database initialized successfully!");
    } else {
      console.log("Database tables already exist!");
    }
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse: Record<string, any> | undefined = undefined;

  const originalResJson = res.json;
  res.json = function (bodyJson, ...args) {
    capturedJsonResponse = bodyJson;
    return originalResJson.apply(res, [bodyJson, ...args]);
  };

  res.on("finish", () => {
    const duration = Date.now() - start;
    if (path.startsWith("/api")) {
      let logLine = `${req.method} ${path} ${res.statusCode} in ${duration}ms`;
      if (capturedJsonResponse) {
        logLine += ` :: ${JSON.stringify(capturedJsonResponse)}`;
      }

      if (logLine.length > 80) {
        logLine = logLine.slice(0, 79) + "…";
      }

      log(logLine);
    }
  });

  next();
});

(async () => {
  // Initialize database BEFORE starting the server
  await initializeDatabase();

  const server = registerRoutes(app);

  app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";

    res.status(status).json({ message });
    throw err;
  });

  if (process.env.NODE_ENV === 'development') {
    app.listen(3000, () => {
      console.log('Local dev server running on port 3000');
    });
  }

  // Use PORT from environment variable (for deployment) or default to 3000
  const port = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

  // Check if port is in use and handle cleanup
  const testServer = net.createServer()
    .once('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log('Port in use, attempting cleanup...');
        exec(`lsof -i :${port} | grep LISTEN | awk '{print $2}' | xargs kill -9`);
        setTimeout(() => {
          startServer();
        }, 1000);
      }
    })
    .once('listening', () => {
      testServer.close();
      startServer();
    })
    .listen(port);

  function startServer() {
    server.listen(port, "0.0.0.0", () => {
      log(`Server running on port ${port}`);
    }).on('error', (err: any) => {
      console.error('Server error:', err);
      process.exit(1);
    });
  }
})();


// Add at the bottom of index.ts
export default async (req: Request, res: Response) => {
  // Convert Vercel's Request/Response to Express format
  const expressReq = req as unknown as express.Request;
  const expressRes = res as unknown as express.Response;
  
  // Forward to Express server
  app(expressReq, expressRes);
};