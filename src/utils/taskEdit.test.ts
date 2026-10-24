import { describe, it, expect } from 'vitest';
import { splitDueDateTime, buildSchedule } from './taskEdit';

describe('분석 결과 수정: 날짜/시간 변환', () => {
  it('종일(23:59)은 시간 칸을 비움', () => {
    expect(splitDueDateTime('2026-10-30T23:59:00')).toEqual({ date: '2026-10-30', time: '' });
  });
  it('시간 있는 일정은 HH:mm', () => {
    expect(splitDueDateTime('2026-10-28T15:00:00')).toEqual({ date: '2026-10-28', time: '15:00' });
  });
  it('날짜만 있거나 값이 없어도 처리', () => {
    expect(splitDueDateTime('2026-10-28')).toEqual({ date: '2026-10-28', time: '' });
    expect(splitDueDateTime(undefined)).toEqual({ date: '', time: '' });
    expect(splitDueDateTime('잘못된 값')).toEqual({ date: '', time: '' });
  });
  it('시간을 비우면 종일, 알림은 기한 날 07:30', () => {
    expect(buildSchedule('2026-11-03', '')).toEqual({
      dueDateTime: '2026-11-03T23:59:00', reminderDateTime: '2026-11-03T07:30:00',
    });
  });
  it('시간을 넣으면 그 시각, 알림 규칙은 동일', () => {
    expect(buildSchedule('2026-11-03', '16:30')).toEqual({
      dueDateTime: '2026-11-03T16:30:00', reminderDateTime: '2026-11-03T07:30:00',
    });
  });
  it('날짜를 지우면 기한·알림 모두 없음', () => {
    expect(buildSchedule('', '10:00')).toEqual({ dueDateTime: undefined, reminderDateTime: undefined });
  });
  it('왕복 변환이 원래 값을 유지', () => {
    for (const v of ['2026-12-15T23:59:00', '2027-01-21T09:05:00']) {
      const { date, time } = splitDueDateTime(v);
      expect(buildSchedule(date, time).dueDateTime).toBe(v);
    }
  });
});
