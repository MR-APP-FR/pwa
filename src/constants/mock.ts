/**
 * Mock configuration
 * Set USE_MOCK_DATE to true to use the mock date (28 jan 2026),
 * set to false to use the real current date.
 */
export const USE_MOCK_DATE = true;

const MOCK_DATE = new Date(2026, 0, 28); // mercredi 28 janvier 2026

export const TODAY = USE_MOCK_DATE ? MOCK_DATE : new Date();

export const WEEK_YEAR = USE_MOCK_DATE ? 2026 : TODAY.getFullYear();
export const WEEK_MONTH = USE_MOCK_DATE ? 1 : TODAY.getMonth() + 1;

// Week start = Monday of current week
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  date.setDate(diff);
  date.setHours(0, 0, 0, 0);
  return date;
}

export const WEEK_START = USE_MOCK_DATE ? new Date(2026, 0, 26) : getMonday(TODAY);

// Next week
const nextMon = new Date(WEEK_START);
nextMon.setDate(WEEK_START.getDate() + 7);
const nextSun = new Date(nextMon);
nextSun.setDate(nextMon.getDate() + 6);

export const NEXT_WEEK_START = nextMon;
export const NEXT_WEEK_END = nextSun;

// Mock time ranges per site
export const MOCK_TIME_RANGES: Record<number, string> = {
  26: '8h56',
  24: '9h00',
  36: '10h00',
};

export const MOCK_TIME_RANGES_FULL: Record<number, string> = {
  26: '8h56 → 18h',
  24: '9h00 → 17h30',
  36: '10h00 → 19h',
};
