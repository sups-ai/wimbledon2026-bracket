/**
 * Tennis / IOC 3-letter country codes → ISO 3166-1 alpha-2.
 * Needed because flag emoji are built from 2-letter codes,
 * but the Tennis API returns 3-letter codes (countryAcr).
 *
 * This covers every country that regularly appears in
 * professional tennis. Unknown codes fall back to first-two-letter
 * heuristic, which works for many (USA→US, FRA→FR, etc.).
 */
const COUNTRY_MAP = {
  // Major tennis nations
  USA: 'US', GBR: 'GB', GER: 'DE', SUI: 'CH', FRA: 'FR',
  ESP: 'ES', ITA: 'IT', AUS: 'AU', CAN: 'CA', ARG: 'AR',
  BRA: 'BR', JPN: 'JP', CHN: 'CN', KOR: 'KR', IND: 'IN',
  RSA: 'ZA', NZL: 'NZ', MEX: 'MX', COL: 'CO', CHI: 'CL',
  PER: 'PE', ECU: 'EC', URU: 'UY', VEN: 'VE', PAR: 'PY',
  DOM: 'DO', PUR: 'PR', HAI: 'HT', JAM: 'JM', BAH: 'BS',
  TRI: 'TT', BAR: 'BB', BER: 'BM', BOL: 'BO',
 
  // Europe
  AUT: 'AT', BEL: 'BE', NED: 'NL', DEN: 'DK', SWE: 'SE',
  NOR: 'NO', FIN: 'FI', POL: 'PL', CZE: 'CZ', SVK: 'SK',
  HUN: 'HU', ROU: 'RO', BUL: 'BG', CRO: 'HR', SRB: 'RS',
  SLO: 'SI', BIH: 'BA', MNE: 'ME', MKD: 'MK', ALB: 'AL',
  KOS: 'XK', GRE: 'GR', POR: 'PT', IRL: 'IE', UKR: 'UA',
  BLR: 'BY', EST: 'EE', LAT: 'LV', LTU: 'LT', GEO: 'GE',
  ARM: 'AM', AZE: 'AZ', CYP: 'CY', MLT: 'MT', LUX: 'LU',
  MON: 'MC', AND: 'AD', LIE: 'LI', ISL: 'IS',
 
  // Asia & Oceania
  TPE: 'TW', HKG: 'HK', THA: 'TH', PHI: 'PH', INA: 'ID',
  MAS: 'MY', SIN: 'SG', VIE: 'VN', PAK: 'PK', SRI: 'LK',
  BAN: 'BD', KAZ: 'KZ', UZB: 'UZ', TKM: 'TM', KGZ: 'KG',
  TJK: 'TJ', MGL: 'MN', FIJ: 'FJ', SAM: 'WS',
 
  // Middle East & Africa
  ISR: 'IL', LIB: 'LB', JOR: 'JO', KSA: 'SA', UAE: 'AE',
  QAT: 'QA', KUW: 'KW', BRN: 'BH', OMA: 'OM', IRI: 'IR',
  TUN: 'TN', ALG: 'DZ', MAR: 'MA', EGY: 'EG', NGR: 'NG',
  KEN: 'KE', ZIM: 'ZW', MOZ: 'MZ',
};
 
/**
 * Convert a 3-letter tennis/IOC country code to a 2-letter ISO code.
 * Falls back to first two characters if not in the lookup.
 */
export function toISO2(code3) {
  if (!code3) return null;
  const upper = code3.toUpperCase().trim();
  return COUNTRY_MAP[upper] || upper.slice(0, 2);
}
 
/**
 * Convert a 2-letter ISO country code to a flag emoji.
 * Works by mapping each letter to a Unicode Regional Indicator Symbol.
 */
export function isoToFlag(iso2) {
  if (!iso2 || iso2.length < 2) return '';
  return String.fromCodePoint(
    iso2.codePointAt(0) - 65 + 0x1F1E6,
    iso2.codePointAt(1) - 65 + 0x1F1E6,
  );
}
 
/**
 * Convenience: 3-letter tennis code → flag emoji in one call.
 * Returns empty string for null/undefined input.
 */
export function countryFlag(code3) {
  const iso = toISO2(code3);
  return iso ? isoToFlag(iso) : '';
}
 
