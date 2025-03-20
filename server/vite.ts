import express, { type Express } from "express";
import fs from "fs";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer, createLogger } from "vite";
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
import { type Server } from "http";
import viteConfig from "../vite.config";
import { nanoid } from "nanoid";

const viteLogger = createLogger();

export function log(message: string, source = "express") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });

  console.log(`${formattedTime} [${source}] ${message}`);
}

export async function setupVite(app: Express, server: Server) {
  const serverOptions = {
    middlewareMode: true,
    hmr: { server },
    allowedHosts: true,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    customLogger: {
      ...viteLogger,
      error: (msg, options) => {
        viteLogger.error(msg, options);
        process.exit(1);
      },
    },
    server: serverOptions,
    appType: "custom",
  });

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        __dirname,
        "..",
        "client",
        "index.html",
      );

      // always reload the index.html file from disk incase it changes
      let template = await fs.promises.readFile(clientTemplate, "utf-8");
      template = template.replace(
        `src="/src/main.tsx"`,
        `src="/src/main.tsx?v=${nanoid()}"`,
      );
      const page = await vite.transformIndexHtml(url, template);
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  // Vercel-compatible path resolution
  const distPath = process.env.NODE_ENV === 'production'
    ? path.join(process.cwd(), 'dist/public')
    : path.resolve(__dirname, "..", "dist", "public");

  // Check if the directory exists in development mode
  if (process.env.NODE_ENV !== 'production' && !fs.existsSync(distPath)) {
    console.warn(`Static directory not found: ${distPath}. This is expected during build.`);
    return;
  }

  // Serve static files with proper caching headers
  app.use(express.static(distPath, {
    maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
    etag: true,
    index: false // Don't serve index.html automatically
  }));

  // Handle SPA routing - serve index.html for all non-file routes
  app.use('*', (req, res, next) => {
    // Skip API routes
    if (req.originalUrl.startsWith('/api')) {
      return next();
    }
    
    // Skip requests for files with extensions (likely static assets)
    if (req.originalUrl.includes('.') && !req.originalUrl.endsWith('.html')) {
      return next();
    }
    
    const indexPath = path.join(distPath, 'index.html');
    
    // In production, don't throw if index.html doesn't exist (Vercel might handle it differently)
    if (process.env.NODE_ENV === 'production' || fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    
    next();
  });
}
