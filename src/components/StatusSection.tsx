import React from 'react';
import { MonthlyWorkdayStats, MonthOverview, KeyEvent } from '../services/workdayService';

interface Props {
  monthOverview: MonthOverview | null;
  monthlyStats: MonthlyWorkdayStats | null;
}

const DAY_KR = ['일', '월', '화', '수', '목', '금', '토'];

const formatEventDate = (d: Date): string =>
  `${d.getMonth() + 1}/${d.getDate()}(${DAY_KR[d.getDay()]})`;

const typeStyle: Record<KeyEvent['type'], string> = {
  holiday: 'text-red-500 dark:text-red-400',
  vacation: 'text-indigo-500 dark:text-indigo-400',
  closure: 'text-amber-500 dark:text-amber-400',
};

const statusStyle: Record<string, string> = {
  '목표 달성': 'text-emerald-500 dark:text-emerald-400',
  '도전중':   'text-amber-500 dark:text-amber-400',
  '달성 실패': 'text-red-500 dark:text-red-400',
};

const card = 'bg-white dark:bg-slate-900 rounded-lg border border-slate-200/50 dark:border-slate-800/50';

const StatusSection: React.FC<Props> = ({ monthOverview, monthlyStats }) => {
  if (!monthOverview && !monthlyStats) return null;

  return (
    <div className="space-y-2">
      {/* 월 표시 */}
      {monthOverview && (
        <div className={`${card} px-5 py-4 flex items-baseline justify-between`}>
          <span className="text-5xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            {monthOverview.month}월
          </span>
          <span className="text-sm text-slate-400 dark:text-slate-600">
            {monthOverview.year}
          </span>
        </div>
      )}

      {/* 주요 일정 */}
      {monthOverview && (
        <div className={`${card} px-4 py-3`}>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-500 mb-2">주요 일정</p>
          {monthOverview.keyEvents.length === 0 ? (
            <p className="text-xs text-slate-400 dark:text-slate-600">이번 달 특이 일정 없음</p>
          ) : (
            <ul className="space-y-1">
              {monthOverview.keyEvents.map((ev, i) => (
                <li key={i} className="flex items-center gap-2 text-xs">
                  <span className={`flex-shrink-0 font-medium ${typeStyle[ev.type]}`}>
                    {formatEventDate(ev.date)}
                  </span>
                  <span className="text-slate-700 dark:text-slate-300">{ev.name}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* 출근일 / 휴일 / 방학 */}
      {monthOverview && (
        <div className={`${card} px-4 py-3 grid grid-cols-3 divide-x divide-slate-100 dark:divide-slate-800`}>
          {[
            { label: '출근일', value: monthOverview.workdays },
            { label: '휴일', value: monthOverview.holidayCount },
            { label: '방학', value: monthOverview.vacationDays },
          ].map(({ label, value }) => (
            <div key={label} className="text-center px-2">
              <p className="text-xs text-slate-400 dark:text-slate-600 mb-0.5">{label}</p>
              <p className="text-xl font-semibold text-slate-700 dark:text-slate-300">
                ({value})
              </p>
            </div>
          ))}
        </div>
      )}

      {/* 정액분 */}
      {monthlyStats && (
        <div className={`${card} px-4 py-2.5 space-y-1`}>
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-600 dark:text-slate-400">이번 달 정액분</span>
            <span className={`font-semibold ${statusStyle[monthlyStats.status]}`}>
              {monthlyStats.status}
            </span>
          </div>
          <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-500">
            <span>현재 근무일{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                ({monthlyStats.currentWorkdays})
              </span>
            </span>
            <span>근무 가능일:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">
                ({monthlyStats.availableWorkdays})
              </span>
            </span>
            <span>복무 사용일{' '}
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
