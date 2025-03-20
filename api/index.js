// This file is used by Vercel to handle API requests
import express from 'express';

// Create Express app
const app = express();

// Add middleware
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

// Simple API route for testing
app.get('/api', (req, res) => {
  res.json({ message: 'API is working!' });
});

app.get('/api/hello', (req, res) => {
  res.json({ message: 'Hello from the API!' });
});

// Export the Express app as a serverless function
export default app;
