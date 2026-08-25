import { useEffect, useRef, useState } from 'react';
import { Upload, Send, Loader2, FileSpreadsheet, AlertTriangle, Check, X } from 'lucide-react';
import { API_BASE, fetchWithAuth } from '../api';

/**
 * 주간보고를 올려 관리할 작업을 도출하고, 검토한 것만 시트로 보낸다.
 *
 * 도출 결과를 바로 시트에 쓰지 않는 이유는 회의록과 같다 — 모델이 잘못 읽은 항목이
 * 섞이면 시트를 되돌리는 게 훨씬 번거롭다. 여기서 고치고 빼고 나서 보낸다.
 */

const COLUMNS = [
  '상태', '시작일', '종료일', '구분', '팀구분', '작업내용',
  '시작시간', '소요시간', '장소', '대표자', '전화번호', '작업인원(명)',
] as const;

// 목록에서 고르는 열과 그 목록의 출처
const CHOICE_COLUMNS: Record<string, 'statuses' | 'categories' | 'teams'> = {
  상태: 'statuses',
  구분: 'categories',
  팀구분: 'teams',
};

interface DerivedItem {
  task: string; status: string; startDate: string; endDate: string;
  category: string; team: string; startTime: string; durationHours: string;
  location: string; owner: string; phone: string; headcount: string;
  evidence: string; confidence: 'high' | 'medium' | 'low';
}

type Row = Record<string, string>;

