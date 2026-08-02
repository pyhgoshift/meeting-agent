import crypto from 'crypto';
import { Request, Response, NextFunction } from 'express';

const SESSION_TTL = 1000 * 60 * 60 * 24 * 7; // 7 days
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();

export function verifyPassword(input: string, expected: string): boolean {
  if (!input || !expected) return false;
  const h1 = crypto.createHash('sha256').update(input).digest();
  const h2 = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(h1, h2);
}

export function makeSessionCookie(secret: string, ttlMs: number = SESSION_TTL): string {
  const expiresAt = Date.now() + ttlMs;
  const data = expiresAt.toString();
  const signature = crypto.createHmac('sha256', secret).update(data).digest('hex');
  return `${data}.${signature}`;
}

export function verifySessionCookie(cookieValue: string | undefined, secret: string): boolean {
  if (!cookieValue) return false;
  const [data, signature] = cookieValue.split('.');
  if (!data || !signature) return false;

  const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('hex');
  if (!crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expectedSignature, 'hex'))) {
    return false;
  }

  const expiresAt = parseInt(data, 10);
  if (isNaN(expiresAt) || expiresAt < Date.now()) return false;

  return true;
}

export function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip) || { count: 0, resetAt: now + 15 * 60 * 1000 };
  
  if (now > entry.resetAt) {
    entry.count = 1;
    entry.resetAt = now + 15 * 60 * 1000; // Reset after 15 mins
  } else {
    entry.count += 1;
  }
  
  rateLimitMap.set(ip, entry);
  return entry.count <= 10;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  // Fail-closed if environment is not set up securely
  const password = process.env.DASHBOARD_PASSWORD;
  const secret = process.env.DASHBOARD_SESSION_SECRET;
  
  if (!password || !secret) {
    console.error('CRITICAL: DASHBOARD_PASSWORD or DASHBOARD_SESSION_SECRET not set. APIs are blocked.');
    res.status(503).json({ error: 'Service Unavailable - Security configuration missing' });
    return;
  }

  const cookieHeader = req.headers.cookie;
  let sessionCookie = '';
  if (cookieHeader) {
    const cookies = cookieHeader.split(';').map(c => c.trim());
    for (const c of cookies) {
      if (c.startsWith('session=')) {
        sessionCookie = c.substring('session='.length);
        break;
      }
    }
  }

  if (verifySessionCookie(sessionCookie, secret)) {
    next();
  } else {
    res.status(401).json({ error: 'Unauthorized' });
  }
}
