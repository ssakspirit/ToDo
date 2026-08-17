import React from 'react';

interface Props {
  children: React.ReactNode;
}

interface State {
  error: Error | null;
}

// 렌더링 중 예외 발생 시 흰 화면 대신 안내 + 새로고침 버튼 표시
class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('렌더링 오류:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-slate-950 text-slate-200 p-6">
          <p className="text-lg font-medium">문제가 발생했습니다</p>
          <p className="text-xs text-slate-500 text-center break-all max-w-sm">
            {this.state.error.message}
          </p>
          <button
            onClick={() => {
              // 캐시가 원인일 수 있으므로 함께 정리
              localStorage.removeItem('todo_tasks_cache');
              window.location.reload();
            }}
            className="px-4 py-2 bg-slate-100 text-slate-900 rounded-lg text-sm"
          >
            새로고침
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default ErrorBoundary;
