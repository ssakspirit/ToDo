import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { ChevronLeft, ChevronRight, Check, RefreshCw } from 'lucide-react';
import { ScheduleTask, TodoTask, completeTask } from '../services/todoService';
import {
  MonthlyWorkdayStats,
  MonthOverview,
  DayInfo,
  getMonthlyWorkdayStats,
  getMonthOverview,
  getMonthCalendarData,
} from '../services/workdayService';

interface Props {
  scheduleTasks: ScheduleTask[];
  todoTasks: TodoTask[];
  onTaskComplete: (id: string) => void;
  onRefresh: () => Promise<void>;
}

const DAY_HEADERS = ['일', '월', '화', '수', '목', '금', '토'];
const DAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

const card = 'bg-white dark:bg-slate-900 rounded-lg border border-slate-200/50 dark:border-slate-800/50';

const statusStyle: Record<string, string> = {
  '목표 달성': 'text-emerald-500 dark:text-emerald-400',
  '도전중': 'text-amber-500 dark:text-amber-400',
  '달성 실패': 'text-red-500 dark:text-red-400',
};

const typeColorMap: Record<KeyEvent['type'], string> = {
  holiday: 'text-red-500 dark:text-red-400',
  vacation: 'text-indigo-500 dark:text-indigo-400',
  closure: 'text-amber-500 dark:text-amber-400',
};

type KeyEvent = { name: string; date: Date; type: 'holiday' | 'vacation' | 'closure' };

