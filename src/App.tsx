import React, { useState, useEffect, useRef } from 'react';
import {
  CheckSquare,
  Moon,
  Sun,
  LogIn,
  LogOut,
  Send,
  Loader2,
  Settings,
} from 'lucide-react';
import { AnalysisStatus, AnalyzedTask, AuthState, ServiceKey, TaskDetails } from './types';
import { analyzeContent } from './services/analyzeService';
import { login, logout, loginSilently, getAccessToken } from './services/authService';
import {
  loginGoogle,
  loginGoogleSilently,
  logoutGoogle,
  handleGoogleOAuthCallback,
} from './services/googleAuthService';
import {
  getTodoLists,
  createTasksInBatch,
  createTaskWithDueDate,
  loadAllTasks,
  TodoList,
  ScheduleTask,
  TodoTask,
} from './services/todoService';
import {
  createEventsInBatch,
  getCalendarLists,
  CalendarList,
} from './services/calendarService';
import { compressImage } from './utils/compressImage';
import { pendingFor, sendPending, markSent, removeCompleted } from './utils/sendPlan';
import TaskCard from './components/TaskCard';
import InputSection, { Attachment } from './components/InputSection';
import StatusSection from './components/StatusSection';
import { CACHE_VERSION, CACHE_KEY, DARK_MODE_KEY } from './config';
import { loadSettings, saveSettings, AppSettings } from './services/settingsService';
import SettingsPanel from './components/SettingsPanel';

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);

  const [tasks, setTasks] = useState<AnalyzedTask[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // 전송 성공 안내를 잠깐 표시
  const showSuccess = (message: string) => {
    setSuccessMsg(message);
    clearTimeout(successTimerRef.current);
    successTimerRef.current = setTimeout(() => setSuccessMsg(null), 4000);
  };
  useEffect(() => () => clearTimeout(successTimerRef.current), []);
  const [darkMode, setDarkMode] = useState(
    () => localStorage.getItem(DARK_MODE_KEY) !== 'off'
  );

  // 다크모드 설정 저장
  useEffect(() => {
    localStorage.setItem(DARK_MODE_KEY, darkMode ? 'on' : 'off');
  }, [darkMode]);
  // Auth state
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isMicrosoftAuthenticated: false,
    isGoogleAuthenticated: false,
  });

  // Todo lists
  const [todoLists, setTodoLists] = useState<TodoList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>('');
  
  // Calendar lists
  const [calendarLists, setCalendarLists] = useState<CalendarList[]>([]);
  const [selectedCalendarId, setSelectedCalendarId] = useState<string>('primary');
  
  const [isSending, setIsSending] = useState(false);
  const [scheduleTasks, setScheduleTasks] = useState<ScheduleTask[]>([]);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const handleSaveSettings = (settings: AppSettings) => {
    saveSettings(settings);
    setSettingsOpen(false);
    loadWorkdayCountdown();
  };
  const [todoTasks, setTodoTasks] = useState<TodoTask[]>([]);

  const loadWorkdayCountdown = async () => {
    // 1. 캐시된 데이터 즉시 표시 (버전 불일치 시 무시)
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (raw) {
        const cache = JSON.parse(raw) as {
          version?: number;
          scheduleTasks: ScheduleTask[];
          todoTasks: TodoTask[];
        };
        if (cache.version === CACHE_VERSION) {
          setScheduleTasks(cache.scheduleTasks);
          setTodoTasks(cache.todoTasks);
        } else {
          localStorage.removeItem(CACHE_KEY);
        }
      }
    } catch {}

    // 2. 백그라운드에서 최신 데이터 가져와 조용히 교체
    try {
      // 설정은 매번 새로 읽음 (폴링 타이머가 예전 설정을 붙잡지 않도록)
      const { scheduleListName, excludedLists } = loadSettings();
      const result = await loadAllTasks(scheduleListName, excludedLists);
      setScheduleTasks(result.scheduleTasks);
      setTodoTasks(result.todoTasks);
      localStorage.setItem(CACHE_KEY, JSON.stringify({ version: CACHE_VERSION, ...result }));
    } catch (e) {
      if (e instanceof Error && e.message === 'INTERACTION_REQUIRED') {
        // 토큰 만료 - 팝업 없이 로그인 상태 초기화 (UI에서 로그인 버튼 표시)
        setAuthState(prev => ({
          ...prev,
          isMicrosoftAuthenticated: false,
          isAuthenticated: prev.isGoogleAuthenticated,
          userName: undefined,
        }));
      } else {
        console.error('일정 로드 실패:', e);
      }
    }
  };

  // 탭 포커스 복귀 및 주기적 폴링으로 근무 현황 자동 갱신
  useEffect(() => {
    const isMsAuth = authState.isMicrosoftAuthenticated;
    if (!isMsAuth) return;

    const refresh = () => loadWorkdayCountdown();

    // 탭이 다시 보일 때 갱신
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') refresh();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    // 5분마다 폴링
    const intervalId = setInterval(refresh, 5 * 60 * 1000);

    return () => {
      document.removeEventListener('visibilitychange', onVisibilityChange);
      clearInterval(intervalId);
    };
  }, [authState.isMicrosoftAuthenticated]);

  // Check auth on mount and try auto-login for both services
  useEffect(() => {
    const checkAuth = async () => {
      const newAuthState: AuthState = {
        isAuthenticated: false,
        isMicrosoftAuthenticated: false,
        isGoogleAuthenticated: false,
      };

      try {
        // Try Microsoft silent login
        const msAccount = await loginSilently();
        if (msAccount) {
          // 토큰 실제 유효성 검증 — 만료 시 INTERACTION_REQUIRED throw
          // (검증 없이 로그인 상태로 확정하면, 이후 데이터 로드 실패의
          //  로그인 해제 처리가 아래 setAuthState에 덮여 유령 로그인이 됨)
          try {
            await getAccessToken();
          } catch (e) {
            if (e instanceof Error && e.message === 'INTERACTION_REQUIRED') throw e;
            // 네트워크 등 일시적 오류는 로그인 유지 (오프라인에서 캐시 데이터 표시)
          }
          newAuthState.isMicrosoftAuthenticated = true;
          newAuthState.userName = msAccount.name || undefined;
          newAuthState.userEmail = msAccount.username || undefined;
          loadTodoLists();
          loadWorkdayCountdown();
        }
      } catch (error) {
        console.error('Microsoft 인증 확인 실패:', error);
      }

      try {
        // 리디렉트 방식 OAuth 콜백 처리 (모바일에서 구글 로그인 후 돌아온 경우)
        const callbackAccount = await handleGoogleOAuthCallback();
        if (callbackAccount) {
          newAuthState.isGoogleAuthenticated = true;
          newAuthState.googleUserName = callbackAccount.name;
          newAuthState.googleUserEmail = callbackAccount.email;
          loadCalendarLists();
        } else {
          // 일반 silent login
          const googleAccount = await loginGoogleSilently();
          if (googleAccount) {
            newAuthState.isGoogleAuthenticated = true;
            newAuthState.googleUserName = googleAccount.name;
            newAuthState.googleUserEmail = googleAccount.email;
            loadCalendarLists();
          }
        }
      } catch (error) {
        console.error('Google 인증 확인 실패:', error);
      }

      // Update isAuthenticated if either service is authenticated
      newAuthState.isAuthenticated =
        newAuthState.isMicrosoftAuthenticated || newAuthState.isGoogleAuthenticated;

      setAuthState(newAuthState);
    };
    checkAuth();
  }, []);

  const loadTodoLists = async () => {
    try {
      const lists = await getTodoLists();
      setTodoLists(lists);
      if (lists.length > 0 && !selectedListId) {
        setSelectedListId(lists[0].id);
      }
    } catch (error) {
      console.error('To-Do 목록 로드 실패:', error);
    }
  };

  const loadCalendarLists = async () => {
    try {
      const lists = await getCalendarLists();
      setCalendarLists(lists);
      // 'primary' 별칭은 목록에 없으므로 실제 기본 캘린더 ID로 바꿔 드롭다운 표시와 값을 일치시킴
      const primaryCalendar = lists.find((cal) => cal.primary) || lists[0];
      if (primaryCalendar) {
        setSelectedCalendarId((prev) => (prev === 'primary' ? primaryCalendar.id : prev));
      }
    } catch (error) {
      console.error('캘린더 목록 로드 실패:', error);
    }
  };

  const handleLogin = async () => {
    try {
      const account = await login();
      if (account) {
        setAuthState((prev) => ({
          ...prev,
          isAuthenticated: true,
          isMicrosoftAuthenticated: true,
          userName: account.name || undefined,
          userEmail: account.username || undefined,
        }));
        await loadTodoLists();
        loadWorkdayCountdown();
      }
    } catch (error) {
      console.error('Microsoft 로그인 실패:', error);
      setErrorMsg('Microsoft 로그인에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleGoogleLogin = async () => {
    try {
      const account = await loginGoogle();
      if (account) {
        setAuthState((prev) => ({
          ...prev,
          isAuthenticated: true,
          isGoogleAuthenticated: true,
          googleUserName: account.name,
          googleUserEmail: account.email,
        }));
        await loadCalendarLists();
      }
    } catch (error) {
      console.error('Google 로그인 실패:', error);
      setErrorMsg('Google 로그인에 실패했습니다. 다시 시도해주세요.');
    }
  };

  const handleLogout = async () => {
    try {
      // Logout from both services
      if (authState.isMicrosoftAuthenticated) {
        await logout();
      }
      if (authState.isGoogleAuthenticated) {
        await logoutGoogle();
      }
      setAuthState({
        isAuthenticated: false,
        isMicrosoftAuthenticated: false,
        isGoogleAuthenticated: false,
      });
      setTodoLists([]);
      setSelectedListId('');
      setCalendarLists([]);
      setSelectedCalendarId('primary');
      // 기기에 남은 작업·일정 캐시와 화면 데이터도 정리
      localStorage.removeItem(CACHE_KEY);
      setScheduleTasks([]);
      setTodoTasks([]);
    } catch (error) {
      console.error('로그아웃 실패:', error);
    }
  };

  const processFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files);
    // 한꺼번에 추가해 선택 순서 유지 (연속 캡처 그룹화에 순서가 중요)
    const processed = await Promise.all(fileArray.map(compressImage));
    setAttachments((prev) => [
      ...prev,
      ...processed.map(({ dataUrl, mimeType }, i) => ({
        id: crypto.randomUUID(),
        file: fileArray[i],
        previewUrl: dataUrl,
        mimeType,
      })),
    ]);
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments((prev) => prev.filter((att) => att.id !== id));
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData.items;
    const files: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) {
          files.push(file);
        }
      }
    }
    if (files.length > 0) {
      processFiles(files);
      e.preventDefault();
    }
  };

  const handleClear = () => {
    setInputText('');
    setAttachments([]);
    setStatus(AnalysisStatus.IDLE);
    setErrorMsg(null);
  };

  const handleDeleteTask = (id: string) => {
    setTasks((prev) => prev.filter((task) => task.id !== id));
  };

  const handleUpdateTask = (id: string, patch: Partial<TaskDetails>) => {
    setTasks((prev) => prev.map((task) => (task.id === id ? { ...task, ...patch } : task)));
  };

  const handleAnalyze = async () => {
    if (!inputText && attachments.length === 0) {
      setErrorMsg('분석할 텍스트를 입력하거나 파일을 업로드해주세요.');
      return;
    }

    setStatus(AnalysisStatus.ANALYZING);
    setErrorMsg(null);

    try {
      const imagesPayload = attachments.map((att) => ({
        data: att.previewUrl.split(',')[1],
        mimeType: att.mimeType,
      }));

      const results = await analyzeContent(inputText, imagesPayload);

      const newTasks: AnalyzedTask[] = results.map(
        (result): AnalyzedTask => ({
          ...result,
          id: crypto.randomUUID(),
          createdAt: Date.now(),
        })
      );

      setTasks((prev) => [...newTasks, ...prev]);
      setStatus(AnalysisStatus.SUCCESS);

      setInputText('');
      setAttachments([]);
    } catch (err: any) {
      console.error(err);
      
      // 429 오류 (할당량 초과)에 대한 특별한 메시지
      const isQuotaExceeded = err?.status === 429 || 
                             err?.code === 429 ||
                             err?.message?.includes('quota') ||
                             err?.message?.includes('RESOURCE_EXHAUSTED');
      
      // 503 오류 (서비스 과부하)에 대한 특별한 메시지
      const isOverloaded = err?.status === 503 || 
                          err?.code === 503 ||
                          err?.message?.includes('overloaded') ||
                          err?.message?.includes('UNAVAILABLE');
      
      if (err?.message === 'PAYLOAD_TOO_LARGE') {
        setErrorMsg('첨부 이미지가 너무 큽니다. 이미지 수를 줄여 나눠서 분석해주세요.');
      } else if (isQuotaExceeded) {
        // retryAfter 정보가 있으면 표시
        const retryAfter = err?.retryAfter;
        if (retryAfter) {
          const retrySeconds = Math.ceil(retryAfter / 1000);
          setErrorMsg(`요청 한도를 초과했습니다. ${retrySeconds}초 후 다시 시도해주세요.`);
        } else {
          setErrorMsg('요청 한도를 초과했습니다. 잠시 후 다시 시도해주세요.');
        }
      } else if (isOverloaded) {
        setErrorMsg('AI 서비스가 일시적으로 과부하 상태입니다. 잠시 후 다시 시도해주세요.');
      } else if (err?.status === 400 || err?.status === 422) {
        // 지원하지 않는 파일 형식 등 — 서버가 보낸 안내 문구를 그대로 표시
        setErrorMsg(err.message);
      } else {
        setErrorMsg('내용을 분석하는 중 오류가 발생했습니다. 다시 시도해주세요.');
      }
      
      setStatus(AnalysisStatus.ERROR);
    }
  };

  const handleSendToBoth = async () => {
    // 현재 로그인된 서비스로만 전송
    const services: ServiceKey[] = [
      ...(authState.isMicrosoftAuthenticated ? (['microsoft'] as const) : []),
      ...(authState.isGoogleAuthenticated ? (['google'] as const) : []),
    ];
    if (services.length === 0) {
      setErrorMsg('먼저 Microsoft 또는 Google 계정으로 로그인해주세요.');
      return;
    }

    // 부분 실패 후 재전송이면 이미 보낸 서비스는 건너뜀 (중복 생성 방지)
    const msPending = authState.isMicrosoftAuthenticated ? pendingFor(tasks, 'microsoft') : [];
    const googlePending = authState.isGoogleAuthenticated ? pendingFor(tasks, 'google') : [];

    if (msPending.length === 0 && googlePending.length === 0) {
      setErrorMsg('전송할 작업이 없습니다.');
      return;
    }
    if (msPending.length > 0 && !selectedListId) {
      setErrorMsg('To-Do 목록을 선택해주세요.');
      return;
    }

    setIsSending(true);
    setErrorMsg(null);

    try {
      const { msSent, googleSent, msExpired } = await sendPending(
        {
          msPending,
          msListId: selectedListId,
          googlePending,
          calendars: calendarLists,
          fallbackCalendarId: selectedCalendarId,
        },
        { createTasks: createTasksInBatch, createEvents: createEventsInBatch }
      );

      if (msExpired) {
        setAuthState(prev => ({
          ...prev,
          isMicrosoftAuthenticated: false,
          isAuthenticated: prev.isGoogleAuthenticated,
          userName: undefined,
        }));
      }

      // 성공 기록 → 로그인된 모든 서비스로 보낸 작업은 목록에서 제거, 나머지는 남겨 재전송
      setTasks((prev) =>
        removeCompleted(markSent(markSent(prev, 'microsoft', msSent), 'google', googleSent), services)
      );

      // 서비스별 결과 (보낼 게 없던 서비스는 생략)
      const outcomes = [
        { name: 'Microsoft', sent: msSent.length, total: msPending.length },
        { name: 'Google', sent: googleSent.length, total: googlePending.length },
      ].filter((o) => o.total > 0);
      const allSent = outcomes.every((o) => o.sent === o.total);

      if (allSent) {
        showSuccess(`${outcomes.map((o) => `${o.name} ${o.sent}건`).join(' · ')} 추가됨`);
      } else {
        const counts = outcomes.map((o) => `${o.name} ${o.sent}/${o.total}건`).join(', ');
        const summary = `${counts} 성공 — 남은 작업은 실패한 쪽으로만 다시 전송됩니다.`;
        setErrorMsg(msExpired ? `Microsoft 로그인이 만료되었습니다. 다시 로그인 후 전송해주세요. (${summary})` : summary);
      }
    } catch (error) {
      console.error('작업 전송 실패:', error);
      setErrorMsg('작업을 전송하는 중 오류가 발생했습니다.');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className={darkMode ? 'dark' : ''}>
      <div
        className="min-h-screen bg-slate-50 dark:bg-slate-950 font-sans text-slate-900 dark:text-slate-100 pb-20 selection:bg-indigo-100 dark:selection:bg-indigo-900 selection:text-indigo-900 dark:selection:text-indigo-100 transition-colors duration-300"
        onPaste={handlePaste}
      >
        {/* Header */}
        <header className="sticky top-0 z-10 bg-white/90 dark:bg-slate-950/90 backdrop-blur border-b border-slate-200/50 dark:border-slate-800/50">
          <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="w-5 h-5 text-slate-400 dark:text-slate-600" />
              <div>
                <h1 className="text-sm font-medium text-slate-600 dark:text-slate-400">
                  To-Do
                </h1>
              </div>
            </div>
            <div className="flex items-center gap-1">
              {!authState.isMicrosoftAuthenticated && (
                <button
                  onClick={handleLogin}
                  className="p-2 text-slate-400 dark:text-slate-600 hover:text-blue-500 transition-colors"
                  title="Microsoft 로그인"
                >
                  <LogIn className="w-4 h-4" />
                </button>
              )}
              {!authState.isGoogleAuthenticated && (
                <button
                  onClick={handleGoogleLogin}
                  className="p-2 text-slate-400 dark:text-slate-600 hover:text-red-500 transition-colors"
                  title="Google 로그인"
                >
                  <LogIn className="w-4 h-4" />
                </button>
              )}
              {authState.isAuthenticated && (
                <button
                  onClick={handleLogout}
                  className="p-2 text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
                  title="로그아웃"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              )}
              {authState.isMicrosoftAuthenticated && (
                <button
                  onClick={() => setSettingsOpen(true)}
                  className="p-2 text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
                  title="설정"
                >
                  <Settings className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={() => setDarkMode(!darkMode)}
                className="p-2 text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
                aria-label="다크모드 전환"
              >
                {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              </button>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-4 space-y-4">
          {/* Input Section */}
          <InputSection
            inputText={inputText}
            onInputChange={setInputText}
            attachments={attachments}
            onAddFiles={processFiles}
            onRemoveAttachment={handleRemoveAttachment}
            onClear={handleClear}
            onAnalyze={handleAnalyze}
            isAnalyzing={status === AnalysisStatus.ANALYZING}
            errorMsg={errorMsg}
          />

          {/* Results Section */}
          {tasks.length > 0 && (
            <section className="space-y-3 pb-6">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-500 dark:text-slate-400">
                  {tasks.length}개
                </span>
                <div className="flex items-center gap-2">
                  {authState.isMicrosoftAuthenticated && todoLists.length > 0 && (
                    <select
                      value={selectedListId}
                      onChange={(e) => setSelectedListId(e.target.value)}
                      className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 rounded text-xs focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-700 outline-none"
                    >
                      {todoLists.map((list) => (
                        <option key={list.id} value={list.id}>
                          {list.displayName}
                        </option>
                      ))}
                    </select>
                  )}
                  {authState.isGoogleAuthenticated && calendarLists.length > 0 && (
                    <select
                      value={selectedCalendarId}
                      onChange={(e) => setSelectedCalendarId(e.target.value)}
                      title="태그(#일정·#기한·#작업·#기프티콘)와 이름이 같은 캘린더가 없을 때 사용할 캘린더"
                      className="px-2 py-1 bg-white dark:bg-slate-900 border border-slate-200/50 dark:border-slate-800/50 rounded text-xs focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-700 outline-none"
                    >
                      {calendarLists.map((calendar) => (
                        <option key={calendar.id} value={calendar.id}>
                          {calendar.summary}
                        </option>
                      ))}
                    </select>
                  )}
                  {authState.isAuthenticated ? (
                    <button
                      onClick={handleSendToBoth}
                      disabled={isSending}
                      className="p-2 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:bg-slate-400 text-white dark:text-slate-900 rounded-lg transition-colors"
                      title={isSending ? "전송 중..." : "전송"}
                    >
                      {isSending ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Send className="w-4 h-4" />
                      )}
                    </button>
                  ) : (
                    <>
                      {!authState.isMicrosoftAuthenticated && (
                        <button
                          onClick={handleLogin}
                          className="p-2 bg-blue-600 dark:bg-blue-500 hover:bg-blue-700 dark:hover:bg-blue-600 text-white rounded-lg transition-colors"
                          title="Microsoft 로그인"
                        >
                          <LogIn className="w-4 h-4" />
                        </button>
                      )}
                      {!authState.isGoogleAuthenticated && (
                        <button
                          onClick={handleGoogleLogin}
                          className="p-2 bg-red-600 dark:bg-red-500 hover:bg-red-700 dark:hover:bg-red-600 text-white rounded-lg transition-colors"
                          title="Google 로그인"
                        >
                          <LogIn className="w-4 h-4" />
                        </button>
                      )}
                    </>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                {tasks.map((task) => (
                  <TaskCard
                    key={task.id}
                    task={task}
                    onDelete={() => handleDeleteTask(task.id)}
                    onUpdate={(patch) => handleUpdateTask(task.id, patch)}
                  />
                ))}
              </div>
            </section>
          )}

          {/* Status Section */}
          {authState.isMicrosoftAuthenticated && (
            <StatusSection
              scheduleTasks={scheduleTasks}
              todoTasks={todoTasks}
              todoLists={todoLists}
              onTaskComplete={(id) => setTodoTasks((prev) => prev.filter((t) => t.id !== id))}
              onTaskCreate={async (listId, title, dueDate) => {
                await createTaskWithDueDate(listId, title, dueDate);
                await loadWorkdayCountdown();
              }}
              onRefresh={loadWorkdayCountdown}
            />
          )}
        </main>

        {settingsOpen && (
          <SettingsPanel
            todoLists={todoLists}
            settings={loadSettings()}
            onSave={handleSaveSettings}
            onClose={() => setSettingsOpen(false)}
          />
        )}

        {successMsg && (
          <div
            role="status"
            className="fixed bottom-6 left-1/2 -translate-x-1/2 z-20 px-4 py-2.5 rounded-lg shadow-lg bg-emerald-600 text-white text-xs font-medium"
          >
            {successMsg}
          </div>
        )}
      </div>
    </div>
  );
};

export default App;
