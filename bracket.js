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
