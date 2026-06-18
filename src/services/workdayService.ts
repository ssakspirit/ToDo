import { ScheduleTask } from './todoService';
import { getHolidayDatesInRange } from './holidayService';

export interface WorkdayCountdown {
  message: string;
  daysLeft: number | null;
}

function toDateOnly(dtString: string): Date {
  const d = new Date(dtString);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function dateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

function isWeekday(d: Date): boolean {
  const dow = d.getDay();
  return dow !== 0 && dow !== 6;
}

// 특정 제목의 첫 번째 할 일 날짜 반환
function getDate(tasks: ScheduleTask[], title: string): Date | null {
  const task = tasks.find((t) => t.title === title && t.dueDateTime);
  if (!task) return null;
  return toDateOnly(task.dueDateTime!);
}

// 특정 제목의 모든 할 일 날짜 반환
function getDates(tasks: ScheduleTask[], title: string): Date[] {
  return tasks
    .filter((t) => t.title === title && t.dueDateTime)
    .map((t) => toDateOnly(t.dueDateTime!));
}

export interface MonthlyWorkdayStats {
  currentWorkdays: number;   // 현재 근무일 (오늘까지 실제 정상근무)
  availableWorkdays: number; // 근무 가능일 (남은 평일)
  leaveUsed: number;         // 복무 사용일 (조퇴/지각/연가/병가 등)
  status: '목표 달성' | '도전중' | '달성 실패';
}

export async function getMonthlyWorkdayStats(tasks: ScheduleTask[]): Promise<MonthlyWorkdayStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = today.getFullYear();
  const month = today.getMonth();
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  const nationalHolidays = await getHolidayDatesInRange(monthStart, monthEnd);

  const closureDates = new Set(
    getDates(tasks, '휴업')
      .filter((d) => d.getFullYear() === year && d.getMonth() === month)
      .map(dateKey)
  );

  const LEAVE_TITLES = ['연가', '병가', '조퇴', '지각', '병조퇴', '병지각'];
  const leaveDateSet = new Set<string>();
  LEAVE_TITLES.forEach((title) => {
    getDates(tasks, title)
      .filter((d) => d.getFullYear() === year && d.getMonth() === month)
      .forEach((d) => leaveDateSet.add(dateKey(d)));
  });

  const summerStart = getDate(tasks, '여름방학시작');
  const summerEnd   = getDate(tasks, '여름방학종료');
  const winterStart = getDate(tasks, '겨울방학시작');
  const winterEnd   = getDate(tasks, '겨울방학종료');

  const isVacation = (d: Date): boolean => {
    if (summerStart && summerEnd && d >= summerStart && d <= summerEnd) return true;
    if (winterStart && winterEnd && d >= winterStart && d <= winterEnd) return true;
    return false;
  };

  const isScheduledDay = (d: Date): boolean =>
    isWeekday(d) &&
    !nationalHolidays.has(dateKey(d)) &&
    !closureDates.has(dateKey(d)) &&
    !isVacation(d);

  // 오늘까지: 실제 정상근무일 + 복무사용일 계산
  let currentWorkdays = 0;
  let leaveUsed = 0;
  let cur = new Date(monthStart);
  while (cur <= today) {
    if (isScheduledDay(cur)) {
      if (leaveDateSet.has(dateKey(cur))) leaveUsed++;
      else currentWorkdays++;
    }
    cur = addDays(cur, 1);
  }

  // 내일부터 월말까지: 근무 가능일
  let availableWorkdays = 0;
  cur = addDays(today, 1);
  while (cur <= monthEnd) {
    if (isScheduledDay(cur)) availableWorkdays++;
    cur = addDays(cur, 1);
  }

  const TARGET = 15;
  const status: MonthlyWorkdayStats['status'] =
    currentWorkdays >= TARGET
      ? '목표 달성'
      : currentWorkdays + availableWorkdays >= TARGET
      ? '도전중'
      : '달성 실패';

  return { currentWorkdays, availableWorkdays, leaveUsed, status };
}

export async function getWorkdayCountdown(tasks: ScheduleTask[]): Promise<WorkdayCountdown> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const summerStart = getDate(tasks, '여름방학시작');
  const summerEnd   = getDate(tasks, '여름방학종료');
  const winterStart = getDate(tasks, '겨울방학시작');
  const winterEnd   = getDate(tasks, '겨울방학종료');

  const closureDates = new Set([
    ...getDates(tasks, '휴업').map(dateKey),
  ]);

  // 현재 위치 파악 및 다음 방학 결정
  let nextVacationStart: Date | null = null;
  let vacationName = '';
  let vacationEmoji = '';

  if (summerStart && today < summerStart) {
    // 여름방학 이전 → 여름방학까지 카운트
    nextVacationStart = summerStart;
    vacationName = '여름방학';
    vacationEmoji = '🏖️';
  } else if (summerStart && summerEnd && today >= summerStart && today <= summerEnd) {
    // 여름방학 중
    return { message: '여름방학 중입니다! 🏖️', daysLeft: null };
  } else if (summerEnd && winterStart && today > summerEnd && today < winterStart) {
    // 여름방학 종료 후, 겨울방학 이전 → 겨울방학까지 카운트
    nextVacationStart = winterStart;
    vacationName = '겨울방학';
    vacationEmoji = '❄️';
  } else if (winterStart && winterEnd && today >= winterStart && today <= winterEnd) {
    // 겨울방학 중
    return { message: '겨울방학 중입니다! ❄️', daysLeft: null };
  } else if (winterEnd && today > winterEnd) {
    // 겨울방학 종료 후 (새 학년) → 다음 여름방학 날짜를 모름
    return { message: '다음 방학 일정을 불러올 수 없습니다', daysLeft: null };
  } else {
    return { message: '방학 일정을 찾을 수 없습니다', daysLeft: null };
  }

  // 방학 전날까지 남은 출근일 계산
  const lastSchoolDay = addDays(nextVacationStart, -1);

  if (today > lastSchoolDay) {
    return { message: `${vacationName} 시작입니다! ${vacationEmoji}`, daysLeft: 0 };
  }

  // 해당 기간의 공휴일 가져오기
  const nationalHolidays = await getHolidayDatesInRange(today, lastSchoolDay);

  // 출근일 카운트: 평일 - 공휴일 - 휴업일
  let count = 0;
  let cur = new Date(today);
  while (cur <= lastSchoolDay) {
    if (
      isWeekday(cur) &&
      !nationalHolidays.has(dateKey(cur)) &&
      !closureDates.has(dateKey(cur))
    ) {
      count++;
    }
    cur = addDays(cur, 1);
  }

  return {
    message: `${vacationName}까지 ${count}일만 더 출근하자! ${vacationEmoji}`,
    daysLeft: count,
  };
}
