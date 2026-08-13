import { useState, useEffect } from 'react';
import { Save, Settings, FileText, MessageSquare, Activity, Loader2, RefreshCw, Lock, Trash2, FileCheck, Zap, Hand } from 'lucide-react';
import { motion } from 'framer-motion';
import { API_BASE, fetchWithAuth } from './api';
import StatusPanel from './components/StatusPanel';
import MeetingsTable from './components/MeetingsTable';
import LogPanel from './components/LogPanel';
import PendingReview from './components/PendingReview';

// 접근 통제는 Cloudflare Access가 엣지에서 처리한다(이메일 OTP). 여기까지 온 요청은
// 이미 인증을 통과했고, 컨테이너 포트는 어디에도 공개돼 있지 않아 터널 외 경로가 없다.
// 그래서 대시보드 자체 로그인은 두지 않는다.
function App() {
  const [activeTab, setActiveTab] = useState<'status' | 'pending' | 'prompt' | 'slack' | 'env'>('status');
  
  const [config, setConfig] = useState({ prompt: '', slackTemplate: '', env: '', envPath: '' });
  const [status, setStatus] = useState<any>(null);
  const [meetings, setMeetings] = useState<any[]>([]);
  
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [autoPublish, setAutoPublish] = useState<boolean | null>(null);
  const [pendingCount, setPendingCount] = useState(0);

  const loadData = async () => {
    setLoadingData(true);
    try {
      const [confRes, statRes, meetRes] = await Promise.all([
        fetchWithAuth(`${API_BASE}/api/config`),
        fetchWithAuth(`${API_BASE}/api/status`),
        fetchWithAuth(`${API_BASE}/api/meetings?limit=50`)
      ]);
      const confData = await confRes.json();
      const statData = await statRes.json();
      const meetData = await meetRes.json();

      // 응답에 data가 없을 수 있다(서버가 500을 냈다거나). 예전엔 그걸 그대로
      // setConfig에 넣어 config가 undefined가 됐고, 다음 렌더의 config.env에서
      // 화면 전체가 죽었다. 병합 방식으로 바꿔 config는 절대 undefined가 되지 않는다.
      if (confData?.data) {
        setConfig(prev => ({ ...prev, ...confData.data }));
        setLoadError('');
      } else {
        setLoadError(confData?.error ?? '설정을 불러오지 못했습니다.');
      }

      setStatus(statData?.data?.watcher ?? null);
      setMeetings(Array.isArray(meetData?.data) ? meetData.data : []);

      // 전송 방식과 검토 대기 건수 (사이드바 배지에 쓰인다)
      fetchWithAuth(`${API_BASE}/api/settings`)
        .then(r => r.json()).then(d => setAutoPublish(d?.data?.autoPublish ?? true)).catch(() => {});
      fetchWithAuth(`${API_BASE}/api/pending`)
        .then(r => r.json()).then(d => setPendingCount(Array.isArray(d?.data) ? d.data.length : 0)).catch(() => {});
    } catch (e) {
      setLoadError((e as Error).message);
    }
    setLoadingData(false);
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(() => {
      if (activeTab === 'status') {
        fetchWithAuth(`${API_BASE}/api/status`)
          .then(res => res.json())
          .then(d => setStatus(d?.data?.watcher ?? null))
          .catch(() => {});
        fetchWithAuth(`${API_BASE}/api/meetings?limit=50`)
          .then(res => res.json())
          .then(d => setMeetings(Array.isArray(d?.data) ? d.data : []))
          .catch(() => {});
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [activeTab]);

  const toggleAutoPublish = async (next: boolean) => {
    const prev = autoPublish;
    setAutoPublish(next); // 먼저 반영해 버튼이 즉시 반응하게 하고, 실패하면 되돌린다
    try {
      await fetchWithAuth(`${API_BASE}/api/settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ autoPublish: next }),
      });
    } catch (e) {
      setAutoPublish(prev);
      alert(`설정 변경 실패: ${(e as Error).message}`);
    }
  };

  const handleClearHistory = async () => {
    // 되돌릴 수 없는 동작이라 한 번 물어본다. 다만 지워지는 건 이 목록뿐이라는 걸
    // 분명히 해둔다 — 슬랙·노션·시트의 회의록과 녹음 원본은 그대로 남는다.
    if (!confirm('처리 기록 목록을 비웁니다.\n\n슬랙·노션·시트의 회의록과 녹음 파일은 그대로 남습니다.\n계속할까요?')) return;

    try {
      await fetchWithAuth(`${API_BASE}/api/meetings`, { method: 'DELETE' });
      setMeetings([]);
    } catch (e) {
      alert(`기록 삭제 실패: ${(e as Error).message}`);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetchWithAuth(`${API_BASE}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // env는 보내지 않는다. 화면의 값은 마스킹된 사본이라 그대로 저장하면 실제 키가 날아간다.
        body: JSON.stringify({ prompt: config.prompt, slackTemplate: config.slackTemplate })
      });
      alert('저장 및 백업되었습니다! 🚀');
    } catch (e) {
      alert(`저장 실패: ${(e as Error).message}`);
    }
    setSaving(false);
  };

  const isEditor = activeTab !== 'status';
  const canSave = activeTab === 'prompt' || activeTab === 'slack';
  const currentValue = activeTab === 'prompt' ? config.prompt : activeTab === 'slack' ? config.slackTemplate : config.env;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-8 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]">
      <div className="max-w-6xl mx-auto">
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-2xl backdrop-blur-md border border-blue-500/30 shadow-xl shadow-blue-900/20">
              <Activity className="w-8 h-8 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Pyhgoshift Control Center
              </h1>
              <p className="text-slate-400 text-sm mt-1">AI Meeting Agent - Secure Dashboard</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {canSave && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl font-semibold shadow-lg shadow-blue-900/50 transition-all active:scale-95 disabled:opacity-50"
              >
                {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
                설정 저장
              </button>
            )}
            {!isEditor && (
              <button onClick={loadData} className="flex items-center gap-2 px-6 py-3 bg-white/10 hover:bg-white/15 rounded-xl font-semibold transition-all active:scale-95 border border-white/10">
                <RefreshCw className={`w-5 h-5 ${loadingData ? 'animate-spin' : ''}`} />
                새로고침
              </button>
            )}
          </div>
        </motion.header>

        <div className="grid grid-cols-12 gap-6">
          <div className="col-span-3 space-y-2">
            <TabButton 
              active={activeTab === 'status'} 
              onClick={() => setActiveTab('status')}
              icon={<Activity className="w-5 h-5" />}
              title="상태 모니터링"
              subtitle="Watcher & History"
            />
            <TabButton
              active={activeTab === 'pending'}
              onClick={() => setActiveTab('pending')}
              icon={<FileCheck className="w-5 h-5" />}
              title={`검토 대기${pendingCount > 0 ? ` (${pendingCount})` : ''}`}
              subtitle={autoPublish === false ? '전송 전 확인' : '자동 전송 중'}
            />

            {/* 전송 방식 — 여기서 바로 바꿀 수 있어야 한다. .env 였다면 매번 재배포해야 했다 */}
            <div className="rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="mb-2 text-xs font-medium text-slate-400">전송 방식</div>
              <div className="flex gap-1.5">
                <button
                  onClick={() => toggleAutoPublish(true)}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    autoPublish === true
                      ? 'bg-blue-600 text-white'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  <Zap className="h-3.5 w-3.5" /> 자동
                </button>
                <button
                  onClick={() => toggleAutoPublish(false)}
                  className={`flex flex-1 items-center justify-center gap-1 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors ${
                    autoPublish === false
                      ? 'bg-amber-600 text-white'
                      : 'bg-white/5 text-slate-400 hover:bg-white/10'
                  }`}
                >
                  <Hand className="h-3.5 w-3.5" /> 수동
                </button>
              </div>
              <p className="mt-2 text-[11px] leading-snug text-slate-500">
                {autoPublish === false
                  ? '분석 후 검토 대기에 보관합니다. 확인하고 직접 전송하세요.'
                  : '분석이 끝나면 바로 전 배포처로 보냅니다.'}
              </p>
            </div>

            <div className="my-4 border-t border-white/10" />
            <TabButton 
              active={activeTab === 'prompt'} 
              onClick={() => setActiveTab('prompt')}
              icon={<FileText className="w-5 h-5" />}
              title="AI 뇌 조종석"
              subtitle="meetingbot_prompt.txt"
            />
            <TabButton 
              active={activeTab === 'slack'} 
              onClick={() => setActiveTab('slack')}
              icon={<MessageSquare className="w-5 h-5" />}
              title="슬랙 템플릿"
              subtitle="slack_template.txt"
            />
            <TabButton 
              active={activeTab === 'env'} 
              onClick={() => setActiveTab('env')}
              icon={<Settings className="w-5 h-5" />}
              title="환경 변수 (API 키)"
              subtitle=".env (읽기 전용 · 마스킹)"
            />
          </div>

          <motion.div 
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="col-span-9"
          >
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl h-[75vh] flex flex-col">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  {activeTab === 'status' && '📊 모니터링 대시보드'}
                  {activeTab === 'pending' && '📝 검토 대기 (전송 전)'}
                  {activeTab === 'prompt' && '🧠 프롬프트 에디터'}
                  {activeTab === 'slack' && '🎨 슬랙 템플릿 에디터'}
                  {activeTab === 'env' && '⚙️ 환경설정 뷰어 (읽기 전용)'}
                </h2>
              </div>

              {loadError && (
                <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  <span className="font-semibold">서버 응답 오류:</span> {loadError}
                </div>
              )}

              {loadingData ? (
                <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>
              ) : activeTab === 'pending' ? (
                <PendingReview />
              ) : activeTab === 'status' ? (
                <>
                  <StatusPanel status={status} />
                  <div className="mb-3 flex items-center justify-between pl-1">
                    <h3 className="text-sm font-bold text-slate-400">최근 처리 내역</h3>
                    {meetings.length > 0 && (
                      <button
                        onClick={handleClearHistory}
                        className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-slate-400 transition-colors hover:border-red-500/30 hover:bg-red-500/10 hover:text-red-300"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        기록 지우기
                      </button>
                    )}
                  </div>
                  <MeetingsTable meetings={meetings} />
                  <LogPanel />
                </>
              ) : (
                <>
                  {activeTab === 'env' && (
                    <div className="mb-4 flex items-start gap-3 rounded-xl border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-200/90">
                      <Lock className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                      <div>
                        <span className="font-semibold">읽기 전용입니다.</span> API 키는 앞뒤 네 글자만 남기고 가려서 보여줍니다.
                        환경변수는 컨테이너가 시작할 때 한 번만 읽히므로 여기서 고쳐도 반영되지 않습니다.
                        수정하려면 NAS의 <code className="rounded bg-black/40 px-1.5 py-0.5 font-mono text-xs">{config.envPath || '/volume1/docker/meeting-agent/.env'}</code>
                        를 직접 편집한 뒤 재배포하세요.
                      </div>
                    </div>
                  )}
                  <textarea
                    value={currentValue}
                    readOnly={activeTab === 'env'}
                    onChange={(e) => {
                      const val = e.target.value;
                      if (activeTab === 'prompt') setConfig({ ...config, prompt: val });
                      if (activeTab === 'slack') setConfig({ ...config, slackTemplate: val });
                    }}
                    className={`flex-1 w-full bg-black/40 border border-white/5 rounded-xl p-4 font-mono text-sm focus:outline-none resize-none ${
                      activeTab === 'env'
                        ? 'text-slate-500 cursor-default'
                        : 'text-slate-300 focus:ring-2 focus:ring-blue-500/50'
                    }`}
                    placeholder={activeTab === 'prompt' ? '여기에 AI 프롬프트를 입력하세요...' : ''}
                  />
                </>
              )}
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

function TabButton({ active, onClick, icon, title, subtitle }: any) {
  return (
    <button 
      onClick={onClick}
      className={`w-full text-left p-4 rounded-2xl transition-all duration-300 flex items-center gap-4 border ${
        active 
          ? 'bg-blue-500/10 border-blue-500/30 shadow-lg shadow-blue-900/20' 
          : 'bg-transparent border-transparent hover:bg-white/5'
      }`}
    >
      <div className={`p-2 rounded-xl ${active ? 'bg-blue-500/20 text-blue-400 shadow-inner' : 'bg-white/5 text-slate-400'}`}>
        {icon}
      </div>
      <div>
        <div className={`font-semibold ${active ? 'text-white' : 'text-slate-300'}`}>{title}</div>
        <div className="text-xs text-slate-500 mt-0.5">{subtitle}</div>
      </div>
    </button>
  );
}

export default App;
