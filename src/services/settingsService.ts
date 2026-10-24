import { SCHEDULE_LIST_NAME, EXCLUDED_LISTS } from '../config';

// 앱 설정 (기기별 localStorage) — 없거나 깨져 있으면 config.ts 기본값 사용
export interface AppSettings {
  scheduleListName: string; // 학사일정·복무 키워드를 읽을 To Do 목록
  excludedLists: string[];  // 달력·작업 목록에서 제외할 To Do 목록
}

export const SETTINGS_KEY = 'app_settings';

export const DEFAULT_SETTINGS: AppSettings = {
  scheduleListName: SCHEDULE_LIST_NAME,
  excludedLists: EXCLUDED_LISTS,
};

export const loadSettings = (): AppSettings => {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw);
    return {
      scheduleListName:
        typeof parsed.scheduleListName === 'string' && parsed.scheduleListName
          ? parsed.scheduleListName
          : DEFAULT_SETTINGS.scheduleListName,
      excludedLists: Array.isArray(parsed.excludedLists)
        ? parsed.excludedLists.filter((name: unknown): name is string => typeof name === 'string')
        : DEFAULT_SETTINGS.excludedLists,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
};

export const saveSettings = (settings: AppSettings): void => {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
};
