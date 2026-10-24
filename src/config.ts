// 앱 기본 설정 모음
// 학사일정 목록·제외 목록은 앱의 설정(⚙) 화면에서 기기별로 바꿀 수 있고, 여기 값은 기본값

// 학사일정/복무 데이터를 읽어올 목록 이름 (기본값)
export const SCHEDULE_LIST_NAME = '학사일정복무';

// 달력·작업 목록에서 제외할 To-Do 목록 (기본값)
export const EXCLUDED_LISTS = [
  '영상제작',
  '교육과정수립운영',
  '학교자율시간',
  '기초학력업무',
  '부산여행',
  '보관',
];

// localStorage 캐시 스키마 버전 — TodoTask/ScheduleTask 필드가 바뀌면 +1
export const CACHE_VERSION = 2;
export const CACHE_KEY = 'todo_tasks_cache';

export const DARK_MODE_KEY = 'dark_mode';
