import { ROUNDS, ROUND_POINTS, CHAMPION_BONUS, REDRAW_PENALTY, FINAL_SET_BONUS } from '../constants';

/**
 * Calculate a user's total score.
 *
 * @param {Object} picks        - { R1: { matchId: playerName }, R2: ..., ... }
 * @param {Object} results      - same shape, keyed by round → matchId → winner name
 * @param {boolean} redrawUsed  - whether the −100 redraw penalty applies
 * @param {number}  finalSetSum - number of correctly-predicted final sets (each +5)
 * @returns {{ total: number, byRound: Object, breakdown: Object }}
 */
export function calculateScore(picks, results, redrawUsed = false, finalSetSum = 0) {
  const byRound  = {};
  const breakdown = {};
  let total = 0;

  for (const round of ROUNDS) {
    const roundPicks   = picks[round]   || {};
    const roundResults = results[round] || {};
    const pts          = ROUND_POINTS[round];
    let roundTotal     = 0;

    for (const [matchId, picked] of Object.entries(roundPicks)) {
      if (!picked) continue;
      const actual = roundResults[matchId];
      if (actual && picked === actual) {
        let earned = pts;
        // Final round: Finalist pts (already in ROUND_POINTS) + Champion bonus
        if (round === 'Final') earned += CHAMPION_BONUS;
        roundTotal += earned;
        if (!breakdown[round]) breakdown[round] = {};
        breakdown[round][matchId] = { picked, correct: true, pts: earned };
      } else if (actual) {
        if (!breakdown[round]) breakdown[round] = {};
        breakdown[round][matchId] = { picked, correct: false, actual, pts: 0 };
      }
    }

    byRound[round] = roundTotal;
    total += roundTotal;
  }

  // Final set bonus
  const setBonus = (finalSetSum || 0) * FINAL_SET_BONUS;
  total += setBonus;

  // Redraw penalty
  if (redrawUsed) total -= REDRAW_PENALTY;

  return { total, byRound, breakdown, setBonus };
}

/**
 * Max possible score for a complete, perfect bracket.
 * (For display purposes only.)
 */
export function maxPossibleScore() {
  const roundMax = ROUNDS.reduce((sum, r) => {
    const matchCount = { R1: 64, R2: 32, R3: 16, R16: 8, QF: 4, SF: 2, Final: 1 }[r];
    const bonus = r === 'Final' ? CHAMPION_BONUS : 0;
    return sum + matchCount * (ROUND_POINTS[r] + bonus);
  }, 0);
  return roundMax; // ~2,560 theoretical max — brief quotes ~1,890 practical
}
