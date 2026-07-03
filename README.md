# Undercover — Pass & Play

A browser-only, mobile-first clone of the social-deduction word game **Undercover**.

## Run locally

Browsers block `fetch()` for pages opened directly from disk (`file://`), and this app loads its
word list via `fetch('./words.txt')`, so you must serve the folder over HTTP:

```sh
cd undercover
python3 -m http.server 8000
```

Then open <http://localhost:8000> in a browser. Any static file server works (`npx serve`,
`php -S localhost:8000`, etc.) — the app has no server-side logic.


## How to play

1. **Setup:** add 3+ players, configure the number of Undercovers and whether Mr. White is in
   play, optionally enable Special Roles, then tap **Start Game** once the word list has loaded.
2. **Reveal:** pass the device around. Each player taps to reveal their word (or "no word" if
   they're Mr. White) privately, then hides it before passing to the next player.
3. **Discuss & Vote:** each round, players discuss aloud, then the device is passed to every
   living player in turn to cast a vote. The player with the most votes is eliminated (ties are
   broken by the Goddess of Justice if enabled, otherwise no one is eliminated that round).
4. **Elimination:** the eliminated player's true role is revealed, and any triggered special-role
   effects (Revenger, Lovers, Boomerang) resolve automatically before the game checks for a
   winner.
5. **Game Over:** winners are announced, both secret words are revealed, and cumulative scores are
   shown. **Play Again** keeps the player list and scores, and lets the host adjust role counts
   and special roles before the words are reshuffled.

## Assumptions

The original design notes left a few mechanics under-specified. This implementation resolves them
as follows:

- **Voting is per-player ballots**, not a show of hands — the device is passed to each living
  player in turn to select their target, so ties can be tallied and detected. Self-votes are
  allowed.
- **Ties**, when the Goddess of Justice is in play, are broken by her regardless of whether she is
  alive or dead. She **may select herself** if she happens to be among the tied players.
- **The Boomerang** only deflects a plurality/majority vote-out (including one resolved by the
  Goddess breaking a tie) — it does **not** protect against being dragged down by the Revenger or
  linked as a Lover.
- **The Revenger** only triggers when eliminated by an actual vote (not when dragged down by
  another Revenger or linked as a Lover).
- **The Joyful Fool bonus** is paid out once, to whichever player is the first to be eliminated by
  an actual vote-out (a round where the Boomerang deflects, or no one is eliminated, does not
  count and the "first vote-out" slot remains open for a later round).
- **Win parity** uses `alive(non-civilians) ≥ alive(civilians)` (equal counts already trigger a
  non-civilian win), matching classic Undercover rules. This is a named flag
  (`PARITY_INCLUDES_EQUAL`) in `scoring.js` if you want to require strictly greater instead.
- **Special-role assignment** is random among eligible players each game: Mr. Mime is never
  assigned to Mr. White (no word to mime); Lovers requires 5+ players and picks two distinct
  players (a Lover may also be Mr. White or hold no other modifier).
- **Auto-scale role defaults** (from the design table) are applied automatically as players are
  added/removed, but the host can always override the Undercover and Mr. White counts with the
  steppers — the **Start Game** button stays disabled until the counts are valid (Civilians must
  remain the strict majority).

## Tuning the scoring / balance

**All point values and win-condition flags live in `scoring.js`, in the `CONFIG` block at the top
of the file.** Nothing in `index.html` contains a point value or win-condition rule — the UI only
calls into `window.Undercover`. To rebalance the game, edit the named constants in `scoring.js`:

| Constant | Meaning | Default |
|---|---|---|
| `CIVILIAN_WIN_POINTS` | Points per winning Civilian | 2 |
| `UNDERCOVER_WIN_POINTS` | Points per winning Undercover | 6 |
| `MR_WHITE_SURVIVE_WIN_POINTS` | Points for Mr. White surviving on the winning side | 8 |
| `MR_WHITE_GUESS_WIN_POINTS` | Points for Mr. White winning via a correct guess | 10 |
| `JOYFUL_FOOL_FIRST_VOTE_OUT_BONUS` | Bonus for the first player voted out, if they're the Joyful Fool | 4 |
| `LOVERS_BONUS` | Extra bonus per Lover when either Lover's side wins | 0 |
| `ROUND_SURVIVED_BONUS` | Points per round survived (0 = off) | 0 |
| `ELIMINATED_WINNERS_STILL_SCORE` | Do eliminated members of the winning team still score? | `true` |
| `MR_WHITE_COUNTS_AS_NON_CIVILIAN` | Does a living Mr. White count toward the parity check? | `true` |
| `PARITY_INCLUDES_EQUAL` | Does the non-civilian side win at *equal* counts, or only when *ahead*? | `true` |

The win-condition and point-distribution logic itself (`checkWinCondition`,
`checkMrWhiteGuess`, `distributePoints`) is pure and documented inline in `scoring.js` if deeper
rule changes are needed.

## Manual test walkthroughs

Full in-browser interaction can't be exercised headlessly in this environment, so the following
walkthroughs should be run manually after any change to confirm the game behaves correctly.

### 4-player, no Special Roles

Setup: 4 players, 1 Undercover, no Mr. White, Special Roles off.

**Civilian-win path:**
1. Reveal all 4 players' words.
2. Round 1: vote out an actual Civilian (not the Undercover). Confirm no winner yet.
3. Round 2: vote out the Undercover.
4. Expect the **Civilians Win** screen — 3 living Civilians, 0 living Undercovers.

**Parity-win path:**
1. Restart (Play Again). Reveal all 4 players' words again.
2. Round 1: vote out a Civilian.
3. Check win condition after this round: 2 Civilians alive, 1 Undercover alive → not yet parity
   (2 > 1).
4. Round 2: vote out a second Civilian.
5. Expect the **Undercovers Win** screen — 1 Civilian alive, 1 Undercover alive (parity reached).

### 6-player, all Special Roles enabled

Setup: 6 players, 1–2 Undercovers, 1 Mr. White, all Special Roles on (Joyful Fool, Mr. Mime,
Lovers, Revenger, Goddess of Justice, Boomerang).

1. **Reveal:** confirm Mr. Mime is never assigned to the Mr. White player, and the two Lovers are
   distinct players.
2. **Boomerang deflect:** vote for the Boomerang player with a clear plurality. Confirm the
   deflection screen appears, no one is eliminated, and the round ends with all 6 players alive.
   Confirm the Boomerang's power is now spent (voting for them again in a later round eliminates
   them normally).
