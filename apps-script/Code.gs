// ============================================================
// Wimbledon 2026 Bracket Challenge — Apps Script Backend
// ITHF Emerging Leaders Council
//
// Sheet tabs required:
//   Entries  — one row per submission
//   Results  — populated by syncResults() trigger
//   Config   — key/value pairs (see CONFIG_KEYS)
//   Draw_ATP — R1 matchups for ATP (populated June 26)
//   Draw_WTA — R1 matchups for WTA (populated June 26)
//
// Script Properties (set via Project Settings → Script Properties):
//   RAPIDAPI_KEY — your RapidAPI key
// ============================================================

// ── Deadline constants (UTC) ─────────────────────────────────────────────────
// All deadline logic uses these. Backend is authoritative — frontend mirrors for UX only.

const PICKS_DEADLINE_UTC  = new Date('2026-06-29T10:00:00.000Z'); // Mon June 29 · 6 AM ET
const REDRAW_OPEN_UTC     = new Date('2026-07-05T04:00:00.000Z'); // Sun July 5  · midnight ET
const REDRAW_DEADLINE_UTC = new Date('2026-07-06T10:00:00.000Z'); // Mon July 6  · 6 AM ET ← before R16 play

// ── Scoring ──────────────────────────────────────────────────────────────────
const ROUND_POINTS   = { R1: 5, R2: 10, R3: 20, R16: 40, QF: 80, SF: 160, Final: 320 };
const CHAMPION_BONUS = 320;   // added on top of Final points for correct champion pick
const REDRAW_PENALTY = 100;   // deducted when redraw is used
const FINAL_SET_BONUS = 5;    // per correctly-predicted final set (optional input)
const ROUNDS         = ['R1', 'R2', 'R3', 'R16', 'QF', 'SF', 'Final'];
const REDRAW_ROUNDS  = ['R16', 'QF', 'SF', 'Final'];

// ── Entries sheet column indices (1-based) ───────────────────────────────────
const COL = {
  Timestamp:   1,  // A
  Name:        2,  // B
  Role:        3,  // C
  Draw:        4,  // D
  R1:          5,  // E  — JSON string { matchId: playerName }
  R2:          6,  // F
  R3:          7,  // G
  R16:         8,  // H
  QF:          9,  // I
  SF:          10, // J
  Final:       11, // K
  FinalSetSum: 12, // L  — number of correctly-predicted final sets (user-entered or 0)
  RedrawUsed:  13, // M  — boolean
  Score:       14, // N  — calculated by updateAllScores()
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function ss()  { return SpreadsheetApp.getActiveSpreadsheet(); }
function tab(name) { return ss().getSheetByName(name); }

function jsonOk(payload) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: true, ...payload }))
    .setMimeType(ContentService.MimeType.JSON);
}

