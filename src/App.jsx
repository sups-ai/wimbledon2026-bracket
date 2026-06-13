import { useState, useEffect, useCallback } from 'react';
import {
  INVITE_CODE, DEMO_CODE,
  ROUNDS, ROUND_LABELS, ROUND_MATCH_COUNTS, ROUND_POINTS, CHAMPION_BONUS,
  REDRAW_ROUNDS, REDRAW_PENALTY,
  PICKS_DEADLINE, REDRAW_OPEN, REDRAW_DEADLINE,
  DRAWS, ROLES, FINAL_SET_VALID, FINAL_SET_BONUS,
  C, SCRIPT_URL,
} from './constants';
import { validateAndBuildAll, roundPickedCount, applyRedraw, drawCompletion, autoFillDraw } from './utils/bracket';
import { countryFlag } from './utils/countries';
import { loadSession, saveSession, clearSession } from './utils/storage';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatCountdown(target, now) {
  const diff = +target - +now;
  if (diff <= 0) return null;
  const totalSec = Math.floor(diff / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${String(h).padStart(2,'0')}h ${String(m).padStart(2,'0')}m ${String(s).padStart(2,'0')}s`;
}

function useWindowWidth() {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 400);
  useEffect(() => {
    const h = () => setW(window.innerWidth);
    window.addEventListener('resize', h);
    return () => window.removeEventListener('resize', h);
  }, []);
  return w;
}

function buildPlayerMeta(r1Matchups) {
  const meta = {};
  for (const dm of Object.values(r1Matchups || {})) {
    for (const m of Object.values(dm || {})) {
      if (m.p1) meta[m.p1] = { seed: m.seed1 || null, country: m.country1 || null };
      if (m.p2) meta[m.p2] = { seed: m.seed2 || null, country: m.country2 || null };
    }
  }
  return meta;
}

function fmtSeed(seed) {
  if (!seed) return null;
  const n = parseInt(seed, 10);
  return Number.isFinite(n) ? `[${n}]` : `(${seed})`;
}

// ─── Shared components ────────────────────────────────────────────────────────

function Btn({ children, onClick, variant = 'primary', disabled, style: extra = {}, ...props }) {
  const base = {
    border: 'none', borderRadius: '8px', fontSize: '13px', fontWeight: '600',
    cursor: disabled ? 'not-allowed' : 'pointer', padding: '12px 18px',
    fontFamily: 'var(--font-ui)', transition: 'opacity 0.15s',
    opacity: disabled ? 0.5 : 1, letterSpacing: '0.2px', ...extra,
  };
  const v = {
    primary:   { background: C.green, color: C.white },
    secondary: { background: C.bg, color: C.text, border: `1px solid ${C.border}` },
    purple:    { background: C.purple, color: C.white },
    gold:      { background: C.gold, color: C.green },
  };
  return <button onClick={!disabled ? onClick : undefined} style={{ ...base, ...v[variant] }} {...props}>{children}</button>;
}

function Badge({ children, color = C.gold }) {
  return <span style={{ display: 'inline-block', padding: '2px 7px', borderRadius: '4px', fontSize: '10px', fontWeight: '700', background: `${color}18`, color }}>{children}</span>;
}

// ─── GATE VIEW ────────────────────────────────────────────────────────────────

function GateView({ onEnter }) {
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [err, setErr] = useState('');
  const [step, setStep] = useState('code'); // code | register

  function submitCode() {
    const t = code.trim();
    if (t.toUpperCase() === INVITE_CODE.toUpperCase()) { setStep('register'); setErr(''); }
    else if (t.toUpperCase() === DEMO_CODE.toUpperCase()) { setStep('register'); setErr(''); }
    else setErr('Invalid code. Check your invite email.');
  }

  function submitRegister() {
    if (!name.trim()) return setErr('Please enter your name.');
    if (!role) return setErr('Please select your role.');
    const isDemo = code.trim().toUpperCase() === DEMO_CODE.toUpperCase();
    onEnter({ name: name.trim(), role }, isDemo);
  }

  const inputStyle = {
    display: 'block', width: '100%', padding: '12px 14px',
    border: `1px solid ${err ? C.error : '#d4d1c9'}`, borderRadius: '8px',
    fontSize: '14px', fontFamily: 'var(--font-ui)', boxSizing: 'border-box',
    background: C.bg, outline: 'none', color: C.text, marginBottom: '14px',
  };

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div className="slide-up" style={{ width: '100%', maxWidth: '380px', position: 'relative' }}>
        {/* Accent line */}
        <div style={{ height: '2px', background: `linear-gradient(90deg, ${C.purple}, ${C.gold})`, borderRadius: '1px', marginBottom: '36px' }} />

        <div style={{ textAlign: 'center', marginBottom: '40px' }}>
          <div style={{ fontSize: '9px', fontWeight: '600', letterSpacing: '3.5px', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>
            ITHF × Emerging Leaders Council
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '38px', fontWeight: '600', color: C.green, lineHeight: 1.0 }}>
            Wimbledon <span style={{ color: C.gold }}>'26</span>
          </div>
          <div style={{ fontSize: '12px', fontWeight: '500', letterSpacing: '2.5px', color: C.purple, textTransform: 'uppercase', marginTop: '8px' }}>
            Bracket Challenge
          </div>
        </div>

        {step === 'code' ? (
          <div style={{ maxWidth: '260px', margin: '0 auto' }}>
            <input
              type="password"
              value={code}
              onChange={e => { setCode(e.target.value); setErr(''); }}
              onKeyDown={e => e.key === 'Enter' && submitCode()}
              placeholder="Invite code"
              autoComplete="off"
              style={{ ...inputStyle, textAlign: 'center', letterSpacing: '2px', border: 'none', borderBottom: `1.5px solid ${err ? C.error : '#ccc8be'}`, borderRadius: 0, background: 'transparent', padding: '12px 0' }}
            />
            {err && <p style={{ color: C.error, fontSize: '12px', marginBottom: '12px', textAlign: 'center' }}>{err}</p>}
            <Btn onClick={submitCode} style={{ width: '100%', marginTop: '8px' }}>Enter Challenge →</Btn>
          </div>
        ) : (
          <div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>Full name</label>
              <input value={name} onChange={e => { setName(e.target.value); setErr(''); }} placeholder="Your full name" style={inputStyle} />
            </div>
            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '5px' }}>Role</label>
              <select value={role} onChange={e => { setRole(e.target.value); setErr(''); }} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
                <option value="">Select role…</option>
                {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
              </select>
            </div>
            <div style={{ background: `${C.green}08`, border: `1px solid ${C.green}18`, borderRadius: '8px', padding: '11px 14px', marginBottom: '18px', fontSize: '12px', color: C.text, lineHeight: 1.55 }}>
              You'll fill out <strong>both ATP and WTA draws</strong> — toggle between them on the next screen.
            </div>
            {err && <p style={{ color: C.error, fontSize: '12px', marginBottom: '12px' }}>{err}</p>}
            <Btn onClick={submitRegister} style={{ width: '100%' }}>Start Picking →</Btn>
          </div>
        )}

        <div style={{ textAlign: 'center', marginTop: '36px' }}>
          <p style={{ fontSize: '10.5px', color: '#aaa7a0', lineHeight: 1.8 }}>
            Picks open Fri June 26 · Lock Mon June 29 · 6 AM ET
          </p>
          <p style={{ fontSize: '10.5px', color: '#aaa7a0', lineHeight: 1.8 }}>
            Presented by the ITHF ELC
          </p>
        </div>
      </div>
    </div>
  );
}

// ─── MATCH CARD ───────────────────────────────────────────────────────────────

function MatchCard({ matchup, picked, onPick, result, disabled, playerMeta, compact }) {
  const { id, p1, p2 } = matchup;
  const players = [p1, p2];
  const pad = compact ? '8px 10px' : '11px 14px';

  return (
    <div style={{ borderRadius: compact ? '6px' : '8px', overflow: 'hidden', marginBottom: compact ? '4px' : '6px', background: '#fafaf7', border: '0.5px solid rgba(0,0,0,0.05)' }}>
      {players.map((player, idx) => {
        const isSelected = picked === player && !!player;
        const isWinner = result === player && !!player;
        const isLoser = result && result !== player;
        const noPlayer = !player;
        const meta = player ? (playerMeta || {})[player] : null;
        const seed = meta ? fmtSeed(meta.seed) : null;
        const flag = meta ? countryFlag(meta.country) : '';

        return (
          <div
            key={idx}
            className={!disabled && player ? 'match-player' : ''}
            onClick={() => !disabled && player && onPick(id, player)}
            style={{
              padding: pad,
              display: 'flex', alignItems: 'center', gap: compact ? '6px' : '9px',
              cursor: !disabled && player ? 'pointer' : 'default',
              background: isSelected ? 'rgba(26,92,46,0.04)' : isWinner ? 'rgba(201,168,76,0.06)' : 'transparent',
              borderTop: idx === 0 ? 'none' : '0.5px solid rgba(0,0,0,0.04)',
              opacity: isLoser ? 0.35 : 1,
              position: 'relative',
              transition: 'background 0.1s',
            }}
          >
            {/* Left accent bar */}
            {isSelected && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '2.5px', background: C.green, borderRadius: '0 1px 1px 0' }} />}
            {isWinner && !isSelected && <div style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '2.5px', background: C.gold, borderRadius: '0 1px 1px 0' }} />}

            {flag && <span style={{ fontSize: compact ? '12px' : '14px', lineHeight: 1, flexShrink: 0 }}>{flag}</span>}
            {seed && <span style={{ fontSize: compact ? '9px' : '10.5px', fontWeight: '700', color: '#aaa', minWidth: compact ? '14px' : '18px', textAlign: 'right', flexShrink: 0 }}>{seed}</span>}

            <span style={{
              fontSize: compact ? '11px' : '13.5px',
              fontWeight: isSelected ? '600' : '400',
              color: noPlayer ? '#ccc' : isSelected ? C.text : '#444',
              flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontStyle: noPlayer ? 'italic' : 'normal',
            }}>
              {player || 'TBD'}
            </span>

            {isWinner && <Badge color={C.gold}>W</Badge>}

            {/* Selection indicator (right side) */}
            {!compact && !result && (
              <div style={{
                width: '14px', height: '14px', borderRadius: '50%', flexShrink: 0,
                border: `1.5px solid ${isSelected ? C.green : '#ddd'}`,
                background: isSelected ? C.green : 'transparent',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                {isSelected && <div style={{ width: '4px', height: '4px', borderRadius: '50%', background: '#fff' }} />}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── ACCORDION ROUND ──────────────────────────────────────────────────────────

function AccordionRound({ round, picks, allMatchups, results, onPick, isLocked, isComplete, isFuture, expanded, onToggle, playerMeta }) {
  const matchups = allMatchups[round] || {};
  const matchList = Object.values(matchups).sort((a, b) => +a.id - +b.id);
  const { total, picked } = roundPickedCount(picks, allMatchups, round);
  const roundResults = results[round] || {};
  const roundPicks = picks[round] || {};

  return (
    <div style={{ margin: '4px 12px 5px', borderRadius: '9px', overflow: 'hidden', background: '#fff', border: '0.5px solid rgba(0,0,0,0.05)', opacity: isFuture ? 0.35 : 1, transition: 'opacity 0.2s' }}>
      {/* Header */}
      <div
        onClick={!isFuture ? onToggle : undefined}
        style={{ padding: '13px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: isFuture ? 'default' : 'pointer' }}
      >
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span style={{ fontSize: '13.5px', fontWeight: '600', color: C.text }}>{ROUND_LABELS[round]}</span>
          <span style={{ fontSize: '10.5px', color: '#b5b1a8' }}>{ROUND_POINTS[round]} pts{round === 'Final' ? ` · +${CHAMPION_BONUS} champ` : ''}</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          {isFuture ? (
            <span style={{ fontSize: '10.5px', color: '#ccc' }}>Complete {ROUND_LABELS[ROUNDS[ROUNDS.indexOf(round) - 1]]} first</span>
          ) : isComplete ? (
            <span style={{ fontSize: '10.5px', fontWeight: '600', color: C.gold }}>{total}/{total} ✓</span>
          ) : total > 0 ? (
            <span style={{ fontSize: '10.5px', fontWeight: '600', color: C.green }}>{picked}/{total}</span>
          ) : null}
          <span style={{ fontSize: '12px', color: '#ccc', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none' }}>▾</span>
        </div>
      </div>

      {/* Collapsed summary (completed rounds) */}
      {!expanded && isComplete && (
        <div style={{ padding: '2px 14px 10px' }}>
          {Object.entries(roundPicks).sort(([a],[b]) => +a - +b).slice(0, 3).map(([matchId, player]) => {
            const meta = playerMeta[player];
            const flag = meta ? countryFlag(meta.country) : '';
            const seed = meta ? fmtSeed(meta.seed) : '';
            return (
              <div key={matchId} style={{ display: 'flex', alignItems: 'center', gap: '7px', padding: '3px 0', fontSize: '11px', color: '#999' }}>
                {flag && <span style={{ fontSize: '11px' }}>{flag}</span>}
                <span style={{ flex: 1, color: '#666', fontWeight: '500' }}>{seed ? `${seed} ` : ''}{player}</span>
                <span style={{ color: C.gold, fontWeight: '700', fontSize: '9px' }}>✓</span>
              </div>
            );
          })}
          {total > 3 && (
            <div style={{ fontSize: '10px', color: '#ccc', fontStyle: 'italic', padding: '2px 0' }}>+ {total - 3} more picks</div>
          )}
        </div>
      )}

      {/* Expanded body */}
      {expanded && !isFuture && (
        <div style={{ padding: '0 10px 12px' }}>
          {/* Progress bar */}
          {total > 0 && (
            <div style={{ marginBottom: '10px' }}>
              <div style={{ height: '2px', background: '#eae7e0', borderRadius: '1px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${total > 0 ? (picked / total) * 100 : 0}%`, background: picked === total ? C.gold : C.green, borderRadius: '1px', transition: 'width 0.25s' }} />
              </div>
            </div>
          )}

          {matchList.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px 16px', color: '#bbb', fontSize: '13px' }}>
              {round === 'R1' ? 'Draw releases Friday June 26' : 'Complete earlier rounds to unlock'}
            </div>
          ) : (
            matchList.map(matchup => (
              <MatchCard
                key={matchup.id}
                matchup={matchup}
                picked={roundPicks[matchup.id]}
                onPick={(matchId, player) => onPick(round, matchId, player)}
                result={roundResults[matchup.id]}
                disabled={isLocked}
                playerMeta={playerMeta}
              />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ─── COLUMN BRACKET (Desktop) ─────────────────────────────────────────────────

function ColumnBracket({ picks, allMatchups, results, onPick, isRoundLocked, playerMeta }) {
  return (
    <div style={{ display: 'flex', alignItems: 'stretch', padding: '16px 12px', overflowX: 'auto', gap: '8px' }}>
      {ROUNDS.map(round => {
        const matchups = allMatchups[round] || {};
        const matchList = Object.values(matchups).sort((a, b) => +a.id - +b.id);
        const roundResults = results[round] || {};
        const roundPicks = picks[round] || {};
        const locked = isRoundLocked(round);
        const isFinal = round === 'Final';

        return (
          <div key={round} style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', minWidth: isFinal ? '90px' : '88px' }}>
            {/* Column header */}
            <div style={{ fontSize: '9px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase', color: '#999', textAlign: 'center', padding: '0 0 6px', whiteSpace: 'nowrap' }}>
              {round} · <span style={{ color: C.gold, fontWeight: '700' }}>{ROUND_POINTS[round]}</span>
            </div>
            {/* Matches distributed vertically */}
            <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'space-around', gap: '3px' }}>
              {matchList.length === 0 ? (
                <div style={{ textAlign: 'center', fontSize: '9px', color: '#ccc', padding: '8px 4px' }}>—</div>
              ) : (
                matchList.map(matchup => (
                  <MatchCard
                    key={matchup.id}
                    matchup={matchup}
                    picked={roundPicks[matchup.id]}
                    onPick={(matchId, player) => onPick(round, matchId, player)}
                    result={roundResults[matchup.id]}
                    disabled={locked}
                    playerMeta={playerMeta}
                    compact
                  />
                ))
              )}
            </div>
          </div>
        );
      })}

      {/* Champion column */}
      <div style={{ flex: '0 0 auto', display: 'flex', flexDirection: 'column', minWidth: '86px' }}>
        <div style={{ fontSize: '9px', fontWeight: '600', letterSpacing: '1px', textTransform: 'uppercase', color: '#999', textAlign: 'center', padding: '0 0 6px' }}>
          Champion · <span style={{ color: C.gold, fontWeight: '700' }}>+{CHAMPION_BONUS}</span>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
          {(() => {
            const finalPicks = picks.Final || {};
            const champion = Object.values(finalPicks)[0];
            const meta = champion ? (playerMeta || {})[champion] : null;
            const flag = meta ? countryFlag(meta.country) : '';
            return (
              <div style={{ background: '#fff', border: `1.5px solid ${C.gold}`, borderRadius: '7px', padding: '10px 8px', textAlign: 'center', width: '80px' }}>
                <div style={{ fontSize: '7px', fontWeight: '700', letterSpacing: '1px', color: C.gold, textTransform: 'uppercase', marginBottom: '3px' }}>Your pick</div>
                <div style={{ fontSize: '16px', marginBottom: '2px' }}>🏆</div>
                {champion ? (
                  <>
                    <div style={{ fontSize: '11px', fontWeight: '600', color: C.green }}>{flag} {champion}</div>
                    <div style={{ fontSize: '8px', color: '#999', marginTop: '2px' }}>{ROUND_POINTS.Final + CHAMPION_BONUS} pts if correct</div>
                  </>
                ) : (
                  <div style={{ fontSize: '10px', color: '#ccc', fontStyle: 'italic' }}>Pick all rounds</div>
                )}
              </div>
            );
          })()}
        </div>
      </div>
    </div>
  );
}

// ─── REVIEW MODAL ─────────────────────────────────────────────────────────────

function ReviewModal({ finalSetSum, setFinalSetSum, onConfirm, onCancel, submitting, submitError }) {
  const valid = d => FINAL_SET_VALID.includes(Number(finalSetSum[d]));
  const bothValid = valid('ATP') && valid('WTA');
  const setVal = (d, v) => setFinalSetSum(prev => ({ ...prev, [d]: v === '' ? '' : Number(v) }));

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', zIndex: 300 }}>
      <div className="slide-up" style={{ background: '#fff', borderRadius: '14px', padding: '28px 24px', maxWidth: '400px', width: '100%', maxHeight: '90vh', overflowY: 'auto' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '600', color: C.text, marginBottom: '6px' }}>
          Final set tiebreaker
        </h2>
        <p style={{ color: C.muted, fontSize: '13px', lineHeight: 1.6, marginBottom: '20px' }}>
          Predict the total games in each final's last set. +{FINAL_SET_BONUS} pts if correct. Valid: {FINAL_SET_VALID.join(', ')} (no 12 — tiebreak at 6-6).
        </p>

        {DRAWS.map(d => {
          const v = finalSetSum[d];
          const touched = v !== '' && v !== undefined && v !== null;
          const ok = valid(d);
          return (
            <div key={d} style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '11px', fontWeight: '600', color: C.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '6px' }}>{d} final · final-set games</label>
              <input
                type="number" inputMode="numeric"
                value={v === undefined || v === null ? '' : v}
                onChange={e => setVal(d, e.target.value)}
                placeholder="e.g. 10"
                style={{ width: '100%', padding: '12px 14px', border: `1px solid ${touched && !ok ? C.error : '#d4d1c9'}`, borderRadius: '8px', fontSize: '15px', fontFamily: 'var(--font-ui)', boxSizing: 'border-box', background: C.bg, outline: 'none', color: C.text }}
              />
              {touched && !ok && <div style={{ fontSize: '12px', color: C.error, marginTop: '5px' }}>Must be one of: {FINAL_SET_VALID.join(', ')}</div>}
            </div>
          );
        })}

        {submitError && <div style={{ background: `${C.error}14`, border: `1px solid ${C.error}44`, borderRadius: '6px', padding: '8px 12px', fontSize: '13px', color: C.error, marginBottom: '12px' }}>{submitError}</div>}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '8px' }}>
          <Btn variant="secondary" onClick={onCancel} disabled={submitting}>Back</Btn>
          <Btn onClick={bothValid ? onConfirm : undefined} disabled={!bothValid || submitting}>{submitting ? 'Submitting…' : 'Submit both →'}</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── REDRAW CONFIRM MODAL ─────────────────────────────────────────────────────

