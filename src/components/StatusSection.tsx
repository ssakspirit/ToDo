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

  const today = new Date();
  const dayNum = today.getDate();
  const dayStr = DAY_KR[today.getDay()];

  return (
    <div className="space-y-2">
      {/* 월 표시 — 가운데 정렬, 작게, 날짜·요일 병기 */}
      {monthOverview && (
        <div className={`${card} px-4 py-2.5 flex items-baseline justify-center gap-2`}>
          <span className="text-2xl font-bold text-slate-800 dark:text-slate-100 tracking-tight">
            {monthOverview.month}월
          </span>
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {dayNum}일 ({dayStr})
          </span>
        </div>
      )}

      {/* 주요 일정 — 인라인 수평 나열 */}
      {monthOverview && (
        <div className={`${card} px-4 py-2.5`}>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            <span className="font-medium text-slate-500 dark:text-slate-500 flex-shrink-0">주요 일정</span>
            {monthOverview.keyEvents.length === 0 ? (
              <span className="text-slate-400 dark:text-slate-600">이번 달 특이 일정 없음</span>
            ) : (
              monthOverview.keyEvents.map((ev, i) => (
                <span key={i} className={`flex-shrink-0 ${typeStyle[ev.type]}`}>
                  {formatEventDate(ev.date)} {ev.name}
                </span>
              ))
            )}
          </div>
        </div>
      )}

      {/* 출근일 현황 — 인라인, 정액분과 동일 스타일 */}
      {monthOverview && (
        <div className={`${card} px-4 py-2.5`}>
          <div className="flex flex-wrap items-center gap-3 text-xs">
            <span className="font-medium text-slate-600 dark:text-slate-400 flex-shrink-0">출근일 현황</span>
            <span className="text-slate-500 dark:text-slate-500">
              출근일{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">({monthOverview.workdays})</span>
            </span>
            <span className="text-slate-500 dark:text-slate-500">
              휴일{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">({monthOverview.holidayCount})</span>
            </span>
            <span className="text-slate-500 dark:text-slate-500">
              방학{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">({monthOverview.vacationDays})</span>
            </span>
          </div>
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
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-500">
            <span>현재 근무일{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">({monthlyStats.currentWorkdays})</span>
            </span>
            <span>근무 가능일:{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">({monthlyStats.availableWorkdays})</span>
            </span>
            <span>복무 사용일{' '}
              <span className="font-medium text-slate-700 dark:text-slate-300">({monthlyStats.leaveUsed})</span>
            </span>
            <span>복무 사용 가능일{' '}
              <span className={`font-semibold ${monthlyStats.availableLeave === 0 ? 'text-red-500 dark:text-red-400' : 'text-sky-500 dark:text-sky-400'}`}>
                ({monthlyStats.availableLeave})
              </span>
            </span>
          </div>
        </div>
      )}
    </div>
  );
};

export default StatusSection;