function dateKey(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function getDayTextColor(info: DayInfo | undefined, col: number): string {
  if (!info) return '';
  switch (info.type) {
    case 'holiday':  return 'text-red-500 dark:text-red-400';
    case 'vacation': return 'text-indigo-500 dark:text-indigo-400';
    case 'closure':  return 'text-amber-500 dark:text-amber-400';
    case 'leave':    return 'text-orange-500 dark:text-orange-400';
    case 'weekend':
      return col === 0 ? 'text-red-400 dark:text-red-500' : 'text-blue-400 dark:text-blue-500';
    default:
      return 'text-slate-700 dark:text-slate-300';
  }
}

function getEventLabelColor(info: DayInfo): string {
  switch (info.type) {
    case 'holiday':  return 'text-red-400 dark:text-red-500';
    case 'vacation': return 'text-indigo-400 dark:text-indigo-500';
    case 'closure':  return 'text-amber-400 dark:text-amber-500';
    case 'leave':    return 'text-orange-400 dark:text-orange-500';
    case 'weekend':  return 'text-red-400 dark:text-red-500';
    default:         return 'text-slate-400';
  }
}

interface TaskListProps {
  title: string;
  tasks: TodoTask[];
  completingIds: Set<string>;
  onComplete: (t: TodoTask) => void;
  card: string;
}

const TaskList: React.FC<TaskListProps> = ({ title, tasks, completingIds, onComplete, card }) => (
  <div className={`${card} px-4 py-3`}>
    <p className="text-xs font-medium text-slate-500 dark:text-slate-400 mb-2">{title}</p>
    <ul className="space-y-2">
      {tasks.map((t) => {
        const completing = completingIds.has(t.id);
        return (
          <li key={t.id} className={`flex items-start gap-2 text-xs transition-opacity duration-300 ${completing ? 'opacity-40' : 'opacity-100'}`}>
            <button
              onClick={() => onComplete(t)}
              disabled={completing}
              className={`flex-shrink-0 mt-px w-4 h-4 rounded-full border-2 flex items-center justify-center transition-all
                ${completing
                  ? 'border-emerald-500 bg-emerald-500'
                  : 'border-slate-300 dark:border-slate-600 hover:border-emerald-400 dark:hover:border-emerald-500'
                }`}
            >
              {completing && <Check className="w-2.5 h-2.5 text-white" strokeWidth={3} />}
            </button>
            <div className="flex flex-col min-w-0">
              <span className="text-slate-700 dark:text-slate-300 leading-snug">{t.title}</span>
              <span className="text-slate-400 dark:text-slate-600 text-[10px]">{t.listName}</span>
            </div>
          </li>
        );
      })}
    </ul>
  </div>
);

const StatusSection: React.FC<Props> = ({ scheduleTasks, todoTasks, onTaskComplete, onRefresh }) => {
  const now = new Date();
  now.setHours(0, 0, 0, 0);

  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1); // 1-12
  const [calendarData, setCalendarData] = useState<Map<string, DayInfo>>(new Map());
  const [overview, setOverview] = useState<MonthOverview | null>(null);
  const [stats, setStats] = useState<MonthlyWorkdayStats | null>(null);
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [completingIds, setCompletingIds] = useState<Set<string>>(new Set());
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }, [refreshing, onRefresh]);

  const handleComplete = useCallback(async (task: TodoTask) => {
    if (completingIds.has(task.id)) return;
    setCompletingIds((prev) => new Set(prev).add(task.id));
    try {
      await completeTask(task.listId, task.id);
      setTimeout(() => {
        onTaskComplete(task.id);
        setCompletingIds((prev) => { const s = new Set(prev); s.delete(task.id); return s; });
      }, 600);
    } catch (e) {
      console.error('완료 처리 실패:', e);
      setCompletingIds((prev) => { const s = new Set(prev); s.delete(task.id); return s; });
    }
  }, [completingIds, onTaskComplete]);

  const tasksByDate = useMemo(() => {
    const map = new Map<string, TodoTask[]>();
    todoTasks.forEach((t) => {
      if (!t.dueDate) return;
      if (!map.has(t.dueDate)) map.set(t.dueDate, []);
      map.get(t.dueDate)!.push(t);
    });
    return map;
  }, [todoTasks]);

  const noDateTasks = useMemo(
    () => todoTasks.filter((t) => !t.dueDate),
    [todoTasks]
  );

  const load = useCallback(
    async (year: number, month: number) => {
      setLoading(true);
      try {
        const [cal, ov, st] = await Promise.all([
          getMonthCalendarData(scheduleTasks, year, month),
          getMonthOverview(scheduleTasks, year, month),
          getMonthlyWorkdayStats(scheduleTasks, year, month),
        ]);
        setCalendarData(cal);
        setOverview(ov);
        setStats(st);
      } catch (e) {
        console.error('월 데이터 로드 실패:', e);
      } finally {
        setLoading(false);
      }
    },
    [scheduleTasks]
  );

  useEffect(() => {
    if (scheduleTasks.length > 0) load(viewYear, viewMonth);
  }, [load, viewYear, viewMonth, scheduleTasks]);

  if (scheduleTasks.length === 0) return null;

  const prevMonth = () => {
    if (viewMonth === 1) { setViewYear((y) => y - 1); setViewMonth(12); }
    else setViewMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (viewMonth === 12) { setViewYear((y) => y + 1); setViewMonth(1); }
    else setViewMonth((m) => m + 1);
  };

  const isCurrentMonth =
    viewYear === now.getFullYear() && viewMonth === now.getMonth() + 1;
  const todayKey = dateKey(now.getFullYear(), now.getMonth() + 1, now.getDate());

  // Build 7-column calendar grid
  const firstDow = new Date(viewYear, viewMonth - 1, 1).getDay(); // 0=Sun
  const daysInMonth = new Date(viewYear, viewMonth, 0).getDate();
  const cells: (number | null)[] = [
    ...Array(firstDow).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="space-y-2">
      {/* Calendar card */}
      <div className={`${card} px-3 py-2.5`}>
        {/* Month navigation */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center">
            <button
              onClick={prevMonth}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
          </div>
          <div className="text-center">
            <span className="text-base font-bold text-slate-800 dark:text-slate-100">
              {viewMonth}월
            </span>
            {isCurrentMonth ? (
              <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">
                {now.getDate()}일 ({DAY_KR[now.getDay()]})
              </span>
            ) : (
              <span className="ml-2 text-xs text-slate-400 dark:text-slate-600">
                {viewYear}년
              </span>
            )}
          </div>
          <div className="flex items-center">
            <button
              onClick={nextMonth}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={handleRefresh}
              disabled={refreshing}
              className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors ml-0.5"
              title="새로고침"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Weekday headers */}
        <div className="grid grid-cols-7 mb-0.5">
          {DAY_HEADERS.map((d, i) => (
            <div
              key={d}
              className={`text-center text-[10px] font-medium py-0.5 ${
                i === 0
                  ? 'text-red-400'
                  : i === 6
                  ? 'text-blue-400'
                  : 'text-slate-400 dark:text-slate-600'
              }`}
            >
              {d}
            </div>
          ))}
        </div>

        {/* Day cells — keep previous data visible while loading; just dim */}
        <div className={`grid grid-cols-7 transition-opacity duration-200 ${loading ? 'opacity-40' : 'opacity-100'}`}>
          {cells.map((day, idx) => {
              if (!day) return <div key={idx} className="py-2" />;

              const col = idx % 7;
              const k = dateKey(viewYear, viewMonth, day);
              const info = calendarData.get(k);
              const isToday = k === todayKey;
              const textColor = getDayTextColor(info, col);
              const events = info?.events ?? [];
              const taskCount = tasksByDate.get(k)?.length ?? 0;
              const isSelected = k === selectedDate;

              return (
                <div
                  key={idx}
                  className={`flex flex-col items-center py-2 rounded cursor-pointer transition-colors
                    ${isSelected
                      ? 'bg-slate-100 dark:bg-slate-800'
                      : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  title={events.join(' · ')}
                  onClick={() => setSelectedDate(isSelected ? null : k)}
                >
                  <span
                    className={`text-xs font-medium leading-tight flex items-center justify-center rounded-full
                      ${isToday
                        ? 'w-5 h-5 bg-slate-800 dark:bg-slate-200 text-white dark:text-slate-900 text-[10px]'
                        : textColor
                      }`}
                  >
                    {day}
                  </span>
                  {events.length > 0 && info && (
                    <span
                      className={`text-[9px] leading-tight text-center w-full px-px truncate ${getEventLabelColor(info)}`}
                    >
                      {events[0].length > 3 ? events[0].slice(0, 3) + '…' : events[0]}
                    </span>
                  )}
                  {taskCount > 0 && (
                    <span className="text-[9px] font-semibold text-blue-500 dark:text-blue-400 leading-tight">
                      {taskCount}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

        {/* Legend */}
        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-2 pt-1.5 border-t border-slate-100 dark:border-slate-800">
          {[
            { cls: 'text-red-400',    label: '공휴일' },
            { cls: 'text-indigo-400', label: '방학' },
            { cls: 'text-amber-400',  label: '휴업' },
            { cls: 'text-orange-400', label: '연가' },
          ].map(({ cls, label }) => (
            <span key={label} className={`text-[10px] ${cls} flex items-center gap-0.5`}>
              <span className="inline-block w-1.5 h-1.5 rounded-full bg-current" />
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* 주요 일정 */}
      {overview && (
        <div className={`${card} px-4 py-2.5`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-medium text-slate-500 dark:text-slate-500 flex-shrink-0">
              주요 일정
            </span>
            {overview.keyEvents.length === 0 ? (
              <span className="text-slate-400 dark:text-slate-600">이달 특이 일정 없음</span>
            ) : (
              overview.keyEvents.map((ev, i) => {
                const d = ev.date;
                const label = `${d.getMonth() + 1}/${d.getDate()}(${DAY_KR[d.getDay()]})`;
                return (
                  <span key={i} className={`flex-shrink-0 ${typeColorMap[ev.type as keyof typeof typeColorMap]}`}>
                    {label} {ev.name}
                  </span>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* 정액분 */}
      {stats && (
        <div className={`${card} px-4 py-2.5 space-y-1`}>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-600 dark:text-slate-400">이번 달 정액분</span>
            <span className={`font-semibold ${statusStyle[stats.status]}`}>
              {stats.status}
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-500">
            <span>
              현재 근무일{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                ({stats.currentWorkdays})
              </span>
            </span>
            <span>
              근무 가능일:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                ({stats.availableWorkdays})
              </span>
            </span>
            <span>
              복무 사용일{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                ({stats.leaveUsed})
              </span>
            </span>
            <span>
              복무 사용 가능일{' '}
              <span
                className={`font-semibold ${
                  stats.availableLeave === 0
                    ? 'text-red-500 dark:text-red-400'
                    : 'text-sky-500 dark:text-sky-400'
                }`}
              >
                ({stats.availableLeave})
              </span>
            </span>
          </div>
        </div>
      )}

      {/* 선택 날짜 작업 목록 */}
      {selectedDate && tasksByDate.has(selectedDate) && (() => {
        const [sy, sm, sd] = selectedDate.split('-').map(Number);
        const selDate = new Date(sy, sm - 1, sd);
        const label = `${sm}월 ${sd}일 (${DAY_KR[selDate.getDay()]}) 기한 작업`;
        return <TaskList title={label} tasks={tasksByDate.get(selectedDate)!} completingIds={completingIds} onComplete={handleComplete} card={card} />;
      })()}

      {/* 기한 없는 작업 */}
      {noDateTasks.length > 0 && (
        <TaskList title="기한 없는 작업" tasks={noDateTasks} completingIds={completingIds} onComplete={handleComplete} card={card} />
      )}
    </div>
  );
};

export default StatusSection;
