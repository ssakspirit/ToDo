import { AnalyzedTask, ServiceKey, TaskDetails } from '../types';

// 분석된 작업을 Microsoft To Do / Google Calendar로 보낼 때의 계획·결과 처리 (UI와 분리된 순수 함수)

export interface CalendarRef {
  id: string;
  summary: string;
}

export const toTaskDetails = (task: AnalyzedTask): TaskDetails => ({
  title: task.title,
  body: task.body,
  dueDateTime: task.dueDateTime,
  importance: task.importance,
  reminderDateTime: task.reminderDateTime,
  categories: task.categories,
});

// 아직 해당 서비스로 보내지 않은 작업
export const pendingFor = (tasks: AnalyzedTask[], service: ServiceKey): AnalyzedTask[] =>
  tasks.filter((task) => !task.sentTo?.[service]);

// 작업 제목의 태그와 이름이 같은 캘린더로 전송, 없으면 드롭다운에서 고른 캘린더
// 우선순위: #기프티콘 > 필수태그(#일정/#기한/#작업)
export const resolveCalendarId = (title: string, calendars: CalendarRef[], fallbackId: string): string => {
  const byName = (name: string) => calendars.find((cal) => cal.summary === name);
  const required = title.match(/#(일정|기한|작업)/)?.[0];
  const calendar =
    (title.includes('#기프티콘') ? byName('#기프티콘') : undefined) ??
    (required ? byName(required) : undefined);
  return calendar?.id ?? fallbackId;
};

export const groupByCalendar = (
  tasks: AnalyzedTask[],
  calendars: CalendarRef[],
  fallbackId: string
): Map<string, AnalyzedTask[]> => {
  const groups = new Map<string, AnalyzedTask[]>();
  tasks.forEach((task) => {
    const calendarId = resolveCalendarId(task.title, calendars, fallbackId);
    if (!groups.has(calendarId)) groups.set(calendarId, []);
    groups.get(calendarId)!.push(task);
  });
  return groups;
};

// createTasksInBatch / createEventsInBatch 결과(입력 순서와 동일)에서 성공한 작업 id
export const succeededIds = (tasks: AnalyzedTask[], results: { success: boolean }[]): string[] =>
  tasks.filter((_, i) => results[i]?.success).map((task) => task.id);

export const markSent = (tasks: AnalyzedTask[], service: ServiceKey, ids: Iterable<string>): AnalyzedTask[] => {
  const idSet = new Set(ids);
  return tasks.map((task) =>
    idSet.has(task.id) ? { ...task, sentTo: { ...task.sentTo, [service]: true } } : task
  );
};

// 현재 로그인된 모든 서비스로 보낸 작업은 목록에서 제거
export const removeCompleted = (tasks: AnalyzedTask[], services: ServiceKey[]): AnalyzedTask[] =>
  tasks.filter((task) => !services.every((service) => task.sentTo?.[service]));

type BatchResult = { success: boolean }[];

export interface SendDeps {
  createTasks: (listId: string, tasks: TaskDetails[]) => Promise<BatchResult>;
  createEvents: (tasks: TaskDetails[], calendarId: string) => Promise<BatchResult>;
}

export interface SendRequest {
  msPending: AnalyzedTask[];
  msListId: string;
  googlePending: AnalyzedTask[];
  calendars: CalendarRef[];
  fallbackCalendarId: string;
}

export interface SendOutcome {
  msSent: string[];
  googleSent: string[];
  msExpired: boolean; // Microsoft 로그인 만료로 MS 전송 전체가 중단됨
}

// 두 서비스로 병렬 전송하고, 서비스별로 성공한 작업 id를 돌려줌 (한쪽 실패가 다른 쪽을 막지 않음)
export const sendPending = async (req: SendRequest, deps: SendDeps): Promise<SendOutcome> => {
  const msPromise =
    req.msPending.length > 0
      ? deps.createTasks(req.msListId, req.msPending.map(toTaskDetails)).then((r) => succeededIds(req.msPending, r))
      : Promise.resolve([]);

  // 태그별 캘린더로 나눠 전송
  const googlePromise =
    req.googlePending.length > 0
      ? Promise.all(
          [...groupByCalendar(req.googlePending, req.calendars, req.fallbackCalendarId)].map(([calendarId, group]) =>
            deps.createEvents(group.map(toTaskDetails), calendarId).then((r) => succeededIds(group, r))
          )
        ).then((ids) => ids.flat())
      : Promise.resolve([]);

  const [ms, google] = await Promise.allSettled([msPromise, googlePromise]);
  return {
    msSent: ms.status === 'fulfilled' ? ms.value : [],
    googleSent: google.status === 'fulfilled' ? google.value : [],
    msExpired: ms.status === 'rejected' && ms.reason instanceof Error && ms.reason.message === 'INTERACTION_REQUIRED',
  };
};
