import { useEffect, useState } from 'react';
import { Send, Trash2, Save, Loader2, FileCheck, ChevronLeft } from 'lucide-react';
import { API_BASE, fetchWithAuth } from '../api';

interface DraftSummary {
  id: string;
  fileName: string;
  recordedAt: string;
  createdAt: string;
  durationSec: number;
  analysis: any;
}

/** 배열 필드는 한 줄에 하나씩 편집한다 — 사용자가 다루기 가장 쉬운 형태다. */
const toLines = (v?: string[]) => (v ?? []).join('\n');
const fromLines = (v: string) => v.split('\n').map(s => s.trim()).filter(Boolean);

/** 할일/일정은 항목마다 값이 여러 개라 ' | ' 로 나눠 한 줄에 담는다. */
const todosToText = (todos?: any[]) =>
  (todos ?? []).map(t => [t.task, t.assignee ?? '', t.due ?? ''].join(' | ')).join('\n');

const textToTodos = (text: string) =>
  fromLines(text).map(line => {
    const [task, assignee, due] = line.split('|').map(s => s.trim());
    return { task: task ?? '', ...(assignee ? { assignee } : {}), ...(due ? { due } : {}) };
  });

const schedulesToText = (s?: any[]) =>
  (s ?? []).map(x => [x.title, x.date ?? ''].join(' | ')).join('\n');

const textToSchedules = (text: string) =>
  fromLines(text).map(line => {
    const [title, date] = line.split('|').map(s => s.trim());
    return { title: title ?? '', ...(date ? { date } : {}) };
  });

