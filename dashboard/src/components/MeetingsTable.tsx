import { Clock, CheckCircle2, XCircle, FileAudio } from 'lucide-react';

const STEP_LABEL: Record<string, string> = {
  slack: 'Slack',
  notion: 'Notion',
  sheets: '시트',
  calendar: '캘린더',
};

interface Step { name: string; status: string; detail?: string }

// 배포처별 결과 칩. 전체 상태가 '성공'이어도 캘린더만 실패할 수 있어 따로 보여준다.
// 실패 사유는 hover 툴팁이 아니라 본문에 그대로 적는다 — 이 대시보드는 주로 폰에서
// 열리는데, 터치 화면에는 hover가 없어 정작 필요할 때 사유를 읽을 방법이 없다.
function StepChips({ steps }: { steps?: Step[] }) {
  if (!steps || steps.length === 0) return <span className="text-xs text-slate-600">-</span>;

  const failures = steps.filter(s => s.status === 'fail' && s.detail);

  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap gap-1.5">
        {steps.map((s, i) => {
          const style =
            s.status === 'ok' ? 'bg-green-500/15 text-green-300 border-green-500/25'
            : s.status === 'fail' ? 'bg-red-500/15 text-red-300 border-red-500/30'
            : 'bg-slate-500/15 text-slate-400 border-slate-500/25';
          const mark = s.status === 'ok' ? '✓' : s.status === 'fail' ? '✕' : '–';

          return (
            <span
              key={i}
              title={s.detail ?? ''}
              className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium ${style}`}
            >
              {mark} {STEP_LABEL[s.name] ?? s.name}
            </span>
          );
        })}
      </div>

      {failures.map((s, i) => (
        <div key={i} className="max-w-md break-words text-xs leading-relaxed text-red-300/80">
          <span className="font-semibold">{STEP_LABEL[s.name] ?? s.name}:</span> {s.detail}
        </div>
      ))}
    </div>
  );
}

export default function MeetingsTable({ meetings }: { meetings: any[] }) {
  if (!meetings || meetings.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center text-slate-500 bg-black/20 rounded-xl border border-white/5">
        <FileAudio className="w-12 h-12 mb-4 opacity-50" />
        <p>최근 처리된 회의록이 없습니다.</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto -mx-2 px-2">
      <table className="w-full text-left text-sm">
        <thead className="sticky top-0 bg-slate-900/80 backdrop-blur-md z-10">
          <tr className="text-slate-400 border-b border-white/10">
            <th className="pb-3 pt-2 font-medium">상태</th>
            <th className="pb-3 pt-2 font-medium">회의명 (파일)</th>
            <th className="pb-3 pt-2 font-medium">배포 결과</th>
            <th className="pb-3 pt-2 font-medium">처리 시각</th>
            <th className="pb-3 pt-2 font-medium text-right">소요 시간</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {meetings.map((m, i) => (
            <tr key={i} className="group hover:bg-white/5 transition-colors align-top">
              <td className="py-3">
                {m.status === 'success'
                  ? <CheckCircle2 className="w-5 h-5 text-green-400" />
                  : <XCircle className="w-5 h-5 text-red-400" />}
              </td>
              <td className="py-3">
                <div className="font-medium text-slate-200">{m.title || m.fileName}</div>
                {m.title && <div className="text-xs text-slate-500">{m.fileName}</div>}
                {m.error && (
                  <div className="mt-1 max-w-md break-words text-xs leading-relaxed text-red-300/80">
                    {m.error}
                  </div>
                )}
              </td>
              <td className="py-3">
                <StepChips steps={m.steps} />
              </td>
              <td className="py-3 text-slate-400 whitespace-nowrap">
                {new Date(m.processedAt).toLocaleString('ko-KR')}
              </td>
              <td className="py-3 text-right">
                <div className="flex items-center justify-end gap-1 text-slate-300">
                  <Clock className="w-4 h-4 text-slate-500" />
                  {/* 기록 파일이 손상되거나 옛 형식이면 숫자가 아닐 수 있다.
                      여기서 toFixed가 터지면 표가 아니라 화면 전체가 죽는다. */}
                  {typeof m.durationSec === 'number' && isFinite(m.durationSec)
                    ? `${m.durationSec.toFixed(1)}s`
                    : '-'}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
