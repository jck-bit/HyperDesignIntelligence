import { Request, Response } from "express";
import app from "./server/index";
import path from "path";
import fs from "fs";

// Helper function to check if a path exists
const fileExists = (filePath: string): boolean => {
  try {
    return fs.existsSync(filePath);
  } catch (err) {
    return false;
  }
};

// Helper function to get content type based on file extension
const getContentType = (filePath: string): string => {
  const ext = path.extname(filePath).toLowerCase();
  const contentTypes: Record<string, string> = {
    '.html': 'text/html',
    '.js': 'text/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff': 'font/woff',
    '.woff2': 'font/woff2',
    '.ttf': 'font/ttf',
    '.eot': 'application/vnd.ms-fontobject',
    '.otf': 'font/otf',
    '.mjs': 'text/javascript'
  };
  
  return contentTypes[ext] || 'text/plain';
};

export default async (req: Request, res: Response) => {
  try {
    // Check if the request is for a static file
    const url = req.url || '/';
    
    // Skip API routes and forward them to the Express app
    if (url.startsWith('/api')) {
      return await app(req, res);
    }
    
    // Try to serve static files from the public directory
    const publicDir = path.join(process.cwd(), 'dist/public');
    let filePath = path.join(publicDir, url === '/' ? 'index.html' : url);
    
    // Remove query parameters from the URL if present
    filePath = filePath.split('?')[0];
    
    // Check if the file exists
    if (fileExists(filePath)) {
      const contentType = getContentType(filePath);
      const content = fs.readFileSync(filePath);
      
      res.setHeader('Content-Type', contentType);
      res.end(content);
      return;
    }
    
    // If the file doesn't exist but it's not an API route, serve index.html (for SPA routing)
    if (!url.includes('.')) {
      const indexPath = path.join(publicDir, 'index.html');
      if (fileExists(indexPath)) {
        const content = fs.readFileSync(indexPath);
        res.setHeader('Content-Type', 'text/html');
        res.end(content);
        return;
      }
    }
    
    // If we get here, let the Express app handle it
    await app(req, res);
  } catch (error) {
    console.error('Vercel adapter error:', error);
    res.statusCode = 500;
    res.end('Internal Server Error');
  }
};