export default function PendingReview() {
  const [drafts, setDrafts] = useState<DraftSummary[]>([]);
  const [editing, setEditing] = useState<any>(null);   // 편집 중인 초안 전체
  const [form, setForm] = useState<any>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');

  const loadList = () => {
    fetchWithAuth(`${API_BASE}/api/pending`)
      .then(r => r.json())
      .then(d => setDrafts(Array.isArray(d?.data) ? d.data : []))
      .catch(e => setError(e.message));
  };

  useEffect(() => {
    loadList();
    const t = setInterval(loadList, 15000);
    return () => clearInterval(t);
  }, []);

  const open = async (id: string) => {
    setError('');
    try {
      const res = await fetchWithAuth(`${API_BASE}/api/pending/${encodeURIComponent(id)}`);
      const d = await res.json();
      setEditing(d.data);
      const a = d.data.analysis;
      setForm({
        title: a.title ?? '',
        datetime: a.datetime ?? '',
        venue: a.venue ?? '',
        agenda: a.agenda ?? '',
        attendees: toLines(a.attendees),
        summary: a.summary ?? '',
        decisions: toLines(a.decisions),
        requests: toLines(a.requests),
        todos: todosToText(a.todos),
        schedules: schedulesToText(a.schedules),
        nextMeeting: a.nextMeeting ?? '',
        nextVenue: a.nextVenue ?? '',
      });
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const buildAnalysis = () => ({
    ...editing.analysis,
    title: form.title,
    datetime: form.datetime,
    venue: form.venue,
    agenda: form.agenda,
    attendees: fromLines(form.attendees),
    summary: form.summary,
    decisions: fromLines(form.decisions),
    requests: fromLines(form.requests),
    todos: textToTodos(form.todos),
    schedules: textToSchedules(form.schedules),
    nextMeeting: form.nextMeeting,
    nextVenue: form.nextVenue,
  });

  const save = async () => {
    setBusy('save'); setError('');
    try {
      await fetchWithAuth(`${API_BASE}/api/pending/${encodeURIComponent(editing.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis: buildAnalysis() }),
      });
      alert('수정 내용을 저장했습니다. 아직 전송되지 않았습니다.');
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy('');
  };

  const publish = async () => {
    if (!confirm('슬랙·노션·구글시트·캘린더로 전송합니다.\n\n전송 후에는 되돌릴 수 없습니다. 계속할까요?')) return;

    setBusy('publish'); setError('');
    try {
      // 화면에서 고친 내용이 반영되도록 항상 저장부터 하고 보낸다
      await fetchWithAuth(`${API_BASE}/api/pending/${encodeURIComponent(editing.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ analysis: buildAnalysis() }),
      });
      await fetchWithAuth(`${API_BASE}/api/pending/${encodeURIComponent(editing.id)}/publish`, {
        method: 'POST',
      });
      setEditing(null); setForm(null);
      loadList();
      alert('전송 완료했습니다.');
    } catch (e) {
      setError(`전송 실패: ${(e as Error).message}`);
    }
    setBusy('');
  };

  const discard = async (id: string) => {
    if (!confirm('이 초안을 버립니다. 전송하지 않고 삭제되며 되돌릴 수 없습니다.\n계속할까요?')) return;
    try {
      await fetchWithAuth(`${API_BASE}/api/pending/${encodeURIComponent(id)}`, { method: 'DELETE' });
      setEditing(null); setForm(null);
      loadList();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  // ── 목록 ────────────────────────────────────────────────
  if (!editing) {
    return (
      <div className="flex-1 overflow-auto">
        {error && (
          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
        )}

        {drafts.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-slate-500">
            <FileCheck className="mb-4 h-12 w-12 opacity-50" />
            <p>검토를 기다리는 회의록이 없습니다.</p>
            <p className="mt-1 text-xs text-slate-600">
              자동 전송이 켜져 있으면 회의록이 바로 나가서 여기 쌓이지 않습니다.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {drafts.map(d => (
              <div key={d.id} className="rounded-xl border border-white/10 bg-black/30 p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="font-semibold text-slate-100">{d.analysis?.title || d.fileName}</div>
                    <div className="mt-0.5 text-xs text-slate-500">{d.fileName}</div>
                    <div className="mt-2 text-xs text-slate-400">
                      회의 시각 {new Date(d.recordedAt).toLocaleString('ko-KR')}
                      <span className="mx-2 text-slate-700">|</span>
                      결정 {d.analysis?.decisions?.length ?? 0}건
                      <span className="mx-2 text-slate-700">|</span>
                      할일 {d.analysis?.todos?.length ?? 0}건
                      <span className="mx-2 text-slate-700">|</span>
                      일정 {d.analysis?.schedules?.length ?? 0}건
                    </div>
                  </div>
                  <button
                    onClick={() => open(d.id)}
                    className="shrink-0 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-500"
                  >
                    검토
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // ── 편집 ────────────────────────────────────────────────
  const field = (label: string, key: string, rows = 1, hint?: string) => (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-400">
        {label}
        {hint && <span className="ml-2 font-normal text-slate-600">{hint}</span>}
      </label>
      {rows === 1 ? (
        <input
          value={form[key]}
          onChange={e => setForm({ ...form, [key]: e.target.value })}
          className="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      ) : (
        <textarea
          value={form[key]}
          rows={rows}
          onChange={e => setForm({ ...form, [key]: e.target.value })}
          className="w-full resize-y rounded-lg border border-white/10 bg-black/40 px-3 py-2 font-mono text-sm text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500/40"
        />
      )}
    </div>
  );

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="mb-3 flex items-center justify-between">
        <button
          onClick={() => { setEditing(null); setForm(null); setError(''); }}
          className="flex items-center gap-1 text-sm text-slate-400 hover:text-slate-200"
        >
          <ChevronLeft className="h-4 w-4" /> 목록으로
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => discard(editing.id)}
            className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-slate-400 hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
          >
            <Trash2 className="h-3.5 w-3.5" /> 버리기
          </button>
          <button
            onClick={save}
            disabled={!!busy}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold hover:bg-white/15 disabled:opacity-50"
          >
            {busy === 'save' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            저장만
          </button>
          <button
            onClick={publish}
            disabled={!!busy}
            className="flex items-center gap-1.5 rounded-lg bg-gradient-to-r from-emerald-600 to-teal-600 px-5 py-2 text-sm font-semibold text-white hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50"
          >
            {busy === 'publish' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            전송
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">{error}</div>
      )}

      <div className="flex-1 space-y-3 overflow-auto pr-1">
        <div className="grid grid-cols-2 gap-3">
          {field('제목', 'title')}
          {field('일시', 'datetime')}
          {field('장소', 'venue')}
          {field('안건', 'agenda')}
        </div>
        {field('참석자', 'attendees', 3, '한 줄에 한 명')}
        {field('요약', 'summary', 6)}
        {field('결정 사항', 'decisions', 4, '한 줄에 하나')}
        {field('요청·질의 사항', 'requests', 3, '한 줄에 하나')}
        {field('할일', 'todos', 4, '할일 | 담당자 | 기한(YYYY-MM-DD)')}
        {field('일정', 'schedules', 3, '일정명 | 날짜(YYYY-MM-DD) — 캘린더에 등록됩니다')}
        <div className="grid grid-cols-2 gap-3">
          {field('차기 회의', 'nextMeeting')}
          {field('차기 회의 장소', 'nextVenue')}
        </div>
      </div>
    </div>
  );
}
