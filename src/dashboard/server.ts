import express from 'express';
import fs from 'fs';
import path from 'path';
import { dashboardRouter } from './routes.js';
import { getWatcherStatus } from '../collector/watcher.js';

export function startDashboardServer(port: number = 3000) {
  const app = express();
  
  // Body parsing limit
  app.use(express.json({ limit: '256kb' }));

  // Health check endpoint (unauthenticated)
  app.get('/healthz', (req, res) => {
    const status = getWatcherStatus();
    if (status.ready && !status.fatalError) {
      res.status(200).send('OK');
    } else {
      res.status(503).send('Service Unavailable');
    }
  });

  // API Routes
  app.use('/api', dashboardRouter);

  // Serve static files from React build
  const uiPath = path.join(process.cwd(), 'dashboard', 'dist');
  if (fs.existsSync(uiPath)) {
    app.use(express.static(uiPath));
    
    // SPA Fallback (compatible with Express 5 path-to-regexp v8)
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        res.sendFile(path.join(uiPath, 'index.html'));
      } else {
        next();
      }
    });
  } else {
    app.use((req, res) => {
      res.send('Dashboard UI is not built. Please run npm run build in dashboard folder.');
    });
  }

  // Bind exclusively to 127.0.0.1 (Tailscale safe) or specific env if provided
  const host = process.env.DASHBOARD_HOST || '127.0.0.1';
  
  app.listen(port, host, () => {
    console.log(`\n🚀 [Dashboard] Web UI is running on http://${host}:${port}`);
    console.log(`   (Secure mode: Bound to ${host})`);
  });
}
