import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  MessageSquare,
  Sparkles,
  CheckSquare,
  Moon,
  Sun,
  Camera,
  Plus,
  X,
  LogIn,
  LogOut,
  Send,
  Loader2,
} from 'lucide-react';
import { AnalysisStatus, AnalyzedTask, AuthState, TaskDetails } from './types';
import { analyzeContent } from './services/analyzeService';
import { login, logout, getAccount, loginSilently, getAccessToken } from './services/authService';
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
import TaskCard from './components/TaskCard';
import StatusSection from './components/StatusSection';
import {
  SCHEDULE_LIST_NAME,
  EXCLUDED_LISTS,
  CACHE_VERSION,
  CACHE_KEY,
  DARK_MODE_KEY,
} from './config';

interface Attachment {
  id: string;
  file: File;
  previewUrl: string; // 압축된 data URL (미리보기 + AI 분석 전송 공용)
  mimeType: string;   // 압축 시 image/jpeg로 바뀔 수 있어 file.type과 별도 보관
}

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tasks, setTasks] = useState<AnalyzedTask[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
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
      const result = await loadAllTasks(SCHEDULE_LIST_NAME, EXCLUDED_LISTS);
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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    e.target.value = '';
  };

  const handleCameraCapture = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      processFiles(e.target.files);
    }
    e.target.value = '';
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
          extractedInfo: {},
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

  // 작업 제목의 태그와 이름이 같은 캘린더로 전송, 없으면 드롭다운에서 고른 캘린더
  // 우선순위: #기프티콘 > 필수태그(#일정/#기한/#작업)
  const resolveCalendarId = (title: string): string => {
    const byName = (name: string) => calendarLists.find((cal) => cal.summary === name);
    const required = title.match(/#(일정|기한|작업)/)?.[0];
    const calendar =
      (title.includes('#기프티콘') ? byName('#기프티콘') : undefined) ??
      (required ? byName(required) : undefined);
    return calendar?.id ?? selectedCalendarId;
  };

  const handleSendToBoth = async () => {
    // Validation
    if (!authState.isMicrosoftAuthenticated && !authState.isGoogleAuthenticated) {
      setErrorMsg('먼저 Microsoft 또는 Google 계정으로 로그인해주세요.');
      return;
    }

    if (tasks.length === 0) {
      setErrorMsg('전송할 작업이 없습니다.');
      return;
    }

    if (authState.isMicrosoftAuthenticated && !selectedListId) {
      setErrorMsg('To-Do 목록을 선택해주세요.');
      return;
    }

    setIsSending(true);
    setErrorMsg(null);

    try {
      const taskDetails: TaskDetails[] = tasks.map((task) => ({
        title: task.title,
        body: task.body,
        dueDateTime: task.dueDateTime,
        importance: task.importance,
        reminderDateTime: task.reminderDateTime,
        categories: task.categories,
      }));

      // Send to both services in parallel (이름 있는 결과로 서비스별 구분)
      const msPromise: Promise<any[]> | null =
        authState.isMicrosoftAuthenticated && selectedListId
          ? createTasksInBatch(selectedListId, taskDetails)
          : null;

      let googlePromise: Promise<any[]> | null = null;
      if (authState.isGoogleAuthenticated) {
        // Group tasks by calendar based on their tags
        const tasksByCalendar = new Map<string, TaskDetails[]>();

        taskDetails.forEach((task) => {
          const calendarId = resolveCalendarId(task.title);

          if (!tasksByCalendar.has(calendarId)) {
            tasksByCalendar.set(calendarId, []);
          }
          tasksByCalendar.get(calendarId)!.push(task);
        });

        // Send each group to its corresponding calendar, flatten results
        googlePromise = Promise.all(
          Array.from(tasksByCalendar.entries()).map(([calendarId, tasks]) =>
            createEventsInBatch(tasks, calendarId)
          )
        ).then((results) => results.flat());
      }

      const [msResult, googleResult] = await Promise.allSettled([
        msPromise ?? Promise.resolve(null),
        googlePromise ?? Promise.resolve(null),
      ]);

      // Analyze results
      // 거부(rejected)된 서비스는 전체 실패로 집계 — total을 0으로 두면 성공으로 오판해 작업이 지워짐
      const total = taskDetails.length;
      let msSuccess = 0;
      let googleSuccess = 0;
      let msExpired = false;

      if (msResult.status === 'fulfilled' && msResult.value) {
        msSuccess = msResult.value.filter((r: any) => r.success).length;
      } else if (msResult.status === 'rejected') {
        if (msResult.reason instanceof Error && msResult.reason.message === 'INTERACTION_REQUIRED') {
          msExpired = true;
          setAuthState(prev => ({
            ...prev,
            isMicrosoftAuthenticated: false,
            isAuthenticated: prev.isGoogleAuthenticated,
            userName: undefined,
          }));
        }
      }

      if (googleResult.status === 'fulfilled' && googleResult.value) {
        googleSuccess = googleResult.value.filter((r: any) => r.success).length;
      }

      // User feedback
      const messages: string[] = [];
      if (authState.isMicrosoftAuthenticated) {
        messages.push(`Microsoft: ${msSuccess}/${total}`);
      }
      if (authState.isGoogleAuthenticated) {
        messages.push(`Google: ${googleSuccess}/${total}`);
      }

      const allSuccess =
        (authState.isMicrosoftAuthenticated ? msSuccess === total : true) &&
        (authState.isGoogleAuthenticated ? googleSuccess === total : true);

      if (allSuccess) {
        setTasks([]);
      } else {
        const summary = `${messages.join(', ')} 성공`;
        setErrorMsg(
          msExpired
            ? `Microsoft 로그인이 만료되었습니다. 다시 로그인 후 전송해주세요. (${summary})`
            : summary
        );
      }
    } catch (error) {
      console.error('작업 전송 실패:', error);
      setErrorMsg('작업을 전송하는 중 오류가 발생했습니다.');
    } finally {
      setIsSending(false);
    }
  };

  const isImageFile = (file: File) => file.type.startsWith('image/');

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
          <section className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/50 dark:border-slate-800/50 p-3 space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {/* Text Input */}
              <div className="flex flex-col h-full">
                <label className="mb-2 flex items-center">
                  <MessageSquare className="w-4 h-4 text-slate-400 dark:text-slate-600" />
                </label>
                <textarea
                  className="flex-1 min-h-[12rem] w-full p-3 bg-slate-50 dark:bg-slate-950 border border-slate-200/50 dark:border-slate-800/50 rounded-lg focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-700 focus:border-transparent outline-none resize-none text-sm leading-relaxed placeholder:text-slate-400 dark:placeholder:text-slate-600"
                  placeholder="여기에 입력"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                />
              </div>

              {/* File Input */}
              <div className="flex flex-col h-full">
                <label className="mb-2 flex items-center">
                  <Camera className="w-4 h-4 text-slate-400 dark:text-slate-600" />
                </label>
                <div className="relative flex-1 min-h-[12rem] flex flex-col">
                  <div
                    className={`flex-1 border border-dashed rounded-lg p-3 transition-colors ${
                      attachments.length > 0
                        ? 'border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900'
                        : 'border-slate-200 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                  >
                    {attachments.length > 0 ? (
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                        {attachments.map((att) => (
                          <div
                            key={att.id}
                            className="relative aspect-square group/item"
                          >
                            <div className="w-full h-full rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-center">
                              {isImageFile(att.file) ? (
                                <img
                                  src={att.previewUrl}
                                  alt="Preview"
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="flex flex-col items-center justify-center p-2 text-center">
                                  <Upload className="w-8 h-8 text-slate-400 mb-1" />
                                  <span className="text-[10px] text-slate-500 truncate w-full px-1">
                                    {att.file.name}
                                  </span>
                                </div>
                              )}
                            </div>
                            <button
                              onClick={(e) => {
                                e.preventDefault();
                                handleRemoveAttachment(att.id);
                              }}
                              className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full p-1 shadow-md hover:bg-red-600 transition-colors opacity-100 sm:opacity-0 sm:group-hover/item:opacity-100"
                            >
                              <X className="w-3 h-3" />
                            </button>
                          </div>
                        ))}
                        <div
                          onClick={() => fileInputRef.current?.click()}
                          className="aspect-square rounded-lg border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-indigo-400 hover:bg-white dark:hover:bg-slate-800 flex flex-col items-center justify-center cursor-pointer text-slate-400 hover:text-indigo-500 transition-colors"
                        >
                          <Plus className="w-6 h-6 mb-1" />
                          <span className="text-xs font-bold">추가</span>
                        </div>
                      </div>
                    ) : (
                      <div className="h-full flex items-center justify-center">
                        <button
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            cameraInputRef.current?.click();
                          }}
                          className="p-3 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors z-10"
                        >
                          <Camera className="w-10 h-10 text-slate-400 dark:text-slate-600" />
                        </button>
                      </div>
                    )}
                    <input
                      ref={fileInputRef}
                      type="file"
                      multiple
                      onChange={handleFileChange}
                      className={`absolute inset-0 w-full h-full opacity-0 cursor-pointer ${
                        attachments.length > 0 ? 'hidden' : 'z-0'
                      }`}
                    />
                  </div>
                  <input
                    type="file"
                    ref={cameraInputRef}
                    accept="image/*"
                    capture="environment"
                    onChange={handleCameraCapture}
                    className="hidden"
                  />
                </div>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2">
              {(inputText || attachments.length > 0) && (
                <button
                  onClick={handleClear}
                  className="p-2 text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
                  title="초기화"
                >
                  <X className="w-4 h-4" />
                </button>
              )}
              <button
                onClick={handleAnalyze}
                disabled={status === AnalysisStatus.ANALYZING}
                className="p-2 bg-slate-900 dark:bg-slate-100 hover:bg-slate-800 dark:hover:bg-slate-200 disabled:bg-slate-400 text-white dark:text-slate-900 rounded-lg transition-colors flex items-center justify-center"
                title={status === AnalysisStatus.ANALYZING ? "분석 중..." : "분석하기"}
              >
                {status === AnalysisStatus.ANALYZING ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Sparkles className="w-4 h-4" />
                )}
              </button>
            </div>

            {errorMsg && (
              <div className="p-3 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-xs rounded-lg border border-red-100 dark:border-red-900/30">
                {errorMsg}
              </div>
            )}
          </section>

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
      </div>
    </div>
  );
};

export default App;
