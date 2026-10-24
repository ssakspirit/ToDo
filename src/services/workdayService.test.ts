import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ScheduleTask } from './todoService';

// 공휴일 API 대신 고정 목록 사용 (평일 공휴일: 10/9 한글날, 12/25 성탄절, 1/1 신정)
const HOLIDAYS = [
  { date: '2026-10-03', name: '개천절' }, // 토요일
  { date: '2026-10-09', name: '한글날' },
  { date: '2026-12-25', name: '기독탄신일' },
  { date: '2027-01-01', name: '1월1일' },
];
const inRange = (start: Date, end: Date) =>
  HOLIDAYS.filter((h) => {
    const d = new Date(h.date + 'T00:00:00');
    return d >= new Date(start.getFullYear(), start.getMonth(), 1) &&
      d <= new Date(end.getFullYear(), end.getMonth() + 1, 0);
  });
vi.mock('./holidayService', () => ({
  getHolidayInfoInRange: async (start: Date, end: Date) => inRange(start, end),
  getHolidayDatesInRange: async (start: Date, end: Date) => new Set(inRange(start, end).map((h) => h.date)),
}));

const { getMonthCalendarData, getMonthlyWorkdayStats, getMonthOverview, getWorkdayCountdown } =
  await import('./workdayService');

// MS Graph 형식: KST 자정을 UTC로, 'Z' 없이 (예: 2026-10-04T15:00:00.0000000 = 10/5 KST)
const kst = (ymd: string) =>
  new Date(`${ymd}T00:00:00+09:00`).toISOString().replace('Z', '').replace(/\.\d+$/, '.0000000');
const t = (title: string, ymd: string): ScheduleTask => ({
  id: title + ymd, title, dueDateTime: kst(ymd), status: 'notStarted', importance: 'normal', createdDateTime: '',
});

const TASKS: ScheduleTask[] = [
  t('여름방학시작', '2026-07-24'), t('여름방학종료', '2026-08-16'),
  t('겨울방학시작', '2027-01-08'), t('겨울방학종료', '2027-02-28'),
  t('휴업', '2026-10-02'), t('휴업', '2026-11-20'),
  t('연가', '2026-10-05'), t('병가', '2026-10-06'), t('공가', '2026-10-07'),
  t('조퇴', '2026-10-13'), t('지각', '2026-10-13'), t('병조퇴', '2026-10-27'),
  t('연가', '2026-10-10'), // 토요일 — 무시돼야 함
  t('#작업 연가 신청', '2026-10-08'), // 제목이 정확히 일치하지 않으므로 복무 아님
];

describe('workdayService (오늘 = 2026-10-23 금)', () => {
  beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date(2026, 9, 23, 10, 0)); });
  afterEach(() => vi.useRealTimers());

  it('10월 정액분: 휴업·공휴일은 제외, 복무는 별도 집계', async () => {
    // 평일 22일 - 휴업(10/2) - 한글날(10/9) = 근무 대상 20일
    // 오늘까지 15일 중 복무 4일(10/5·6·7·13) → 근무 11, 이후 5일 중 복무 1일(10/27) → 가능 4
    expect(await getMonthlyWorkdayStats(TASKS, 2026, 10)).toEqual({
      currentWorkdays: 11,
      availableWorkdays: 4,
      leaveUsed: 5,
      availableLeave: 0,
      status: '도전중',
    });
  });

  it('여름방학이 낀 7월: 방학 평일은 근무 대상에서 제외', async () => {
    // 7월 평일 23일 중 방학(7/24, 27~31) 6일 제외 → 17일, 모두 지난 날
    expect(await getMonthlyWorkdayStats(TASKS, 2026, 7)).toMatchObject({
      currentWorkdays: 17, availableWorkdays: 0, leaveUsed: 0, status: '목표 달성',
    });
  });

  it('달력: 날짜별 유형과 표시 이벤트', async () => {
    const cal = await getMonthCalendarData(TASKS, 2026, 10);
    expect(cal.get('2026-10-02')).toEqual({ type: 'closure', events: ['휴업'] });
    expect(cal.get('2026-10-03')).toEqual({ type: 'weekend', events: ['개천절'] });
    expect(cal.get('2026-10-07')).toEqual({ type: 'leave', events: ['공가'] });
    expect(cal.get('2026-10-08')).toEqual({ type: 'workday', events: [] });
    expect(cal.get('2026-10-09')).toEqual({ type: 'holiday', events: ['한글날'] });
    expect(cal.get('2026-10-10')).toEqual({ type: 'weekend', events: [] });
    // 같은 날 여러 복무는 LEAVE_TITLES 순서로
    expect(cal.get('2026-10-13')).toEqual({ type: 'leave', events: ['조퇴', '지각'] });
  });

  it('월 개요: 주요 일정과 출근일 수', async () => {
    const ov = await getMonthOverview(TASKS, 2026, 10);
    expect(ov.keyEvents.map((e) => e.name)).toEqual(['휴업', '개천절', '한글날']);
    expect(ov).toMatchObject({ workdays: 20, holidayCount: 1, vacationDays: 0 });
  });

  it('방학 카운트다운: 겨울방학 전날까지 평일 - 공휴일 - 휴업', async () => {
    // 10/23~1/7 평일 55일 - 휴업(11/20) - 성탄절 - 신정 = 52
    expect(await getWorkdayCountdown(TASKS)).toEqual({
      message: '겨울방학까지 52일만 더 출근하자! ❄️', daysLeft: 52, inVacation: false,
    });
  });

  it('방학 일정이 없으면 안내 메시지', async () => {
    const noVacation = TASKS.filter((x) => !x.title.includes('방학'));
    expect(await getWorkdayCountdown(noVacation)).toMatchObject({ daysLeft: null, inVacation: false });
  });

  it('방학 중이면 개학까지 남은 달력 일수', async () => {
    vi.setSystemTime(new Date(2026, 7, 10)); // 8/10, 여름방학 중
    expect(await getWorkdayCountdown(TASKS)).toEqual({ message: '여름방학 중 🏖️', daysLeft: 7, inVacation: true });
  });
});
