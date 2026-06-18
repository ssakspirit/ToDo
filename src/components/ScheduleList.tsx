import React from 'react';
import { Calendar, RefreshCw, Loader2, AlertCircle } from 'lucide-react';
import { ScheduleTask } from '../services/todoService';

interface Props {
  tasks: ScheduleTask[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

const formatDueDate = (dateTime?: string): string => {
  if (!dateTime) return '';
  const d = new Date(dateTime);
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const days = ['일', '월', '화', '수', '목', '금', '토'];
  return `${month}/${day}(${days[d.getDay()]})`;
};

const isDueSoon = (dateTime?: string): boolean => {
  if (!dateTime) return false;
  const diff = new Date(dateTime).getTime() - Date.now();
  return diff >= 0 && diff <= 7 * 24 * 60 * 60 * 1000;
};

const isOverdue = (dateTime?: string): boolean => {
  if (!dateTime) return false;
  return new Date(dateTime).getTime() < Date.now();
};

const ScheduleList: React.FC<Props> = ({ tasks, isLoading, error, onRefresh }) => {
  return (
    <section className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/50 dark:border-slate-800/50 p-3">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Calendar className="w-4 h-4 text-slate-400 dark:text-slate-600" />
          <span className="text-xs font-medium text-slate-600 dark:text-slate-400">학사일정복무</span>
          {!isLoading && tasks.length > 0 && (
            <span className="text-xs text-slate-400 dark:text-slate-600">({tasks.length})</span>
          )}
        </div>
        <button
          onClick={onRefresh}
          disabled={isLoading}
          className="p-1 text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors disabled:opacity-50"
          title="새로고침"
        >
          {isLoading ? (
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
          ) : (
            <RefreshCw className="w-3.5 h-3.5" />
          )}
        </button>
      </div>

      {error && (
        <div className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-900/20 rounded-lg text-xs text-red-500 dark:text-red-400">
          <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
          {error}
        </div>
      )}

      {!isLoading && !error && tasks.length === 0 && (
        <p className="text-xs text-slate-400 dark:text-slate-600 text-center py-4">
          완료되지 않은 일정이 없습니다
        </p>
      )}

      {tasks.length > 0 && (
        <ul className="space-y-1.5">
          {tasks.map((task) => {
            const overdue = isOverdue(task.dueDateTime);
            const soon = !overdue && isDueSoon(task.dueDateTime);
            return (
              <li
                key={task.id}
                className="flex items-start justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
              >
                <span className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed flex-1 min-w-0 truncate">
                  {task.title}
                </span>
                {task.dueDateTime && (
                  <span
                    className={`text-xs flex-shrink-0 font-medium ${
                      overdue
                        ? 'text-red-500 dark:text-red-400'
                        : soon
                        ? 'text-amber-500 dark:text-amber-400'
                        : 'text-slate-400 dark:text-slate-600'
                    }`}
                  >
                    {formatDueDate(task.dueDateTime)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
};

export default ScheduleList;
