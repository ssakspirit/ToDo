import React, { useState } from 'react';
import { X } from 'lucide-react';
import { TodoList } from '../services/todoService';
import { AppSettings } from '../services/settingsService';

interface SettingsPanelProps {
  todoLists: TodoList[];
  settings: AppSettings;
  onSave: (settings: AppSettings) => void;
  onClose: () => void;
}

// 학사일정 목록·제외 목록 설정 (이 기기에만 저장)
const SettingsPanel: React.FC<SettingsPanelProps> = ({ todoLists, settings, onSave, onClose }) => {
  const [scheduleListName, setScheduleListName] = useState(settings.scheduleListName);
  const [excluded, setExcluded] = useState(new Set(settings.excludedLists));

  const listNames = todoLists.map((l) => l.displayName);
  // 설정된 목록이 지금 To Do에 없어도 선택지에 남겨 값이 사라지지 않게 함
  const scheduleOptions = listNames.includes(scheduleListName) ? listNames : [scheduleListName, ...listNames];

  const toggleExcluded = (name: string) => {
    setExcluded((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleSave = () => {
    onSave({
      scheduleListName,
      // 지금 없는 목록 이름도 유지 (나중에 다시 생길 수 있음), 학사일정 목록은 제외 대상에서 뺌
      excludedLists: [...excluded].filter((name) => name !== scheduleListName),
    });
  };

  return (
    <div className="fixed inset-0 z-30 bg-black/40 flex items-center justify-center p-4" onClick={onClose}>
      <div
        role="dialog"
        aria-label="설정"
        className="w-full max-w-sm max-h-[80vh] overflow-y-auto bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 p-4 space-y-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-medium text-slate-700 dark:text-slate-200">설정</h2>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300" title="닫기">
            <X className="w-4 h-4" />
          </button>
        </div>

        <label className="block space-y-1">
          <span className="text-xs text-slate-500 dark:text-slate-400">학사일정·복무 목록</span>
          <select
            value={scheduleListName}
            onChange={(e) => setScheduleListName(e.target.value)}
            className="w-full px-2 py-1.5 text-xs bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 rounded focus:outline-none focus:ring-1 focus:ring-slate-300 dark:focus:ring-slate-600"
          >
            {scheduleOptions.map((name) => (
              <option key={name} value={name}>
                {listNames.includes(name) ? name : `${name} (없음)`}
              </option>
            ))}
          </select>
          <span className="block text-[10px] text-slate-400 dark:text-slate-500">
            휴업·연가·방학 등 키워드를 읽어 달력과 정액분을 계산하는 목록
          </span>
        </label>

        <fieldset className="space-y-1">
          <legend className="text-xs text-slate-500 dark:text-slate-400">달력·작업 목록에서 제외할 목록</legend>
          <div className="space-y-1 pt-1">
            {listNames
              .filter((name) => name !== scheduleListName)
              .map((name) => (
                <label key={name} className="flex items-center gap-2 text-xs text-slate-700 dark:text-slate-300">
                  <input type="checkbox" checked={excluded.has(name)} onChange={() => toggleExcluded(name)} />
                  {name}
                </label>
              ))}
          </div>
        </fieldset>

        <p className="text-[10px] text-slate-400 dark:text-slate-500">이 기기에만 저장됩니다.</p>

        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="px-3 py-1.5 text-xs text-slate-500 hover:text-slate-700 dark:hover:text-slate-300">
            취소
          </button>
          <button
            onClick={handleSave}
            className="px-3 py-1.5 text-xs bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 rounded hover:bg-slate-800 dark:hover:bg-slate-200"
          >
            저장
          </button>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
