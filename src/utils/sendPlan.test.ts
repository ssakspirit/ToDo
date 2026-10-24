import { describe, it, expect, vi } from 'vitest';
import { AnalyzedTask, TaskDetails } from '../types';
import {
  pendingFor, resolveCalendarId, groupByCalendar, succeededIds, markSent, removeCompleted, sendPending, SendDeps,
} from './sendPlan';

const task = (id: string, title: string, sentTo?: AnalyzedTask['sentTo']): AnalyzedTask => ({
  id, title, body: '', importance: 'low', createdAt: 0, sentTo,
});

const CALENDARS = [
  { id: 'cal-schedule', summary: '#일정' },
  { id: 'cal-deadline', summary: '#기한' },
  { id: 'cal-gift', summary: '#기프티콘' },
];

describe('캘린더 선택', () => {
  it('필수태그와 이름이 같은 캘린더', () => {
    expect(resolveCalendarId('#일정 #회의 교무회의', CALENDARS, 'primary')).toBe('cal-schedule');
    expect(resolveCalendarId('#기한 #보고서 제출', CALENDARS, 'primary')).toBe('cal-deadline');
  });
  it('#기프티콘은 #기한보다 우선', () => {
    expect(resolveCalendarId('#기한 #기프티콘 아메리카노', CALENDARS, 'primary')).toBe('cal-gift');
  });
  it('맞는 캘린더가 없으면 드롭다운에서 고른 캘린더', () => {
    expect(resolveCalendarId('#작업 #정리 책상', CALENDARS, 'picked')).toBe('picked');
    expect(resolveCalendarId('태그 없음', CALENDARS, 'picked')).toBe('picked');
  });
  it('캘린더별로 묶기', () => {
    const groups = groupByCalendar([task('a', '#일정 A'), task('b', '#기한 B'), task('c', '#일정 C')], CALENDARS, 'p');
    expect([...groups].map(([id, ts]) => [id, ts.map((x) => x.id)])).toEqual([
      ['cal-schedule', ['a', 'c']],
      ['cal-deadline', ['b']],
    ]);
  });
});

describe('부분 실패 후 재전송 (중복 방지)', () => {
  it('결과 순서대로 성공한 작업만 골라냄', () => {
    const ts = [task('a', 'A'), task('b', 'B'), task('c', 'C')];
    expect(succeededIds(ts, [{ success: true }, { success: false }, { success: true }])).toEqual(['a', 'c']);
  });

  it('MS 성공·Google 실패 → 남은 작업은 Google로만 다시 보냄', () => {
    let ts = [task('a', 'A'), task('b', 'B')];
    ts = markSent(ts, 'microsoft', ['a', 'b']);
    ts = markSent(ts, 'google', ['a']);
    ts = removeCompleted(ts, ['microsoft', 'google']);
    expect(ts.map((x) => x.id)).toEqual(['b']);
    expect(pendingFor(ts, 'microsoft')).toEqual([]);           // MS로는 다시 안 보냄
    expect(pendingFor(ts, 'google').map((x) => x.id)).toEqual(['b']);
  });

  it('로그인된 서비스 기준으로 완료 판단 (Google 로그아웃 상태면 MS만 성공해도 완료)', () => {
    const ts = [task('a', 'A', { microsoft: true })];
    expect(removeCompleted(ts, ['microsoft'])).toEqual([]);
    expect(removeCompleted(ts, ['microsoft', 'google'])).toHaveLength(1);
  });

  it('markSent는 기존 전송 기록을 보존하고 원본을 바꾸지 않음', () => {
    const original = [task('a', 'A', { google: true })];
    const next = markSent(original, 'microsoft', ['a']);
    expect(next[0].sentTo).toEqual({ google: true, microsoft: true });
    expect(original[0].sentTo).toEqual({ google: true });
  });
});

describe('sendPending: 실제 전송 흐름 (가짜 API)', () => {
  // 제목에 '실패'가 들어간 작업은 해당 서비스에서 실패하도록 하는 가짜 API
  const fakeDeps = (opts: { msFailTitle?: string; googleFailTitle?: string; msExpired?: boolean } = {}) => {
    const deps = {
      createTasks: vi.fn(async (_listId: string, ts: TaskDetails[]) => {
        if (opts.msExpired) throw new Error('INTERACTION_REQUIRED');
        return ts.map((t) => ({ success: !(opts.msFailTitle && t.title.includes(opts.msFailTitle)) }));
      }),
      createEvents: vi.fn(async (ts: TaskDetails[], _calendarId: string) =>
        ts.map((t) => ({ success: !(opts.googleFailTitle && t.title.includes(opts.googleFailTitle)) }))
      ),
    } satisfies SendDeps;
    return deps;
  };
  const request = (ts: AnalyzedTask[]) => ({
    msPending: pendingFor(ts, 'microsoft'), msListId: 'list-1',
    googlePending: pendingFor(ts, 'google'), calendars: CALENDARS, fallbackCalendarId: 'primary',
  });
  // App.handleSendToBoth와 같은 방식으로 결과 반영
  const apply = (ts: AnalyzedTask[], o: Awaited<ReturnType<typeof sendPending>>) =>
    removeCompleted(markSent(markSent(ts, 'microsoft', o.msSent), 'google', o.googleSent), ['microsoft', 'google']);

  it('Google 일부 실패 → 재전송 시 그 작업만 Google로, MS에는 중복 없음', async () => {
    let ts = [task('a', '#일정 A'), task('b', '#기한 B 실패'), task('c', '#작업 C')];

    const round1 = fakeDeps({ googleFailTitle: '실패' });
    const o1 = await sendPending(request(ts), round1);
    expect(o1).toEqual({ msSent: ['a', 'b', 'c'], googleSent: ['a', 'c'], msExpired: false });
    // 태그별 캘린더로 나눠 보냄 (#작업 캘린더는 없으므로 드롭다운 선택값)
    expect(round1.createEvents.mock.calls.map(([g, id]) => [id, g.map((x) => x.title)])).toEqual([
      ['cal-schedule', ['#일정 A']],
      ['cal-deadline', ['#기한 B 실패']],
      ['primary', ['#작업 C']],
    ]);
    ts = apply(ts, o1);
    expect(ts.map((x) => x.id)).toEqual(['b']);

    const round2 = fakeDeps();
    const o2 = await sendPending(request(ts), round2);
    expect(round2.createTasks).not.toHaveBeenCalled(); // MS 중복 생성 없음
    expect(round2.createEvents.mock.calls.flatMap(([g]) => g.map((x) => x.title))).toEqual(['#기한 B 실패']);
    expect(apply(ts, o2)).toEqual([]);
  });

  it('MS 로그인 만료는 MS만 중단하고 Google은 계속 진행', async () => {
    const ts = [task('a', '#일정 A')];
    const o = await sendPending(request(ts), fakeDeps({ msExpired: true }));
    expect(o).toEqual({ msSent: [], googleSent: ['a'], msExpired: true });
    expect(apply(ts, o)[0].sentTo).toEqual({ google: true }); // 재로그인 후 MS로만 다시 보냄
  });

  it('보낼 작업이 없는 서비스는 호출하지 않음', async () => {
    const deps = fakeDeps();
    await sendPending({ ...request([]), googlePending: [task('a', '#일정 A')] }, deps);
    expect(deps.createTasks).not.toHaveBeenCalled();
    expect(deps.createEvents).toHaveBeenCalledTimes(1);
  });
});
