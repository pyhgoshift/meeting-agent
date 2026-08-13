import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import type { MeetingAnalysis } from '../extract/analyzer.js';

/**
 * 검토 대기 중인 회의록 초안.
 *
 * 수동 전송 모드에서는 분석까지만 끝내고 여기에 보관한다. 사용자가 대시보드에서
 * 내용을 고친 뒤 전송을 누르면 그때 슬랙·노션·시트·캘린더로 나간다.
 *
 * 전사본(transcript)까지 같이 보관하는 이유는 노션 페이지에 원문을 넣어야 하기 때문이다.
 * 음성 파일은 전송을 기다리는 동안 이미 .archive 로 옮겨지므로 다시 전사할 수단이 없다.
 */

export interface PendingDraft {
  id: string;              // 파일명 기반 (중복 방지를 위해 시각 포함)
  fileName: string;
  recordedAt: string;      // ISO
  createdAt: string;       // ISO — 초안이 만들어진 시각
  durationSec: number;     // 음성 길이
  analysis: MeetingAnalysis;
  transcript: string;
}

function pendingDir(watchDir: string): string {
  return path.join(watchDir, '.pending');
}

function draftPath(watchDir: string, id: string): string {
  // id 는 우리가 만들지만, 경로 조작을 막기 위해 파일명 성분만 남긴다
  return path.join(pendingDir(watchDir), `${path.basename(id)}.json`);
}

/**
 * 초안 id. 순전히 ASCII 로만 만든다.
 *
 * 파일명(대개 한글)을 그대로 쓰면 URL 경로에 한글이 들어가고, 인코딩이 어긋나는 곳이
 * 하나만 있어도 "Failed to decode param" 으로 깨진다. id 는 사람이 읽을 필요가 없고
 * 파일명은 초안 안에 따로 들어있으므로, 시각과 짧은 해시로 충분하다.
 */
export function makeDraftId(fileName: string): string {
  const stem = path.basename(fileName).replace(/\.[^/.]+$/, '');
  const hash = crypto.createHash('sha1').update(stem).digest('hex').slice(0, 8);
  return `${Date.now()}-${hash}`;
}

export function saveDraft(watchDir: string, draft: PendingDraft): void {
  const dir = pendingDir(watchDir);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const p = draftPath(watchDir, draft.id);
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(draft, null, 2), 'utf-8');
  fs.renameSync(tmp, p);
}

export function readDraft(watchDir: string, id: string): PendingDraft | null {
  const p = draftPath(watchDir, id);
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, 'utf-8')) as PendingDraft;
  } catch (e) {
    console.error(`⚠️ 초안 파싱 실패 (${id}):`, (e as Error).message);
    return null;
  }
}

/** 목록은 전사본을 뺀 요약 정보만 돌려준다. 목록 화면에 원문 전체를 실어 보낼 이유가 없다. */
export function listDrafts(watchDir: string): Omit<PendingDraft, 'transcript'>[] {
  const dir = pendingDir(watchDir);
  if (!fs.existsSync(dir)) return [];

  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json'))
    .map(f => {
      try {
        const d = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf-8')) as PendingDraft;
        const { transcript, ...rest } = d;
        return rest;
      } catch {
        return null;
      }
    })
    .filter((d): d is Omit<PendingDraft, 'transcript'> => d !== null)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // 최신순
}

export function deleteDraft(watchDir: string, id: string): boolean {
  const p = draftPath(watchDir, id);
  if (!fs.existsSync(p)) return false;
  fs.unlinkSync(p);
  return true;
}
