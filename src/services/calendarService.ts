import { getGoogleAccessToken } from './googleAuthService';
import { TaskDetails } from '../types';

interface CalendarEvent {
  summary: string;
  description?: string;
  start: {
    date?: string;
    dateTime?: string;
    timeZone: string;
  };
  end: {
    date?: string;
    dateTime?: string;
    timeZone: string;
  };
  reminders: {
    useDefault: boolean;
    overrides: Array<{
      method: string;
      minutes: number;
    }>;
  };
}

// Convert TaskDetails to Google Calendar Event
const convertTaskToEvent = (task: TaskDetails): CalendarEvent => {
  const dueDateTime = task.dueDateTime || new Date().toISOString();
  const dueDate = new Date(dueDateTime);
  const reminderDateTime = task.reminderDateTime 
    ? new Date(task.reminderDateTime) 
    : null;

  // dueDateTime에 시간 정보가 있는지 확인 (23:59:00이 아닌 경우)
  const hasSpecificTime = dueDate.getHours() !== 23 || dueDate.getMinutes() !== 59;
  
  // 시간이 있는 이벤트인지 종일 이벤트인지 결정
  // dueDateTime이 23:59:00이면 종일 이벤트로 처리
  const isAllDay = !hasSpecificTime;

  if (isAllDay) {
    // 종일 이벤트 (기한만 있고 구체적 시간이 없는 경우)
    const dateString = dueDate.toISOString().split('T')[0]; // YYYY-MM-DD
    
    // 알림 시간 계산 (기한 날짜 오전 7:30)
    const reminderMinutes = 450; // 7:30 AM = 7.5 hours = 450 minutes from start of day

    return {
      summary: task.title,
      description: task.body,
      start: {
        date: dateString,
        timeZone: 'Asia/Seoul',
      },
      end: {
        date: dateString,
        timeZone: 'Asia/Seoul',
      },
      reminders: {
        useDefault: false,
        overrides: [
          {
            method: 'popup',
            minutes: reminderMinutes,
          },
        ],
      },
    };
  } else {
    // 시간이 있는 이벤트 (구체적인 시간이 명시된 경우)
    // 시작 시간: dueDateTime의 시간 사용
    const startDateTime = new Date(dueDate);
    
    // 종료 시간: 시작 시간 + 1시간 (또는 reminderDateTime이 있으면 그 시간 사용)
    const endDateTime = reminderDateTime && reminderDateTime > startDateTime
      ? new Date(reminderDateTime)
      : new Date(startDateTime.getTime() + 60 * 60 * 1000); // 기본 1시간 후

    // 알림 시간 계산 (reminderDateTime이 있으면 사용, 없으면 시작 30분 전)
    let reminderMinutes = 30; // 기본 30분 전
    if (reminderDateTime && reminderDateTime <= startDateTime) {
      const diffMs = startDateTime.getTime() - reminderDateTime.getTime();
      reminderMinutes = Math.max(0, Math.floor(diffMs / (60 * 1000)));
    }

    return {
      summary: task.title,
      description: task.body,
      start: {
        dateTime: startDateTime.toISOString(),
        timeZone: 'Asia/Seoul',
      },
      end: {
        dateTime: endDateTime.toISOString(),
        timeZone: 'Asia/Seoul',
      },
      reminders: {
        useDefault: false,
        overrides: [
          {
            method: 'popup',
            minutes: reminderMinutes,
          },
        ],
      },
    };
  }
};

// Create a single calendar event
export const createCalendarEvent = async (
  task: TaskDetails
): Promise<any> => {
  try {
    const accessToken = await getGoogleAccessToken();
    const event = convertTaskToEvent(task);

    const response = await fetch(
      'https://www.googleapis.com/calendar/v3/calendars/primary/events',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(event),
      }
    );

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error?.message || '이벤트 생성 실패');
    }

    return await response.json();
  } catch (error) {
    console.error('캘린더 이벤트 생성 실패:', error);
    throw error;
  }
};

// Create events in batch (sequential processing, same as todoService)
export const createEventsInBatch = async (
  tasks: TaskDetails[]
): Promise<any[]> => {
  const results = [];
  for (const task of tasks) {
    try {
      const result = await createCalendarEvent(task);
      results.push({ success: true, data: result });
    } catch (error) {
      results.push({ success: false, error, task });
    }
  }
  return results;
};