function RedrawConfirmModal({ draw, countdown, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', zIndex: 200 }}>
      <div className="slide-up" style={{ background: '#fff', borderRadius: '14px', padding: '28px 24px', maxWidth: '380px', width: '100%' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '600', color: C.text, textAlign: 'center', marginBottom: '12px' }}>
          Use Middle Sunday Redraw?
        </h2>
        <p style={{ color: C.muted, fontSize: '13px', lineHeight: 1.6, textAlign: 'center', marginBottom: '20px' }}>
          Resets your <strong>{draw}</strong> R16, QF, SF, and Final picks. One use per draw. Costs <strong style={{ color: C.error }}>−{REDRAW_PENALTY} pts</strong>.
        </p>
        <div style={{ background: `${C.purple}0d`, border: `1px solid ${C.purple}30`, borderRadius: '10px', padding: '14px', marginBottom: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: '600', color: C.purple, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>Window closes in</div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: '600', color: C.purple }}>{countdown || '—'}</div>
          <div style={{ fontSize: '11px', color: C.muted, marginTop: '3px' }}>Mon 6 July · 6 AM ET</div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
          <Btn variant="purple" onClick={onConfirm}>Confirm Redraw</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── BRACKET PICKER VIEW ──────────────────────────────────────────────────────

function BracketPickerView({
  user, picks, setPicks, finalSetSum, setFinalSetSum,
  r1Matchups, results, submitted, onSubmit, onSubmitRedraw,
  now, redrawUsed, submitting, submitError, onClearError,
}) {
  const [activeDraw, setActiveDraw] = useState('ATP');
  const [expandedRound, setExpandedRound] = useState('R1');
  const [showRedrawConfirm, setShowRedrawConfirm] = useState(false);
  const [redrawMode, setRedrawMode] = useState(false);
  const [showReview, setShowReview] = useState(false);

  const width = useWindowWidth();
  const isDesktop = width >= 768;

  const picksLocked = now > PICKS_DEADLINE;
  const isRedrawWindow = now >= REDRAW_OPEN && now <= REDRAW_DEADLINE;
  const redrawCountdown = formatCountdown(REDRAW_DEADLINE, now);
  const picksCountdown = formatCountdown(PICKS_DEADLINE, now);

  const drawR1 = r1Matchups[activeDraw] || {};
  const drawPicks = picks[activeDraw] || {};
  const drawResults = results[activeDraw] || {};
  const playerMeta = buildPlayerMeta(r1Matchups);

  const { allMatchups, validatedPicks } = validateAndBuildAll(drawR1, drawPicks);

  useEffect(() => {
    if (JSON.stringify(validatedPicks) !== JSON.stringify(drawPicks)) {
      setPicks(prev => ({ ...prev, [activeDraw]: validatedPicks }));
    }
  }, [JSON.stringify(validatedPicks), activeDraw]);

  const roundProgress = ROUNDS.reduce((acc, r) => {
    acc[r] = roundPickedCount(picks[activeDraw] || {}, allMatchups, r);
    return acc;
  }, {});

  const compATP = drawCompletion(r1Matchups.ATP || {}, picks.ATP || {});
  const compWTA = drawCompletion(r1Matchups.WTA || {}, picks.WTA || {});
  const bothComplete = compATP.complete && compWTA.complete;
  const drawComp = { ATP: compATP, WTA: compWTA };

  // Auto-expand first incomplete round
  useEffect(() => {
    const first = ROUNDS.find(r => {
      const { total, picked } = roundProgress[r] || {};
      return total > 0 && picked < total;
    });
    if (first && first !== expandedRound) setExpandedRound(first);
  }, [activeDraw]);

  function isRoundLocked(round) {
    if (!submitted) return picksLocked;
    if (redrawMode && REDRAW_ROUNDS.includes(round)) return false;
    return true;
  }

  function isRoundFuture(round) {
    const idx = ROUNDS.indexOf(round);
    if (idx === 0) return false;
    const prev = ROUNDS[idx - 1];
    const { total, picked } = roundProgress[prev] || {};
    return total === 0 || picked < total;
  }

  function handlePick(round, matchId, player) {
    if (isRoundLocked(round)) return;
    setPicks(prev => ({
      ...prev,
      [activeDraw]: {
        ...(prev[activeDraw] || {}),
        [round]: { ...((prev[activeDraw] || {})[round] || {}), [matchId]: player },
      },
    }));
  }

  function handleAutoFill(mode = 'random') {
    if (Object.keys(drawR1).length === 0) return;
    const label = mode === 'seed' ? 'seed-based' : 'random';
    const hasPicks = ROUNDS.some(r => Object.keys((picks[activeDraw] || {})[r] || {}).length > 0);
    if (hasPicks && !window.confirm(`Replace all ${activeDraw} picks with a ${label} fill?`)) return;
    const filled = autoFillDraw(drawR1, mode, playerMeta);
    setPicks(prev => ({ ...prev, [activeDraw]: filled }));
    setExpandedRound('Final');
  }

  // Redraw
  function startRedraw() { setShowRedrawConfirm(false); setRedrawMode(true); setPicks(prev => ({ ...prev, [activeDraw]: applyRedraw(prev[activeDraw] || {}) })); setExpandedRound('R16'); }
  function cancelRedraw() { setRedrawMode(false); }
  async function submitRedraw() { await onSubmitRedraw(activeDraw, picks[activeDraw] || {}); setRedrawMode(false); }

  // Submit
  function handlePrimary() {
    if (picksLocked) return;
    if (bothComplete) { setShowReview(true); return; }
    if (!compATP.complete && activeDraw !== 'ATP') { setActiveDraw('ATP'); return; }
    if (compATP.complete && !compWTA.complete && activeDraw !== 'WTA') { setActiveDraw('WTA'); return; }
  }
  async function confirmSubmit() { await onSubmit(); setShowReview(false); }

  const hasSeeds = Object.values(drawR1).some(m => m.seed1 || m.seed2);
  const hasMatchups = Object.keys(drawR1).length > 0;

  return (
    <div style={{ background: C.bg, minHeight: '100vh', paddingBottom: '68px' }}>

      {/* Draw toggle */}
      <div style={{ display: 'flex', gap: '4px', padding: '10px 12px 6px' }}>
        {DRAWS.map(d => {
          const on = activeDraw === d;
          const comp = drawComp[d];
          return (
            <button key={d} onClick={() => { setActiveDraw(d); setExpandedRound('R1'); }}
              style={{ flex: 1, padding: '9px 8px', borderRadius: '8px', border: `1px solid ${on ? C.green : '#e4e1d9'}`, background: on ? 'rgba(26,92,46,0.03)' : '#fff', textAlign: 'center', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: '16px', fontWeight: '700', color: on ? C.green : '#ccc' }}>{d}</div>
              <div style={{ fontSize: '9px', fontWeight: '600', color: on ? (comp.complete ? C.gold : C.green) : '#bbb', marginTop: '1px' }}>
                {comp.complete ? 'Complete ✓' : `${comp.picked} of ${comp.total || '—'}`}
              </div>
            </button>
          );
        })}
      </div>

      {/* Countdown / redraw banner */}
      {!submitted && picksCountdown && (
        <div style={{ margin: '4px 12px 2px', padding: '7px 12px', background: 'rgba(26,92,46,0.06)', borderRadius: '6px', fontSize: '10.5px', color: '#666' }}>
          {activeDraw} locks <strong style={{ color: C.green }}>{picksCountdown}</strong>
        </div>
      )}
      {submitted && isRedrawWindow && !redrawUsed[activeDraw] && !redrawMode && (
        <div style={{ margin: '4px 12px', padding: '8px 12px', background: `${C.purple}0d`, borderRadius: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '11px', fontWeight: '600', color: C.purple }}>{activeDraw} redraw available</div>
            <div style={{ fontSize: '10px', color: '#999' }}>Closes {redrawCountdown}</div>
          </div>
          <Btn variant="gold" onClick={() => setShowRedrawConfirm(true)} style={{ padding: '6px 12px', fontSize: '11px' }}>Use (−{REDRAW_PENALTY})</Btn>
        </div>
      )}

      {/* Auto-fill */}
      {!submitted && !picksLocked && hasMatchups && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '8px 12px', flexWrap: 'wrap' }}>
          <span style={{ fontSize: '11px', color: '#999', fontWeight: '600' }}>Auto-fill {activeDraw}:</span>
          <button onClick={() => handleAutoFill('random')} style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid ${C.green}`, background: `${C.green}08`, color: C.green, fontSize: '11px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>Fill randomly</button>
          <button onClick={hasSeeds ? () => handleAutoFill('seed') : undefined} disabled={!hasSeeds} title={hasSeeds ? 'Higher seed advances' : 'Available June 26'}
            style={{ padding: '5px 10px', borderRadius: '6px', border: `1px solid ${hasSeeds ? C.gold : '#ddd'}`, background: hasSeeds ? `${C.gold}14` : '#f5f5f0', color: hasSeeds ? C.gold : '#ccc', fontSize: '11px', fontWeight: '600', cursor: hasSeeds ? 'pointer' : 'not-allowed', fontFamily: 'var(--font-ui)' }}>Fill by seed</button>
        </div>
      )}

      {/* Bracket body */}
      {isDesktop ? (
        <ColumnBracket
          picks={picks[activeDraw] || {}}
          allMatchups={allMatchups}
          results={drawResults}
          onPick={handlePick}
          isRoundLocked={isRoundLocked}
          playerMeta={playerMeta}
        />
      ) : (
        <div style={{ padding: '4px 0' }}>
          {ROUNDS.map(round => {
            const { total, picked } = roundProgress[round] || {};
            const complete = total > 0 && picked === total;
            const future = isRoundFuture(round);
            return (
              <AccordionRound
                key={round}
                round={round}
                picks={picks[activeDraw] || {}}
                allMatchups={allMatchups}
                results={drawResults}
                onPick={handlePick}
                isLocked={isRoundLocked(round)}
                isComplete={complete}
                isFuture={future}
                expanded={expandedRound === round}
                onToggle={() => setExpandedRound(expandedRound === round ? null : round)}
                playerMeta={playerMeta}
              />
            );
          })}
        </div>
      )}

      {/* Submit footer */}
      {!submitted && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: '#fff', borderTop: '0.5px solid rgba(0,0,0,0.08)', padding: '12px 16px', zIndex: 100, display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: '11px', fontWeight: '600', color: C.text }}>
              ATP {compATP.complete ? '✓' : `${compATP.picked}/${compATP.total || '—'}`} · WTA {compWTA.complete ? '✓' : `${compWTA.picked}/${compWTA.total || '—'}`}
            </div>
            <div style={{ fontSize: '9.5px', color: '#aaa', marginTop: '1px' }}>{bothComplete ? 'Both draws complete' : 'Fill both draws to submit'}</div>
          </div>
          <Btn onClick={handlePrimary} disabled={submitting || picksLocked} style={{ flexShrink: 0 }}>
            {submitting ? 'Submitting…' : picksLocked ? 'Locked' : bothComplete ? 'Review & Submit →' : 'Continue →'}
          </Btn>
        </div>
      )}

      {/* Redraw submit footer */}
      {redrawMode && (
        <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: `${C.purple}f5`, borderTop: `2px solid ${C.purple}`, padding: '12px 16px', zIndex: 100 }}>
          <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '11px', fontWeight: '600', color: C.gold }}>{activeDraw} redraw · −{REDRAW_PENALTY} pts</div>
              <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.6)' }}>Closes: {redrawCountdown || '…'}</div>
            </div>
            <Btn variant="secondary" onClick={cancelRedraw} style={{ padding: '8px 12px', fontSize: '11px' }}>Cancel</Btn>
            <Btn variant="gold" onClick={submitRedraw} disabled={submitting} style={{ padding: '8px 14px', fontSize: '11px' }}>Submit Redraw →</Btn>
          </div>
        </div>
      )}

      {showRedrawConfirm && <RedrawConfirmModal draw={activeDraw} countdown={redrawCountdown} onConfirm={startRedraw} onCancel={() => setShowRedrawConfirm(false)} />}
      {showReview && <ReviewModal finalSetSum={finalSetSum} setFinalSetSum={setFinalSetSum} onConfirm={confirmSubmit} onCancel={() => { setShowReview(false); onClearError(); }} submitting={submitting} submitError={submitError} />}
    </div>
  );
}

// ─── LEADERBOARD VIEW ─────────────────────────────────────────────────────────

function LeaderboardView({ leaderboard, user, results, onViewPicks }) {
  const [tab, setTab] = useState('Combined');

  const byName = {};
  for (const e of leaderboard) {
    if (!byName[e.name]) byName[e.name] = { name: e.name, role: e.role, byDraw: {}, total: 0, redrawAny: false };
    byName[e.name].byDraw[e.draw] = e;
    byName[e.name].total += (e.score || 0);
    if (e.redrawUsed) byName[e.name].redrawAny = true;
  }
  const people = Object.values(byName);
  let rows = tab === 'Combined'
    ? people.map(p => ({ person: p, score: p.total }))
    : people.filter(p => p.byDraw[tab]).map(p => ({ person: p, score: p.byDraw[tab].score || 0 }));
  rows.sort((a, b) => b.score - a.score);

  const champion = [];
  for (const d of ['ATP', 'WTA']) {
    const fin = results?.[d]?.Final || {};
    const w = Object.values(fin)[0];
    if (w) champion.push(`${d}: ${w}`);
  }

  const MEDALS = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ background: C.bg, minHeight: '100vh' }}>
      {champion.length > 0 && (
        <div style={{ margin: '12px 12px 0', background: `${C.gold}14`, border: `1px solid ${C.gold}44`, borderRadius: '8px', padding: '10px 14px' }}>
          <span style={{ fontSize: '10px', fontWeight: '600', color: C.gold, textTransform: 'uppercase', letterSpacing: '1.5px' }}>Champion 🏆 </span>
          <span style={{ fontSize: '13px', fontWeight: '600', color: C.text }}>{champion.join('  ·  ')}</span>
        </div>
      )}

      {/* Draw tabs */}
      <div style={{ display: 'flex', margin: '12px 12px 0', background: '#fff', borderRadius: '8px', border: '0.5px solid rgba(0,0,0,0.06)', overflow: 'hidden' }}>
        {['Combined', 'ATP', 'WTA'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            style={{ flex: 1, padding: '10px', background: tab === t ? C.green : 'transparent', border: 'none', color: tab === t ? '#fff' : C.muted, fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'var(--font-ui)' }}>
            {t}
          </button>
        ))}
      </div>

      <div style={{ padding: '12px' }}>
        {rows.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: '#bbb', fontSize: '13px' }}>No entries yet</div>
        ) : rows.map(({ person, score }, idx) => {
          const isMe = user && person.name === user.name;
          const viewDraw = tab === 'Combined' ? (person.byDraw.ATP ? 'ATP' : 'WTA') : tab;
          return (
            <div key={`${person.name}-${idx}`} onClick={() => onViewPicks(person, viewDraw)}
              style={{ background: isMe ? `${C.green}08` : '#fff', border: `0.5px solid ${isMe ? C.green + '44' : 'rgba(0,0,0,0.05)'}`, borderRadius: '9px', padding: '13px 14px', marginBottom: '5px', display: 'flex', alignItems: 'center', gap: '11px', cursor: 'pointer' }}>
              <div style={{ width: '30px', height: '30px', borderRadius: '50%', flexShrink: 0, background: idx < 3 ? [C.gold, '#bbb', '#cd7f32'][idx] : '#f0efe9', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {idx < 3 ? <span style={{ fontSize: '14px' }}>{MEDALS[idx]}</span> : <span style={{ fontSize: '12px', fontWeight: '700', color: '#aaa' }}>{idx + 1}</span>}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: '600', color: C.text, display: 'flex', alignItems: 'center', gap: '5px' }}>
                  {person.name} {isMe && <Badge color={C.green}>You</Badge>}
                </div>
                <div style={{ fontSize: '11px', color: '#999', marginTop: '1px' }}>
                  {person.role}{tab === 'Combined' ? ` · ${Object.keys(person.byDraw).join(' + ')}` : ''}{person.redrawAny ? ' · Redraw' : ''}
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '700', color: C.green }}>{score}</div>
                <div style={{ fontSize: '9px', color: '#bbb', textTransform: 'uppercase', letterSpacing: '0.5px' }}>pts</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── RULES VIEW ───────────────────────────────────────────────────────────────

function RulesView() {
  const scoring = [
    ['Round 1', '64 per draw', ROUND_POINTS.R1],
    ['Round 2', '32 per draw', ROUND_POINTS.R2],
    ['Round 3', '16 per draw', ROUND_POINTS.R3],
    ['Round of 16', '8 per draw', ROUND_POINTS.R16],
    ['Quarterfinals', '4 per draw', ROUND_POINTS.QF],
    ['Semifinals', '2 per draw', ROUND_POINTS.SF],
    ['Final', '1 per draw', ROUND_POINTS.Final],
    ['Champion 🏆', '1 per draw', `+${CHAMPION_BONUS}`],
    ['Final set bonus', 'Both draws', `+${FINAL_SET_BONUS}`],
  ];

  return (
    <div style={{ background: C.bg, minHeight: '100vh', padding: '16px 14px' }}>
      <div style={{ maxWidth: '560px', margin: '0 auto' }}>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '600', color: C.green, marginBottom: '14px' }}>Scoring</h2>
        <div style={{ background: '#fff', borderRadius: '9px', border: '0.5px solid rgba(0,0,0,0.06)', overflow: 'hidden', marginBottom: '20px' }}>
          {scoring.map(([round, picks, pts], i) => (
            <div key={round} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 14px', borderTop: i > 0 ? '0.5px solid rgba(0,0,0,0.04)' : 'none', fontSize: '13px' }}>
              <div>
                <span style={{ fontWeight: '500', color: C.text }}>{round}</span>
                <span style={{ color: '#bbb', marginLeft: '8px', fontSize: '11px' }}>{picks}</span>
              </div>
              <span style={{ fontWeight: '700', color: C.gold }}>{pts}</span>
            </div>
          ))}
        </div>

        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '600', color: C.green, marginBottom: '14px' }}>Deadlines</h2>
        <div style={{ background: '#fff', borderRadius: '9px', border: '0.5px solid rgba(0,0,0,0.06)', padding: '14px', fontSize: '13px', lineHeight: 1.8, color: '#555', marginBottom: '20px' }}>
          <strong style={{ color: C.text }}>Picks lock:</strong> Mon June 29 · 6 AM ET<br/>
          <strong style={{ color: C.text }}>Middle Sunday redraw:</strong> Opens Sun July 5 · Closes Mon July 6 · 6 AM ET<br/>
          <span style={{ fontSize: '11px', color: '#999' }}>Redraw resets R16–Final only. Costs −{REDRAW_PENALTY} pts. One per draw.</span>
        </div>

        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '600', color: C.green, marginBottom: '14px' }}>How it works</h2>
        <div style={{ background: '#fff', borderRadius: '9px', border: '0.5px solid rgba(0,0,0,0.06)', padding: '14px', fontSize: '13px', lineHeight: 1.7, color: '#555' }}>
          Fill out all 7 rounds for <strong>both ATP and WTA</strong> draws before R1 begins. Points are earned when your pick matches the actual winner of that match. If your bracket busts, downstream picks in that branch are likely wrong too — that's the game.
        </div>
      </div>
    </div>
  );
}

// ─── PICKS MODAL ──────────────────────────────────────────────────────────────

function PicksModal({ person, initialDraw, results, onClose }) {
  const availableDraws = DRAWS.filter(d => person.byDraw[d]);
  const [draw, setDraw] = useState(initialDraw && person.byDraw[initialDraw] ? initialDraw : availableDraws[0]);
  const [activeRound, setActiveRound] = useState('R1');
  const entry = person.byDraw[draw] || { picks: {}, score: 0 };
  const roundPicks = entry.picks?.[activeRound] || {};
  const roundResults = (results?.[draw] || {})[activeRound] || {};

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', background: C.bg }}>
      <div style={{ background: C.green, padding: '14px 16px 0' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '17px', fontWeight: '600', color: '#fff' }}>{person.name}</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>{draw} · {entry.score} pts</div>
          </div>
          <button onClick={onClose} style={{ background: 'rgba(255,255,255,0.12)', border: 'none', borderRadius: '6px', padding: '6px 12px', color: '#fff', cursor: 'pointer', fontSize: '13px', fontFamily: 'var(--font-ui)' }}>✕</button>
        </div>
        {availableDraws.length > 1 && (
          <div style={{ display: 'flex', gap: '4px', marginBottom: '10px' }}>
            {availableDraws.map(d => (
              <button key={d} onClick={() => { setDraw(d); setActiveRound('R1'); }}
                style={{ padding: '5px 14px', borderRadius: '6px', cursor: 'pointer', fontSize: '11px', fontWeight: '600', border: `1px solid ${draw === d ? C.gold : 'rgba(255,255,255,0.2)'}`, background: draw === d ? 'rgba(255,255,255,0.1)' : 'transparent', color: draw === d ? '#fff' : 'rgba(255,255,255,0.5)', fontFamily: 'var(--font-ui)' }}>
                {d}
              </button>
            ))}
          </div>
        )}
        <div className="no-scrollbar" style={{ display: 'flex', gap: '2px', overflowX: 'auto' }}>
          {ROUNDS.map(r => (
            <button key={r} onClick={() => setActiveRound(r)}
              style={{ padding: '8px 11px', background: activeRound === r ? '#fff' : 'transparent', border: 'none', borderRadius: '8px 8px 0 0', color: activeRound === r ? C.green : 'rgba(255,255,255,0.5)', fontSize: '11px', fontWeight: '600', cursor: 'pointer', flexShrink: 0, fontFamily: 'var(--font-ui)' }}>
              {r}
            </button>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: '14px 12px' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div style={{ fontSize: '11px', color: '#999', marginBottom: '10px' }}>{ROUND_LABELS[activeRound]} · {ROUND_POINTS[activeRound]} pts{activeRound === 'Final' ? ` · +${CHAMPION_BONUS} champion` : ''}</div>
          {Object.entries(roundPicks).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: '#bbb', fontSize: '13px' }}>No picks for this round.</div>
          ) : Object.entries(roundPicks).sort(([a],[b]) => +a - +b).map(([matchId, picked]) => {
            const actual = roundResults[matchId];
            const correct = actual && picked === actual;
            const wrong = actual && picked !== actual;
            const pts = correct ? ROUND_POINTS[activeRound] + (activeRound === 'Final' ? CHAMPION_BONUS : 0) : 0;
            return (
              <div key={matchId} style={{ background: '#fff', borderRadius: '7px', padding: '10px 12px', marginBottom: '5px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', border: `0.5px solid ${correct ? C.gold + '66' : wrong ? C.error + '33' : 'rgba(0,0,0,0.05)'}` }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                  <div style={{ width: '6px', height: '6px', borderRadius: '50%', flexShrink: 0, background: correct ? C.gold : wrong ? C.error : '#ddd' }} />
                  <span style={{ fontSize: '13px', fontWeight: correct ? '600' : '400', color: wrong ? '#bbb' : C.text, textDecoration: wrong ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{picked}</span>
                  {wrong && actual && <span style={{ fontSize: '11px', color: '#bbb', flexShrink: 0 }}>→ {actual}</span>}
                </div>
                {pts > 0 && <Badge color={C.gold}>+{pts}</Badge>}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ─── SOFT LAUNCH BANNER ───────────────────────────────────────────────────────

function SoftLaunchBanner() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: C.bg, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', zIndex: 500 }}>
      <div className="slide-up" style={{ textAlign: 'center', maxWidth: '340px' }}>
        <div style={{ height: '2px', background: `linear-gradient(90deg, ${C.purple}, ${C.gold})`, borderRadius: '1px', marginBottom: '40px' }} />
        <div style={{ fontSize: '9px', fontWeight: '600', letterSpacing: '3.5px', color: C.gold, textTransform: 'uppercase', marginBottom: '16px' }}>ITHF × Emerging Leaders Council</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '42px', fontWeight: '600', color: C.green, lineHeight: 1.0 }}>
          Wimbledon <span style={{ color: C.gold }}>'26</span>
        </div>
        <div style={{ fontSize: '12px', fontWeight: '500', letterSpacing: '2.5px', color: C.purple, textTransform: 'uppercase', marginTop: '8px', marginBottom: '40px' }}>Bracket Challenge</div>
        <div style={{ fontSize: '13px', color: '#999', lineHeight: 1.7 }}>
          Picks open when the draw is released.<br />
          <strong style={{ color: C.gold }}>Friday June 26, 2026</strong>
        </div>
        <div style={{ marginTop: '28px', background: 'rgba(26,92,46,0.05)', borderRadius: '8px', padding: '14px 18px', fontSize: '12px', color: '#888', lineHeight: 1.7 }}>
          Pick lock: Mon June 29 · 6 AM ET<br />
          All 7 rounds open simultaneously<br />
          128-player ATP & WTA draws
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

const DRAW_RELEASE = new Date('2026-06-26T00:00:00Z');
const EMPTY_PICKS = { ATP: {}, WTA: {} };

export default function App() {
  const [phase, setPhase] = useState('gate');
  const [isDemo, setIsDemo] = useState(false);
  const [session, setSession] = useState(null);
  const [picks, setPicks] = useState(EMPTY_PICKS);
  const [finalSetSum, setFinalSetSum] = useState({ ATP: '', WTA: '' });
  const [r1Matchups, setR1Matchups] = useState({ ATP: {}, WTA: {} });
  const [results, setResults] = useState({ ATP: {}, WTA: {} });
  const [leaderboard, setLeaderboard] = useState([]);
  const [activeTab, setActiveTab] = useState('bracket');
  const [viewing, setViewing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [now, setNow] = useState(new Date());

  useEffect(() => { const id = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(id); }, []);

  useEffect(() => {
    const saved = loadSession();
    if (saved?.user) {
      setSession({ user: saved.user, submitted: !!saved.submitted, redrawUsed: saved.redrawUsed || { ATP: false, WTA: false } });
      setPicks(saved.picks || EMPTY_PICKS);
      setFinalSetSum(saved.finalSetSum || { ATP: '', WTA: '' });
      setPhase('main');
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    saveSession({ user: session.user, submitted: session.submitted, redrawUsed: session.redrawUsed, picks, finalSetSum });
  }, [session, picks, finalSetSum]);

  const fetchData = useCallback(async () => {
    if (!SCRIPT_URL) return;
    try {
      const res = await fetch(`${SCRIPT_URL}?action=data`, { cache: 'no-store' });
      const data = await res.json();
      if (data.matchups) setR1Matchups({ ATP: data.matchups.ATP || {}, WTA: data.matchups.WTA || {} });
      if (data.results) setResults({ ATP: data.results.ATP || {}, WTA: data.results.WTA || {} });
      if (data.leaderboard) setLeaderboard(data.leaderboard);
    } catch {}
  }, []);

  useEffect(() => { fetchData(); const id = setInterval(fetchData, 5 * 60 * 1000); return () => clearInterval(id); }, [fetchData]);

  function handleEnter(userData, demo) {
    setIsDemo(demo);
    const saved = loadSession();
    if (saved?.user) {
      setSession({ user: saved.user, submitted: !!saved.submitted, redrawUsed: saved.redrawUsed || { ATP: false, WTA: false } });
      setPicks(saved.picks || EMPTY_PICKS);
      setFinalSetSum(saved.finalSetSum || { ATP: '', WTA: '' });
    } else {
      setSession({ user: userData, submitted: false, redrawUsed: { ATP: false, WTA: false } });
      setPicks(EMPTY_PICKS);
      setFinalSetSum({ ATP: '', WTA: '' });
    }
    setPhase('main');
  }

  async function handleSubmit() {
    if (!session || submitting) return;
    setSubmitting(true); setSubmitError('');
    try {
      if (SCRIPT_URL && !isDemo) {
        for (const draw of DRAWS) {
          const res = await fetch(SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ type: 'entry', name: session.user.name, role: session.user.role, draw, picks: picks[draw] || {}, finalSetSum: Number(finalSetSum[draw]) || 0 }) });
          const data = await res.json();
          if (!data.success) { setSubmitError(`${draw}: ${data.error || 'Failed.'}`); setSubmitting(false); return; }
        }
      }
      setSession(prev => ({ ...prev, submitted: true }));
      fetchData();
    } catch { setSubmitError('Network error.'); }
    finally { setSubmitting(false); }
  }

  async function handleSubmitRedraw(draw, drawPicks) {
    if (!session || submitting) return;
    setSubmitting(true); setSubmitError('');
    try {
      if (SCRIPT_URL && !isDemo) {
        const res = await fetch(SCRIPT_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain' }, body: JSON.stringify({ type: 'redraw', name: session.user.name, draw, picks: { R16: drawPicks.R16 || {}, QF: drawPicks.QF || {}, SF: drawPicks.SF || {}, Final: drawPicks.Final || {} } }) });
        const data = await res.json();
        if (!data.success) { setSubmitError(data.error || 'Redraw failed.'); setSubmitting(false); return; }
      }
      setSession(prev => ({ ...prev, redrawUsed: { ...prev.redrawUsed, [draw]: true } }));
      fetchData();
    } catch { setSubmitError('Network error.'); }
    finally { setSubmitting(false); }
  }

  if (phase === 'gate') return <GateView onEnter={handleEnter} />;

  const showSoftLaunch = !isDemo && now < DRAW_RELEASE;

  // Calculate score for header display
  const userScore = leaderboard
    .filter(e => e.name === session?.user?.name)
    .reduce((s, e) => s + (e.score || 0), 0);

  return (
    <>
      {showSoftLaunch && <SoftLaunchBanner />}

      {/* ── RG-STYLE HEADER ── */}
      <div style={{ background: C.green, padding: '14px 20px 0', position: 'sticky', top: 0, zIndex: 100, overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, opacity: 0.02, backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 28px,#fff 28px,#fff 29px)', pointerEvents: 'none' }} />
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', position: 'relative' }}>
          <div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '21px', fontWeight: '600', color: '#fff', lineHeight: 1.15 }}>
              ITHF Wimbledon <span style={{ color: C.gold }}>'26</span>
            </div>
            <div style={{ fontSize: '10px', color: 'rgba(255,255,255,0.4)', lineHeight: 1.5 }}>
              Presented by the <span style={{ color: C.gold }}>Emerging Leaders Council</span> · Bracket Challenge for ITHF & Friends
            </div>
          </div>
          <div style={{ textAlign: 'right', position: 'relative' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: '600', color: '#fff', lineHeight: 1 }}>{session?.submitted ? userScore : '—'}</div>
            <div style={{ fontSize: '8px', fontWeight: '600', letterSpacing: '1.5px', color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', marginTop: '2px' }}>pts</div>
          </div>
        </div>
        <div style={{ display: 'flex', marginTop: '12px', position: 'relative' }}>
          {[{ id: 'bracket', label: 'Bracket' }, { id: 'leaderboard', label: 'Leaderboard' }, { id: 'rules', label: 'Rules' }].map(t => {
            const on = activeTab === t.id;
            const locked = t.id === 'leaderboard' && !session?.submitted;
            return (
              <button key={t.id} onClick={() => !locked && setActiveTab(t.id)}
                style={{ flex: 1, padding: '10px 0', textAlign: 'center', fontSize: '11px', fontWeight: '600', color: on ? '#fff' : locked ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.4)', background: 'transparent', border: 'none', borderBottom: `2px solid ${on ? C.gold : 'transparent'}`, cursor: locked ? 'default' : 'pointer', fontFamily: 'var(--font-ui)', letterSpacing: '0.3px' }}>
                {t.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* ── CONTENT ── */}
      {activeTab === 'bracket' && (
        <BracketPickerView
          user={session.user} picks={picks} setPicks={setPicks}
          finalSetSum={finalSetSum} setFinalSetSum={setFinalSetSum}
          r1Matchups={r1Matchups} results={results}
          submitted={session.submitted} onSubmit={handleSubmit} onSubmitRedraw={handleSubmitRedraw}
          now={now} redrawUsed={session.redrawUsed}
          submitting={submitting} submitError={submitError} onClearError={() => setSubmitError('')}
        />
      )}
      {activeTab === 'leaderboard' && (
        <LeaderboardView leaderboard={leaderboard} user={session.user} results={results} onViewPicks={(person, draw) => setViewing({ person, draw })} />
      )}
      {activeTab === 'rules' && <RulesView />}

      {viewing && <PicksModal person={viewing.person} initialDraw={viewing.draw} results={results} onClose={() => setViewing(null)} />}

      {submitError && activeTab === 'leaderboard' && (
        <div className="toast" style={{ position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', background: C.error, color: '#fff', padding: '10px 18px', borderRadius: '8px', fontSize: '12px', zIndex: 400, maxWidth: '90vw', textAlign: 'center' }}>{submitError}</div>
      )}
    </>
  );
}