3. **Tie → Goddess:** engineer a 2-2 tie (in a 4-remaining-player round) between two non-Goddess
   players. Confirm the Goddess of Justice tie-break screen appears (even if the Goddess herself
   is already dead) and her choice is eliminated.
4. **Revenger drag:** vote out the Revenger by an outright plurality (not a tie). Confirm the
   Revenger-pick screen appears immediately after their role reveal, and their chosen target is
   eliminated in the same round, with both cascading into the next win-condition check.
5. **Lovers linkage:** vote out one of the two Lovers. Confirm their partner is automatically
   eliminated in the same round (and if the partner is also a Revenger, confirm their drag-down
   resolves too before the round settles).
6. **Mr. White guess — correct:** vote out Mr. White. On the guess screen, type the exact Civilian
   word (any case/whitespace). Confirm the game ends immediately with **Mr. White Wins** and only
   Mr. White receives points.
7. **Mr. White guess — incorrect:** replay to the same point and type an incorrect word. Confirm
   the game does *not* end — play continues to the next round or win check as normal.
8. **Joyful Fool bonus:** confirm that whichever player was genuinely the first to be voted out
   (skipping any deflected-by-Boomerang or tied-with-no-Goddess rounds) received the Joyful Fool
   bonus on the final scoreboard, if they held that role — regardless of which side ultimately
   won.

### Play Again

1. After any game ends, tap **Play Again**.
2. Confirm the player list and their cumulative scores (shown next to each name on the Setup
   screen) persist.
3. Confirm Special Roles and role counts can be freely changed before starting the next game, and
   that a new word pair is chosen (not immediately repeating the previous game's pair, when the
   list has more than one pair available).
