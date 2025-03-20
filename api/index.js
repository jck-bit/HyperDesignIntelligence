import express from 'express';
import * as dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Load environment variables
dotenv.config();
console.log("NODE_ENV:", process.env.NODE_ENV);
console.log("DATABASE_URL from process.env:", process.env.DATABASE_URL ? "Found" : "Not found");

// Create Express app
const app = express();

// Add middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Add detailed logging middleware
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

// Add direct route handlers for API endpoints
// Fallback agents data
const fallbackAgents = [
  {
    id: 1,
    name: "Albert Einstein",
    type: "Theoretical Physics",
    capabilities: ["Innovation", "Research", "Problem Solving"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Einstein",
    status: "active"
  },
  {
    id: 2,
    name: "Elon Musk",
    type: "Tech Entrepreneur",
    capabilities: ["Innovation", "Strategic Thinking", "Product Development"], 
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Musk",
    status: "active"
  },
  {
    id: 3,
    name: "Emad Mostaque",
    type: "AI Innovator",
    capabilities: ["Artificial Intelligence", "Leadership", "Technical Vision"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mostaque",
    status: "active"
  },
  {
    id: 4,
    name: "Fei-Fei Li",
    type: "AI Research",
    capabilities: ["Artificial Intelligence", "Research", "Technical Vision"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Li",
    status: "active"
  },
  {
    id: 5,
    name: "Leonardo da Vinci",
    type: "Renaissance Innovator",
    capabilities: ["Innovation", "Art", "Engineering"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=DaVinci",
    status: "active"
  },
  {
    id: 6,
    name: "Steve Jobs",
    type: "Tech Visionary",
    capabilities: ["Innovation", "Product Development", "Design"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Jobs",
    status: "active"
  },
  {
    id: 7,
    name: "Walt Disney",
    type: "Creative Visionary",
    capabilities: ["Creativity", "Innovation", "Storytelling"],
    avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Disney",
    status: "active"
  }
];

// Get agents
app.get('/api/agents', (req, res) => {
  res.json(fallbackAgents);
});

// Update agent status
app.put('/api/agents/:id/status', (req, res) => {
  const agentId = parseInt(req.params.id);
  const { status } = req.body;
  
  if (isNaN(agentId) || !status) {
    return res.status(400).json({ error: 'Invalid agent ID or status' });
  }
  
  // Find the agent in our fallback data
  const agent = fallbackAgents.find(a => a.id === agentId);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  // Update the status
  agent.status = status;
  
  res.json({ success: true, agent });
});

// Update agent metrics
app.put('/api/agents/:id/metrics', (req, res) => {
  const agentId = parseInt(req.params.id);
  const { metrics } = req.body;
  
  if (isNaN(agentId) || !metrics) {
    return res.status(400).json({ error: 'Invalid agent ID or metrics' });
  }
  
  // Find the agent in our fallback data
  const agent = fallbackAgents.find(a => a.id === agentId);
  if (!agent) {
    return res.status(404).json({ error: 'Agent not found' });
  }
  
  // Update the metrics
  agent.metrics = metrics;
  
  res.json({ success: true, agent });
});

// Voice endpoints
app.get('/api/voice/voices', (req, res) => {
  // Return default voices
  res.json([
    { voice_id: "ThT5KcBeYPX3keUQqHPh", name: "Leonardo da Vinci" },
    { voice_id: "AZnzlk1XvdvUeBnXmlld", name: "Steve Jobs" }
  ]);
});

app.post('/api/voice/synthesize', (req, res) => {
  const { text, persona } = req.body;
  
  // Return a fallback response
  res.json({
    fallback: true,
    text,
    persona
  });
});

(async () => {
  try {
    // Import modules based on environment
    let routesModule, viteModule, dbModule;
    
    if (process.env.NODE_ENV === 'production') {
      console.log('Loading production modules...');
      // In production, try to import from the bundled files
      try {
        routesModule = await import('../dist/server-build/server/routes.mjs');
        viteModule = await import('../dist/server-build/server/vite.mjs');
        dbModule = await import('../dist/server-build/server/db.mjs');
      } catch (error) {
        console.error('Error importing production modules:', error);
        // Fallback to development imports
        routesModule = await import('../server/routes.js');
        viteModule = await import('../server/vite.js');
        dbModule = await import('../server/db.js');
      }
    } else {
      console.log('Loading development modules...');
      routesModule = await import('../server/routes.js');
      viteModule = await import('../server/vite.js');
      dbModule = await import('../server/db.js');
    }
    
    const { registerRoutes } = routesModule;
    const { serveStatic } = viteModule;
    const { initializeConnection, checkTablesExist, initializeTables } = dbModule;
    
    // Initialize database in development mode
    if (process.env.NODE_ENV !== 'production') {
      try {
        if (!process.env.DATABASE_URL) {
          console.log("DATABASE_URL not set, using mock database");
        } else {
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
        }
      } catch (error) {
        console.error("Error initializing database:", error);
      }
    }
    
    // Register routes
    const server = registerRoutes(app);
    
    // Serve static files
    serveStatic(app);
    
    // Add error handling middleware
    app.use((err, _req, res, _next) => {
      const status = err.status || err.statusCode || 500;
      const message = err.message || "Internal Server Error";
      res.status(status).json({ message });
      console.error(err);
    });
    
    // Start the server in development mode
    if (process.env.NODE_ENV !== 'production') {
      const port = process.env.PORT || 3003;
      server.listen(port, () => {
        console.log(`Server running on port ${port}`);
      });
    }
  } catch (error) {
    console.error('Error setting up server:', error);
  }
})();

// Export the Express app as a serverless function
export default app;
