import { useEffect, useRef, useState } from 'react';
import {
  Upload, Send, Loader2, FileSpreadsheet, AlertTriangle, Check, X,
  ChevronDown, ChevronRight, ExternalLink, Ban,
} from 'lucide-react';
import { API_BASE, fetchWithAuth } from '../api';

/**
 * 업무 문서를 올려 관리할 작업을 도출하고, 검토한 것만 시트로 보낸다.
 *
 * 도출 결과를 바로 시트에 쓰지 않는 이유는 회의록과 같다 — 모델이 잘못 읽은 항목이
 * 섞이면 시트를 되돌리는 게 훨씬 번거롭다. 여기서 고치고 빼고 나서 보낸다.
 *
 * 항목을 표가 아니라 카드로 보여준다. 열이 12개라 표로 만들면 칸이 손톱만 해져서
 * 한글이 두세 글자마다 줄바꿈되고, 정작 중요한 작업내용이 제일 안 읽힌다.
 */

// 카드 아래쪽 격자에 놓을 열들. 작업내용은 위에 크게 따로 둔다.
const DETAIL_FIELDS = [
  '상태', '구분', '팀구분', '시작일', '종료일',
  '시작시간', '소요시간', '작업인원(명)', '장소', '대표자', '전화번호',
] as const;

// 시트에서 쓰이는 값 목록을 제안해줄 열. 목록에 없는 값도 직접 칠 수 있다.
const SUGGEST_SOURCE: Record<string, 'statuses' | 'categories' | 'teams'> = {
  상태: 'statuses',
  구분: 'categories',
  팀구분: 'teams',
};

const DATE_FIELDS = new Set(['시작일', '종료일']);

interface DerivedItem {
  task: string; status: string; startDate: string; endDate: string;
  category: string; team: string; startTime: string; durationHours: string;
  location: string; owner: string; phone: string; headcount: string;
  evidence: string; confidence: 'high' | 'medium' | 'low';
}

interface Rejected { text: string; reason: string }

type Row = Record<string, string>;

interface Extracted { fileName: string; format: string; pages?: number; text: string }

interface Derivation {
  model: string; skipped: number; notes: string;
  items: DerivedItem[]; rejected: Rejected[];
  categories: string[]; teams: string[]; statuses: string[];
  sheetName?: string; sheetUrl?: string;
}

function toRow(item: DerivedItem): Row {
  return {
    상태: item.status, 시작일: item.startDate, 종료일: item.endDate,
    구분: item.category, 팀구분: item.team, 작업내용: item.task,
    시작시간: item.startTime, 소요시간: item.durationHours, 장소: item.location,
    대표자: item.owner, 전화번호: item.phone, '작업인원(명)': item.headcount,
  };
}

const CONFIDENCE_STYLE: Record<string, string> = {
  high: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  medium: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  low: 'bg-rose-500/15 text-rose-300 border-rose-500/30',
};
const CONFIDENCE_LABEL: Record<string, string> = {
  high: '문서에 명시', medium: '추정', low: '추론',
};

type Stage = { label: string; state: 'done' | 'active' | 'wait'; detail?: string };

