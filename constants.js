// ─── Invite codes ───────────────────────────────────────────────────────────
export const INVITE_CODE = 'ITHF2026WBLC';
export const DEMO_CODE   = 'WBLC2026TEST';

// ─── Key dates (all stored as UTC) ──────────────────────────────────────────
// Picks open: draw released June 26 — matchups populate automatically
// Picks lock: Mon June 29 · 6 AM ET  = 10:00 UTC
// Redraw open: Middle Sunday July 5 · midnight ET = 04:00 UTC
// Redraw deadline: Mon July 6 · 6 AM ET = 10:00 UTC  ← before R16 play begins
export const PICKS_DEADLINE   = new Date('2026-06-29T10:00:00Z');
export const REDRAW_OPEN      = new Date('2026-07-05T04:00:00Z');
export const REDRAW_DEADLINE  = new Date('2026-07-06T10:00:00Z'); // hard close before R16

// ─── Rounds ─────────────────────────────────────────────────────────────────
export const ROUNDS = ['R1', 'R2', 'R3', 'R16', 'QF', 'SF', 'Final'];

export const ROUND_LABELS = {
  R1:    'Round 1',
  R2:    'Round 2',
  R3:    'Round 3',
  R16:   'Round of 16',
  QF:    'Quarterfinals',
  SF:    'Semifinals',
  Final: 'Final',
};

/** Expected number of matches per round (128-player draw) */
export const ROUND_MATCH_COUNTS = {
  R1: 64, R2: 32, R3: 16, R16: 8, QF: 4, SF: 2, Final: 1,
};

// ─── Scoring ─────────────────────────────────────────────────────────────────
/** Points for each correct pick, by round */
export const ROUND_POINTS = {
  R1: 5, R2: 10, R3: 20, R16: 40, QF: 80, SF: 160, Final: 320,
};

/**
 * Additional bonus on top of the Final pick if your player wins the tournament.
 * Correct final pick = 320 (Finalist) + 320 (Champion) = 640 total.
 */
export const CHAMPION_BONUS = 320;

/** +5 for each match where the correct final-set score is predicted */
export const FINAL_SET_BONUS = 5;

/** Redraw penalty: deducted from total score when redraw is used */
export const REDRAW_PENALTY = 100;

/** Rounds that are reset and re-pickable on Middle Sunday */
export const REDRAW_ROUNDS = ['R16', 'QF', 'SF', 'Final'];

// ─── Draws ───────────────────────────────────────────────────────────────────
export const DRAWS = ['ATP', 'WTA'];
export const DRAW_LABELS = { ATP: "Men's Singles", WTA: "Women's Singles" };

// ─── Roles ───────────────────────────────────────────────────────────────────
export const ROLES = ['ELC Member', 'ITHF Staff', 'Guest'];

// ─── Design tokens ───────────────────────────────────────────────────────────
export const C = {
  green:       '#1a5c2e',
  greenDark:   '#143f20',
  greenLight:  '#2a7a3e',
  purple:      '#4b0082',
  purpleLight: '#6a1a9a',
  gold:        '#c9a84c',
  goldLight:   '#e0c070',
  bg:          '#f8f8f4',
  white:       '#ffffff',
  text:        '#1a1a1a',
  muted:       '#666666',
  subtle:      '#999999',
  border:      '#e0ddd5',
  error:       '#c62828',
  success:     '#2d6a4f',
};

// ─── Apps Script ─────────────────────────────────────────────────────────────
export const SCRIPT_URL = import.meta.env.VITE_APPS_SCRIPT_URL || '';
