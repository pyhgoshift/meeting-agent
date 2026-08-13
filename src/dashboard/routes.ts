import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { readHistory, clearHistory } from './history.js';
import { readLogs } from '../utils/logbuffer.js';
import { readSettings, writeSettings } from './settings.js';
import { listDrafts, readDraft, saveDraft, deleteDraft } from './pending.js';
import { publishMeeting } from '../distributor/publish.js';
import { appendHistoryRecord } from './history.js';
import { getWatcherStatus } from '../collector/watcher.js';

export const dashboardRouter = Router();

// 접근 통제는 Cloudflare Access가 엣지에서 끝낸다(이메일 OTP). 컨테이너 포트는
// 어디에도 공개돼 있지 않고(meeting-net 안에서 cloudflared만 접근 가능),
// 그래서 여기 도달한 요청은 이미 인증을 통과한 것으로 본다.
//
// Access는 인증된 사용자의 이메일을 헤더로 실어 보낸다. 누가 설정을 바꿨는지
// 남겨두면 나중에 추적이 되므로 쓰기 요청에서만 기록한다.
function accessUser(req: Request): string {
  return (req.headers['cf-access-authenticated-user-email'] as string) || '(Access 헤더 없음)';
}

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

dashboardRouter.get('/status', (req: Request, res: Response) => {
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

dashboardRouter.get('/meetings', (req: Request, res: Response) => {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  const limit = parseInt(req.query.limit as string) || 50;
  const history = readHistory(watchDir, limit);
  
  res.json({
    success: true,
    data: history
  });
});

// ── 설정 (자동/수동 전송) ────────────────────────────────────────
dashboardRouter.get('/settings', (req: Request, res: Response) => {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  res.json({ success: true, data: readSettings(watchDir) });
});

dashboardRouter.put('/settings', (req: Request, res: Response) => {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  try {
    const { autoPublish } = req.body ?? {};
    if (typeof autoPublish !== 'boolean') {
      res.status(400).json({ success: false, error: 'autoPublish 는 true/false 여야 합니다.' });
      return;
    }
    const next = writeSettings(watchDir, { autoPublish });
    console.log(`⚙️  [Dashboard] 전송 방식 → ${autoPublish ? '자동' : '수동(검토 후 전송)'} — ${accessUser(req)}`);
    res.json({ success: true, data: next });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

// ── 검토 대기 초안 ───────────────────────────────────────────────
dashboardRouter.get('/pending', (req: Request, res: Response) => {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  res.json({ success: true, data: listDrafts(watchDir) });
});

dashboardRouter.get('/pending/:id', (req: Request, res: Response) => {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  const draft = readDraft(watchDir, String(req.params.id));
  if (!draft) {
    res.status(404).json({ success: false, error: '초안을 찾을 수 없습니다.' });
    return;
  }
  res.json({ success: true, data: draft });
});

/** 검토 중 수정한 내용을 저장한다 (전송은 하지 않음). */
dashboardRouter.put('/pending/:id', (req: Request, res: Response) => {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  try {
    const draft = readDraft(watchDir, String(req.params.id));
    if (!draft) {
      res.status(404).json({ success: false, error: '초안을 찾을 수 없습니다.' });
      return;
    }
    const { analysis } = req.body ?? {};
    if (!analysis || typeof analysis !== 'object') {
      res.status(400).json({ success: false, error: 'analysis 가 필요합니다.' });
      return;
    }
    // 전사본은 그대로 두고 분석 결과만 갈아끼운다
    saveDraft(watchDir, { ...draft, analysis });
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/** 검토를 마친 초안을 배포처 네 곳으로 보낸다. */
dashboardRouter.post('/pending/:id/publish', async (req: Request, res: Response) => {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  const draft = readDraft(watchDir, String(req.params.id));
  if (!draft) {
    res.status(404).json({ success: false, error: '초안을 찾을 수 없습니다.' });
    return;
  }

  console.log(`\n📤 [Dashboard] 검토 완료 — 전송 시작: ${draft.analysis.title || draft.fileName} (${accessUser(req)})`);

  try {
    const { steps } = await publishMeeting({
      analysis: draft.analysis,
      fileName: draft.fileName,
      durationSec: draft.durationSec,
      transcript: draft.transcript,
      recordedAt: new Date(draft.recordedAt),
    });

    appendHistoryRecord(watchDir, {
      fileName: draft.fileName,
      title: draft.analysis.title,
      processedAt: new Date().toISOString(),
      status: 'success',
      durationSec: draft.durationSec,
      steps,
    });

    // 전송에 성공했을 때만 초안을 지운다. 실패하면 남겨서 다시 시도할 수 있어야 한다.
    deleteDraft(watchDir, String(req.params.id));
    console.log(`✅ 전송 완료: ${draft.analysis.title || draft.fileName}`);

    res.json({ success: true, data: { steps } });
  } catch (error) {
    const steps = (error as { steps?: unknown }).steps;
    console.error(`❌ 전송 실패: ${(error as Error).message}`);

    appendHistoryRecord(watchDir, {
      fileName: draft.fileName,
      title: draft.analysis.title,
      processedAt: new Date().toISOString(),
      status: 'error',
      error: (error as Error).message,
      durationSec: draft.durationSec,
      steps: Array.isArray(steps) ? steps : [],
    });

    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

/** 초안 폐기 (전송하지 않고 버린다). */
dashboardRouter.delete('/pending/:id', (req: Request, res: Response) => {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  const removed = deleteDraft(watchDir, String(req.params.id));
  if (!removed) {
    res.status(404).json({ success: false, error: '초안을 찾을 수 없습니다.' });
    return;
  }
  console.log(`🗑️  [Dashboard] 초안 폐기: ${String(req.params.id)} — ${accessUser(req)}`);
  res.json({ success: true });
});

dashboardRouter.get('/logs', (req: Request, res: Response) => {
  const limit = parseInt(req.query.limit as string) || 200;
  res.json({ success: true, data: readLogs(limit) });
});

dashboardRouter.delete('/meetings', (req: Request, res: Response) => {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  try {
    clearHistory(watchDir);
    console.log(`🧹 [Dashboard] 처리 기록을 비웠습니다 — ${accessUser(req)}`);
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});

dashboardRouter.get('/config', (req: Request, res: Response) => {
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

dashboardRouter.post('/config', (req: Request, res: Response) => {
  const watchDir = process.env.WATCH_DIR ?? './recordings';
  try {
    // env는 의도적으로 받지 않는다. GET이 마스킹된 값을 돌려주므로 그대로 저장하면
    // 실제 키가 '****'로 덮여 버리고, 애초에 CONFIG_DIR은 읽기 전용으로 마운트된다.
    const { prompt, slackTemplate } = req.body;

    const changed: string[] = [];
    if (prompt !== undefined) { writeFileSafe(watchDir, 'meetingbot_prompt.txt', prompt); changed.push('프롬프트'); }
    if (slackTemplate !== undefined) { writeFileSafe(watchDir, 'slack_template.txt', slackTemplate); changed.push('슬랙 템플릿'); }

    if (changed.length > 0) {
      console.log(`📝 [Dashboard] ${changed.join(', ')} 수정됨 — ${accessUser(req)}`);
    }

    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, error: (error as Error).message });
  }
});
