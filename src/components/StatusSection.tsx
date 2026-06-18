import React from 'react';
import { WorkdayCountdown, MonthlyWorkdayStats } from '../services/workdayService';

interface Props {
  countdown: WorkdayCountdown | null;
  monthlyStats: MonthlyWorkdayStats | null;
}

const statusStyle: Record<string, string> = {
  '목표 달성': 'text-emerald-500 dark:text-emerald-400',
  '도전중':   'text-amber-500 dark:text-amber-400',
  '달성 실패': 'text-red-500 dark:text-red-400',
};

const StatusSection: React.FC<Props> = ({ countdown, monthlyStats }) => {
  if (!countdown && !monthlyStats) return null;

  return (
    <div className="space-y-2">
      {/* 방학알림 */}
      {countdown && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/50 dark:border-slate-800/50 px-4 py-2.5 flex items-center gap-2">
          <span className="text-xs text-slate-400 dark:text-slate-600 flex-shrink-0">방학알림</span>
          <span className="text-xs font-medium text-indigo-500 dark:text-indigo-400">
            {countdown.message}
          </span>
        </div>
      )}

      {/* 정액분 */}
      {monthlyStats && (
        <div className="bg-white dark:bg-slate-900 rounded-lg border border-slate-200/50 dark:border-slate-800/50 px-4 py-2.5 space-y-1">
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-600 dark:text-slate-400">이번 달 정액분</span>
            <span className={`font-semibold ${statusStyle[monthlyStats.status]}`}>
              {monthlyStats.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-500">
            <span>
              현재 근무일{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                ({monthlyStats.currentWorkdays})
              </span>
            </span>
            <span>
              근무 가능일:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                ({monthlyStats.availableWorkdays})
              </span>
            </span>
            <span>
              복무 사용일{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                ({monthlyStats.leaveUsed})
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatusSection;
