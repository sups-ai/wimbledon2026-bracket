import { useState, useEffect, useCallback } from 'react';
import {
  INVITE_CODE, DEMO_CODE,
  ROUNDS, ROUND_LABELS, ROUND_MATCH_COUNTS, ROUND_POINTS, CHAMPION_BONUS,
  REDRAW_ROUNDS, REDRAW_PENALTY,
  PICKS_DEADLINE, REDRAW_OPEN, REDRAW_DEADLINE,
  DRAWS, DRAW_LABELS, ROLES,
  C, SCRIPT_URL,
} from './constants';
import { validateAndBuildAll, roundPickedCount, applyRedraw } from './utils/bracket';
import { calculateScore } from './utils/scoring';
import { loadSession, saveSession, clearSession } from './utils/storage';

// ─── Time helpers ─────────────────────────────────────────────────────────────

function formatCountdown(target, now) {
  const diff = +target - +now;
  if (diff <= 0) return null;
  const totalSec = Math.floor(diff / 1000);
  const d = Math.floor(totalSec / 86400);
  const h = Math.floor((totalSec % 86400) / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (d > 0) return `${d}d ${h}h ${m}m`;
  return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}m ${String(s).padStart(2, '0')}s`;
}

// ─── Shared sub-components ────────────────────────────────────────────────────

function GreenHeader({ eyebrow, title, subtitle, children }) {
  return (
    <div style={{ background: C.green, position: 'relative', overflow: 'hidden' }}>
      {/* Subtle grass-stripe overlay */}
      <div style={{
        position: 'absolute', inset: 0, opacity: 0.035,
        backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 46px,#fff 46px,#fff 48px)',
        pointerEvents: 'none',
      }} />
      <div style={{ position: 'relative', padding: '20px 16px 0' }}>
        {eyebrow && (
          <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '2.5px', color: C.gold, textTransform: 'uppercase', marginBottom: '4px' }}>{eyebrow}</div>
        )}
        {title && (
          <div style={{ fontSize: '22px', fontWeight: '800', color: C.white, fontFamily: 'var(--font-display)', lineHeight: 1.2 }}>{title}</div>
        )}
        {subtitle && (
          <div style={{ fontSize: '13px', color: 'rgba(255,255,255,0.7)', marginTop: '3px' }}>{subtitle}</div>
        )}
        {children}
      </div>
    </div>
  );
}

function Btn({ children, onClick, variant = 'primary', disabled, style: extra = {}, ...props }) {
  const base = {
    border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: '700',
    cursor: disabled ? 'not-allowed' : 'pointer', padding: '13px 20px',
    fontFamily: 'var(--font-ui)', transition: 'opacity 0.15s, transform 0.1s',
    opacity: disabled ? 0.55 : 1, ...extra,
  };
  const variants = {
    primary:   { background: C.green,  color: C.white },
    secondary: { background: C.bg,     color: C.text, border: `1.5px solid ${C.border}` },
    purple:    { background: C.purple, color: C.white },
    gold:      { background: C.gold,   color: C.green },
    danger:    { background: C.error,  color: C.white },
  };
  return (
    <button onClick={!disabled ? onClick : undefined} style={{ ...base, ...variants[variant] }} {...props}>
      {children}
    </button>
  );
}

function Badge({ children, color = C.gold }) {
  return (
    <span style={{ display: 'inline-block', padding: '2px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: '700', background: `${color}22`, color }}>
      {children}
    </span>
  );
}

// ─── GATE VIEW ────────────────────────────────────────────────────────────────

function GateView({ onEnter }) {
  const [code, setCode] = useState('');
  const [err,  setErr]  = useState('');

  function submit() {
    const t = code.trim().toUpperCase();
    if (t === INVITE_CODE || t === DEMO_CODE) {
      onEnter(t === DEMO_CODE);
    } else {
      setErr('Invalid code. Check your invite email.');
    }
  }

  return (
    <div style={{ minHeight: '100vh', background: C.green, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', position: 'relative', overflow: 'hidden' }}>
      {/* Grass lines */}
      <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 46px,#fff 46px,#fff 48px)', pointerEvents: 'none' }} />

      <div className="slide-up" style={{ background: C.white, borderRadius: '16px', padding: '48px 36px 40px', width: '100%', maxWidth: '400px', textAlign: 'center', boxShadow: '0 32px 80px rgba(0,0,0,0.28)', position: 'relative' }}>
        {/* Top accent bar */}
        <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: '4px', background: `linear-gradient(90deg, ${C.purple}, ${C.gold})`, borderRadius: '16px 16px 0 0' }} />

        <div style={{ fontSize: '10px', fontWeight: '700', letterSpacing: '2.5px', color: C.gold, textTransform: 'uppercase', marginBottom: '10px' }}>
          ITHF Emerging Leaders Council
        </div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '30px', fontWeight: '800', color: C.green, lineHeight: 1.15, marginBottom: '4px' }}>
          Wimbledon 2026
        </h1>
        <div style={{ fontSize: '15px', color: C.purple, fontWeight: '600', marginBottom: '36px' }}>
          Bracket Challenge
        </div>

        <input
          value={code}
          onChange={e => { setCode(e.target.value); setErr(''); }}
          onKeyDown={e => e.key === 'Enter' && submit()}
          placeholder="INVITE CODE"
          autoCapitalize="characters"
          style={{
            width: '100%', padding: '14px 16px', border: `2px solid ${err ? C.error : C.border}`,
            borderRadius: '8px', fontSize: '14px', fontFamily: 'var(--font-ui)',
            background: C.bg, boxSizing: 'border-box', outline: 'none',
            letterSpacing: '2px', textTransform: 'uppercase', textAlign: 'center',
            marginBottom: err ? '8px' : '16px', color: C.text,
          }}
        />
        {err && <p style={{ color: C.error, fontSize: '13px', marginBottom: '12px' }}>{err}</p>}

        <Btn onClick={submit} style={{ width: '100%' }}>Enter Challenge</Btn>

        <p style={{ fontSize: '11px', color: C.muted, marginTop: '20px', lineHeight: 1.5 }}>
          Picks open Fri June 26 · Lock Mon June 29 · 6 AM ET<br />
          Presented by the ITHF ELC
        </p>
      </div>
    </div>
  );
}

// ─── REGISTER VIEW ────────────────────────────────────────────────────────────

function RegisterView({ onRegister }) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [draw, setDraw] = useState('');
  const [err,  setErr]  = useState('');

  function submit() {
    if (!name.trim())  return setErr('Please enter your name.');
    if (!role)         return setErr('Please select your role.');
    if (!draw)         return setErr('Please choose ATP or WTA.');
    onRegister({ name: name.trim(), role, draw });
  }

  const field = (label, children) => (
    <div style={{ marginBottom: '20px' }}>
      <label style={{ display: 'block', fontSize: '11px', fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '7px' }}>{label}</label>
      {children}
    </div>
  );

  const inputStyle = { width: '100%', padding: '12px 14px', border: `1.5px solid ${C.border}`, borderRadius: '8px', fontSize: '15px', fontFamily: 'var(--font-ui)', boxSizing: 'border-box', background: C.bg, outline: 'none', color: C.text };

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <GreenHeader eyebrow="ITHF ELC · Wimbledon 2026" title="Create your entry" />

      <div style={{ maxWidth: '480px', margin: '0 auto', padding: '24px 16px' }}>
        <div className="slide-up" style={{ background: C.white, borderRadius: '12px', padding: '28px 24px', boxShadow: '0 4px 20px rgba(0,0,0,0.07)' }}>

          {field('Full name',
            <input value={name} onChange={e => { setName(e.target.value); setErr(''); }} placeholder="Your full name" style={inputStyle} />
          )}

          {field('Role',
            <select value={role} onChange={e => { setRole(e.target.value); setErr(''); }} style={{ ...inputStyle, appearance: 'none', cursor: 'pointer' }}>
              <option value="">Select role…</option>
              {ROLES.map(r => <option key={r} value={r}>{r}</option>)}
            </select>
          )}

          {field('Your draw',
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
              {DRAWS.map(d => (
                <button
                  key={d}
                  onClick={() => { setDraw(d); setErr(''); }}
                  style={{
                    padding: '18px 12px', borderRadius: '10px', cursor: 'pointer', textAlign: 'center',
                    border: `2px solid ${draw === d ? C.green : C.border}`,
                    background: draw === d ? `${C.green}0d` : C.white,
                    transition: 'all 0.15s',
                  }}
                >
                  <div style={{ fontSize: '20px', fontWeight: '800', color: draw === d ? C.green : C.text, fontFamily: 'var(--font-display)' }}>{d}</div>
                  <div style={{ fontSize: '12px', color: C.muted, marginTop: '2px' }}>{DRAW_LABELS[d]}</div>
                </button>
              ))}
            </div>
          )}

          {err && <p style={{ color: C.error, fontSize: '13px', marginBottom: '16px' }}>{err}</p>}

          <Btn onClick={submit} style={{ width: '100%' }}>Start Picking →</Btn>
        </div>

        <p style={{ fontSize: '12px', color: C.muted, textAlign: 'center', marginTop: '16px', lineHeight: 1.5 }}>
          All 7 rounds open simultaneously.<br />Single deadline: Mon June 29 · 6 AM ET.
        </p>
      </div>
    </div>
  );
}

// ─── MATCH CARD ───────────────────────────────────────────────────────────────

function MatchCard({ matchup, picked, onPick, result, disabled }) {
  const { id, p1, p2 } = matchup;
  const players = [p1, p2];
  const isLocked = disabled;

  return (
    <div style={{ background: C.white, borderRadius: '9px', overflow: 'hidden', border: `1px solid ${C.border}`, marginBottom: '7px' }}>
      {players.map((player, idx) => {
        const isSelected = picked === player;
        const isWinner   = result  === player;
        const isLoser    = result  && result !== player;
        const noPlayer   = !player;

        return (
          <div
            key={idx}
            className={!isLocked && player ? 'match-player' : ''}
            onClick={() => !isLocked && player && onPick(id, player)}
            style={{
              padding: '11px 14px',
              display: 'flex', alignItems: 'center', gap: '11px',
              cursor: !isLocked && player ? 'pointer' : 'default',
              background: isSelected ? `${C.green}0e` : isWinner ? `${C.gold}12` : 'transparent',
              borderBottom: idx === 0 ? `1px solid ${C.border}` : 'none',
              opacity: isLoser ? 0.4 : 1,
              transition: 'background 0.12s',
            }}
          >
            {/* Radio indicator */}
            <div style={{
              width: '18px', height: '18px', borderRadius: '50%', flexShrink: 0,
              border: `2px solid ${isSelected ? C.green : isWinner ? C.gold : C.border}`,
              background: isSelected ? C.green : isWinner ? C.gold : 'transparent',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              transition: 'all 0.12s',
            }}>
              {(isSelected || isWinner) && <div style={{ width: '6px', height: '6px', borderRadius: '50%', background: C.white }} />}
            </div>

            {/* Player name */}
            <span style={{
              fontSize: '14px', fontWeight: isSelected ? '600' : '400',
              color: noPlayer ? C.subtle : C.text,
              flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
              fontStyle: noPlayer ? 'italic' : 'normal',
            }}>
              {player || 'TBD — complete earlier picks first'}
            </span>

            {/* Winner badge */}
            {isWinner && <Badge color={C.gold}>W</Badge>}
          </div>
        );
      })}
    </div>
  );
}

// ─── REDRAW CONFIRM MODAL ─────────────────────────────────────────────────────

function RedrawConfirmModal({ countdown, onConfirm, onCancel }) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px', zIndex: 200 }}>
      <div className="slide-up" style={{ background: C.white, borderRadius: '14px', padding: '32px 28px', maxWidth: '380px', width: '100%' }}>
        <div style={{ fontSize: '32px', textAlign: 'center', marginBottom: '12px' }}>🔄</div>
        <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '20px', fontWeight: '700', color: C.text, textAlign: 'center', marginBottom: '12px' }}>
          Use Middle Sunday Redraw?
        </h2>
        <p style={{ color: C.muted, fontSize: '14px', lineHeight: 1.65, textAlign: 'center', marginBottom: '20px' }}>
          Resets your <strong>Round of 16, QF, SF, and Final</strong> picks so you can re-pick them based on the first week's results. One-time use. Costs <strong style={{ color: C.error }}>−{REDRAW_PENALTY} pts</strong>.
        </p>

        {/* Countdown */}
        <div style={{ background: `${C.purple}0d`, border: `1px solid ${C.purple}30`, borderRadius: '10px', padding: '14px', marginBottom: '24px', textAlign: 'center' }}>
          <div style={{ fontSize: '10px', fontWeight: '700', color: C.purple, textTransform: 'uppercase', letterSpacing: '1.5px', marginBottom: '4px' }}>
            Window closes in
          </div>
          <div style={{ fontFamily: 'var(--font-display)', fontSize: '24px', fontWeight: '700', color: C.purple }}>
            {countdown || '—'}
          </div>
          <div style={{ fontSize: '11px', color: C.muted, marginTop: '3px' }}>
            Mon 6 July · 6 AM ET · before R16 play
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
          <Btn variant="secondary" onClick={onCancel}>Cancel</Btn>
          <Btn variant="purple"   onClick={onConfirm}>Confirm Redraw</Btn>
        </div>
      </div>
    </div>
  );
}

// ─── REDRAW SUBMIT FOOTER ─────────────────────────────────────────────────────

function RedrawSubmitFooter({ picks, allMatchups, onSubmit, onCancel, submitting, countdown }) {
  const complete = REDRAW_ROUNDS.every(r => {
    const { total, picked } = roundPickedCount(picks, allMatchups, r);
    return total > 0 && picked === total;
  });

  return (
    <div style={{ position: 'sticky', bottom: 0, background: `${C.purple}f8`, borderTop: `2px solid ${C.purple}`, padding: '12px 16px', boxShadow: '0 -4px 20px rgba(75,0,130,0.2)' }}>
      <div style={{ maxWidth: '640px', margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <div>
            <div style={{ fontSize: '12px', fontWeight: '700', color: C.gold }}>Redraw mode · −{REDRAW_PENALTY} pts</div>
            <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>Closes: {countdown || 'calculating…'}</div>
          </div>
          <Btn variant="secondary" onClick={onCancel} style={{ padding: '8px 14px', fontSize: '12px' }}>Cancel</Btn>
        </div>
        <Btn
          onClick={complete ? onSubmit : undefined}
          disabled={!complete || submitting}
          style={{ width: '100%', background: complete ? C.gold : C.muted, color: complete ? C.green : C.white }}
        >
          {submitting ? 'Submitting…' : complete ? 'Submit Redraw →' : 'Complete R16–Final picks first'}
        </Btn>
      </div>
    </div>
  );
}

// ─── BRACKET PICKER VIEW ──────────────────────────────────────────────────────

function BracketPickerView({
  user, picks, setPicks, r1Matchups, results,
  submitted, onSubmit, onSubmitRedraw,
  now, redrawUsed, submitting, submitError, onClearError,
}) {
  const [activeRound,         setActiveRound]         = useState('R1');
  const [showRedrawConfirm,   setShowRedrawConfirm]   = useState(false);
  const [redrawMode,          setRedrawMode]           = useState(false);

  const picksLocked    = now > PICKS_DEADLINE;
  const isRedrawWindow = now >= REDRAW_OPEN && now <= REDRAW_DEADLINE;
  const redrawCountdown = formatCountdown(REDRAW_DEADLINE, now);
  const picksCountdown  = formatCountdown(PICKS_DEADLINE, now);

  // Build matchups + validate picks on every render (fast, pure)
  const { allMatchups, validatedPicks } = validateAndBuildAll(r1Matchups, picks);

  // If validation stripped any picks, propagate back up
  useEffect(() => {
    // Compare stringified to avoid infinite loops
    if (JSON.stringify(validatedPicks) !== JSON.stringify(picks)) {
      setPicks(validatedPicks);
    }
  }, [JSON.stringify(validatedPicks)]);

  // ── Progress ──
  const roundProgress = ROUNDS.reduce((acc, r) => {
    acc[r] = roundPickedCount(picks, allMatchups, r);
    return acc;
  }, {});

  const totalPicked   = ROUNDS.reduce((s, r) => s + (roundProgress[r]?.picked || 0), 0);
  const totalPossible = ROUNDS.reduce((s, r) => s + (roundProgress[r]?.total  || 0), 0);
  const allComplete   = totalPossible > 0 && totalPicked === totalPossible;

  // Locks: submitted+not-redraw-mode → read-only everywhere
  // submitted+redraw-mode            → R16–Final are editable
  function isRoundLocked(round) {
    if (!submitted) return picksLocked;
    if (redrawMode && REDRAW_ROUNDS.includes(round)) return false;
    return true;
  }

  // ── Pick handler ──
  function handlePick(round, matchId, player) {
    if (isRoundLocked(round)) return;
    setPicks(prev => ({ ...prev, [round]: { ...(prev[round] || {}), [matchId]: player } }));
  }

  // ── Active round content ──
  const activeMatchupsObj = allMatchups[activeRound] || {};
  const activeMatchupsList = Object.values(activeMatchupsObj).sort((a, b) => +a.id - +b.id);
  const activeResults      = results[activeRound] || {};
  const activePicks        = picks[activeRound] || {};

  // ── Redraw flow ──
  function startRedraw() {
    setShowRedrawConfirm(false);
    setRedrawMode(true);
    setPicks(prev => applyRedraw(prev));
    setActiveRound('R16');
  }

  function cancelRedraw() {
    setRedrawMode(false);
    // Picks already cleared — user loses the reset but that's their call
  }

  async function submitRedraw() {
    await onSubmitRedraw(picks);
    setRedrawMode(false);
  }

  return (
    <div style={{ minHeight: '100vh', background: C.bg, display: 'flex', flexDirection: 'column', paddingBottom: submitted ? '60px' : '0' }}>

      {/* ── HEADER ── */}
      <div style={{ background: C.green, position: 'sticky', top: 0, zIndex: 100 }}>
        {/* Grass overlay */}
        <div style={{ position: 'absolute', inset: 0, opacity: 0.03, backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 46px,#fff 46px,#fff 48px)', pointerEvents: 'none' }} />

        <div style={{ position: 'relative', padding: '14px 16px 0' }}>
          {/* Top row */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '10px' }}>
            <div>
              <div style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '2.5px', color: C.gold, textTransform: 'uppercase' }}>ITHF ELC · Wimbledon 2026</div>
              <div style={{ fontSize: '16px', fontWeight: '700', color: C.white, marginTop: '1px' }}>{user.name}</div>
              <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)' }}>{user.draw} · {user.role}</div>
            </div>
            {submitted && !redrawMode && (
              <div style={{ background: `${C.gold}22`, border: `1px solid ${C.gold}`, borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '700', color: C.gold, flexShrink: 0 }}>
                Submitted ✓
              </div>
            )}
            {redrawMode && (
              <div style={{ background: `${C.purple}aa`, borderRadius: '6px', padding: '5px 10px', fontSize: '11px', fontWeight: '700', color: C.gold, flexShrink: 0 }}>
                Redraw mode
              </div>
            )}
          </div>

          {/* Picks countdown */}
          {!submitted && picksCountdown && (
            <div style={{ background: 'rgba(0,0,0,0.18)', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px', fontSize: '12px', color: 'rgba(255,255,255,0.85)' }}>
              🔒 Picks lock: <strong style={{ color: C.gold }}>{picksCountdown}</strong>
            </div>
          )}

          {/* Redraw banner — shown during Middle Sunday window if not used and not in redraw mode */}
          {submitted && isRedrawWindow && !redrawUsed && !redrawMode && (
            <div style={{ background: `${C.purple}cc`, borderRadius: '6px', padding: '8px 12px', marginBottom: '10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <div>
                <div style={{ fontSize: '12px', fontWeight: '700', color: C.gold }}>Middle Sunday Redraw Available</div>
                <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.7)' }}>Closes {redrawCountdown} · Mon 6 Jul 6 AM ET</div>
              </div>
              <Btn
                variant="gold"
                onClick={() => setShowRedrawConfirm(true)}
                style={{ padding: '7px 12px', fontSize: '12px', flexShrink: 0 }}
              >
                Use (−{REDRAW_PENALTY})
              </Btn>
            </div>
          )}

          {/* Redraw used notice */}
          {redrawUsed && !redrawMode && (
            <div style={{ background: 'rgba(0,0,0,0.18)', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px', fontSize: '11px', color: 'rgba(255,255,255,0.65)' }}>
              Redraw used · −{REDRAW_PENALTY} pts applied
            </div>
          )}

          {/* Redraw window closed notice (after deadline, not used) */}
          {submitted && !redrawUsed && !isRedrawWindow && now > REDRAW_DEADLINE && now < new Date('2026-07-12T18:00:00Z') && (
            <div style={{ background: 'rgba(0,0,0,0.18)', borderRadius: '6px', padding: '6px 10px', marginBottom: '10px', fontSize: '11px', color: 'rgba(255,255,255,0.5)' }}>
              Redraw window closed
            </div>
          )}

          {/* Round tabs */}
          <div className="no-scrollbar" style={{ display: 'flex', gap: '3px', overflowX: 'auto' }}>
            {ROUNDS.map(round => {
              const { total, picked } = roundProgress[round] || {};
              const complete  = total > 0 && picked === total;
              const isActive  = activeRound === round;
              const isRedraw  = redrawMode && REDRAW_ROUNDS.includes(round);

              return (
                <button
                  key={round}
                  onClick={() => setActiveRound(round)}
                  style={{
                    padding: '8px 11px', background: isActive ? C.white : 'transparent',
                    border: 'none', borderRadius: '8px 8px 0 0', cursor: 'pointer',
                    color: isActive ? C.green : complete ? C.gold : isRedraw ? `${C.gold}bb` : 'rgba(255,255,255,0.6)',
                    fontSize: '11px', fontWeight: '700', whiteSpace: 'nowrap', flexShrink: 0,
                    fontFamily: 'var(--font-ui)',
                    outline: isRedraw && !isActive ? `1px solid ${C.gold}55` : 'none',
                    transition: 'all 0.12s',
                  }}
                >
                  {round}
                  {complete && !isActive && ' ✓'}
                  {!complete && total > 0 && ` ${picked}/${total}`}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* ── ROUND BODY ── */}
      <div style={{ flex: 1, maxWidth: '640px', width: '100%', margin: '0 auto', padding: '16px 14px', boxSizing: 'border-box' }}>

        {/* Round header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
          <h2 style={{ fontSize: '18px', fontWeight: '700', color: C.text, fontFamily: 'var(--font-display)' }}>{ROUND_LABELS[activeRound]}</h2>
          <div style={{ fontSize: '12px', color: C.muted }}>
            {ROUND_POINTS[activeRound]} pts each
            {activeRound === 'Final' && <> · +{CHAMPION_BONUS} champion</>}
          </div>
        </div>

        {/* Round progress bar */}
        {(() => {
          const { total, picked } = roundProgress[activeRound] || {};
          const pct = total > 0 ? (picked / total) * 100 : 0;
          return (
            <div style={{ marginBottom: '14px' }}>
              <div style={{ height: '3px', background: C.border, borderRadius: '2px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${pct}%`, background: pct === 100 ? C.gold : C.green, borderRadius: '2px', transition: 'width 0.25s' }} />
              </div>
              <div style={{ fontSize: '11px', color: C.muted, marginTop: '4px' }}>{picked || 0} of {total || 0} picked</div>
            </div>
          );
        })()}

        {/* Empty state */}
        {activeMatchupsList.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '48px 20px', color: C.muted }}>
            {activeRound === 'R1' ? (
              <>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>🌱</div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: C.text, marginBottom: '6px' }}>Draw releases Friday June 26</div>
                <div style={{ fontSize: '14px', lineHeight: 1.6 }}>
                  R1 matchups will populate automatically once the Wimbledon draw is published.<br />
                  Come back to make your picks from June 26.
                </div>
              </>
            ) : (
              <>
                <div style={{ fontSize: '36px', marginBottom: '12px' }}>🎾</div>
                <div style={{ fontSize: '16px', fontWeight: '600', color: C.text, marginBottom: '6px' }}>Complete earlier rounds first</div>
                <div style={{ fontSize: '14px' }}>Pick all winners in {ROUND_LABELS[ROUNDS[ROUNDS.indexOf(activeRound) - 1]]} to unlock {ROUND_LABELS[activeRound]}.</div>
              </>
            )}
          </div>
        ) : (
          activeMatchupsList.map(matchup => (
            <MatchCard
              key={matchup.id}
              matchup={matchup}
              picked={activePicks[matchup.id]}
              onPick={(matchId, player) => handlePick(activeRound, matchId, player)}
              result={activeResults[matchup.id]}
              disabled={isRoundLocked(activeRound)}
            />
          ))
        )}
      </div>

      {/* ── SUBMIT FOOTER (pre-submission) ── */}
      {!submitted && (
        <div style={{ position: 'sticky', bottom: 0, background: C.white, borderTop: `1px solid ${C.border}`, padding: '12px 16px', boxShadow: '0 -4px 16px rgba(0,0,0,0.07)' }}>
          <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex', gap: '12px', alignItems: 'center' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: '12px', fontWeight: '600', color: C.text }}>{totalPicked} of {totalPossible} picks made</div>
              <div style={{ height: '3px', background: C.border, borderRadius: '2px', marginTop: '4px', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${totalPossible > 0 ? (totalPicked / totalPossible) * 100 : 0}%`, background: C.green, borderRadius: '2px', transition: 'width 0.2s' }} />
              </div>
            </div>
            <Btn
              onClick={() => {
                if (allComplete && !picksLocked) onSubmit();
                else if (!allComplete) {
                  // Jump to first incomplete round
                  const first = ROUNDS.find(r => {
                    const { total, picked } = roundProgress[r] || {};
                    return total > 0 && picked < total;
                  });
                  if (first) setActiveRound(first);
                }
              }}
              disabled={submitting || picksLocked}
              style={{ flexShrink: 0, minWidth: '120px' }}
            >
              {submitting
                ? 'Submitting…'
                : picksLocked
                  ? '🔒 Locked'
                  : allComplete
                    ? 'Review & Submit →'
                    : 'Continue →'}
            </Btn>
          </div>

          {submitError && (
            <div style={{ marginTop: '8px', background: `${C.error}14`, border: `1px solid ${C.error}44`, borderRadius: '6px', padding: '8px 12px', fontSize: '13px', color: C.error, display: 'flex', justifyContent: 'space-between' }}>
              {submitError}
              <button onClick={onClearError} style={{ background: 'none', border: 'none', color: C.error, cursor: 'pointer', fontSize: '16px', padding: '0 0 0 8px' }}>×</button>
            </div>
          )}
        </div>
      )}

      {/* ── REDRAW SUBMIT FOOTER ── */}
      {redrawMode && (
        <RedrawSubmitFooter
          picks={picks}
          allMatchups={allMatchups}
          onSubmit={submitRedraw}
          onCancel={cancelRedraw}
          submitting={submitting}
          countdown={redrawCountdown}
        />
      )}

      {/* ── REDRAW CONFIRM MODAL ── */}
      {showRedrawConfirm && (
        <RedrawConfirmModal
          countdown={redrawCountdown}
          onConfirm={startRedraw}
          onCancel={() => setShowRedrawConfirm(false)}
        />
      )}
    </div>
  );
}

// ─── LEADERBOARD VIEW ─────────────────────────────────────────────────────────

function LeaderboardView({ leaderboard, user, results, onViewPicks }) {
  const [tab, setTab] = useState(user?.draw || 'ATP');

  const filtered = tab === 'Combined'
    ? leaderboard
    : leaderboard.filter(e => e.draw === tab);

  const sorted = [...filtered].sort((a, b) => b.score - a.score);

  const champion = (() => {
    const finalRes = results?.Final || {};
    return Object.values(finalRes)[0] || null;
  })();

  const MEDALS = ['🥇', '🥈', '🥉'];

  return (
    <div style={{ minHeight: '100vh', background: C.bg }}>
      <GreenHeader eyebrow="ITHF ELC · Wimbledon 2026" title="Leaderboard">
        {champion && (
          <div style={{ background: `${C.gold}22`, border: `1px solid ${C.gold}55`, borderRadius: '8px', padding: '10px 14px', margin: '12px 0 0' }}>
            <span style={{ fontSize: '10px', fontWeight: '700', color: C.gold, textTransform: 'uppercase', letterSpacing: '1.5px' }}>Champion 🏆 </span>
            <span style={{ fontSize: '15px', fontWeight: '700', color: C.white }}>{champion}</span>
          </div>
        )}
        <div style={{ height: '14px' }} />
      </GreenHeader>

      {/* Draw tabs */}
      <div style={{ background: C.white, borderBottom: `1px solid ${C.border}`, position: 'sticky', top: 0, zIndex: 90 }}>
        <div style={{ maxWidth: '640px', margin: '0 auto', display: 'flex' }}>
          {['ATP', 'WTA', 'Combined'].map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                flex: 1, padding: '12px', background: 'transparent', border: 'none',
                borderBottom: `2.5px solid ${tab === t ? C.green : 'transparent'}`,
                color: tab === t ? C.green : C.muted, fontSize: '13px', fontWeight: '700',
                cursor: 'pointer', fontFamily: 'var(--font-ui)', transition: 'all 0.15s',
              }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

      {/* Entries */}
      <div style={{ maxWidth: '640px', margin: '0 auto', padding: '16px 14px' }}>
        {sorted.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '56px 20px', color: C.muted }}>
            <div style={{ fontSize: '32px', marginBottom: '10px' }}>🎾</div>
            <div style={{ fontSize: '15px', fontWeight: '600', color: C.text, marginBottom: '6px' }}>No entries yet</div>
            <div style={{ fontSize: '13px' }}>Entries will appear here once picks are submitted.</div>
          </div>
        ) : sorted.map((entry, idx) => {
          const isMe = user && entry.name === user.name && entry.draw === user.draw;

          return (
            <div
              key={`${entry.name}-${entry.draw}-${idx}`}
              onClick={() => onViewPicks(entry)}
              style={{
                background: isMe ? `${C.green}0a` : C.white,
                border: `1px solid ${isMe ? C.green + '55' : C.border}`,
                borderRadius: '10px', padding: '14px 16px', marginBottom: '7px',
                display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer',
                transition: 'border-color 0.15s, box-shadow 0.15s',
              }}
            >
              {/* Rank */}
              <div style={{
                width: '34px', height: '34px', borderRadius: '50%', flexShrink: 0,
                background: idx < 3 ? [C.gold, '#aaaaaa', '#cd7f32'][idx] : C.bg,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontFamily: 'var(--font-display)',
              }}>
                {idx < 3
                  ? <span style={{ fontSize: '16px' }}>{MEDALS[idx]}</span>
                  : <span style={{ fontSize: '13px', fontWeight: '700', color: C.muted }}>{idx + 1}</span>
                }
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '15px', fontWeight: '600', color: C.text, display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                  {entry.name}
                  {isMe && <Badge color={C.green}>You</Badge>}
                </div>
                <div style={{ fontSize: '12px', color: C.muted, marginTop: '1px' }}>
                  {entry.role} · {entry.draw}{entry.redrawUsed ? ' · Redraw used' : ''}
                </div>
              </div>

              {/* Score */}
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontFamily: 'var(--font-display)', fontSize: '22px', fontWeight: '700', color: C.green }}>{entry.score}</div>
                <div style={{ fontSize: '10px', color: C.muted, textTransform: 'uppercase', letterSpacing: '0.5px' }}>pts</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── PICKS MODAL ─────────────────────────────────────────────────────────────

function PicksModal({ entry, results, onClose }) {
  const [activeRound, setActiveRound] = useState('R1');
  const roundPicks   = entry.picks?.[activeRound] || {};
  const roundResults = results?.[activeRound]     || {};

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', background: C.bg }}>

      {/* Header */}
      <div style={{ background: C.green, padding: '16px 16px 0', position: 'sticky', top: 0 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '12px' }}>
          <div>
            <div style={{ fontSize: '9px', fontWeight: '700', letterSpacing: '2px', color: C.gold, textTransform: 'uppercase' }}>Bracket</div>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: '18px', fontWeight: '700', color: C.white }}>{entry.name}</div>
            <div style={{ fontSize: '12px', color: 'rgba(255,255,255,0.65)' }}>{entry.draw} · {entry.score} pts</div>
          </div>
          <button
            onClick={onClose}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '8px', padding: '7px 13px', color: C.white, cursor: 'pointer', fontSize: '14px', fontFamily: 'var(--font-ui)' }}
          >
            ✕ Close
          </button>
        </div>

        <div className="no-scrollbar" style={{ display: 'flex', gap: '3px', overflowX: 'auto' }}>
          {ROUNDS.map(r => (
            <button
              key={r}
              onClick={() => setActiveRound(r)}
              style={{ padding: '8px 11px', background: activeRound === r ? C.white : 'transparent', border: 'none', borderRadius: '8px 8px 0 0', color: activeRound === r ? C.green : 'rgba(255,255,255,0.65)', fontSize: '11px', fontWeight: '700', cursor: 'pointer', flexShrink: 0, whiteSpace: 'nowrap', fontFamily: 'var(--font-ui)' }}
            >{r}</button>
          ))}
        </div>
      </div>

      {/* Picks list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px 14px' }}>
        <div style={{ maxWidth: '480px', margin: '0 auto' }}>
          <div style={{ fontSize: '12px', color: C.muted, marginBottom: '12px' }}>
            {ROUND_LABELS[activeRound]} · {ROUND_POINTS[activeRound]} pts each
            {activeRound === 'Final' && ` · +${CHAMPION_BONUS} champion`}
          </div>

          {Object.entries(roundPicks).length === 0 ? (
            <div style={{ textAlign: 'center', padding: '32px', color: C.muted, fontSize: '14px' }}>No picks for this round.</div>
          ) : (
            Object.entries(roundPicks).sort(([a], [b]) => +a - +b).map(([matchId, picked]) => {
              const actual  = roundResults[matchId];
              const correct = actual && picked === actual;
              const wrong   = actual && picked !== actual;
              const pts     = correct ? ROUND_POINTS[activeRound] + (activeRound === 'Final' ? CHAMPION_BONUS : 0) : 0;

              return (
                <div
                  key={matchId}
                  style={{
                    background: C.white, borderRadius: '8px', padding: '11px 14px', marginBottom: '6px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    border: `1px solid ${correct ? C.gold + '88' : wrong ? C.error + '44' : C.border}`,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '9px', flex: 1, minWidth: 0 }}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', flexShrink: 0, background: correct ? C.gold : wrong ? C.error : C.border }} />
                    <span style={{ fontSize: '14px', fontWeight: correct ? '600' : '400', color: wrong ? C.muted : C.text, textDecoration: wrong ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {picked}
                    </span>
                    {wrong && actual && (
                      <span style={{ fontSize: '12px', color: C.muted, flexShrink: 0 }}>→ {actual}</span>
                    )}
                  </div>
                  {pts > 0 && <Badge color={C.gold}>+{pts}</Badge>}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}

// ─── BOTTOM NAV ───────────────────────────────────────────────────────────────

function BottomNav({ active, onChange, submitted }) {
  const tabs = [
    { id: 'picks',       label: 'My Picks',    icon: '🎾' },
    { id: 'leaderboard', label: 'Leaderboard', icon: '🏆' },
  ];
  return (
    <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: C.white, borderTop: `1px solid ${C.border}`, display: 'flex', zIndex: 150, paddingBottom: 'env(safe-area-inset-bottom)' }}>
      {tabs.map(tab => {
        const isActive = active === tab.id;
        const locked   = tab.id === 'leaderboard' && !submitted;
        return (
          <button
            key={tab.id}
            onClick={() => !locked && onChange(tab.id)}
            style={{
              flex: 1, padding: '10px 0 9px', background: 'transparent', border: 'none',
              borderTop: `2.5px solid ${isActive ? C.green : 'transparent'}`,
              color: isActive ? C.green : locked ? C.border : C.muted,
              fontSize: '11px', fontWeight: '700', cursor: locked ? 'default' : 'pointer',
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px',
              fontFamily: 'var(--font-ui)', transition: 'color 0.15s',
            }}
          >
            <span style={{ fontSize: '18px' }}>{tab.icon}</span>
            {tab.label}
            {locked && <span style={{ fontSize: '9px', color: C.border, letterSpacing: '0.5px' }}>SUBMIT FIRST</span>}
          </button>
        );
      })}
    </div>
  );
}

// ─── SOFT LAUNCH BANNER ───────────────────────────────────────────────────────
// Shown before June 26 — gate is live but picks aren't open yet

function SoftLaunchBanner() {
  return (
    <div style={{ position: 'fixed', inset: 0, background: C.green, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '24px', zIndex: 500 }}>
      <div style={{ position: 'absolute', inset: 0, opacity: 0.04, backgroundImage: 'repeating-linear-gradient(0deg,transparent,transparent 46px,#fff 46px,#fff 48px)', pointerEvents: 'none' }} />
      <div className="slide-up" style={{ textAlign: 'center', maxWidth: '360px', position: 'relative' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', letterSpacing: '2.5px', color: C.gold, textTransform: 'uppercase', marginBottom: '12px' }}>ITHF ELC · Wimbledon 2026</div>
        <h1 style={{ fontFamily: 'var(--font-display)', fontSize: '36px', fontWeight: '800', color: C.white, marginBottom: '8px' }}>Bracket Challenge</h1>
        <div style={{ fontSize: '15px', color: 'rgba(255,255,255,0.75)', marginBottom: '32px', lineHeight: 1.6 }}>
          Picks open when the draw is released.<br />
          <strong style={{ color: C.gold }}>Friday June 26, 2026</strong>
        </div>
        <div style={{ background: 'rgba(255,255,255,0.1)', borderRadius: '10px', padding: '16px 20px', fontSize: '13px', color: 'rgba(255,255,255,0.7)', lineHeight: 1.7 }}>
          Pick lock: Mon June 29 · 6 AM ET<br />
          All 7 rounds open simultaneously<br />
          128-player {'{'}ATP · WTA{'}'} draw
        </div>
      </div>
    </div>
  );
}

// ─── MAIN APP ─────────────────────────────────────────────────────────────────

const DRAW_RELEASE = new Date('2026-06-26T00:00:00Z');

export default function App() {
  const [phase,       setPhase]       = useState('gate');   // gate | register | main
  const [isDemo,      setIsDemo]      = useState(false);
  const [session,     setSession]     = useState(null);     // { user, submitted, redrawUsed }
  const [picks,       setPicks]       = useState({});
  const [r1Matchups,  setR1Matchups]  = useState({});
  const [results,     setResults]     = useState({});
  const [leaderboard, setLeaderboard] = useState([]);
  const [activeTab,   setActiveTab]   = useState('picks');
  const [viewingEntry, setViewingEntry] = useState(null);
  const [submitting,  setSubmitting]  = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [now,         setNow]         = useState(new Date());

  // Tick every second (for countdowns + redraw window detection)
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Restore session from localStorage on mount
  useEffect(() => {
    const saved = loadSession();
    if (saved?.user) {
      setSession({ user: saved.user, submitted: !!saved.submitted, redrawUsed: !!saved.redrawUsed });
      setPicks(saved.picks || {});
      setPhase('main');
    }
  }, []);

  // Persist picks + session state to localStorage
  useEffect(() => {
    if (!session) return;
    saveSession({ user: session.user, submitted: session.submitted, redrawUsed: session.redrawUsed, picks });
  }, [session, picks]);

  // Fetch live data from Apps Script
  const fetchData = useCallback(async () => {
    if (!SCRIPT_URL) return;
    try {
      const res  = await fetch(`${SCRIPT_URL}?action=data`, { cache: 'no-store' });
      const data = await res.json();
      if (data.matchups?.R1) setR1Matchups(data.matchups.R1);
      if (data.results)     setResults(data.results);
      if (data.leaderboard) setLeaderboard(data.leaderboard);
    } catch {
      // No-op: live data is a progressive enhancement
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(fetchData, 5 * 60 * 1000); // refresh every 5 min
    return () => clearInterval(id);
  }, [fetchData]);

  // ── Handlers ──

  function handleEnter(demo) {
    setIsDemo(demo);
    const saved = loadSession();
    if (saved?.user) {
      setSession({ user: saved.user, submitted: !!saved.submitted, redrawUsed: !!saved.redrawUsed });
      setPicks(saved.picks || {});
      setPhase('main');
    } else {
      setPhase('register');
    }
  }

  function handleRegister(userData) {
    const newSession = { user: userData, submitted: false, redrawUsed: false };
    setSession(newSession);
    setPicks({});
    setPhase('main');
  }

  async function handleSubmit() {
    if (!session || submitting) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      if (SCRIPT_URL && !isDemo) {
        const res  = await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' }, // avoid CORS preflight
          body: JSON.stringify({ type: 'entry', name: session.user.name, role: session.user.role, draw: session.user.draw, picks }),
        });
        const data = await res.json();
        if (!data.success) {
          setSubmitError(data.error || 'Submission failed. Please try again.');
          setSubmitting(false);
          return;
        }
      }
      setSession(prev => ({ ...prev, submitted: true }));
      fetchData();
    } catch {
      setSubmitError('Network error. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  async function handleSubmitRedraw(redrawPicks) {
    if (!session || submitting) return;
    setSubmitting(true);
    setSubmitError('');

    try {
      if (SCRIPT_URL && !isDemo) {
        const res  = await fetch(SCRIPT_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain' },
          body: JSON.stringify({
            type: 'redraw',
            name: session.user.name,
            draw: session.user.draw,
            picks: {
              R16:   redrawPicks.R16   || {},
              QF:    redrawPicks.QF    || {},
              SF:    redrawPicks.SF    || {},
              Final: redrawPicks.Final || {},
            },
          }),
        });
        const data = await res.json();
        if (!data.success) {
          setSubmitError(data.error || 'Redraw failed. The window may have closed.');
          setSubmitting(false);
          return;
        }
      }
      setPicks(redrawPicks);
      setSession(prev => ({ ...prev, redrawUsed: true }));
      fetchData();
    } catch {
      setSubmitError('Network error during redraw. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  // ── Render ──

  if (phase === 'gate')     return <GateView onEnter={handleEnter} />;
  if (phase === 'register') return <RegisterView onRegister={handleRegister} />;

  const showSoftLaunch = !isDemo && now < DRAW_RELEASE;

  return (
    <>
      {showSoftLaunch && <SoftLaunchBanner />}

      <div style={{ paddingBottom: '60px' }}>
        {activeTab === 'picks' && (
          <BracketPickerView
            user={session.user}
            picks={picks}
            setPicks={setPicks}
            r1Matchups={r1Matchups}
            results={results}
            submitted={session.submitted}
            onSubmit={handleSubmit}
            onSubmitRedraw={handleSubmitRedraw}
            now={now}
            redrawUsed={session.redrawUsed}
            submitting={submitting}
            submitError={submitError}
            onClearError={() => setSubmitError('')}
          />
        )}

        {activeTab === 'leaderboard' && (
          <LeaderboardView
            leaderboard={leaderboard}
            user={session.user}
            results={results}
            onViewPicks={entry => setViewingEntry(entry)}
          />
        )}
      </div>

      <BottomNav
        active={activeTab}
        onChange={setActiveTab}
        submitted={session.submitted}
      />

      {viewingEntry && (
        <PicksModal
          entry={viewingEntry}
          results={results}
          onClose={() => setViewingEntry(null)}
        />
      )}

      {submitError && activeTab === 'leaderboard' && (
        <div className="toast" style={{ position: 'fixed', top: '16px', left: '50%', transform: 'translateX(-50%)', background: C.error, color: C.white, padding: '10px 18px', borderRadius: '8px', fontSize: '13px', zIndex: 400, maxWidth: '90vw', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.2)' }}>
          {submitError}
        </div>
      )}
    </>
  );
}
