import React, { useState } from 'react';
import { AnalyzedTask, TaskDetails } from '../types';
import { Trash2, Calendar, AlertCircle, Pencil, Check, X } from 'lucide-react';
import { format, parseISO, isValid } from 'date-fns';
import { splitDueDateTime, buildSchedule } from '../utils/taskEdit';

interface TaskCardProps {
  task: AnalyzedTask;
  onDelete: () => void;
  onUpdate: (patch: Partial<TaskDetails>) => void;
}

const inputClass =
  'w-full px-2 py-1 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600';

const TaskCard: React.FC<TaskCardProps> = ({ task, onDelete, onUpdate }) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({ title: '', body: '', date: '', time: '' });

  const formatDateTime = (isoString?: string) => {
    if (!isoString) return null;
    const date = parseISO(isoString);
    return isValid(date) ? format(date, 'yyyy-MM-dd HH:mm') : null;
  };

  const startEdit = () => {
    setDraft({ title: task.title, body: task.body, ...splitDueDateTime(task.dueDateTime) });
    setEditing(true);
  };

  const saveEdit = () => {
    onUpdate({ title: draft.title.trim() || task.title, body: draft.body, ...buildSchedule(draft.date, draft.time) });
    setEditing(false);
  };

  // 부분 실패 후 남은 작업: 이미 보낸 서비스 표시
  const sentLabels = [
    task.sentTo?.microsoft && 'Microsoft',
    task.sentTo?.google && 'Google',
  ].filter(Boolean) as string[];

  if (editing) {
    return (
      <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-300 dark:border-slate-700 p-3 space-y-2 transition-colors">
        <input
          className={`${inputClass} text-sm font-medium`}
          value={draft.title}
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          placeholder="#필수태그 #추가태그 내용"
          aria-label="제목"
        />
        <div className="flex gap-2">
          <input
            type="date"
            className={inputClass}
            value={draft.date}
            onChange={(e) => setDraft({ ...draft, date: e.target.value })}
            aria-label="기한 날짜"
          />
          <input
            type="time"
            className={inputClass}
            value={draft.time}
            onChange={(e) => setDraft({ ...draft, time: e.target.value })}
            aria-label="시간 (비우면 종일)"
            title="비우면 종일 일정"
          />
        </div>
        <textarea
          className={`${inputClass} min-h-[4rem] resize-y leading-relaxed`}
          value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })}
          aria-label="노트"
        />
        {sentLabels.length > 0 && (
          <p className="text-[10px] text-amber-600 dark:text-amber-400">
            이미 {sentLabels.join('·')}에 보낸 내용에는 수정이 반영되지 않습니다.
          </p>
        )}
        <div className="flex justify-end gap-1">
          <button
            onClick={() => setEditing(false)}
            className="p-1.5 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            title="취소"
          >
            <X className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={saveEdit}
            className="p-1.5 text-emerald-500 hover:text-emerald-600 transition-colors"
            title="저장"
          >
            <Check className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

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
          onClick={startEdit}
          className="p-1 text-slate-400 dark:text-slate-600 hover:text-slate-600 dark:hover:text-slate-400 transition-colors"
          title="수정"
        >
          <Pencil className="w-3 h-3" />
        </button>
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
        {sentLabels.length > 0 && (
          <span className="ml-auto text-[10px] text-emerald-600 dark:text-emerald-400">
            {sentLabels.join('·')} 전송됨
          </span>
        )}
      </div>

    </div>
  );
};

export default TaskCard;
