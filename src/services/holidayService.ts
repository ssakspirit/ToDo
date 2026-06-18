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
