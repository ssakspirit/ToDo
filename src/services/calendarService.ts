import { getGoogleAccessToken } from './googleAuthService';
import { TaskDetails } from '../types';

interface CalendarEvent {
  summary: string;
  description?: string;
  start: {
    date: string;
    timeZone: string;
  };
  end: {
    date: string;
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

// Convert TaskDetails to Google Calendar Event (all-day event)
const convertTaskToEvent = (task: TaskDetails): CalendarEvent => {
  // Extract date from dueDateTime (ISO 8601 format)
  const dueDateTime = task.dueDateTime || new Date().toISOString();
  const dueDate = new Date(dueDateTime);
  const dateString = dueDate.toISOString().split('T')[0]; // YYYY-MM-DD

  // Calculate reminder minutes
  // Goal: Reminder at 7:30 AM on due date
  // All-day events start at 00:00
  // Google wants "minutes before event start"
  // But our due time is 23:59, so we need reminder at 7:30 AM of the same day
  // From 00:00 to 7:30 = 7.5 hours = 450 minutes AFTER start
  // However, for all-day events, reminders are relative to the day start (00:00)
  // So 7:30 AM = 450 minutes after midnight
  // Google API expects positive values for "minutes before"
  // For all-day events starting at midnight, 7:30 AM reminder = (24*60 - 450) minutes before end of day
  // But actually, we want 7:30 AM on the day of the event
  // The simplest approach: Set reminder for 450 minutes (7.5 hours)
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
