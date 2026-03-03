/** The 7 macro-regions for WHERE markets */
export const REGIONS = [
  "north",
  "haifa",
  "sharon",
  "dan",
  "jerusalem",
  "south",
  "gaza_envelope",
] as const;

export type Region = (typeof REGIONS)[number];

export const REGION_LABELS: Record<Region, { he: string; en: string }> = {
  north: { he: "צפון", en: "North" },
  haifa: { he: "חיפה", en: "Haifa" },
  sharon: { he: "שרון", en: "Sharon" },
  dan: { he: "דן", en: "Dan" },
  jerusalem: { he: "ירושלים", en: "Jerusalem" },
  south: { he: "דרום", en: "South" },
  gaza_envelope: { he: "עוטף עזה", en: "Gaza Envelope" },
};

/**
 * Maps Hebrew city/area names from Pikud HaOref alerts to macro-regions.
 * This is a comprehensive but not exhaustive list — unknown cities
 * are resolved via fallback heuristics.
 */
const CITY_REGION_MAP: Record<string, Region> = {
  // === NORTH ===
  "קריית שמונה": "north",
  "מטולה": "north",
  "כפר גלעדי": "north",
  "דן": "north",
  "שדה נחמיה": "north",
  "הגושרים": "north",
  "יפתח": "north",
  "מרגליות": "north",
  "אביבים": "north",
  "צפת": "north",
  "ראש פינה": "north",
  "חצור הגלילית": "north",
  "כרמיאל": "north",
  "מעלות-תרשיחא": "north",
  "שלומי": "north",
  "נהריה": "north",
  "עכו": "north",
  "טבריה": "north",
  "מגדל העמק": "north",
  "עפולה": "north",
  "בית שאן": "north",
  "נצרת": "north",
  "נצרת עילית": "north",
  "נוף הגליל": "north",
  "יוקנעם": "north",
  "זכרון יעקב": "haifa",
  "מעלה אפרים": "north",

  // === HAIFA ===
  "חיפה": "haifa",
  "קריית אתא": "haifa",
  "קריית ביאליק": "haifa",
  "קריית ים": "haifa",
  "קריית מוצקין": "haifa",
  "טירת כרמל": "haifa",
  "נשר": "haifa",
  "חדרה": "haifa",
  "אור עקיבא": "haifa",
  "קיסריה": "haifa",
  "פרדס חנה-כרכור": "haifa",
  "בנימינה": "haifa",

  // === SHARON ===
  "נתניה": "sharon",
  "הרצליה": "sharon",
  "רעננה": "sharon",
  "כפר סבא": "sharon",
  "הוד השרון": "sharon",
  "רמת השרון": "sharon",
  "כפר יונה": "sharon",
  "אבן יהודה": "sharon",
  "קדימה-צורן": "sharon",
  "טייבה": "sharon",
  "קלנסווה": "sharon",

  // === DAN (Tel Aviv Metro) ===
  "תל אביב - יפו": "dan",
  "תל אביב": "dan",
  "רמת גן": "dan",
  "גבעתיים": "dan",
  "בני ברק": "dan",
  "חולון": "dan",
  "בת ים": "dan",
  "פתח תקווה": "dan",
  "ראשון לציון": "dan",
  "רחובות": "dan",
  "נס ציונה": "dan",
  "לוד": "dan",
  "רמלה": "dan",
  "מודיעין-מכבים-רעות": "dan",
  "מודיעין": "dan",
  "יהוד-מונוסון": "dan",
  "אור יהודה": "dan",
  "קריית אונו": "dan",
  "גבעת שמואל": "dan",
  "כפר קאסם": "dan",
  "ראש העין": "dan",
  "אלעד": "dan",
  "שוהם": "dan",

  // === JERUSALEM ===
  "ירושלים": "jerusalem",
  "בית שמש": "jerusalem",
  "מעלה אדומים": "jerusalem",
  "ביתר עילית": "jerusalem",
  "גבעת זאב": "jerusalem",
  "מבשרת ציון": "jerusalem",
  "אבו גוש": "jerusalem",
  "קריית יערים": "jerusalem",

  // === SOUTH ===
  "באר שבע": "south",
  "אשדוד": "south",
  "אשקלון": "south",
  "קריית גת": "south",
  "דימונה": "south",
  "ערד": "south",
  "אילת": "south",
  "אופקים": "south",
  "נתיבות": "south",
  "ירוחם": "south",
  "מצפה רמון": "south",
  "קריית מלאכי": "south",
  "גדרה": "south",
  "יבנה": "south",

  // === GAZA ENVELOPE ===
  "שדרות": "gaza_envelope",
  "עין השלושה": "gaza_envelope",
  "ניר עוז": "gaza_envelope",
  "כפר עזה": "gaza_envelope",
  "נחל עוז": "gaza_envelope",
  "בארי": "gaza_envelope",
  "רעים": "gaza_envelope",
  "כיסופים": "gaza_envelope",
  "סופה": "gaza_envelope",
  "חולית": "gaza_envelope",
  "קיבוץ זיקים": "gaza_envelope",
  "יד מרדכי": "gaza_envelope",
};

/**
 * Resolve a Hebrew city name to its macro-region.
 * Returns undefined if the city is not in the mapping.
 */
export function cityToRegion(city: string): Region | undefined {
  const trimmed = city.trim();
  return CITY_REGION_MAP[trimmed];
}

/**
 * Given a list of cities from an alert, returns deduplicated set of affected regions.
 */
export function citiesToRegions(cities: string[]): Region[] {
  const regions = new Set<Region>();
  for (const city of cities) {
    const region = cityToRegion(city);
    if (region) {
      regions.add(region);
    }
  }
  return [...regions];
}

/**
 * Best-effort region for an alert: returns the most common region among the cities.
 * If tied, returns the first in REGIONS order.
 */
export function primaryRegion(cities: string[]): Region | undefined {
  const counts = new Map<Region, number>();
  for (const city of cities) {
    const region = cityToRegion(city);
    if (region) {
      counts.set(region, (counts.get(region) ?? 0) + 1);
    }
  }

  if (counts.size === 0) return undefined;

  let best: Region | undefined;
  let bestCount = 0;
  for (const r of REGIONS) {
    const c = counts.get(r) ?? 0;
    if (c > bestCount) {
      best = r;
      bestCount = c;
    }
  }
  return best;
}
