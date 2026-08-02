import { Activity, HardDrive, CheckCircle2, AlertCircle } from 'lucide-react';

export default function StatusPanel({ status }: { status: any }) {
  if (!status) return null;

  return (
    <div className="grid grid-cols-3 gap-4 mb-6">
      <div className="bg-black/30 border border-white/5 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-400 text-sm">워처 상태</span>
          <Activity className="w-4 h-4 text-slate-500" />
        </div>
        <div className="flex items-center gap-2">
          <div className={`w-2.5 h-2.5 rounded-full ${status.ready ? 'bg-green-500' : 'bg-red-500'} ${status.ready && !status.fatalError ? 'animate-pulse' : ''}`} />
          <span className="text-white font-semibold">
            {status.fatalError ? '오류 발생' : status.ready ? '정상 작동 중' : '시작 중...'}
          </span>
        </div>
      </div>
      
      <div className="bg-black/30 border border-white/5 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-400 text-sm">대기열 (큐)</span>
          <HardDrive className="w-4 h-4 text-slate-500" />
        </div>
        <div className="text-white font-semibold">
          {status.queueSize}건 처리 중 / {status.queuePending}건 대기
        </div>
      </div>

      <div className="bg-black/30 border border-white/5 rounded-xl p-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-slate-400 text-sm">가동 시간</span>
          {status.fatalError ? <AlertCircle className="w-4 h-4 text-red-400" /> : <CheckCircle2 className="w-4 h-4 text-green-400" />}
        </div>
        <div className="text-white font-semibold text-sm truncate">
          {status.startedAt ? new Date(status.startedAt).toLocaleString('ko-KR') : '-'}
        </div>
      </div>
    </div>
  );
}
