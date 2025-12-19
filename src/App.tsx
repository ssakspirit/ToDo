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
import { analyzeContent } from './services/geminiService';
import { login, logout, getAccount, loginSilently } from './services/authService';
import {
  loginGoogle,
  loginGoogleSilently,
  logoutGoogle,
} from './services/googleAuthService';
import {
  getTodoLists,
  createTasksInBatch,
  TodoList,
} from './services/todoService';
import { createEventsInBatch } from './services/calendarService';
import TaskCard from './components/TaskCard';

interface Attachment {
  id: string;
  file: File;
  previewUrl: string;
}

const App: React.FC = () => {
  const [inputText, setInputText] = useState('');
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [status, setStatus] = useState<AnalysisStatus>(AnalysisStatus.IDLE);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [tasks, setTasks] = useState<AnalyzedTask[]>([]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [darkMode, setDarkMode] = useState(true);

  // Auth state
  const [authState, setAuthState] = useState<AuthState>({
    isAuthenticated: false,
    isMicrosoftAuthenticated: false,
    isGoogleAuthenticated: false,
  });

  // Todo lists
  const [todoLists, setTodoLists] = useState<TodoList[]>([]);
  const [selectedListId, setSelectedListId] = useState<string>('');
  const [isSending, setIsSending] = useState(false);

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
          newAuthState.isMicrosoftAuthenticated = true;
          newAuthState.userName = msAccount.name || undefined;
          newAuthState.userEmail = msAccount.username || undefined;
          loadTodoLists();
        }
      } catch (error) {
        console.error('Microsoft 인증 확인 실패:', error);
      }

      try {
        // Try Google silent login
        const googleAccount = await loginGoogleSilently();
        if (googleAccount) {
          newAuthState.isGoogleAuthenticated = true;
          newAuthState.googleUserName = googleAccount.name;
          newAuthState.googleUserEmail = googleAccount.email;
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
    } catch (error) {
      console.error('로그아웃 실패:', error);
    }
  };

  const processFiles = (files: FileList | File[]) => {
    const fileArray = Array.from(files);

    fileArray.forEach((file) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        setAttachments((prev) => [
          ...prev,
          {
            id: crypto.randomUUID(),
            file,
            previewUrl: reader.result as string,
          },
        ]);
      };
      reader.readAsDataURL(file);
    });
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
        mimeType: att.file.type,
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
    } catch (err) {
      console.error(err);
      setErrorMsg('내용을 분석하는 중 오류가 발생했습니다. 다시 시도해주세요.');
      setStatus(AnalysisStatus.ERROR);
    }
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

      // Send to both services in parallel
      const promises: Promise<any[]>[] = [];

      if (authState.isMicrosoftAuthenticated && selectedListId) {
        promises.push(createTasksInBatch(selectedListId, taskDetails));
      }

      if (authState.isGoogleAuthenticated) {
        promises.push(createEventsInBatch(taskDetails));
      }

      const results = await Promise.allSettled(promises);

      // Analyze results
      let msSuccess = 0;
      let msTotal = 0;
      let googleSuccess = 0;
      let googleTotal = 0;

      results.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          const successCount = result.value.filter((r: any) => r.success).length;
          const totalCount = result.value.length;

          if (index === 0 && authState.isMicrosoftAuthenticated) {
            msSuccess = successCount;
            msTotal = totalCount;
          } else if (
            (index === 0 && !authState.isMicrosoftAuthenticated) ||
            (index === 1 && authState.isMicrosoftAuthenticated)
          ) {
            googleSuccess = successCount;
            googleTotal = totalCount;
          }
        }
      });

      // User feedback
      const messages: string[] = [];
      if (authState.isMicrosoftAuthenticated) {
        messages.push(`Microsoft: ${msSuccess}/${msTotal}`);
      }
      if (authState.isGoogleAuthenticated) {
        messages.push(`Google: ${googleSuccess}/${googleTotal}`);
      }

      const allSuccess =
        (authState.isMicrosoftAuthenticated ? msSuccess === msTotal : true) &&
        (authState.isGoogleAuthenticated ? googleSuccess === googleTotal : true);

      if (allSuccess) {
        setTasks([]);
      } else {
        setErrorMsg(`${messages.join(', ')} 성공`);
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
              <h1 className="text-sm font-medium text-slate-600 dark:text-slate-400">
                To-Do
              </h1>
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
        </main>
      </div>
    </div>
  );
};

export default App;
