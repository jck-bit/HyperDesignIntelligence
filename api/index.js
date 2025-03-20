import express from 'express';
import { registerRoutes } from '../server/routes.js';
import { serveStatic } from '../server/vite.js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeConnection, checkTablesExist, initializeTables } from '../server/db.js';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();
console.log("DATABASE_URL from process.env:", process.env.DATABASE_URL ? "Found" : "Not found");

// Function to initialize database
async function initializeDatabase() {
  try {
    if (!process.env.DATABASE_URL) {
      console.log("DATABASE_URL not set, using mock database (no real database initialization)");
      return;
    }

    console.log("Initializing database connection...");
    await initializeConnection();

    console.log("Checking database connection and tables...");
    const tablesExist = await checkTablesExist();

    if (!tablesExist) {
      console.log("Tables don't exist, initializing database...");
      await initializeTables();
      console.log("Database initialized successfully!");
    } else {
      console.log("Database tables already exist!");
    }
  } catch (error) {
    console.error("Error initializing database:", error);
  }
}

// Create Express app
const app = express();

// Add middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add detailed logging middleware (from original server)
app.use((req, res, next) => {
  const start = Date.now();
  const path = req.path;
  let capturedJsonResponse = undefined;

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

      console.log(logLine);
    }
  });

  next();
});

// Add health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'ok',
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Initialize database and set up server for local development
if (process.env.NODE_ENV !== 'production') {
  (async () => {
    // Initialize database BEFORE setting up routes
    await initializeDatabase();
    
    // Register routes from your original server
    const server = registerRoutes(app);
    
    // Serve static files (important for client assets)
    serveStatic(app);
    
    // Add error handling middleware (from original server)
    app.use((err, _req, res, _next) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
      console.error(err);
    });
    
    // Start the server in development mode
    const port = process.env.PORT || 3003; // Use a different port
    server.listen(port, () => {
      console.log(`Server running on port ${port}`);
    });
  })();
} else {
  // In production, register routes directly
  registerRoutes(app);
  
  // Serve static files
  serveStatic(app);
  
  // Add error handling middleware
  app.use((err, _req, res, _next) => {
    const status = err.status || err.statusCode || 500;
    const message = err.message || "Internal Server Error";
    res.status(status).json({ message });
    console.error(err);
  });
}

// Export the Express app as a serverless function
export default app;
