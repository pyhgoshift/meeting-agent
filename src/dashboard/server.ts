import express from 'express';
import fs from 'fs';
import path from 'path';
import { dashboardRouter } from './routes.js';
import { getWatcherStatus } from '../collector/watcher.js';

export function startDashboardServer(port: number = 3000) {
  const app = express();
  
  // 액션아이템 분석은 문서 전문을 그대로 받는다. 아래 전역 제한이 먼저 걸리면
  // 긴 문서가 413 으로 튕기므로, 이 경로만 앞에서 넉넉하게 파싱한다.
  // (먼저 파싱해두면 뒤의 전역 파서는 이미 처리된 요청을 그냥 지나간다.)
  app.use('/api/actionitems/derive', express.json({ limit: '8mb' }));

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
    // 자산 파일명에는 빌드 해시가 붙으므로 오래 캐시해도 안전하다. 반면 index.html은
    // 그 해시를 가리키는 포인터라서 캐시되면 안 된다 — 배포로 해시가 바뀐 뒤에도
    // 낡은 index.html이 살아있으면 없어진 번들을 요청해 화면이 하얗게 뜬다.
    app.use(express.static(uiPath, {
      setHeaders(res, filePath) {
        res.setHeader(
          'Cache-Control',
          filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable'
        );
      },
    }));

    // SPA Fallback (compatible with Express 5 path-to-regexp v8)
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api/')) {
        res.setHeader('Cache-Control', 'no-cache');
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

  // Bind exclusively to 0.0.0.0 inside container (Docker port mapping will handle external isolation)
  const host = process.env.DASHBOARD_HOST || '0.0.0.0';
  
  app.listen(port, host, () => {
    console.log(`\n🚀 [Dashboard] Web UI is running on http://${host}:${port}`);
    console.log(`   (Secure mode: Bound to ${host})`);
  });
}
