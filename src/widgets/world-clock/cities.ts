export interface City {
  /** Stable key, also used as the add-city combobox's item id and the
   * persisted selection id — never rename an existing one. */
  id: string
  city: string
  country: string
  /** IANA time zone identifier. Several cities intentionally share one
   * (e.g. every India entry uses `Asia/Kolkata`) — that's expected, not a
   * bug to dedupe. */
  tz: string
  lat: number
  lon: number
}

/** Curated set of major cities spanning every UTC offset, used to seed the
 * "add a city" picker and to place markers on the map. Not exhaustive (the
 * browser knows ~400 IANA zones via `Intl.supportedValuesOf('timeZone')`)
 * but picking from a fixed list keeps the picker scannable and guarantees
 * every entry has map coordinates. */
export const WORLD_CITIES: City[] = [
  { id: 'honolulu', city: 'Honolulu', country: 'United States', tz: 'Pacific/Honolulu', lat: 21.31, lon: -157.86 },
  { id: 'anchorage', city: 'Anchorage', country: 'United States', tz: 'America/Anchorage', lat: 61.22, lon: -149.9 },
  {
    id: 'los-angeles',
    city: 'Los Angeles',
    country: 'United States',
    tz: 'America/Los_Angeles',
    lat: 34.05,
    lon: -118.24,
  },
  { id: 'vancouver', city: 'Vancouver', country: 'Canada', tz: 'America/Vancouver', lat: 49.28, lon: -123.12 },
  { id: 'denver', city: 'Denver', country: 'United States', tz: 'America/Denver', lat: 39.74, lon: -104.99 },
  { id: 'phoenix', city: 'Phoenix', country: 'United States', tz: 'America/Phoenix', lat: 33.45, lon: -112.07 },
  { id: 'chicago', city: 'Chicago', country: 'United States', tz: 'America/Chicago', lat: 41.88, lon: -87.63 },
  { id: 'mexico-city', city: 'Mexico City', country: 'Mexico', tz: 'America/Mexico_City', lat: 19.43, lon: -99.13 },
  { id: 'havana', city: 'Havana', country: 'Cuba', tz: 'America/Havana', lat: 23.11, lon: -82.37 },
  { id: 'new-york', city: 'New York', country: 'United States', tz: 'America/New_York', lat: 40.71, lon: -74.01 },
  { id: 'toronto', city: 'Toronto', country: 'Canada', tz: 'America/Toronto', lat: 43.65, lon: -79.38 },
  { id: 'bogota', city: 'Bogota', country: 'Colombia', tz: 'America/Bogota', lat: 4.71, lon: -74.07 },
  { id: 'caracas', city: 'Caracas', country: 'Venezuela', tz: 'America/Caracas', lat: 10.48, lon: -66.9 },
  { id: 'quito', city: 'Quito', country: 'Ecuador', tz: 'America/Guayaquil', lat: -0.23, lon: -78.52 },
  { id: 'lima', city: 'Lima', country: 'Peru', tz: 'America/Lima', lat: -12.05, lon: -77.04 },
  { id: 'santiago', city: 'Santiago', country: 'Chile', tz: 'America/Santiago', lat: -33.45, lon: -70.67 },
  { id: 'sao-paulo', city: 'Sao Paulo', country: 'Brazil', tz: 'America/Sao_Paulo', lat: -23.55, lon: -46.63 },
  {
    id: 'buenos-aires',
    city: 'Buenos Aires',
    country: 'Argentina',
    tz: 'America/Argentina/Buenos_Aires',
    lat: -34.6,
    lon: -58.38,
  },
  { id: 'montevideo', city: 'Montevideo', country: 'Uruguay', tz: 'America/Montevideo', lat: -34.9, lon: -56.16 },
  { id: 'reykjavik', city: 'Reykjavik', country: 'Iceland', tz: 'Atlantic/Reykjavik', lat: 64.15, lon: -21.94 },
  { id: 'dublin', city: 'Dublin', country: 'Ireland', tz: 'Europe/Dublin', lat: 53.35, lon: -6.26 },
  { id: 'london', city: 'London', country: 'United Kingdom', tz: 'Europe/London', lat: 51.51, lon: -0.13 },
  { id: 'lisbon', city: 'Lisbon', country: 'Portugal', tz: 'Europe/Lisbon', lat: 38.72, lon: -9.14 },
  { id: 'paris', city: 'Paris', country: 'France', tz: 'Europe/Paris', lat: 48.86, lon: 2.35 },
  { id: 'madrid', city: 'Madrid', country: 'Spain', tz: 'Europe/Madrid', lat: 40.42, lon: -3.7 },
  { id: 'amsterdam', city: 'Amsterdam', country: 'Netherlands', tz: 'Europe/Amsterdam', lat: 52.37, lon: 4.9 },
  { id: 'berlin', city: 'Berlin', country: 'Germany', tz: 'Europe/Berlin', lat: 52.52, lon: 13.4 },
  { id: 'stockholm', city: 'Stockholm', country: 'Sweden', tz: 'Europe/Stockholm', lat: 59.33, lon: 18.07 },
  { id: 'zurich', city: 'Zurich', country: 'Switzerland', tz: 'Europe/Zurich', lat: 47.37, lon: 8.54 },
  { id: 'vienna', city: 'Vienna', country: 'Austria', tz: 'Europe/Vienna', lat: 48.21, lon: 16.37 },
  { id: 'prague', city: 'Prague', country: 'Czech Republic', tz: 'Europe/Prague', lat: 50.08, lon: 14.44 },
  { id: 'warsaw', city: 'Warsaw', country: 'Poland', tz: 'Europe/Warsaw', lat: 52.23, lon: 21.01 },
  { id: 'rome', city: 'Rome', country: 'Italy', tz: 'Europe/Rome', lat: 41.9, lon: 12.5 },
  { id: 'athens', city: 'Athens', country: 'Greece', tz: 'Europe/Athens', lat: 37.98, lon: 23.73 },
  { id: 'kyiv', city: 'Kyiv', country: 'Ukraine', tz: 'Europe/Kyiv', lat: 50.45, lon: 30.52 },
  { id: 'casablanca', city: 'Casablanca', country: 'Morocco', tz: 'Africa/Casablanca', lat: 33.57, lon: -7.59 },
  { id: 'accra', city: 'Accra', country: 'Ghana', tz: 'Africa/Accra', lat: 5.6, lon: -0.19 },
  { id: 'cairo', city: 'Cairo', country: 'Egypt', tz: 'Africa/Cairo', lat: 30.04, lon: 31.24 },
  { id: 'lagos', city: 'Lagos', country: 'Nigeria', tz: 'Africa/Lagos', lat: 6.52, lon: 3.38 },
  {
    id: 'addis-ababa',
    city: 'Addis Ababa',
    country: 'Ethiopia',
    tz: 'Africa/Addis_Ababa',
    lat: 9.03,
    lon: 38.74,
  },
  { id: 'nairobi', city: 'Nairobi', country: 'Kenya', tz: 'Africa/Nairobi', lat: -1.29, lon: 36.82 },
  {
    id: 'dar-es-salaam',
    city: 'Dar es Salaam',
    country: 'Tanzania',
    tz: 'Africa/Dar_es_Salaam',
    lat: -6.79,
    lon: 39.21,
  },
  {
    id: 'johannesburg',
    city: 'Johannesburg',
    country: 'South Africa',
    tz: 'Africa/Johannesburg',
    lat: -26.2,
    lon: 28.05,
  },
  { id: 'istanbul', city: 'Istanbul', country: 'Turkey', tz: 'Europe/Istanbul', lat: 41.01, lon: 28.98 },
  { id: 'jerusalem', city: 'Jerusalem', country: 'Israel', tz: 'Asia/Jerusalem', lat: 31.77, lon: 35.21 },
  { id: 'moscow', city: 'Moscow', country: 'Russia', tz: 'Europe/Moscow', lat: 55.76, lon: 37.62 },
  { id: 'tbilisi', city: 'Tbilisi', country: 'Georgia', tz: 'Asia/Tbilisi', lat: 41.72, lon: 44.79 },
  { id: 'riyadh', city: 'Riyadh', country: 'Saudi Arabia', tz: 'Asia/Riyadh', lat: 24.71, lon: 46.68 },
  { id: 'doha', city: 'Doha', country: 'Qatar', tz: 'Asia/Qatar', lat: 25.29, lon: 51.53 },
  { id: 'dubai', city: 'Dubai', country: 'United Arab Emirates', tz: 'Asia/Dubai', lat: 25.2, lon: 55.27 },
  { id: 'tehran', city: 'Tehran', country: 'Iran', tz: 'Asia/Tehran', lat: 35.69, lon: 51.39 },
  { id: 'karachi', city: 'Karachi', country: 'Pakistan', tz: 'Asia/Karachi', lat: 24.86, lon: 67.01 },
  { id: 'new-delhi', city: 'New Delhi', country: 'India', tz: 'Asia/Kolkata', lat: 28.61, lon: 77.21 },
  { id: 'mumbai', city: 'Mumbai', country: 'India', tz: 'Asia/Kolkata', lat: 19.08, lon: 72.88 },
  { id: 'colombo', city: 'Colombo', country: 'Sri Lanka', tz: 'Asia/Colombo', lat: 6.93, lon: 79.85 },
  { id: 'kathmandu', city: 'Kathmandu', country: 'Nepal', tz: 'Asia/Kathmandu', lat: 27.72, lon: 85.32 },
  { id: 'dhaka', city: 'Dhaka', country: 'Bangladesh', tz: 'Asia/Dhaka', lat: 23.81, lon: 90.41 },
  { id: 'yangon', city: 'Yangon', country: 'Myanmar', tz: 'Asia/Yangon', lat: 16.87, lon: 96.2 },
  { id: 'bangkok', city: 'Bangkok', country: 'Thailand', tz: 'Asia/Bangkok', lat: 13.76, lon: 100.5 },
  {
    id: 'ho-chi-minh-city',
    city: 'Ho Chi Minh City',
    country: 'Vietnam',
    tz: 'Asia/Ho_Chi_Minh',
    lat: 10.78,
    lon: 106.7,
  },
  { id: 'phnom-penh', city: 'Phnom Penh', country: 'Cambodia', tz: 'Asia/Phnom_Penh', lat: 11.56, lon: 104.92 },
  { id: 'jakarta', city: 'Jakarta', country: 'Indonesia', tz: 'Asia/Jakarta', lat: -6.21, lon: 106.85 },
  {
    id: 'kuala-lumpur',
    city: 'Kuala Lumpur',
    country: 'Malaysia',
    tz: 'Asia/Kuala_Lumpur',
    lat: 3.14,
    lon: 101.69,
  },
  { id: 'singapore', city: 'Singapore', country: 'Singapore', tz: 'Asia/Singapore', lat: 1.35, lon: 103.82 },
  { id: 'hong-kong', city: 'Hong Kong', country: 'China', tz: 'Asia/Hong_Kong', lat: 22.32, lon: 114.17 },
  { id: 'shanghai', city: 'Shanghai', country: 'China', tz: 'Asia/Shanghai', lat: 31.23, lon: 121.47 },
  { id: 'beijing', city: 'Beijing', country: 'China', tz: 'Asia/Shanghai', lat: 39.9, lon: 116.41 },
  { id: 'taipei', city: 'Taipei', country: 'Taiwan', tz: 'Asia/Taipei', lat: 25.03, lon: 121.57 },
  { id: 'seoul', city: 'Seoul', country: 'South Korea', tz: 'Asia/Seoul', lat: 37.57, lon: 126.98 },
  { id: 'tokyo', city: 'Tokyo', country: 'Japan', tz: 'Asia/Tokyo', lat: 35.68, lon: 139.65 },
  { id: 'manila', city: 'Manila', country: 'Philippines', tz: 'Asia/Manila', lat: 14.6, lon: 120.98 },
  { id: 'perth', city: 'Perth', country: 'Australia', tz: 'Australia/Perth', lat: -31.95, lon: 115.86 },
  { id: 'sydney', city: 'Sydney', country: 'Australia', tz: 'Australia/Sydney', lat: -33.87, lon: 151.21 },
  { id: 'melbourne', city: 'Melbourne', country: 'Australia', tz: 'Australia/Melbourne', lat: -37.81, lon: 144.96 },
  { id: 'auckland', city: 'Auckland', country: 'New Zealand', tz: 'Pacific/Auckland', lat: -36.85, lon: 174.76 },
  { id: 'fiji', city: 'Fiji', country: 'Fiji', tz: 'Pacific/Fiji', lat: -18.14, lon: 178.44 },
]

const CITY_BY_ID: Record<string, City> = Object.fromEntries(WORLD_CITIES.map((c) => [c.id, c]))

export function getCity(id: string): City | undefined {
  return CITY_BY_ID[id]
}

/** Default rows for a fresh widget instance: the browser's own time zone
 * (when it matches one of the curated cities exactly) plus a few widely
 * spread defaults, deduplicated. Falls back to the same fixed trio when
 * there's no match (e.g. the browser/test runner is on UTC), so the
 * default is still deterministic. */
export function defaultCityIds(localTimeZone: string): string[] {
  const local = WORLD_CITIES.find((c) => c.tz === localTimeZone)
  const fallback = ['london', 'new-york', 'tokyo']
  const ids = local ? [local.id, ...fallback] : fallback
  return Array.from(new Set(ids)).slice(0, 4)
}