export default function ActionItems() {
  const [sheet, setSheet] = useState<{ configured: boolean; rowCount?: number; sheetName?: string; sheetUrl?: string } | null>(null);
  const [busy, setBusy] = useState<'' | 'extract' | 'derive' | 'commit'>('');
  const [error, setError] = useState('');
  const [done, setDone] = useState<{ added: number; sheetName?: string; sheetUrl?: string } | null>(null);

  const [extracted, setExtracted] = useState<Extracted | null>(null);
  const [result, setResult] = useState<Derivation | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [picked, setPicked] = useState<boolean[]>([]);
  const [elapsed, setElapsed] = useState(0);
  const [openEvidence, setOpenEvidence] = useState<number | null>(null);
  const [showRejected, setShowRejected] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const loadSheet = () =>
    fetchWithAuth(`${API_BASE}/api/actionitems/sheet`)
      .then(r => r.json()).then(j => setSheet(j.data)).catch(e => setError(e.message));

  useEffect(() => { loadSheet(); }, []);

  async function run(file: File) {
    setError(''); setDone(null); setResult(null); setExtracted(null);

    // 1단계 — 글자 뽑기
    setBusy('extract');
    let doc: Extracted;
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/api/actionitems/extract?fileName=${encodeURIComponent(file.name)}`,
        { method: 'POST', body: file, headers: { 'content-type': 'application/octet-stream' } },
      );
      doc = (await res.json()).data;
      setExtracted(doc);
    } catch (e) {
      setError((e as Error).message); setBusy('');
      if (fileInput.current) fileInput.current.value = '';
      return;
    }

    // 2단계 — 도출. 접수만 받고 결과는 따로 찾아온다.
    // Cloudflare 가 100초에서 연결을 끊어서(524) 한 번의 요청으로는 끝낼 수 없다.
    setBusy('derive'); setElapsed(0);
    try {
      const accepted = await fetchWithAuth(`${API_BASE}/api/actionitems/derive`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text: doc.text }),
      });
      const { jobId } = (await accepted.json()).data;

      const data = await waitForJob(jobId);
      setResult(data);
      setRows(data.items.map(toRow));
      setPicked(data.items.map(() => true));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  /** 끝날 때까지 몇 초마다 물어본다. 요청 하나하나는 즉시 끝나므로 타임아웃에 안 걸린다. */
  async function waitForJob(jobId: string): Promise<Derivation> {
    for (;;) {
      await new Promise(r => setTimeout(r, 2500));

      const res = await fetchWithAuth(`${API_BASE}/api/actionitems/derive/${jobId}`);
      const { data } = await res.json();

      if (data.state === 'running') { setElapsed(data.elapsedSec); continue; }
      return data as Derivation;
    }
  }

  async function commit() {
    const chosen = rows.filter((_, i) => picked[i]);
    if (chosen.length === 0) { setError('보낼 항목을 하나 이상 선택하세요.'); return; }

    setBusy('commit'); setError('');
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/actionitems/commit`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ items: chosen }),
      });
      setDone((await res.json()).data);
      setResult(null); setExtracted(null); setRows([]); setPicked([]);
      loadSheet();   // 방금 넣은 것이 다음 도출의 중복 판정에 쓰이도록
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const edit = (i: number, col: string, v: string) =>
    setRows(rs => rs.map((r, n) => (n === i ? { ...r, [col]: v } : r)));

  const chosenCount = picked.filter(Boolean).length;

  const stages: Stage[] = [
    {
      label: '문서 읽기',
      state: extracted ? 'done' : busy === 'extract' ? 'active' : 'wait',
      detail: extracted
        ? `${extracted.format}${extracted.pages ? ` · ${extracted.pages}쪽` : ''} · ${extracted.text.length.toLocaleString()}자`
        : undefined,
    },
    {
      label: '분석 · 액션아이템 도출',
      state: result ? 'done' : busy === 'derive' ? 'active' : 'wait',
      detail: result
        ? `확정 ${result.items.length}건${result.rejected.length ? ` · 관련 없음 ${result.rejected.length}건` : ''}${result.skipped ? ` · 중복 ${result.skipped}건` : ''}`
        : busy === 'derive'
          ? elapsed ? `${elapsed}초 경과 — 보통 1~2분` : '1~2분 걸립니다'
          : undefined,
    },
    { label: '검토 후 시트 전송', state: result ? 'active' : 'wait' },
  ];

  if (sheet && !sheet.configured) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <p className="text-slate-300">구글 시트가 연결돼 있지 않습니다.</p>
        <p className="max-w-md text-sm leading-relaxed text-slate-500">
          <code className="rounded bg-black/30 px-1.5 py-0.5">ACTIONITEM_SHEET_URL</code> 과{' '}
          <code className="rounded bg-black/30 px-1.5 py-0.5">ACTIONITEM_SHEET_TOKEN</code> 을{' '}
          <code className="rounded bg-black/30 px-1.5 py-0.5">/volume1/docker/meeting-agent/.env</code>
          에 넣고 재배포하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 진행 단계 — 파일을 올린 뒤에만 */}
      {(busy || result) && (
        <div className="mb-4 flex flex-wrap items-center gap-x-2 gap-y-2 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
          {stages.map((s, i) => (
            <div key={s.label} className="flex items-center gap-2">
              {i > 0 && <ChevronRight className="h-3.5 w-3.5 text-slate-600" />}
              <span
                className={`flex h-5 w-5 items-center justify-center rounded-full text-[10px] ${
                  s.state === 'done' ? 'bg-emerald-500/20 text-emerald-300'
                    : s.state === 'active' ? 'bg-blue-500/20 text-blue-300'
                    : 'bg-white/5 text-slate-600'
                }`}
              >
                {s.state === 'done' ? <Check className="h-3 w-3" />
                  : s.state === 'active' ? <Loader2 className="h-3 w-3 animate-spin" />
                  : i + 1}
              </span>
              <span className={s.state === 'wait' ? 'text-xs text-slate-600' : 'text-xs text-slate-300'}>
                {s.label}
              </span>
              {s.detail && <span className="text-xs text-slate-500">({s.detail})</span>}
            </div>
          ))}
        </div>
      )}

      {/* 올리기 */}
      {!result && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,.pptx,.hwpx"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) run(f); }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy !== ''}
            className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-white/20 px-10 py-8 text-slate-300 transition-colors hover:border-blue-500/50 hover:bg-blue-500/5 disabled:opacity-50"
          >
            {busy
              ? <><Loader2 className="h-6 w-6 animate-spin text-blue-400" /> 처리하고 있습니다…</>
              : <><Upload className="h-6 w-6" /> 문서 선택</>}
          </button>
          <p className="text-xs text-slate-500">
            주간보고 · 회의자료 · 사업계획 등 일이 적힌 문서면 무엇이든
          </p>
          <p className="text-xs text-slate-600">PDF · 워드(.docx) · 파워포인트(.pptx) · 한글(.hwpx)</p>

          {sheet?.rowCount !== undefined && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              {sheet.sheetName ?? '시트'}에 이미 {sheet.rowCount}건 — 같은 작업은 자동으로 걸러집니다
            </p>
          )}

          {done && (
            <div className="flex flex-col items-center gap-1.5 rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-5 py-3">
              <p className="flex items-center gap-1.5 text-sm text-emerald-200">
                <Check className="h-4 w-4" />
                <strong>{done.sheetName ?? '시트'}</strong> 에 {done.added}건을 추가했습니다.
              </p>
              {done.sheetUrl && (
                <a
                  href={done.sheetUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs text-emerald-300 underline underline-offset-2 hover:text-emerald-200"
                >
                  시트 열어보기 <ExternalLink className="h-3 w-3" />
                </a>
              )}
              <p className="text-[11px] text-emerald-400/70">맨 아래에 추가됩니다 (날짜순 정렬됨)</p>
            </div>
          )}
        </div>
      )}

      {/* 검토 */}
      {result && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-400">
            <span className="font-medium text-slate-200">{extracted?.fileName}</span>
            <span className="text-slate-600">|</span>
            <span>도출 {result.items.length}건 · 선택 {chosenCount}건</span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-500">{result.model}</span>
            {result.sheetName && (
              <>
                <span className="text-slate-600">|</span>
                <span className="flex items-center gap-1 text-slate-500">
                  <FileSpreadsheet className="h-3 w-3" /> {result.sheetName} 로 전송
                </span>
              </>
            )}
          </div>

          {result.notes && (
            <div className="mb-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs leading-relaxed text-blue-200">
              {result.notes}
            </div>
          )}

          <div className="flex-1 space-y-3 overflow-y-auto pr-1">
            {rows.map((row, i) => {
              const item = result.items[i];
              return (
                <div
                  key={i}
                  className={`rounded-xl border p-4 transition-all ${
                    picked[i]
                      ? 'border-white/10 bg-white/[0.03]'
                      : 'border-white/5 bg-transparent opacity-40'
                  }`}
                >
                  {/* 작업내용 — 제일 크게 */}
                  <div className="mb-3 flex items-start gap-3">
                    <input
                      type="checkbox"
                      checked={picked[i]}
                      onChange={() => setPicked(p => p.map((v, n) => (n === i ? !v : v)))}
                      className="mt-2 h-4 w-4 shrink-0 accent-blue-500"
                    />
                    <input
                      value={row['작업내용']}
                      onChange={e => edit(i, '작업내용', e.target.value)}
                      placeholder="작업내용"
                      className="min-w-0 flex-1 rounded-lg bg-black/25 px-3 py-2 text-sm font-medium text-slate-100 outline-none ring-1 ring-transparent transition-all focus:bg-black/40 focus:ring-blue-500/40"
                    />
                    <button
                      onClick={() => setOpenEvidence(openEvidence === i ? null : i)}
                      className={`shrink-0 rounded-lg border px-2 py-1.5 text-[11px] transition-colors ${CONFIDENCE_STYLE[item.confidence]}`}
                      title="근거 문장 보기"
                    >
                      {CONFIDENCE_LABEL[item.confidence]}
                    </button>
                  </div>

                  {openEvidence === i && (
                    <div className="mb-3 ml-7 rounded-lg border-l-2 border-slate-600 bg-black/20 px-3 py-2 text-xs leading-relaxed text-slate-400">
                      <span className="mb-1 block text-[10px] uppercase tracking-wide text-slate-600">문서의 근거</span>
                      {item.evidence || '(근거가 기록되지 않았습니다)'}
                    </div>
                  )}

                  {/* 나머지 값 — 넉넉한 격자 */}
                  <div className="ml-7 grid grid-cols-2 gap-x-3 gap-y-2 sm:grid-cols-3 lg:grid-cols-4">
                    {DETAIL_FIELDS.map(col => {
                      const source = SUGGEST_SOURCE[col];
                      const listId = source ? `list-${source}` : undefined;
                      return (
                        <label key={col} className="flex flex-col gap-1">
                          <span className="text-[10px] text-slate-500">{col}</span>
                          <input
                            value={row[col]}
                            list={listId}
                            type={DATE_FIELDS.has(col) ? 'date' : 'text'}
                            onChange={e => edit(i, col, e.target.value)}
                            className="w-full rounded-md bg-black/25 px-2 py-1.5 text-xs text-slate-200 outline-none ring-1 ring-transparent transition-all focus:bg-black/40 focus:ring-blue-500/40"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            {/* 목록에서 고르되 직접 입력도 되게 — datalist 는 값을 강제하지 않는다 */}
            <datalist id="list-statuses">
              {result.statuses.map(v => <option key={v} value={v} />)}
            </datalist>
            <datalist id="list-categories">
              {result.categories.map(v => <option key={v} value={v} />)}
            </datalist>
            <datalist id="list-teams">
              {result.teams.map(v => <option key={v} value={v} />)}
            </datalist>

            {/* 관련 없다고 판단한 것들 */}
            {result.rejected.length > 0 && (
              <div className="rounded-xl border border-white/5 bg-black/10">
                <button
                  onClick={() => setShowRejected(v => !v)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-xs text-slate-500 transition-colors hover:text-slate-300"
                >
                  {showRejected ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
                  <Ban className="h-3.5 w-3.5" />
                  관련 없음으로 판단한 {result.rejected.length}건 — 왜 뺐는지 보기
                </button>
                {showRejected && (
                  <div className="space-y-2 border-t border-white/5 px-4 py-3">
                    {result.rejected.map((r, n) => (
                      <div key={n} className="text-xs leading-relaxed">
                        <p className="text-slate-400">{r.text}</p>
                        <p className="mt-0.5 text-slate-600">→ {r.reason}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => { setResult(null); setExtracted(null); setRows([]); setPicked([]); }}
              className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 transition-colors hover:bg-white/5"
            >
              <X className="h-3.5 w-3.5" /> 취소
            </button>
            <button
              onClick={commit}
              disabled={busy === 'commit' || chosenCount === 0}
              className="flex items-center gap-2 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-500 disabled:opacity-40"
            >
              {busy === 'commit'
                ? <><Loader2 className="h-4 w-4 animate-spin" /> 보내는 중…</>
                : <><Send className="h-4 w-4" /> {chosenCount}건을 {result.sheetName ?? '시트'}로 보내기</>}
            </button>
          </div>
        </>
      )}

      {error && (
        <div className="mt-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
          {error}
        </div>
      )}
    </div>
  );
}
