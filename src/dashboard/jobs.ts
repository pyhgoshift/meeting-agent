import crypto from 'crypto';

/**
 * 오래 걸리는 작업을 접수만 하고 결과는 나중에 찾아가게 한다.
 *
 * Cloudflare 는 응답이 100초 안에 안 오면 연결을 끊는다(524). 액션아이템 도출은
 * 문서 길이에 따라 1~2분이 걸려서, 한 번의 요청으로 처리하면 봇이 멀쩡히 일하는
 * 중에 화면만 끊긴다. 접수는 즉시 끝내고 화면이 짧은 요청으로 상태를 물어보게 한다.
 *
 * 저장은 메모리에만 한다. 컨테이너가 재시작하면 진행 중인 작업은 사라지는데,
 * 그때는 어차피 도출도 중단되므로 다시 올리는 게 맞다.
 */

export type JobState = 'running' | 'done' | 'error';

interface Job<T> {
  state: JobState;
  data?: T;
  error?: string;
  startedAt: number;
  finishedAt?: number;
}

const jobs = new Map<string, Job<unknown>>();

// 찾아가지 않은 결과가 쌓이지 않게 한다. 끝난 지 오래된 것부터 버린다.
const KEEP_MS = 30 * 60 * 1000;

function sweep(): void {
  const now = Date.now();
  for (const [id, job] of jobs) {
    const age = now - (job.finishedAt ?? job.startedAt);
    // 끝난 건 30분 뒤 버린다. 도는 중인 건 두 시간까지 봐준다(모델이 오래 걸릴 수 있다).
    if (job.state === 'running' ? age > 4 * KEEP_MS : age > KEEP_MS) jobs.delete(id);
  }
}

/** 작업을 접수하고 표를 돌려준다. 실제 일은 뒤에서 돈다. */
export function startJob<T>(work: () => Promise<T>): string {
  sweep();

  const id = crypto.randomBytes(9).toString('base64url');
  jobs.set(id, { state: 'running', startedAt: Date.now() });

  work().then(
    data => jobs.set(id, { state: 'done', data, startedAt: jobs.get(id)!.startedAt, finishedAt: Date.now() }),
    err => jobs.set(id, {
      state: 'error',
      error: (err as Error).message,
      startedAt: jobs.get(id)!.startedAt,
      finishedAt: Date.now(),
    }),
  );

  return id;
}

export function readJob<T>(id: string): (Job<T> & { elapsedSec: number }) | null {
  const job = jobs.get(id) as Job<T> | undefined;
  if (!job) return null;
  return { ...job, elapsedSec: Math.round(((job.finishedAt ?? Date.now()) - job.startedAt) / 1000) };
}

/** 결과를 받아간 작업은 지운다. 같은 결과를 두 번 쓸 일이 없다. */
export function dropJob(id: string): void {
  jobs.delete(id);
}