interface Derivation {
  fileName: string; format: string; pages?: number; textLength: number;
  model: string; skipped: number; notes: string;
  items: DerivedItem[];
  categories: string[]; teams: string[]; statuses: string[];
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
const CONFIDENCE_LABEL: Record<string, string> = { high: '명시', medium: '추정', low: '추론' };

export default function ActionItems() {
  const [sheet, setSheet] = useState<{ configured: boolean; rowCount?: number } | null>(null);
  const [busy, setBusy] = useState<'' | 'derive' | 'commit'>('');
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const [result, setResult] = useState<Derivation | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [picked, setPicked] = useState<boolean[]>([]);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchWithAuth(`${API_BASE}/api/actionitems/sheet`)
      .then(r => r.json())
      .then(j => setSheet(j.data))
      .catch(e => setError(e.message));
  }, []);

  async function upload(file: File) {
    setBusy('derive'); setError(''); setDone(''); setResult(null);
    try {
      const res = await fetchWithAuth(
        `${API_BASE}/api/actionitems/derive?fileName=${encodeURIComponent(file.name)}`,
        { method: 'POST', body: file, headers: { 'content-type': 'application/octet-stream' } },
      );
      const { data } = await res.json();
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
      const { data } = await res.json();
      setDone(`${data.added}건을 시트에 추가했습니다.`);
      setResult(null); setRows([]); setPicked([]);
      // 방금 넣은 것이 다음 도출의 중복 판정에 쓰이도록 현황을 다시 읽는다
      fetchWithAuth(`${API_BASE}/api/actionitems/sheet`).then(r => r.json()).then(j => setSheet(j.data));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy('');
    }
  }

  const edit = (i: number, col: string, v: string) =>
    setRows(rs => rs.map((r, n) => (n === i ? { ...r, [col]: v } : r)));

  const chosenCount = picked.filter(Boolean).length;

  if (sheet && !sheet.configured) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 text-center">
        <AlertTriangle className="h-10 w-10 text-amber-400" />
        <p className="text-slate-300">구글 시트가 연결돼 있지 않습니다.</p>
        <p className="max-w-md text-sm text-slate-500">
          <code className="rounded bg-black/30 px-1.5 py-0.5">ACTIONITEM_SHEET_URL</code> 과{' '}
          <code className="rounded bg-black/30 px-1.5 py-0.5">ACTIONITEM_SHEET_TOKEN</code> 을
          <code className="mx-1 rounded bg-black/30 px-1.5 py-0.5">/volume1/docker/meeting-agent/.env</code>
          에 넣고 재배포하세요.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* 올리기 */}
      {!result && (
        <div className="flex flex-1 flex-col items-center justify-center gap-4">
          <input
            ref={fileInput}
            type="file"
            accept=".pdf,.docx,.pptx,.hwpx"
            className="hidden"
            onChange={e => { const f = e.target.files?.[0]; if (f) upload(f); }}
          />
          <button
            onClick={() => fileInput.current?.click()}
            disabled={busy === 'derive'}
            className="flex items-center gap-3 rounded-2xl border-2 border-dashed border-white/20 px-10 py-8 text-slate-300 transition-colors hover:border-blue-500/50 hover:bg-blue-500/5 disabled:opacity-50"
          >
            {busy === 'derive'
              ? <><Loader2 className="h-6 w-6 animate-spin text-blue-400" /> 보고서를 분석하고 있습니다…</>
              : <><Upload className="h-6 w-6" /> 주간보고 파일 선택</>}
          </button>
          <p className="text-xs text-slate-500">PDF · 워드(.docx) · 파워포인트(.pptx) · 한글(.hwpx)</p>
          {busy === 'derive' && (
            <p className="text-xs text-slate-500">보고서 분량에 따라 1~2분 걸릴 수 있습니다.</p>
          )}
          {sheet?.rowCount !== undefined && (
            <p className="flex items-center gap-1.5 text-xs text-slate-500">
              <FileSpreadsheet className="h-3.5 w-3.5" />
              시트에 이미 {sheet.rowCount}건 — 같은 작업은 자동으로 걸러집니다
            </p>
          )}
          {done && (
            <p className="flex items-center gap-1.5 text-sm text-emerald-300">
              <Check className="h-4 w-4" /> {done}
            </p>
          )}
        </div>
      )}

      {/* 검토 */}
      {result && (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
            <span className="font-medium text-slate-200">{result.fileName}</span>
            <span>{result.format}{result.pages ? ` · ${result.pages}쪽` : ''}</span>
            <span>{result.items.length}건 도출</span>
            {result.skipped > 0 && <span className="text-slate-500">중복 {result.skipped}건 제외</span>}
            <span className="text-slate-500">{result.model}</span>
          </div>

          {result.notes && (
            <div className="mb-3 rounded-xl border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs leading-relaxed text-blue-200">
              {result.notes}
            </div>
          )}

          <div className="flex-1 overflow-auto rounded-xl border border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="sticky top-0 z-10 bg-slate-900/95 backdrop-blur">
                <tr className="border-b border-white/10">
                  <th className="w-8 p-2" />
                  <th className="w-14 p-2 font-medium text-slate-400">근거</th>
                  {COLUMNS.map(c => (
                    <th key={c} className="whitespace-nowrap p-2 font-medium text-slate-400">{c}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row, i) => (
                  <tr
                    key={i}
                    className={`border-b border-white/5 transition-colors ${picked[i] ? 'hover:bg-white/5' : 'opacity-35'}`}
                  >
                    <td className="p-2 align-top">
                      <input
                        type="checkbox"
                        checked={picked[i]}
                        onChange={() => setPicked(p => p.map((v, n) => (n === i ? !v : v)))}
                        className="h-4 w-4 accent-blue-500"
                      />
                    </td>
                    <td className="p-2 align-top">
                      <span
                        title={result.items[i].evidence}
                        className={`cursor-help rounded border px-1.5 py-0.5 text-[10px] ${CONFIDENCE_STYLE[result.items[i].confidence]}`}
                      >
                        {CONFIDENCE_LABEL[result.items[i].confidence]}
                      </span>
                    </td>
                    {COLUMNS.map(col => {
                      const source = CHOICE_COLUMNS[col];
                      const options = source ? result[source] : null;
                      // 모델이 새 분류를 지어냈으면 목록에 없다 — 그것도 고를 수 있게 넣는다
                      const list = options && row[col] && !options.includes(row[col])
                        ? [row[col], ...options]
                        : options;

                      return (
                        <td key={col} className="p-1 align-top">
                          {list ? (
                            <select
                              value={row[col]}
                              onChange={e => edit(i, col, e.target.value)}
                              className="w-full rounded bg-black/30 px-1.5 py-1 text-slate-200 outline-none focus:bg-black/50"
                            >
                              <option value="">—</option>
                              {list.map(o => <option key={o} value={o}>{o}</option>)}
                            </select>
                          ) : (
                            <input
                              value={row[col]}
                              onChange={e => edit(i, col, e.target.value)}
                              className={`rounded bg-black/20 px-1.5 py-1 text-slate-200 outline-none focus:bg-black/50 ${col === '작업내용' ? 'w-64' : 'w-24'}`}
                            />
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <button
              onClick={() => { setResult(null); setRows([]); setPicked([]); }}
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
                : <><Send className="h-4 w-4" /> 선택한 {chosenCount}건 시트로 보내기</>}
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
