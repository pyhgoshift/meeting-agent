import { useState } from 'react';
import { motion } from 'framer-motion';
import { Lock, Loader2, LogIn } from 'lucide-react';
import { API_BASE } from '../api';

export default function LoginForm({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const res = await fetch(`${API_BASE}/api/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
        credentials: 'include'
      });

      if (res.ok) {
        onLogin();
      } else {
        const data = await res.json();
        setError(data.error || '로그인 실패');
      }
    } catch (err) {
      setError('서버 연결 실패');
    }
    
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <motion.div 
        initial={{ opacity: 0, scale: 0.95 }}
        animate={{ opacity: 1, scale: 1 }}
        className="w-full max-w-md bg-white/5 backdrop-blur-xl border border-white/10 rounded-2xl p-8 shadow-2xl"
      >
        <div className="text-center mb-8">
          <div className="inline-flex p-4 bg-blue-500/20 rounded-full mb-4 border border-blue-500/30">
            <Lock className="w-8 h-8 text-blue-400" />
          </div>
          <h2 className="text-2xl font-bold text-white">보안 접속</h2>
          <p className="text-slate-400 text-sm mt-2">AI Meeting Agent Dashboard</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="대시보드 비밀번호 입력"
              className="w-full bg-black/40 border border-white/10 rounded-xl p-4 text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500/50"
              autoFocus
            />
          </div>

          {error && (
            <motion.p 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-red-400 text-sm text-center"
            >
              {error}
            </motion.p>
          )}

          <button
            type="submit"
            disabled={loading || !password}
            className="w-full flex items-center justify-center gap-2 py-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-xl font-semibold text-white shadow-lg shadow-blue-900/50 transition-all active:scale-95 disabled:opacity-50"
          >
            {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : <LogIn className="w-5 h-5" />}
            접속하기
          </button>
        </form>
      </motion.div>
    </div>
  );
}
