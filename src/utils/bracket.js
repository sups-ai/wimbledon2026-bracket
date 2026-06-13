import { ROUNDS, REDRAW_ROUNDS } from '../constants';

/**
 * Core bracket function. Takes R1 matchups (object keyed by matchId) and
 * user picks for all rounds, then:
 *   1. Builds each round's matchups from the previous round's picks
 *   2. Validates each round's picks against the freshly-built matchups —
 *      any pick whose player is no longer in the matchup (because an earlier
 *      round pick changed) is silently cleared rather than kept stale.
 *
 * Returns { allMatchups, validatedPicks } so both are always consistent.
 *
 * NOTE: operates on a SINGLE draw. For the both-draws model, call once per
 * draw with that draw's R1 matchups and that draw's picks.
 */
export function validateAndBuildAll(r1Matchups, rawPicks) {
  let prevMatchups = r1Matchups;           // object: { matchId → { id, p1, p2 } }
  let prevPicks    = rawPicks.R1 || {};    // object: { matchId → playerName }

  const allMatchups    = { R1: r1Matchups };
  const validatedPicks = { R1: rawPicks.R1 || {} };

  const subRounds = ['R2', 'R3', 'R16', 'QF', 'SF', 'Final'];

  for (const round of subRounds) {
    // --- Build this round's matchups ---
    const sortedIds    = Object.keys(prevMatchups).sort((a, b) => +a - +b);
    const currentMatchups = {};

    for (let i = 0; i < sortedIds.length; i += 2) {
      const id1 = sortedIds[i];
      const id2 = sortedIds[i + 1];
      if (id2 === undefined) break;           // shouldn't happen in a clean draw
      const matchId = String(Math.floor(i / 2) + 1);
      currentMatchups[matchId] = {
        id: matchId,
        p1: prevPicks[id1] || null,
        p2: prevPicks[id2] || null,
      };
    }
    allMatchups[round] = currentMatchups;

    // --- Validate picks for this round ---
    const rawRoundPicks   = rawPicks[round] || {};
    const validRoundPicks = {};

    for (const [matchId, pick] of Object.entries(rawRoundPicks)) {
      const matchup = currentMatchups[matchId];
      if (matchup && pick && (pick === matchup.p1 || pick === matchup.p2)) {
        validRoundPicks[matchId] = pick;
      }
      // else: pick is stale — drop it silently
    }
    validatedPicks[round] = validRoundPicks;

    // Advance for next round
    prevMatchups = currentMatchups;
    prevPicks    = validRoundPicks;
  }

  return { allMatchups, validatedPicks };
}

/**
 * How many matches are in each round for a 128-player draw.
 * Used to show "N of 64 picked" progress.
 */
export function roundPickedCount(picks, allMatchups, round) {
  const matchups = allMatchups[round] || {};
  const total   = Object.keys(matchups).length;
  const picked  = Object.values(picks[round] || {}).filter(Boolean).length;
  return { total, picked };
}

/**
 * Given the current picks object, apply a redraw: clear R16–Final picks
 * but preserve R1–R3.
 */
export function applyRedraw(picks) {
  const next = { ...picks };
  for (const r of REDRAW_ROUNDS) {
    next[r] = {};
  }
  return next;
}

/**
 * Completion summary for a single draw.
 * Returns { picked, total, complete } across all rounds, using freshly-built
 * matchups so it stays consistent with what the user can actually pick.
 */
export function drawCompletion(r1Matchups, picks) {
  const { allMatchups, validatedPicks } = validateAndBuildAll(r1Matchups || {}, picks || {});
  let picked = 0, total = 0;
  for (const r of ROUNDS) {
    const c = roundPickedCount(validatedPicks, allMatchups, r);
    picked += c.picked;
    total  += c.total;
  }
  return { picked, total, complete: total > 0 && picked === total };
}

/**
 * Parse a seed string from the API into a numeric priority.
 * Lower number = stronger seed = wins the auto-fill.
 * Numeric seeds ("1"–"32") → their integer value.
 * Special codes (WC, Q, LL, PR) and null/undefined → Infinity (weakest).
 */
function seedPriority(seedStr) {
  if (!seedStr) return Infinity;
  const n = parseInt(seedStr, 10);
  return Number.isFinite(n) ? n : Infinity;
}

/**
 * Auto-fill an entire draw by picking a winner for every match, round by round.
 * Cascades: R1 is filled first, then each subsequent round's matchups are built
 * from the prior round's picks before filling.
 *
 * mode === 'random'  → winner chosen at random from the two players.
 * mode === 'seed'    → higher seed advances (lower seed number wins).
 *                      Requires playerMeta map: { playerName: { seed, country } }.
 *                      When both players are unseeded/equal, falls back to random.
 *
 * The result is fully overridable: the user can change any pick afterward.
 */
export function autoFillDraw(r1Matchups, mode = 'random', playerMeta = {}) {
  const pickWinner = (m) => {
    const opts = [m.p1, m.p2].filter(Boolean);
    if (opts.length === 0) return null;
    if (opts.length === 1) return opts[0];

    if (mode === 'seed') {
      const s1 = seedPriority(playerMeta[m.p1]?.seed);
      const s2 = seedPriority(playerMeta[m.p2]?.seed);
      if (s1 !== s2) return s1 < s2 ? m.p1 : m.p2;
      // Equal priority (both unseeded or same seed) → random
    }
    return opts[Math.floor(Math.random() * opts.length)];
  };

  const picks = { R1: {} };
  for (const [id, m] of Object.entries(r1Matchups || {})) {
    const w = pickWinner(m);
    if (w) picks.R1[id] = w;
  }

  const subRounds = ['R2', 'R3', 'R16', 'QF', 'SF', 'Final'];
  for (const round of subRounds) {
    const { allMatchups } = validateAndBuildAll(r1Matchups || {}, picks);
    const m = allMatchups[round] || {};
    picks[round] = {};
    for (const [id, match] of Object.entries(m)) {
      const w = pickWinner(match);
      if (w) picks[round][id] = w;
    }
  }

  return picks;
}
