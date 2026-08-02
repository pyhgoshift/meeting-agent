import { Clock, CheckCircle2, XCircle, FileAudio } from 'lucide-react';

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
            <th className="pb-3 pt-2 font-medium">처리 시각</th>
            <th className="pb-3 pt-2 font-medium text-right">소요 시간</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5">
          {meetings.map((m, i) => (
            <tr key={i} className="group hover:bg-white/5 transition-colors">
              <td className="py-3">
                {m.status === 'success' ? (
                  <CheckCircle2 className="w-5 h-5 text-green-400" />
                ) : (
                  <div className="relative flex items-center group/err">
                    <XCircle className="w-5 h-5 text-red-400" />
                    {m.error && (
                      <div className="absolute left-7 bg-slate-800 text-red-200 text-xs p-2 rounded shadow-xl opacity-0 group-hover/err:opacity-100 pointer-events-none transition-opacity whitespace-nowrap z-50 border border-red-500/30">
                        {m.error}
                      </div>
                    )}
                  </div>
                )}
              </td>
              <td className="py-3">
                <div className="font-medium text-slate-200">{m.title || m.fileName}</div>
                {m.title && <div className="text-xs text-slate-500">{m.fileName}</div>}
              </td>
              <td className="py-3 text-slate-400">
                {new Date(m.processedAt).toLocaleString('ko-KR')}
              </td>
              <td className="py-3 text-right">
                <div className="flex items-center justify-end gap-1 text-slate-300">
                  <Clock className="w-4 h-4 text-slate-500" />
                  {m.durationSec ? `${m.durationSec.toFixed(1)}s` : '-'}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
