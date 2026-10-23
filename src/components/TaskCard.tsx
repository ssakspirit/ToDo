import React from 'react';
import { AnalyzedTask } from '../types';
import { Trash2, Calendar, AlertCircle } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';

interface TaskCardProps {
  task: AnalyzedTask;
  onDelete: () => void;
}

const TaskCard: React.FC<TaskCardProps> = ({ task, onDelete }) => {
  const formatDateTime = (isoString?: string) => {
    if (!isoString) return null;
    const date = parseISO(isoString);
    return isValid(date) ? format(date, 'yyyy-MM-dd HH:mm') : null;
  };


  return (
    <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/50 dark:border-slate-800/50 p-3 space-y-2 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-slate-900 dark:text-white">
            {task.title}
          </h3>
        </div>
        <button
          onClick={onDelete}
          className="p-1 text-slate-400 dark:text-slate-600 hover:text-red-500 transition-colors"
          title="삭제"
        >
          <Trash2 className="w-3 h-3" />
        </button>
      </div>

      {/* Body */}
      <div className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap line-clamp-2">
        {task.body.replace(/\*\*/g, '')}
      </div>

      {/* Date Info */}
      <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-500">
        {task.dueDateTime && (
          <div className="flex items-center gap-1">
            <Calendar className="w-3 h-3" />
            <span>{formatDateTime(task.dueDateTime)}</span>
          </div>
        )}
        {task.reminderDateTime && (
          <div className="flex items-center gap-1">
            <AlertCircle className="w-3 h-3" />
            <span>{formatDateTime(task.reminderDateTime)}</span>
          </div>
        )}
      </div>

    </div>
  );
};

export default TaskCard;
