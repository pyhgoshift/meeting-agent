import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { verifyPassword, makeSessionCookie, checkRateLimit, requireAuth } from './auth.js';
import { readHistory } from './history.js';
import { getWatcherStatus } from '../collector/watcher.js';

export const dashboardRouter = Router();

// 컨테이너가 --env-file로 실제 사용하는 .env가 있는 곳.
// deploy.sh가 배포 디렉토리를 여기에 읽기 전용으로 마운트한다.
// (WATCH_DIR 아래의 .env가 아니다 — 그건 아무도 읽지 않는 파일이다.)
const CONFIG_DIR = process.env.CONFIG_DIR ?? '/app/config';

// 값이 노출되면 안 되는 키. 나머지(모델명, 채널 ID 등)는 그대로 보여줘야 쓸모가 있다.
const SECRET_KEY = /KEY|TOKEN|SECRET|PASSWORD|WEBHOOK|CREDENTIAL/i;

// 이름에 KEY가 들어가도 값이 비밀이 아닌 것들. GOOGLE_SERVICE_KEY_PATH가 대표적인데,
// 경로를 가려버리면 캘린더 연동이 안 될 때 정작 확인해야 할 값을 못 본다.
const NOT_SECRET_KEY = /_PATH$|_DIR$/i;

function readEnvFile(): string {
  const p = path.join(CONFIG_DIR, '.env');
  return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : '';
}

function maskSecrets(raw: string): string {
  return raw.split('\n').map(line => {
    const eq = line.indexOf('=');
    if (!line.trim() || line.trimStart().startsWith('#') || eq === -1) return line;

    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (!value || NOT_SECRET_KEY.test(key) || !SECRET_KEY.test(key)) return line;

    // 어떤 값이 들어있는지 식별은 되되 재사용은 불가능하게 앞뒤만 남긴다.
    return value.length > 12
      ? `${key}=${value.slice(0, 4)}${'*'.repeat(8)}${value.slice(-4)}`
      : `${key}=${'*'.repeat(8)}`;
  }).join('\n');
}

// Helper to read file safely
const readFileSafe = (watchDir: string, filename: string) => {
  const filepath = path.join(watchDir, filename);
  if (fs.existsSync(filepath)) {
    return fs.readFileSync(filepath, 'utf-8');
  }
  return '';
};

// Helper to write file safely with backup
const writeFileSafe = (watchDir: string, filename: string, content: string) => {
  if (!fs.existsSync(watchDir)) {
    fs.mkdirSync(watchDir, { recursive: true });
  }
  const filepath = path.join(watchDir, filename);
  
  if (fs.existsSync(filepath)) {
    const backupPath = `${filepath}.bak.${new Date().toISOString().replace(/[:.]/g, '-')}`;
    fs.copyFileSync(filepath, backupPath);
  }
  
  fs.writeFileSync(filepath, content, 'utf-8');
};

dashboardRouter.post('/login', (req: Request, res: Response): void => {
  const ip = req.ip || req.socket.remoteAddress || 'unknown';
  if (!checkRateLimit(ip)) {
    res.status(429).json({ error: 'Too many login attempts. Try again later.' });
    return;
  }

  const { password } = req.body;
  const expectedPassword = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.DASHBOARD_SESSION_SECRET;

  if (!expectedPassword || !secret) {
    res.status(503).json({ error: 'Security configuration missing' });
    return;
  }

  if (verifyPassword(password, expectedPassword)) {
    const cookie = makeSessionCookie(secret);
    res.cookie('session', cookie, { 
      httpOnly: true, 
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 1000 * 60 * 60 * 24 * 7 // 7 days
    });
    res.json({ success: true });
  } else {
    res.status(401).json({ error: 'Invalid password' });
  }
});

dashboardRouter.post('/logout', (req: Request, res: Response) => {
  res.clearCookie('session');
  res.json({ success: true });
});

dashboardRouter.get('/status', requireAuth, (req: Request, res: Response) => {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  const watcherStatus = getWatcherStatus();
  const history = readHistory(watchDir, 1);
  
  res.json({
    success: true,
    data: {
      watcher: watcherStatus,
      lastProcess: history.length > 0 ? history[0] : null
    }
  });
});

dashboardRouter.get('/meetings', requireAuth, (req: Request, res: Response) => {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  const limit = parseInt(req.query.limit as string) || 50;
  const history = readHistory(watchDir, limit);
  
  res.json({
    success: true,
    data: history
  });
});

dashboardRouter.get('/config', requireAuth, (req: Request, res: Response) => {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  try {
    const prompt = readFileSafe(watchDir, 'meetingbot_prompt.txt');
    const slackTemplate = readFileSafe(watchDir, 'slack_template.txt');
    const env = maskSecrets(readEnvFile());

    res.json({
      success: true,
      data: { prompt, slackTemplate, env, envPath: path.join(CONFIG_DIR, '.env'), envReadOnly: true }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

dashboardRouter.post('/config', requireAuth, (req: Request, res: Response) => {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  try {
    // env는 의도적으로 받지 않는다. GET이 마스킹된 값을 돌려주므로 그대로 저장하면
    // 실제 키가 '****'로 덮여 버리고, 애초에 CONFIG_DIR은 읽기 전용으로 마운트된다.
    const { prompt, slackTemplate } = req.body;

    if (prompt !== undefined) writeFileSafe(watchDir, 'meetingbot_prompt.txt', prompt);
    if (slackTemplate !== undefined) writeFileSafe(watchDir, 'slack_template.txt', slackTemplate);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
