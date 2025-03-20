// This file is used by Vercel to handle API requests
import express from 'express';
import { registerRoutes } from '../server/routes.js';
import { serveStatic } from '../server/vite.js';

// Create Express app
const app = express();

// Add middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Register routes
registerRoutes(app);

// Serve static files
serveStatic(app);

// Export the Express app as a serverless function
export default app;
