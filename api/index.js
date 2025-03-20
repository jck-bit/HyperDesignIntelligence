import express from 'express';
import { registerRoutes } from '../server/routes.js';
import { serveStatic } from '../server/vite.js';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { initializeConnection, checkTablesExist, initializeTables } from '../server/db.js';
import { voiceService } from '../server/voice-service.js';
import { storage } from '../server/storage.js';

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

// REST API endpoints for agent status and metrics updates
app.put('/api/agents/:id/status', async (req, res) => {
  try {
    const agentId = parseInt(req.params.id);
    const { status } = req.body;
    
    if (isNaN(agentId) || !status) {
      return res.status(400).json({ error: 'Invalid agent ID or status' });
    }
    
    await storage.updateAgentStatus(agentId, status);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating agent status:', error);
    res.status(500).json({ error: 'Failed to update agent status' });
  }
});

app.put('/api/agents/:id/metrics', async (req, res) => {
  try {
    const agentId = parseInt(req.params.id);
    const { metrics } = req.body;
    
    if (isNaN(agentId) || !metrics) {
      return res.status(400).json({ error: 'Invalid agent ID or metrics' });
    }
    
    await storage.updateAgentMetrics(agentId, metrics);
    res.json({ success: true });
  } catch (error) {
    console.error('Error updating agent metrics:', error);
    res.status(500).json({ error: 'Failed to update agent metrics' });
  }
});

// Add voice endpoints to match client expectations
app.get('/api/voice/voices', async (req, res) => {
  try {
    // Use the voiceService directly
    const voices = await voiceService.getVoices();
    res.json(voices);
  } catch (error) {
    console.error('Error fetching voices:', error);
    // Return default voices instead of error
    res.json([
      { voice_id: "ThT5KcBeYPX3keUQqHPh", name: "Leonardo da Vinci" },
      { voice_id: "AZnzlk1XvdvUeBnXmlld", name: "Steve Jobs" }
    ]);
  }
});

// Add voice synthesis endpoint
app.post('/api/voice/synthesize', async (req, res) => {
  try {
    const { text, persona } = req.body;
    console.log(`Voice synthesis request: "${text.substring(0, 30)}..." with persona: ${persona || 'default'}`);

    // Get synthesized speech from voice service
    const audioData = await voiceService.synthesizeSpeech({ text, persona });

    // If we get a fallback indicator object, send it as JSON
    if (typeof audioData === 'object' && 'fallback' in audioData) {
      console.log('Sending fallback response to client');
      return res.json(audioData);
    }

    // Otherwise send the audio buffer with appropriate headers
    console.log('Sending audio response to client:', audioData.length, 'bytes');
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Cache-Control', 'no-cache');
    res.send(audioData);
  } catch (error) {
    console.error('Speech synthesis error:', error);
    res.status(500).json({ error: 'Failed to synthesize speech' });
  }
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
}

// Export the Express app as a serverless function
export default app;
