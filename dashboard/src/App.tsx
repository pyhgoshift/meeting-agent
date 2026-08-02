import { useState, useEffect } from 'react';
import { Save, Settings, FileText, MessageSquare, Activity, Loader2, LogOut, RefreshCw } from 'lucide-react';
import { motion } from 'framer-motion';
import { API_BASE, fetchWithAuth } from './api';
import LoginForm from './components/LoginForm';
import StatusPanel from './components/StatusPanel';
import MeetingsTable from './components/MeetingsTable';

function App() {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);
  const [activeTab, setActiveTab] = useState<'status' | 'prompt' | 'slack' | 'env'>('status');
  
  const [config, setConfig] = useState({ prompt: '', slackTemplate: '', env: '' });
  const [status, setStatus] = useState<any>(null);
  const [meetings, setMeetings] = useState<any[]>([]);
  
  const [saving, setSaving] = useState(false);
  const [loadingData, setLoadingData] = useState(true);

  const checkAuth = async () => {
    try {
      await fetchWithAuth(`${API_BASE}/api/status`);
      setAuthenticated(true);
    } catch {
      setAuthenticated(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const loadData = async () => {
    if (!authenticated) return;
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

      setConfig(confData.data);
      setStatus(statData.data.watcher);
      setMeetings(meetData.data);
    } catch (e) {
      if ((e as Error).message === 'Unauthorized') setAuthenticated(false);
    }
    setLoadingData(false);
  };

  useEffect(() => {
    if (authenticated) {
      loadData();
      const interval = setInterval(() => {
        if (activeTab === 'status') {
          fetchWithAuth(`${API_BASE}/api/status`)
            .then(res => res.json())
            .then(d => setStatus(d.data.watcher))
            .catch(() => {});
          fetchWithAuth(`${API_BASE}/api/meetings?limit=50`)
            .then(res => res.json())
            .then(d => setMeetings(d.data))
            .catch(() => {});
        }
      }, 15000);
      return () => clearInterval(interval);
    }
  }, [authenticated, activeTab]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetchWithAuth(`${API_BASE}/api/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      alert('저장 및 백업되었습니다! 🚀');
    } catch (e) {
      if ((e as Error).message === 'Unauthorized') setAuthenticated(false);
      else alert('저장 실패!');
    }
    setSaving(false);
  };

  const handleLogout = async () => {
    try {
      await fetchWithAuth(`${API_BASE}/api/logout`, { method: 'POST' });
    } catch (e) {}
    setAuthenticated(false);
  };

  if (authenticated === null) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white"><Loader2 className="animate-spin w-12 h-12 text-blue-500" /></div>;
  }

  if (authenticated === false) {
    return <LoginForm onLogin={() => setAuthenticated(true)} />;
  }

  const isEditor = activeTab !== 'status';
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
            <button onClick={handleLogout} className="p-3 rounded-xl bg-white/5 hover:bg-white/10 text-slate-400 transition-colors border border-white/5">
              <LogOut className="w-5 h-5" />
            </button>
            {isEditor && (
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
              subtitle=".env (백업 보호됨)"
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
                  {activeTab === 'prompt' && '🧠 프롬프트 에디터'}
                  {activeTab === 'slack' && '🎨 슬랙 템플릿 에디터'}
                  {activeTab === 'env' && '⚙️ 환경설정 에디터 (Secured)'}
                </h2>
              </div>
              
              {loadingData ? (
                <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 text-blue-500 animate-spin" /></div>
              ) : activeTab === 'status' ? (
                <>
                  <StatusPanel status={status} />
                  <h3 className="text-sm font-bold text-slate-400 mb-3 pl-1">최근 처리 내역</h3>
                  <MeetingsTable meetings={meetings} />
                </>
              ) : (
                <textarea 
                  value={currentValue}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (activeTab === 'prompt') setConfig({ ...config, prompt: val });
                    if (activeTab === 'slack') setConfig({ ...config, slackTemplate: val });
                    if (activeTab === 'env') setConfig({ ...config, env: val });
                  }}
                  className="flex-1 w-full bg-black/40 border border-white/5 rounded-xl p-4 text-slate-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                  placeholder={activeTab === 'prompt' ? '여기에 AI 프롬프트를 입력하세요...' : ''}
                />
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
