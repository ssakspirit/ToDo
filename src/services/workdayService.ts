import { ScheduleTask } from './todoService';
import { getHolidayDatesInRange, getHolidayInfoInRange } from './holidayService';

export interface WorkdayCountdown {
  message: string;
  daysLeft: number | null;
  inVacation: boolean; // true일 때 daysLeft = 개학까지 남은 달력 일수
}

// '학사일정복무' 목록에서 제목이 정확히 일치해야 인식되는 키워드
// 복무 사용(정액분 근무일에서 제외되고 복무 사용일로 집계)
const LEAVE_TITLES = ['연가', '병가', '공가', '조퇴', '지각', '병조퇴', '병지각'];
// 출근 대상일에서 아예 제외
const CLOSURE_TITLE = '휴업';
const VACATION_LABELS: Record<string, string> = {
  '여름방학시작': '여름방학 시작',
  '여름방학종료': '여름방학 종료',
  '겨울방학시작': '겨울방학 시작',
  '겨울방학종료': '겨울방학 종료',
};

function toDateOnly(dtString: string): Date {
  // MS Graph returns dateTime in UTC without 'Z' suffix; add it so JS parses as UTC,
  // then extract the local date (KST). Without this, Korean users see dates shifted -1 day.
  const s =
    dtString.includes('Z') || /[+-]\d{2}:\d{2}$/.test(dtString)
      ? dtString
      : dtString + 'Z';
  const d = new Date(s);
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

function isInMonth(d: Date, year: number, month0: number): boolean {
  return d.getFullYear() === year && d.getMonth() === month0;
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

// 학사일정·복무 키워드를 한 번에 해석한 결과 (모든 계산 함수가 공유)
interface ScheduleContext {
  closureKeys: Set<string>;                // 휴업일 (YYYY-MM-DD)
  leaveTitlesByKey: Map<string, string[]>; // 날짜 → 그날의 복무 키워드 (LEAVE_TITLES 순서)
  summerStart: Date | null;
  summerEnd: Date | null;
  winterStart: Date | null;
  winterEnd: Date | null;
  isVacation: (d: Date) => boolean;
}

function buildScheduleContext(tasks: ScheduleTask[]): ScheduleContext {
  const closureKeys = new Set(getDates(tasks, CLOSURE_TITLE).map(dateKey));

  const leaveTitlesByKey = new Map<string, string[]>();
  LEAVE_TITLES.forEach((title) => {
    getDates(tasks, title).forEach((d) => {
      const k = dateKey(d);
      if (!leaveTitlesByKey.has(k)) leaveTitlesByKey.set(k, []);
      leaveTitlesByKey.get(k)!.push(title);
    });
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

  return { closureKeys, leaveTitlesByKey, summerStart, summerEnd, winterStart, winterEnd, isVacation };
}

export interface MonthlyWorkdayStats {
  currentWorkdays: number;   // 현재 근무일 (오늘까지 실제 정상근무)
  availableWorkdays: number; // 근무 가능일 (남은 평일)
  leaveUsed: number;         // 복무 사용일 (조퇴/지각/연가/병가/공가 등)
  availableLeave: number;    // 복무 사용 가능일 (추가로 쉴 수 있는 여유일수)
  status: '목표 달성' | '도전중' | '달성 실패';
}

export interface DayInfo {
  type: 'workday' | 'holiday' | 'vacation' | 'closure' | 'leave' | 'weekend';
  events: string[];
}

export async function getMonthCalendarData(
  tasks: ScheduleTask[],
  year: number,
  month: number // 1-12
): Promise<Map<string, DayInfo>> {
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  const apiHolidays = await getHolidayInfoInRange(monthStart, monthEnd);
  const holidayMap = new Map<string, string>();
  apiHolidays.forEach((h) => holidayMap.set(h.date, h.name));

  const { closureKeys, leaveTitlesByKey, isVacation } = buildScheduleContext(tasks);

  const result = new Map<string, DayInfo>();
  let cur = new Date(monthStart);
  while (cur <= monthEnd) {
    const k = dateKey(cur);
    const isWeekend = cur.getDay() === 0 || cur.getDay() === 6;
    const events: string[] = [];
    let type: DayInfo['type'];

    if (isWeekend) {
      type = 'weekend';
      if (holidayMap.has(k)) events.push(holidayMap.get(k)!);
    } else if (holidayMap.has(k)) {
      type = 'holiday';
      events.push(holidayMap.get(k)!);
    } else if (isVacation(cur)) {
      type = 'vacation';
      events.push('방학');
    } else if (closureKeys.has(k)) {
      type = 'closure';
      events.push(CLOSURE_TITLE);
    } else if (leaveTitlesByKey.has(k)) {
      type = 'leave';
      events.push(...leaveTitlesByKey.get(k)!);
    } else {
      type = 'workday';
    }

    result.set(k, { type, events });
    cur = addDays(cur, 1);
  }
  return result;
}

export async function getMonthlyWorkdayStats(
  tasks: ScheduleTask[],
  targetYear?: number,
  targetMonth?: number // 1-12
): Promise<MonthlyWorkdayStats> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const year = targetYear ?? today.getFullYear();
  const month = targetMonth != null ? targetMonth - 1 : today.getMonth(); // 0-indexed
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  const nationalHolidays = await getHolidayDatesInRange(monthStart, monthEnd);
  const { closureKeys, leaveTitlesByKey, isVacation } = buildScheduleContext(tasks);

  const isScheduledDay = (d: Date): boolean =>
    isWeekday(d) &&
    !nationalHolidays.has(dateKey(d)) &&
    !closureKeys.has(dateKey(d)) &&
    !isVacation(d);

  // monthStart ~ min(today, monthEnd): 실제 정상근무일 + 복무사용일
  let currentWorkdays = 0;
  let leaveUsed = 0;
  const pastEnd = today < monthEnd ? today : monthEnd;
  let cur = new Date(monthStart);
  while (cur <= pastEnd) {
    if (isScheduledDay(cur)) {
      if (leaveTitlesByKey.has(dateKey(cur))) leaveUsed++;
      else currentWorkdays++;
    }
    cur = addDays(cur, 1);
  }

  // max(today+1, monthStart) ~ monthEnd: 근무 가능일 + 미래 복무사용일
  let availableWorkdays = 0;
  const futureStart = addDays(today, 1) > monthStart ? addDays(today, 1) : monthStart;
  cur = new Date(futureStart);
  while (cur <= monthEnd) {
    if (isScheduledDay(cur)) {
      if (leaveTitlesByKey.has(dateKey(cur))) leaveUsed++;
      else availableWorkdays++;
    }
    cur = addDays(cur, 1);
  }

  const TARGET = 15;
  const status: MonthlyWorkdayStats['status'] =
    currentWorkdays >= TARGET
      ? '목표 달성'
      : currentWorkdays + availableWorkdays >= TARGET
      ? '도전중'
      : '달성 실패';

  const availableLeave = Math.max(0, currentWorkdays + availableWorkdays - TARGET);
  return { currentWorkdays, availableWorkdays, leaveUsed, availableLeave, status };
}

export interface KeyEvent {
  name: string;
  date: Date;
  type: 'holiday' | 'vacation' | 'closure';
}

export interface MonthOverview {
  year: number;
  month: number;
  keyEvents: KeyEvent[];
  workdays: number;    // 출근 해야 하는 날 (전체 월 기준)
  holidayCount: number; // 공휴일 수 (평일 기준)
  vacationDays: number; // 방학 일수 (평일 기준)
}

export async function getMonthOverview(
  tasks: ScheduleTask[],
  targetYear?: number,
  targetMonth?: number // 1-12
): Promise<MonthOverview> {
  const today = new Date();
  const year = targetYear ?? today.getFullYear();
  const month = targetMonth != null ? targetMonth - 1 : today.getMonth(); // 0-indexed
  const monthStart = new Date(year, month, 1);
  const monthEnd = new Date(year, month + 1, 0);

  const apiHolidays = await getHolidayInfoInRange(monthStart, monthEnd);
  const holidayDateSet = new Set(apiHolidays.map((h) => h.date));
  const { closureKeys, isVacation } = buildScheduleContext(tasks);

  // 주요 일정: 공휴일
  const keyEvents: KeyEvent[] = apiHolidays.map((h) => ({
    name: h.name,
    date: new Date(h.date + 'T00:00:00'),
    type: 'holiday' as const,
  }));

  // 이번 달에 해당하는 방학 시작/종료 이벤트 추가
  Object.entries(VACATION_LABELS).forEach(([title, label]) => {
    const d = getDate(tasks, title);
    if (d && isInMonth(d, year, month)) {
      keyEvents.push({ name: label, date: d, type: 'vacation' });
    }
  });

  // 이번 달 휴업 이벤트 추가
  getDates(tasks, CLOSURE_TITLE).forEach((d) => {
    if (isInMonth(d, year, month)) {
      keyEvents.push({ name: CLOSURE_TITLE, date: d, type: 'closure' });
    }
  });

  keyEvents.sort((a, b) => a.date.getTime() - b.date.getTime());

  let workdays = 0;
  let holidayCount = 0;
  let vacationDays = 0;

  let cur = new Date(monthStart);
  while (cur <= monthEnd) {
    if (isWeekday(cur)) {
      const key = dateKey(cur);
      if (holidayDateSet.has(key)) {
        holidayCount++;
      } else if (isVacation(cur)) {
        vacationDays++;
      } else if (!closureKeys.has(key)) {
        workdays++;
      }
    }
    cur = addDays(cur, 1);
  }

  return { year, month: month + 1, keyEvents, workdays, holidayCount, vacationDays };
}

export async function getWorkdayCountdown(tasks: ScheduleTask[]): Promise<WorkdayCountdown> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { closureKeys, summerStart, summerEnd, winterStart, winterEnd } = buildScheduleContext(tasks);

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
    // 여름방학 중 → 개학까지 달력 일수
    const resumeDate = addDays(summerEnd, 1);
    const daysLeft = Math.round((resumeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return { message: '여름방학 중 🏖️', daysLeft, inVacation: true };
  } else if (summerEnd && winterStart && today > summerEnd && today < winterStart) {
    // 여름방학 종료 후, 겨울방학 이전 → 겨울방학까지 카운트
    nextVacationStart = winterStart;
    vacationName = '겨울방학';
    vacationEmoji = '❄️';
  } else if (winterStart && winterEnd && today >= winterStart && today <= winterEnd) {
    // 겨울방학 중 → 개학까지 달력 일수
    const resumeDate = addDays(winterEnd, 1);
    const daysLeft = Math.round((resumeDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return { message: '겨울방학 중 ❄️', daysLeft, inVacation: true };
  } else if (winterEnd && today > winterEnd) {
    // 겨울방학 종료 후 (새 학년) → 다음 여름방학 날짜를 모름
    return { message: '다음 방학 일정을 불러올 수 없습니다', daysLeft: null, inVacation: false };
  } else {
    return { message: '방학 일정을 찾을 수 없습니다', daysLeft: null, inVacation: false };
  }

  // 방학 전날까지 남은 출근일 계산
  const lastSchoolDay = addDays(nextVacationStart, -1);

  if (today > lastSchoolDay) {
    return { message: `${vacationName} 시작입니다! ${vacationEmoji}`, daysLeft: 0, inVacation: false };
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
      !closureKeys.has(dateKey(cur))
    ) {
      count++;
    }
    cur = addDays(cur, 1);
  }

  return {
    message: `${vacationName}까지 ${count}일만 더 출근하자! ${vacationEmoji}`,
    daysLeft: count,
    inVacation: false,
  };
}
