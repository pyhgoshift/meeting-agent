/**
 * 콘솔 출력을 메모리에 링버퍼로 담아둔다.
 *
 * 봇의 진행 상황(음성 변환 중 / 조각 3/4 / Slack 전송 중 …)은 전부 console.log 로만
 * 나가서, 지금까지는 NAS 에 SSH 로 붙어 docker logs 를 봐야만 알 수 있었다.
 * 대시보드에서 같은 내용을 보여주려고 가로챈다.
 *
 * 원래 출력은 그대로 흘려보내므로 docker logs 는 지금처럼 동작한다.
 */

export interface LogLine {
  at: string;   // ISO 시각
  level: 'log' | 'warn' | 'error';
  text: string;
}

const MAX_LINES = 300;
const buffer: LogLine[] = [];
let captured = false;

function format(arg: unknown): string {
  if (typeof arg === 'string') return arg;
  if (arg instanceof Error) return arg.message;
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
}

function push(level: LogLine['level'], text: string): void {
  const at = new Date().toISOString();
  // 여러 줄짜리 출력은 줄 단위로 쪼개야 화면에서 스크롤이 맞는다
  for (const line of text.split('\n')) {
    buffer.push({ at, level, text: line });
  }
  if (buffer.length > MAX_LINES) buffer.splice(0, buffer.length - MAX_LINES);
}

/** console.log/warn/error 를 감싸 버퍼에도 쌓는다. 프로세스 시작 시 한 번만 호출한다. */
export function captureConsole(): void {
  if (captured) return;
  captured = true;

  (['log', 'warn', 'error'] as const).forEach(level => {
    const original = console[level].bind(console);
    console[level] = (...args: unknown[]) => {
      original(...args);                                  // 기존 출력 유지 (docker logs)
      try {
        push(level, args.map(format).join(' '));
      } catch {
        // 버퍼 문제로 봇이 멈추는 일은 없어야 한다
      }
    };
  });
}

export function readLogs(limit = MAX_LINES): LogLine[] {
  return buffer.slice(-Math.min(limit, MAX_LINES));
}
