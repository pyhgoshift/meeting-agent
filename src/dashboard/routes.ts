import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { verifyPassword, makeSessionCookie, checkRateLimit, requireAuth } from './auth.js';
import { readHistory } from './history.js';
import { getWatcherStatus } from '../collector/watcher.js';

export const dashboardRouter = Router();

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
    const env = readFileSafe(watchDir, '.env');

    res.json({
      success: true,
      data: { prompt, slackTemplate, env }
    });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

dashboardRouter.post('/config', requireAuth, (req: Request, res: Response) => {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  try {
    const { prompt, slackTemplate, env } = req.body;

    if (prompt !== undefined) writeFileSafe(watchDir, 'meetingbot_prompt.txt', prompt);
    if (slackTemplate !== undefined) writeFileSafe(watchDir, 'slack_template.txt', slackTemplate);
    if (env !== undefined) writeFileSafe(watchDir, '.env', env);

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
