import { useEffect, useRef, useState } from 'react';
import { Terminal, ChevronDown, ChevronUp } from 'lucide-react';
import { API_BASE, fetchWithAuth } from '../api';

interface LogLine { at: string; level: 'log' | 'warn' | 'error'; text: string }

/**
 * 봇의 콘솔 출력을 그대로 보여준다. 예전에는 진행 상황을 보려면 NAS 에 SSH 로 붙어
 * docker logs 를 봐야 했다. 회의 처리는 몇 분씩 걸리므로 상태 탭에 있을 때만 3초마다
 * 받아온다(회의 목록은 15초 주기라 진행 상황을 보기엔 너무 느리다).
 */
export default function LogPanel() {
  const [lines, setLines] = useState<LogLine[]>([]);
  const [open, setOpen] = useState(true);
  const [follow, setFollow] = useState(true);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const load = () => {
      fetchWithAuth(`${API_BASE}/api/logs?limit=200`)
        .then(r => r.json())
        .then(d => setLines(Array.isArray(d?.data) ? d.data : []))
        .catch(() => {}); // 로그를 못 받아도 대시보드 나머지는 계속 동작해야 한다
    };

    load();
    const t = setInterval(load, 3000);
    return () => clearInterval(t);
  }, [open]);

  // 새 줄이 들어오면 맨 아래로. 단 사용자가 위로 스크롤해 읽는 중이면 방해하지 않는다.
  useEffect(() => {
    if (follow && boxRef.current) {
      boxRef.current.scrollTop = boxRef.current.scrollHeight;
    }
  }, [lines, follow]);

  const onScroll = () => {
    const el = boxRef.current;
    if (!el) return;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setFollow(atBottom);
  };

  const color = (l: LogLine['level']) =>
    l === 'error' ? 'text-red-300' : l === 'warn' ? 'text-amber-300' : 'text-slate-400';

  return (
    <div className="mt-4 rounded-xl border border-white/10 bg-black/40">
      <button
        onClick={() => setOpen(o => !o)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/5"
      >
        <span className="flex items-center gap-2 font-medium">
          <Terminal className="h-4 w-4 text-slate-500" />
          실시간 진행 로그
          {!follow && open && (
            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-xs text-amber-300">
              멈춤 · 맨 아래로 내리면 다시 따라감
            </span>
          )}
        </span>
        {open ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>

      {open && (
        <div
          ref={boxRef}
          onScroll={onScroll}
          className="max-h-56 overflow-auto border-t border-white/5 px-4 py-3 font-mono text-xs leading-relaxed"
        >
          {lines.length === 0 ? (
            <div className="text-slate-600">아직 출력이 없습니다.</div>
          ) : (
            lines.map((l, i) => (
              <div key={i} className={`whitespace-pre-wrap break-words ${color(l.level)}`}>
                <span className="mr-2 text-slate-600">
                  {/* toLocaleTimeString('ko-KR')은 "10시 50분 40초"라 로그가 지저분해진다 */}
                  {new Date(l.at).toTimeString().slice(0, 8)}
                </span>
                {l.text}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
