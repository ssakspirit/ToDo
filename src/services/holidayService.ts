const BASE_URL = 'https://apis.data.go.kr/B090041/openapi/service/SpcdeInfoService/getRestDeInfo';

function parseXmlHolidays(xmlText: string): Array<{ dateName: string; locdate: number; isHoliday: string }> {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlText, 'application/xml');

  const resultCode = doc.querySelector('resultCode')?.textContent;
  if (resultCode !== '00') return [];

  const items = doc.querySelectorAll('item');
  const result: Array<{ dateName: string; locdate: number; isHoliday: string }> = [];

  items.forEach((item) => {
    const dateName = item.querySelector('dateName')?.textContent ?? '';
    const locdate = parseInt(item.querySelector('locdate')?.textContent ?? '0', 10);
    const isHoliday = item.querySelector('isHoliday')?.textContent ?? 'N';
    result.push({ dateName, locdate, isHoliday });
  });

  return result;
}

async function fetchHolidays(year: number, month: number) {
  const apiKey = import.meta.env.VITE_HOLIDAY_API_KEY;
  if (!apiKey) return [];

  const monthStr = String(month).padStart(2, '0');
  const url = `${BASE_URL}?serviceKey=${apiKey}&solYear=${year}&solMonth=${monthStr}&numOfRows=50`;

  try {
    const res = await fetch(url);
    if (!res.ok) return [];
    const xmlText = await res.text();
    return parseXmlHolidays(xmlText);
  } catch {
    return [];
  }
}

export async function getTodayHolidayName(): Promise<string | null> {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const day = today.getDate();
  const todayNum = year * 10000 + month * 100 + day;

  const holidays = await fetchHolidays(year, month);
  const match = holidays.find((h) => h.isHoliday === 'Y' && h.locdate === todayNum);
  return match ? match.dateName : null;
}

export interface HolidayInfo {
  name: string;
  date: string; // YYYY-MM-DD
}

// 범위 내 공휴일 이름 + 날짜 목록 반환
export async function getHolidayInfoInRange(start: Date, end: Date): Promise<HolidayInfo[]> {
  const result: HolidayInfo[] = [];
  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cur <= endMonth) {
    const items = await fetchHolidays(cur.getFullYear(), cur.getMonth() + 1);
    items.forEach((item) => {
      if (item.isHoliday === 'Y') {
        const s = String(item.locdate);
        result.push({ name: item.dateName, date: `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}` });
      }
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return result;
}

// YYYY-MM-DD 형식의 공휴일 날짜 집합을 반환
export async function getHolidayDatesInRange(start: Date, end: Date): Promise<Set<string>> {
  const result = new Set<string>();

  const cur = new Date(start.getFullYear(), start.getMonth(), 1);
  const endMonth = new Date(end.getFullYear(), end.getMonth(), 1);

  while (cur <= endMonth) {
    const year = cur.getFullYear();
    const month = cur.getMonth() + 1;
    const items = await fetchHolidays(year, month);

    items.forEach((item) => {
      if (item.isHoliday === 'Y') {
        const s = String(item.locdate);
        result.add(`${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}`);
      }
    });

    cur.setMonth(cur.getMonth() + 1);
  }

  return result;
}
