import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loadSettings, saveSettings, DEFAULT_SETTINGS, SETTINGS_KEY } from './settingsService';

describe('앱 설정', () => {
  let store: Record<string, string>;
  beforeEach(() => {
    store = {};
    vi.stubGlobal('localStorage', {
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it('저장된 값이 없으면 config.ts 기본값', () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    expect(DEFAULT_SETTINGS.scheduleListName).toBe('학사일정복무');
  });

  it('저장 후 다시 읽으면 같은 값', () => {
    saveSettings({ scheduleListName: '복무', excludedLists: ['보관'] });
    expect(loadSettings()).toEqual({ scheduleListName: '복무', excludedLists: ['보관'] });
  });

  it('깨진 값이나 잘못된 형식이면 해당 항목만 기본값', () => {
    store[SETTINGS_KEY] = '{깨진 JSON';
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
    store[SETTINGS_KEY] = JSON.stringify({ scheduleListName: '', excludedLists: ['보관', 3, null] });
    expect(loadSettings()).toEqual({ scheduleListName: DEFAULT_SETTINGS.scheduleListName, excludedLists: ['보관'] });
  });

  it('localStorage를 쓸 수 없어도(사파리 개인정보 보호 모드 등) 기본값', () => {
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('denied'); } });
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });
});
