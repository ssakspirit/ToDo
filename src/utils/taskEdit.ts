import { TaskDetails } from '../types';

// 분석 결과 수정 화면용 날짜/시간 변환
// 규칙(분석 프롬프트와 동일): 시간 없음 = 23:59(종일), 알림 = 기한 날 07:30

const DUE_PATTERN = /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/;
const ALL_DAY_TIME = '23:59';

// dueDateTime → 입력칸 값 (종일이면 time은 빈 값)
export const splitDueDateTime = (dueDateTime?: string): { date: string; time: string } => {
  const m = dueDateTime?.match(DUE_PATTERN);
  if (!m) return { date: '', time: '' };
  const time = m[2] ? `${m[2]}:${m[3]}` : '';
  return { date: m[1], time: time === ALL_DAY_TIME ? '' : time };
};

// 입력칸 값 → dueDateTime / reminderDateTime
export const buildSchedule = (
  date: string,
  time: string
): Pick<TaskDetails, 'dueDateTime' | 'reminderDateTime'> => {
  if (!date) return { dueDateTime: undefined, reminderDateTime: undefined };
  return {
    dueDateTime: `${date}T${time || ALL_DAY_TIME}:00`,
    reminderDateTime: `${date}T07:30:00`,
  };
};
