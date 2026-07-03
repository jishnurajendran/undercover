/**
 * scoring.js — Undercover balance file
 *
 * THE single source of truth for points and win-condition logic. index.html contains
 * zero point values or win-condition logic — it only calls into window.Undercover.
 *
 * To rebalance the game, edit only the CONFIG block below. Every function here is pure
 * (no DOM access, no mutation of arguments) so it can be unit-tested from Node directly:
 *   node -e "const U = require('./scoring.js'); console.log(U.CONFIG)"
 */
(function (root) {
  'use strict';

  // ───────────────────────────── CONFIG ─────────────────────────────
  // Every tunable number/flag for the game lives here and nowhere else.
  var CONFIG = {
    // Points awarded to each winning Civilian when the Civilian team wins.
    CIVILIAN_WIN_POINTS: 2,

    // Points awarded to each winning Undercover when the Undercover side wins.
    UNDERCOVER_WIN_POINTS: 5,

    // Points awarded to a Mr. White who survives to the end on the winning non-civilian side.
    MR_WHITE_SURVIVE_WIN_POINTS: 8,

    // Points awarded to a Mr. White who is voted out but correctly guesses the Civilian word.
    MR_WHITE_GUESS_WIN_POINTS: 10,

    // Bonus for the Joyful Fool if they are the first player eliminated by a vote (regardless
    // of who ultimately wins the game). Deflected/non-vote eliminations do not count.
    JOYFUL_FOOL_FIRST_VOTE_OUT_BONUS: 4,

    // Extra bonus points for each Lover, on top of normal win points, when either Lover's
    // side wins (both Lovers are treated as winners together). 0 = no extra bonus.
    LOVERS_BONUS: 2,

    // Points awarded per round a player survives (was alive when the round ended). 0 = off.
    ROUND_SURVIVED_BONUS: 1,

    // If true, a player on the winning team still scores win points even if they were
    // eliminated earlier in the game (as long as their side ultimately won).
    ELIMINATED_WINNERS_STILL_SCORE: true,

    // If true, a living Mr. White is counted as part of the "non-civilian side" for the
    // parity win-condition check (§7). Standard Undercover rules: true.
    MR_WHITE_COUNTS_AS_NON_CIVILIAN: true,

    // If true, the non-civilian side wins when alive(non-civilians) >= alive(civilians)
    // ("parity", i.e. equal counts already trigger the win — not just exceeding). Standard
    // Undercover rules: true.
    PARITY_INCLUDES_EQUAL: true
  };

  // ───────────────────────── WIN CONDITION ─────────────────────────
  /**
   * Determine whether the game is over and who won.
   *
   * @param {Object} state - Must expose `players`: an array of
   *   { id, baseRole: 'CIVILIAN'|'UNDERCOVER'|'MR_WHITE', alive: boolean }.
   * @returns {{ over: boolean, winningTeam: 'CIVILIANS'|'UNDERCOVERS'|'MR_WHITE'|null, reason: string }}
   */
  function checkWinCondition(state) {
    var players = (state && state.players) || [];

    var aliveCivilians = 0;
    var aliveNonCivilians = 0;
    var aliveUndercovers = 0;
    var aliveMrWhites = 0;

    for (var i = 0; i < players.length; i++) {
      var p = players[i];
      if (!p.alive) continue;
      if (p.baseRole === 'CIVILIAN') {
        aliveCivilians++;
      } else if (p.baseRole === 'UNDERCOVER') {
        aliveUndercovers++;
        aliveNonCivilians++;
      } else if (p.baseRole === 'MR_WHITE') {
        aliveMrWhites++;
        if (CONFIG.MR_WHITE_COUNTS_AS_NON_CIVILIAN) aliveNonCivilians++;
      }
    }

    // Civilians win when every non-civilian (Undercover + living Mr. White) is eliminated.
    if (aliveUndercovers === 0 && aliveMrWhites === 0) {
      return {
        over: true,
        winningTeam: 'CIVILIANS',
        reason: 'All Undercovers and Mr. White have been eliminated.'
      };
    }

    // Non-civilian side wins at parity: alive(non-civilians) >= alive(civilians).
    var parityReached = CONFIG.PARITY_INCLUDES_EQUAL
      ? aliveNonCivilians >= aliveCivilians
      : aliveNonCivilians > aliveCivilians;

    if (parityReached && aliveNonCivilians > 0) {
      // If any Undercover is alive, the Undercover team is credited with the win (Mr. White
      // rides along on that side per the shared "non-civilian side" rule); if only Mr. White
      // remains alive on that side, it's a Mr. White win.
      var winningTeam = aliveUndercovers > 0 ? 'UNDERCOVERS' : 'MR_WHITE';
      return {
        over: true,
        winningTeam: winningTeam,
        reason: 'Non-civilian side has reached parity with the Civilians.'
      };
    }

    return { over: false, winningTeam: null, reason: 'Game continues.' };
  }

  // ───────────────────────── MR. WHITE GUESS ─────────────────────────
  /**
   * Compare a Mr. White's typed guess against the Civilian word (trim + case-insensitive).
   * @param {string} guess
   * @param {string} civilianWord
   * @returns {boolean}
   */
  function checkMrWhiteGuess(guess, civilianWord) {
    if (typeof guess !== 'string' || typeof civilianWord !== 'string') return false;
    return guess.trim().toLowerCase() === civilianWord.trim().toLowerCase();
  }

  // ───────────────────────── POINT DISTRIBUTION ─────────────────────────
  /**
   * Compute point deltas for the end of a game (or an instant Mr. White guess-win).
   * Does not mutate `state` or `outcome`; the caller applies the returned deltas.
   *
   * @param {Object} state - Exposes `players` (see below) and round-tracking fields:
   *   players[]: { id, baseRole, modifiers: string[] (e.g. 'LOVER', 'JOYFUL_FOOL'),
   *                alive, lover: playerId|null, roundsSurvived: number }
   *   firstVoteOutPlayerId: id of the first player eliminated by an actual vote, or null.
   * @param {Object} outcome - The result of checkWinCondition(state), plus optionally
   *   { mrWhiteGuessedCorrectly: boolean, mrWhiteId: playerId } for an instant guess-win.
   * @returns {Array<{ playerId: string, delta: number, reason: string }>}
   */
  function distributePoints(state, outcome) {
    var players = (state && state.players) || [];
    var deltas = [];

    function award(playerId, delta, reason) {
      if (delta === 0) return;
      deltas.push({ playerId: playerId, delta: delta, reason: reason });
    }

    function isWinner(p) {
      if (!outcome || !outcome.winningTeam) return false;
      if (!CONFIG.ELIMINATED_WINNERS_STILL_SCORE && !p.alive) return false;

      if (outcome.winningTeam === 'CIVILIANS') return p.baseRole === 'CIVILIAN';
      if (outcome.winningTeam === 'UNDERCOVERS') {
        return p.baseRole === 'UNDERCOVER' || p.baseRole === 'MR_WHITE';
      }
      if (outcome.winningTeam === 'MR_WHITE') {
        return p.baseRole === 'MR_WHITE' || p.baseRole === 'UNDERCOVER';
      }
      return false;
    }

    // Instant Mr. White guess-win short-circuits normal win distribution: only the correctly
    // guessing Mr. White scores, from a guess-win.
    if (outcome && outcome.mrWhiteGuessedCorrectly && outcome.mrWhiteId) {
      award(
        outcome.mrWhiteId,
        CONFIG.MR_WHITE_GUESS_WIN_POINTS,
        'Mr. White correctly guessed the Civilian word'
      );
      return deltas;
    }

    if (outcome && outcome.over && outcome.winningTeam) {
      for (var i = 0; i < players.length; i++) {
        var p = players[i];
        if (!isWinner(p)) continue;

        if (p.baseRole === 'CIVILIAN') {
          award(p.id, CONFIG.CIVILIAN_WIN_POINTS, 'Civilian team won');
        } else if (p.baseRole === 'UNDERCOVER') {
          award(p.id, CONFIG.UNDERCOVER_WIN_POINTS, 'Undercover team won');
        } else if (p.baseRole === 'MR_WHITE') {
          award(p.id, CONFIG.MR_WHITE_SURVIVE_WIN_POINTS, 'Mr. White survived on the winning side');
        }

        // Lovers bonus: both lovers score together if either lover's side wins.
        if (p.modifiers && p.modifiers.indexOf('LOVER') !== -1 && CONFIG.LOVERS_BONUS) {
          award(p.id, CONFIG.LOVERS_BONUS, 'Lovers bonus');
        }
      }

      // A living lover whose partner won (but who is not personally on the winning team, e.g.
      // partner is a different base role) still counts as a winner per the rules — ensure both
      // lovers score if either lover's side won.
      for (var j = 0; j < players.length; j++) {
        var lp = players[j];
        if (!lp.modifiers || lp.modifiers.indexOf('LOVER') === -1) continue;
        if (!lp.lover) continue;
        var partner = players.filter(function (pl) { return pl.id === lp.lover; })[0];
        if (!partner) continue;
        var lpAlreadyScored = deltas.some(function (d) { return d.playerId === lp.id; });
        if (!lpAlreadyScored && isWinner(partner)) {
          if (lp.baseRole === 'CIVILIAN') {
            award(lp.id, CONFIG.CIVILIAN_WIN_POINTS, "Civilian team won (via Lover's side)");
          } else if (lp.baseRole === 'UNDERCOVER') {
            award(lp.id, CONFIG.UNDERCOVER_WIN_POINTS, "Undercover team won (via Lover's side)");
          } else if (lp.baseRole === 'MR_WHITE') {
            award(lp.id, CONFIG.MR_WHITE_SURVIVE_WIN_POINTS, "Mr. White won (via Lover's side)");
          }
          if (CONFIG.LOVERS_BONUS) award(lp.id, CONFIG.LOVERS_BONUS, 'Lovers bonus');
        }
      }
    }

    // Joyful Fool bonus: awarded once, regardless of final outcome, to whoever was the first
    // player eliminated by an actual vote.
    if (state && state.firstVoteOutPlayerId) {
      var fool = players.filter(function (p) { return p.id === state.firstVoteOutPlayerId; })[0];
      if (fool && fool.modifiers && fool.modifiers.indexOf('JOYFUL_FOOL') !== -1) {
        award(fool.id, CONFIG.JOYFUL_FOOL_FIRST_VOTE_OUT_BONUS, 'Joyful Fool: first eliminated by vote');
      }
    }

    // Optional per-round-survived bonus.
    if (CONFIG.ROUND_SURVIVED_BONUS) {
      for (var k = 0; k < players.length; k++) {
        var rp = players[k];
        var rounds = rp.roundsSurvived || 0;
        if (rounds > 0) {
          award(rp.id, rounds * CONFIG.ROUND_SURVIVED_BONUS, rounds + ' round(s) survived');
        }
      }
    }

    return deltas;
  }

  var Undercover = {
    CONFIG: CONFIG,
    checkWinCondition: checkWinCondition,
    checkMrWhiteGuess: checkMrWhiteGuess,
    distributePoints: distributePoints
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Undercover;
  } else {
    root.Undercover = Undercover;
  }
})(typeof window !== 'undefined' ? window : this);