function jsonErr(msg) {
  return ContentService
    .createTextOutput(JSON.stringify({ success: false, error: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

function prop(key) {
  return PropertiesService.getScriptProperties().getProperty(key);
}

// ── Redraw window check ───────────────────────────────────────────────────────
// AUTHORITATIVE: called server-side before any redraw is processed.

function isRedrawWindowOpen() {
  const now = new Date();
  return now >= REDRAW_OPEN_UTC && now <= REDRAW_DEADLINE_UTC;
}

function redrawWindowErrorMsg() {
  const now = new Date();
  if (now < REDRAW_OPEN_UTC) {
    return 'Redraw window has not opened yet — opens Middle Sunday July 5.';
  }
  // now > REDRAW_DEADLINE_UTC
  return 'Redraw window has closed — deadline was Mon 6 Jul · 6 AM ET (before Round of 16 play).';
}

// ── doGet ─────────────────────────────────────────────────────────────────────

function doGet(e) {
  const action = (e.parameter && e.parameter.action) || 'data';

  try {
    if (action === 'data') {
      return jsonOk({
        matchups:    getMatchups(),
        results:     getResults(),
        leaderboard: getLeaderboard(),
        config:      getConfig(),
      });
    }
    if (action === 'leaderboard') return jsonOk({ leaderboard: getLeaderboard() });
    if (action === 'results')     return jsonOk({ results:     getResults() });

    return jsonErr('Unknown action: ' + action);
  } catch (err) {
    return jsonErr('doGet error: ' + err.message);
  }
}

// ── doPost ────────────────────────────────────────────────────────────────────

function doPost(e) {
  try {
    // Apps Script CORS workaround: send Content-Type: text/plain from frontend
    const raw  = e.postData.contents;
    const data = JSON.parse(raw);

    if (data.type === 'entry')  return submitEntry(data);
    if (data.type === 'redraw') return processRedraw(data);

    return jsonErr('Unknown request type: ' + data.type);
  } catch (err) {
    return jsonErr('doPost error: ' + err.message);
  }
}

// ── submitEntry ───────────────────────────────────────────────────────────────

function submitEntry(data) {
  // 1. Picks deadline check
  if (new Date() > PICKS_DEADLINE_UTC) {
    return jsonErr('Picks deadline has passed — no new entries accepted.');
  }

  // 2. Validate required fields
  const { name, role, draw, picks } = data;
  if (!name || !role || !draw || !picks) {
    return jsonErr('Missing required fields (name, role, draw, picks).');
  }
  if (!['ATP', 'WTA'].includes(draw)) {
    return jsonErr('Draw must be ATP or WTA.');
  }

  // 3. Duplicate prevention (same name + draw)
  const sheet = tab('Entries');
  if (findEntryRow(sheet, name, draw) !== -1) {
    return jsonErr('An entry for "' + name + '" in the ' + draw + ' draw already exists.');
  }

  // 4. Append row
  sheet.appendRow([
    new Date(),                        // A Timestamp
    name,                              // B Name
    role,                              // C Role
    draw,                              // D Draw
    JSON.stringify(picks.R1    || {}), // E R1
    JSON.stringify(picks.R2    || {}), // F R2
    JSON.stringify(picks.R3    || {}), // G R3
    JSON.stringify(picks.R16   || {}), // H R16
    JSON.stringify(picks.QF    || {}), // I QF
    JSON.stringify(picks.SF    || {}), // J SF
    JSON.stringify(picks.Final || {}), // K Final
    data.finalSetSum || 0,             // L FinalSetSum
    false,                             // M RedrawUsed
    0,                                 // N Score (recalculated by trigger)
  ]);

  // 5. Immediately score the new entry with current results
  updateAllScores();

  return jsonOk({ message: 'Entry submitted.' });
}

// ── processRedraw ─────────────────────────────────────────────────────────────
// AUTHORITATIVE redraw deadline check — rejects regardless of what the frontend says.

function processRedraw(data) {
  // ── Deadline check (server-authoritative) ────────────────────────────────
  if (!isRedrawWindowOpen()) {
    return jsonErr(redrawWindowErrorMsg());
  }

  const { name, draw, picks } = data;
  if (!name || !draw || !picks) {
    return jsonErr('Missing required fields (name, draw, picks).');
  }

  const sheet = tab('Entries');
  const rowIdx = findEntryRow(sheet, name, draw);

  if (rowIdx === -1) {
    return jsonErr('Entry not found for "' + name + '" in the ' + draw + ' draw.');
  }

  // Check redraw-already-used (column M)
  const alreadyUsed = sheet.getRange(rowIdx, COL.RedrawUsed).getValue();
  if (alreadyUsed === true || alreadyUsed === 'TRUE') {
    return jsonErr('Redraw already used — only one redraw per entry.');
  }

  // ── Write updated picks (R16, QF, SF, Final) and flag RedrawUsed ─────────
  sheet.getRange(rowIdx, COL.R16).setValue(JSON.stringify(picks.R16   || {}));
  sheet.getRange(rowIdx, COL.QF ).setValue(JSON.stringify(picks.QF    || {}));
  sheet.getRange(rowIdx, COL.SF ).setValue(JSON.stringify(picks.SF    || {}));
  sheet.getRange(rowIdx, COL.Final).setValue(JSON.stringify(picks.Final || {}));
  sheet.getRange(rowIdx, COL.RedrawUsed).setValue(true);

  // Immediately recalculate score for this entry
  updateAllScores();

  return jsonOk({ message: 'Redraw applied.' });
}

// ── findEntryRow ─────────────────────────────────────────────────────────────
// Returns 1-based row index or -1 if not found.

function findEntryRow(sheet, name, draw) {
  const data  = sheet.getDataRange().getValues();
  const nameLc = name.trim().toLowerCase();
  for (let i = 1; i < data.length; i++) {         // skip header row
    if (
      String(data[i][COL.Name - 1]).trim().toLowerCase() === nameLc &&
      String(data[i][COL.Draw - 1]).trim().toUpperCase() === draw.trim().toUpperCase()
    ) {
      return i + 1; // 1-based sheet row
    }
  }
  return -1;
}

// ── getMatchups ───────────────────────────────────────────────────────────────
// Reads Draw_ATP and Draw_WTA tabs.
// Each tab: header row, then columns: Match_ID | Player1 | Player2
// Returns { ATP: { '1': { id:'1', p1:'...', p2:'...' }, ... }, WTA: { ... } }

function getMatchups() {
  const matchups = {};
  for (const draw of ['ATP', 'WTA']) {
    const sheet = ss().getSheetByName('Draw_' + draw);
    if (!sheet) { matchups[draw] = {}; continue; }
    const rows = sheet.getDataRange().getValues().slice(1); // skip header
    const obj  = {};
    for (const row of rows) {
      const id = String(row[0]).trim();
      if (!id) continue;
      obj[id] = { id, p1: row[1] || '', p2: row[2] || '' };
    }
    matchups[draw] = obj;
  }
  // For backwards-compat, also expose as { R1: { matchId: {...} } } under each draw
  return {
    ATP: matchups.ATP,
    WTA: matchups.WTA,
    // Flat R1 for frontend — keyed by draw, then matchId
    R1: {
      ATP: matchups.ATP,
      WTA: matchups.WTA,
    },
  };
}

// ── getResults ────────────────────────────────────────────────────────────────
// Reads Results tab: Round | Draw | Match_ID | Winner
// Returns { ATP: { R1: { '1': 'PlayerName', ... }, ... }, WTA: { ... } }

function getResults() {
  const sheet = tab('Results');
  if (!sheet) return {};
  const rows  = sheet.getDataRange().getValues().slice(1);
  const out   = { ATP: {}, WTA: {} };

  for (const row of rows) {
    const round  = String(row[0]).trim();
    const draw   = String(row[1]).trim().toUpperCase();
    const matchId = String(row[2]).trim();
    const winner  = String(row[3]).trim();
    if (!round || !draw || !matchId || !winner) continue;
    if (!out[draw])        out[draw]       = {};
    if (!out[draw][round]) out[draw][round] = {};
    out[draw][round][matchId] = winner;
  }
  return out;
}

// ── getLeaderboard ────────────────────────────────────────────────────────────
// Returns all Entries rows as structured objects (with Score from column N).

function getLeaderboard() {
  const sheet = tab('Entries');
  if (!sheet) return [];
  const rows  = sheet.getDataRange().getValues().slice(1); // skip header
  return rows
    .filter(row => row[COL.Name - 1]) // skip blank rows
    .map(row => ({
      name:       String(row[COL.Name      - 1]),
      role:       String(row[COL.Role      - 1]),
      draw:       String(row[COL.Draw      - 1]),
      redrawUsed: !!row[COL.RedrawUsed - 1],
      score:      Number(row[COL.Score     - 1]) || 0,
      // Send picks so the frontend can render each user's full bracket
      picks: {
        R1:    safeParseJson(row[COL.R1    - 1]),
        R2:    safeParseJson(row[COL.R2    - 1]),
        R3:    safeParseJson(row[COL.R3    - 1]),
        R16:   safeParseJson(row[COL.R16   - 1]),
        QF:    safeParseJson(row[COL.QF    - 1]),
        SF:    safeParseJson(row[COL.SF    - 1]),
        Final: safeParseJson(row[COL.Final - 1]),
      },
    }));
}

function safeParseJson(val) {
  try { return JSON.parse(val) || {}; } catch { return {}; }
}

// ── getConfig ─────────────────────────────────────────────────────────────────
// Reads Config tab (col A = key, col B = value). Returns plain object.

function getConfig() {
  const sheet = tab('Config');
  if (!sheet) return {};
  const rows  = sheet.getDataRange().getValues();
  const cfg   = {};
  for (const row of rows) {
    if (row[0]) cfg[String(row[0]).trim()] = row[1];
  }
  // Always include the canonical deadline values from code constants
  cfg.PicksDeadline  = PICKS_DEADLINE_UTC.toISOString();
  cfg.RedrawOpen     = REDRAW_OPEN_UTC.toISOString();
  cfg.RedrawDeadline = REDRAW_DEADLINE_UTC.toISOString();
  return cfg;
}

// ── scorePicks ────────────────────────────────────────────────────────────────
// Pure function — mirrors the frontend calculateScore() in scoring.js.
// picks: { R1:{matchId:playerName}, ... }
// results: { R1:{matchId:winner}, ... }  ← already filtered for the correct draw

function scorePicks(picks, results, redrawUsed, finalSetSum) {
  let total = 0;
  for (const round of ROUNDS) {
    const rPicks   = picks[round]   || {};
    const rResults = results[round] || {};
    const pts      = ROUND_POINTS[round];
    for (const [matchId, picked] of Object.entries(rPicks)) {
      if (!picked) continue;
      const actual = rResults[matchId];
      if (actual && picked === actual) {
        total += pts;
        if (round === 'Final') total += CHAMPION_BONUS;
      }
    }
  }
  total += (finalSetSum || 0) * FINAL_SET_BONUS;
  if (redrawUsed) total -= REDRAW_PENALTY;
  return total;
}

// ── updateAllScores ───────────────────────────────────────────────────────────
// Recalculates the Score column for every entry. Called after any results change
// and immediately after a new entry or redraw is submitted.

function updateAllScores() {
  const entriesSheet = tab('Entries');
  if (!entriesSheet) return;

  const allResults = getResults();
  const data       = entriesSheet.getDataRange().getValues();

  for (let i = 1; i < data.length; i++) {
    const row = data[i];
    if (!row[COL.Name - 1]) continue;

    const draw    = String(row[COL.Draw - 1]).trim().toUpperCase();
    const results = allResults[draw] || {};

    const picks = {
      R1:    safeParseJson(row[COL.R1    - 1]),
      R2:    safeParseJson(row[COL.R2    - 1]),
      R3:    safeParseJson(row[COL.R3    - 1]),
      R16:   safeParseJson(row[COL.R16   - 1]),
      QF:    safeParseJson(row[COL.QF    - 1]),
      SF:    safeParseJson(row[COL.SF    - 1]),
      Final: safeParseJson(row[COL.Final - 1]),
    };
    const redrawUsed  = !!row[COL.RedrawUsed  - 1];
    const finalSetSum = Number(row[COL.FinalSetSum - 1]) || 0;

    const score = scorePicks(picks, results, redrawUsed, finalSetSum);
    entriesSheet.getRange(i + 1, COL.Score).setValue(score);
  }
}

// ── syncResults ───────────────────────────────────────────────────────────────
// Time-triggered every 30 min (set up via Triggers menu in Apps Script editor).
// Fetches completed matches from the RapidAPI tennis API and writes to Results tab.
// Convention from brief: player1 = winner for completed matches.

function syncResults() {
  const apiKey      = prop('RAPIDAPI_KEY');
  const atpTourId   = getConfigValue('TournamentIdATP');
  const wtaTourId   = getConfigValue('TournamentIdWTA');

  if (!apiKey)    { Logger.log('RAPIDAPI_KEY not set'); return; }
  if (!atpTourId) { Logger.log('TournamentIdATP not set in Config — run findTournamentIDs() first'); return; }
  if (!wtaTourId) { Logger.log('TournamentIdWTA not set in Config — run findTournamentIDs() first'); return; }

  let changed = false;
  changed |= fetchAndWriteResults(atpTourId, 'ATP', apiKey);
  changed |= fetchAndWriteResults(wtaTourId, 'WTA', apiKey);

  if (changed) {
    updateAllScores();
    Logger.log('Results updated and scores recalculated at ' + new Date());
  } else {
    Logger.log('No result changes detected at ' + new Date());
  }
}

function fetchAndWriteResults(tournamentId, draw, apiKey) {
  const url = 'https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/'
    + (draw === 'ATP' ? 'atp' : 'wta')
    + '/tournament/' + tournamentId + '/fixtures';

  let response;
  try {
    response = UrlFetchApp.fetch(url, {
      headers: {
        'x-rapidapi-host': 'tennis-api-atp-wta-itf.p.rapidapi.com',
        'x-rapidapi-key':  apiKey,
      },
      muteHttpExceptions: true,
    });
  } catch (e) {
    Logger.log('API fetch error for ' + draw + ': ' + e.message);
    return false;
  }

  if (response.getResponseCode() !== 200) {
    Logger.log('API returned ' + response.getResponseCode() + ' for ' + draw);
    return false;
  }

  let fixtures;
  try { fixtures = JSON.parse(response.getContentText()); }
  catch (e) { Logger.log('JSON parse error: ' + e.message); return false; }

  const resultsSheet = tab('Results');
  if (!resultsSheet) {
    Logger.log('Results sheet not found');
    return false;
  }

  // Build a set of existing result keys to avoid duplicates and detect changes
  const existingRows    = resultsSheet.getDataRange().getValues().slice(1);
  const existingResults = {};
  for (const row of existingRows) {
    const key = [row[0], row[1], row[2]].join('|'); // round|draw|matchId
    existingResults[key] = row[3];                  // winner
  }

  const matches  = fixtures.fixtures || fixtures.results || fixtures.data || [];
  let   changed  = false;
  const newRows  = [];

  for (const match of matches) {
    // API fields: round_name, match_id, player1.full_name, player2.full_name, status
    // Convention: player1 = winner when status indicates completion
    const status = String(match.status || '').toLowerCase();
    const completed = ['finished', 'complete', 'retired', 'walkover', 'default'].some(s => status.includes(s));
    if (!completed) continue;

    const round   = normaliseRound(match.round_name || match.round || '');
    if (!round)   continue;

    const matchId = String(match.match_id || match.id || '');
    const winner  = match.player1?.full_name || match.player1?.name || '';
    if (!matchId || !winner) continue;

    const key = [round, draw, matchId].join('|');
    if (existingResults[key] === winner) continue; // no change

    newRows.push([round, draw, matchId, winner, new Date().toISOString()]);
    existingResults[key] = winner;
    changed = true;
  }

  if (newRows.length > 0) {
    // Overwrite Results tab for this draw (simpler than patching individual rows)
    rebuildResultsSheetForDraw(resultsSheet, draw, existingResults);
  }

  return changed;
}

function rebuildResultsSheetForDraw(sheet, draw, existingResults) {
  // Delete rows for this draw then re-append
  const all     = sheet.getDataRange().getValues();
  const header  = all[0];
  const kept    = all.slice(1).filter(row => String(row[1]).trim().toUpperCase() !== draw.toUpperCase());
  const newData = [];
  for (const [key, winner] of Object.entries(existingResults)) {
    const [round, d, matchId] = key.split('|');
    if (d !== draw) continue;
    newData.push([round, draw, matchId, winner, '']);
  }
  const combined = [header, ...kept, ...newData];
  sheet.clearContents();
  if (combined.length > 0) {
    sheet.getRange(1, 1, combined.length, combined[0].length).setValues(combined);
  }
}

// ── normaliseRound ────────────────────────────────────────────────────────────
// Maps API round names to our internal round keys.

function normaliseRound(apiRound) {
  const r = String(apiRound).trim().toLowerCase().replace(/[^a-z0-9]/g, '');
  if (r.includes('round1') || r.includes('r128') || r === '1' || r.includes('firstrnd')) return 'R1';
  if (r.includes('round2') || r.includes('r64')  || r === '2') return 'R2';
  if (r.includes('round3') || r.includes('r32')  || r === '3') return 'R3';
  if (r.includes('round4') || r.includes('r16')  || r === '4' || r.includes('roundof16') || r.includes('4thrnd')) return 'R16';
  if (r.includes('quarter') || r === 'qf' || r === '5') return 'QF';
  if (r.includes('semi')   || r === 'sf' || r === '6') return 'SF';
  if (r.includes('final')  && !r.includes('semi') && !r.includes('quarter')) return 'Final';
  return null;
}

// ── findTournamentIDs ─────────────────────────────────────────────────────────
// Run MANUALLY in the Apps Script editor on June 26 (draw day).
// Searches the ATP & WTA tournament lists for Wimbledon 2026 and logs the IDs.
// Then manually set TournamentIdATP and TournamentIdWTA in the Config tab.

function findTournamentIDs() {
  const apiKey = prop('RAPIDAPI_KEY');
  if (!apiKey) { Logger.log('Set RAPIDAPI_KEY in Script Properties first.'); return; }

  for (const tour of ['atp', 'wta']) {
    const url = 'https://tennis-api-atp-wta-itf.p.rapidapi.com/tennis/v2/' + tour + '/tournaments/2026';
    let response;
    try {
      response = UrlFetchApp.fetch(url, {
        headers: { 'x-rapidapi-host': 'tennis-api-atp-wta-itf.p.rapidapi.com', 'x-rapidapi-key': apiKey },
        muteHttpExceptions: true,
      });
    } catch (e) { Logger.log(tour + ' fetch error: ' + e.message); continue; }

    if (response.getResponseCode() !== 200) { Logger.log(tour + ' HTTP ' + response.getResponseCode()); continue; }

    const data = JSON.parse(response.getContentText());
    const list = data.tournaments || data.data || [];
    Logger.log('\n=== ' + tour.toUpperCase() + ' tournaments matching "wimbledon" ===');
    for (const t of list) {
      const name = String(t.tournament_name || t.name || '').toLowerCase();
      if (name.includes('wimbledon')) {
        Logger.log('  id=' + t.tournament_id + '  name=' + (t.tournament_name || t.name));
      }
    }
  }
  Logger.log('\n→ Copy the IDs above into the Config tab (TournamentIdATP / TournamentIdWTA).');
}

// ── getConfigValue ────────────────────────────────────────────────────────────
// Reads a single value from the Config tab by key name.

function getConfigValue(key) {
  const sheet = tab('Config');
  if (!sheet) return null;
  const rows = sheet.getDataRange().getValues();
  for (const row of rows) {
    if (String(row[0]).trim() === key) return row[1] || null;
  }
  return null;
}

// ── setupSheets ───────────────────────────────────────────────────────────────
// Run ONCE in the editor to create all required tabs with headers.
// Safe to re-run — skips tabs that already exist.

function setupSheets() {
  const spreadsheet = ss();

  function ensureSheet(name, headers) {
    let sheet = spreadsheet.getSheetByName(name);
    if (!sheet) {
      sheet = spreadsheet.insertSheet(name);
      Logger.log('Created sheet: ' + name);
    }
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(headers);
      sheet.getRange(1, 1, 1, headers.length)
        .setFontWeight('bold')
        .setBackground('#1a5c2e')
        .setFontColor('#ffffff');
    }
    return sheet;
  }

  ensureSheet('Entries', [
    'Timestamp','Name','Role','Draw',
    'R1','R2','R3','R16','QF','SF','Final',
    'FinalSetSum','RedrawUsed','Score',
  ]);

  ensureSheet('Results', ['Round','Draw','Match_ID','Winner','Notes']);

  ensureSheet('Draw_ATP', ['Match_ID','Player1','Player2']);
  ensureSheet('Draw_WTA', ['Match_ID','Player1','Player2']);

  const configSheet = ensureSheet('Config', ['Key','Value']);
  const configDefaults = [
    ['InviteCode',      'ITHF2026WBLC'],
    ['DemoCode',        'WBLC2026TEST'],
    ['TournamentIdATP', ''],                              // set on June 26
    ['TournamentIdWTA', ''],                              // set on June 26
    ['DrawReleased',    false],
    ['PicksLocked',     false],
    ['RedrawOpen',      '2026-07-05T04:00:00Z'],
    ['RedrawDeadline',  '2026-07-06T10:00:00Z'],         // Mon 6 Jul 6 AM ET — before R16
  ];
  if (configSheet.getLastRow() <= 1) {
    for (const row of configDefaults) configSheet.appendRow(row);
  }

  Logger.log('Sheet setup complete.');
}

// ── installTrigger ────────────────────────────────────────────────────────────
// Run ONCE to create the 30-min syncResults trigger.
// Check existing triggers first to avoid duplicates.

function installTrigger() {
  const triggers = ScriptApp.getProjectTriggers();
  for (const t of triggers) {
    if (t.getHandlerFunction() === 'syncResults') {
      Logger.log('syncResults trigger already installed.');
      return;
    }
  }
  ScriptApp.newTrigger('syncResults')
    .timeBased()
    .everyMinutes(30)
    .create();
  Logger.log('syncResults trigger installed (every 30 min).');
}
