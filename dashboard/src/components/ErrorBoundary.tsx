import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props { children: ReactNode }
interface State { error: Error | null; stack: string }

/**
 * 렌더링 중 예외가 나면 React는 트리 전체를 언마운트한다 — 화면이 그냥 하얗게 비고
 * 원인은 개발자 도구를 열어야만 보인다. NAS에 띄워두고 폰으로 접속하는 대시보드에서는
 * 그게 사실상 "원인 확인 불가"라서, 에러를 화면에 그대로 띄운다.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, stack: '' };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    this.setState({ stack: info.componentStack ?? '' });
    console.error('[Dashboard] 렌더링 오류:', error, info);
  }

  render() {
    const { error, stack } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-slate-950 p-6 text-slate-200">
        <div className="mx-auto max-w-3xl">
          <h1 className="mb-2 text-2xl font-bold text-red-400">대시보드 화면 오류</h1>
          <p className="mb-6 text-sm text-slate-400">
            화면을 그리다 문제가 생겨 멈췄습니다. 봇 자체는 계속 동작 중일 수 있습니다.
            아래 내용을 그대로 복사해서 전달해 주세요.
          </p>

          <div className="mb-4 rounded-xl border border-red-500/30 bg-red-500/10 p-4">
            <div className="font-mono text-sm break-words text-red-200">
              {error.name}: {error.message}
            </div>
          </div>

          {stack && (
            <pre className="mb-6 max-h-72 overflow-auto rounded-xl border border-white/10 bg-black/40 p-4 font-mono text-xs text-slate-400">
              {stack.trim()}
            </pre>
          )}

          <button
            onClick={() => window.location.reload()}
            className="rounded-xl bg-blue-600 px-5 py-2.5 font-semibold text-white hover:bg-blue-500"
          >
            새로고침
          </button>
        </div>
      </div>
    );
  }
}
