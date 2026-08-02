import { useState, useEffect } from 'react';
import { Save, Settings, FileText, MessageSquare, Activity, Loader2 } from 'lucide-react';
import { motion } from 'framer-motion';

const API_BASE = 'http://localhost:3000/api';

function App() {
  const [activeTab, setActiveTab] = useState<'prompt' | 'slack' | 'env'>('prompt');
  const [config, setConfig] = useState({ prompt: '', slackTemplate: '', env: '' });
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch(`${API_BASE}/config`)
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setConfig(data.data);
        }
        setLoading(false);
      });
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      await fetch(`${API_BASE}/config`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config)
      });
      alert('저장되었습니다! 🚀');
    } catch (e) {
      alert('저장 실패!');
    }
    setSaving(false);
  };

  const handleChange = (val: string) => {
    if (activeTab === 'prompt') setConfig({ ...config, prompt: val });
    if (activeTab === 'slack') setConfig({ ...config, slackTemplate: val });
    if (activeTab === 'env') setConfig({ ...config, env: val });
  };

  const currentValue = activeTab === 'prompt' ? config.prompt : activeTab === 'slack' ? config.slackTemplate : config.env;

  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center text-white"><Loader2 className="animate-spin w-12 h-12 text-blue-500" /></div>;
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-200 font-sans p-8 bg-[url('https://www.transparenttextures.com/patterns/stardust.png')]">
      <div className="max-w-5xl mx-auto">
        <motion.header 
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-center justify-between mb-8"
        >
          <div className="flex items-center gap-4">
            <div className="p-3 bg-blue-500/20 rounded-2xl backdrop-blur-md border border-blue-500/30">
              <Activity className="w-8 h-8 text-blue-400" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-transparent">
                Pyhgoshift Control Center
              </h1>
              <p className="text-slate-400 text-sm mt-1">AI Meeting Agent Dashboard</p>
            </div>
          </div>
          
          <button 
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl font-semibold shadow-lg shadow-blue-900/50 transition-all active:scale-95 disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            설정 저장하기
          </button>
        </motion.header>

        <div className="grid grid-cols-12 gap-6">
          {/* Sidebar */}
          <div className="col-span-3 space-y-2">
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
              subtitle=".env"
            />
          </div>

          {/* Editor */}
          <motion.div 
            key={activeTab}
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            className="col-span-9"
          >
            <div className="bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-6 shadow-2xl h-[70vh] flex flex-col">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-bold text-white flex items-center gap-2">
                  {activeTab === 'prompt' && '🧠 프롬프트 에디터'}
                  {activeTab === 'slack' && '🎨 슬랙 템플릿 에디터'}
                  {activeTab === 'env' && '⚙️ 환경설정 에디터'}
                </h2>
                <span className="text-xs text-slate-400 bg-white/5 px-3 py-1 rounded-full">
                  자동 동기화 중
                </span>
              </div>
              <textarea 
                value={currentValue}
                onChange={(e) => handleChange(e.target.value)}
                className="flex-1 w-full bg-black/40 border border-white/5 rounded-xl p-4 text-slate-300 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/50 resize-none"
                placeholder={activeTab === 'prompt' ? '여기에 AI 프롬프트를 입력하세요...' : ''}
              />
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
      <div className={`p-2 rounded-xl ${active ? 'bg-blue-500/20 text-blue-400' : 'bg-white/5 text-slate-400'}`}>
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
