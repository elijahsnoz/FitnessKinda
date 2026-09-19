# Spec — Payoff at logging (Lever 1)

**Status:** proposed, not built
**Depends on:** nothing. No data-model change, no new fields, no backend change.
**Blocked by:** the Android device check (see README limitations) should happen first.

---

## 1. The problem

Logging an episode is a deposit with no receipt. The person does the work while they
are ill; the payoff — a doctor reading the summary — may be months away and may never
happen. Today, saving an episode drops them on the timeline with a toast, and the
numbers that make the record feel worth keeping are one tab away, below the fold.

Episodes are months apart, so the app is opened perhaps four times a year. Each of
those openings has to be worth something on its own.

## 2. What we are building

After an episode is **created**, show a short screen that reflects the person's own
record back at them, built entirely from numbers the app already computes.

```
  ✓ Episode saved

  This is your 4th episode.

  Last one          5 months ago · 14 May 2026
  Gap before this   157 days
  Usually lasts     6 days
  Tested            2 of 4 episodes

  [ Done ]        [ See timeline ]
```

## 3. Goals and non-goals

**Goals**

- Make the value of the record visible in the same session as the effort.
- Use only recorded facts. Every line must be arithmetic the Trends tab would agree with.
- Cost at most one extra tap on the fastest path.

**Non-goals**

- No new signals, fields or logging surfaces. (That is Lever 2, deliberately separate.)
- No diagnosis, no medication guidance, no prediction of the next episode.
- No advice, encouragement or judgement — including implied judgement about not testing.
- No analytics, no tracking of whether the screen was seen.

## 4. Behaviour

### 4.1 When it appears

| Event | Behaviour |
|---|---|
| A **new** episode is saved | The screen appears in place of the timeline |
| An existing episode is **updated** | Unchanged: toast + timeline, no screen |
| "Mark as recovered" is tapped | Unchanged: toast, stay on the timeline |
| An episode is **deleted** | Unchanged |
| The save fails | Unchanged: the existing error path, no screen |

Rationale: the screen is a response to a new data point. Editing is housekeeping.

### 4.2 Leaving it

- **Done** → Log tab, reset and ready for the next entry.
- **See timeline** → Timeline tab.
- Any tab-bar tap leaves normally. The screen is never a trap and never auto-dismisses —
  someone reading slowly while ill must not lose it.
- It is unreachable except immediately after a save. It is not a tab and has no history entry.

### 4.3 Saving is already complete

The record is written before the screen renders. Nothing on this screen is pending, and
dismissing it can never lose data. When signed in with a queued write, the screen says
nothing about sync — the timeline card already carries that.

## 5. Content rules

Lines are included **only** when the data supports them. Never show a placeholder, a
dash or a zero-state row.

| Line | Shown when | Copy |
|---|---|---|
| Ordinal | always | `This is your {n}th episode.` |
| Last one | ≥2 episodes | `Last one` · `{relativeDay} · {fmtDate}` |
| Gap before this | ≥2 episodes | `Gap before this` · `{n} days` |
| Usually lasts | ≥2 episodes with a recovery date | `Usually lasts` · `{avgDuration} days` |
| Tested | always | `Tested` · `{tested} of {total} episodes` |
| Still open | the saved episode has no recovery date | `You can mark this recovered from the timeline when it passes.` |

### 5.1 The first episode

There is nothing to compare against. Show:

```
  ✓ First episode recorded.

  From now on, each episode you log will show how
  long it has been since the last one, how long they
  usually last, and how many were confirmed by a test.
```

### 5.2 A backdated episode

If the saved episode is **not** the most recent one in the record — the person logged
something from March while September already exists — then:

- "Last one" and "Gap before this" compare against the episode immediately **before the
  saved one chronologically**, not the newest in the record.
- Add one neutral line: `You have {n} more recent episodes recorded.`

Getting this wrong would state something false about the person's history, which is the
one thing this screen cannot do.

### 5.3 Tone

The "Tested 1 of 4 episodes" line is the most useful thing on the screen and the easiest
to get wrong. It is a count, not a prompt. No "consider testing", no colour coding, no
warning icon. The number does the work.

## 6. Architecture

The app must not learn anything malaria-specific. The screen is generic; the content is
domain-owned, exactly like `metrics()`, `charts()` and `insights()`.

**Add to the domain interface** (`js/domains/malaria.js`), optional:

```js
/**
 * What to tell someone immediately after they save an entry.
 * @param {object[]} entries  every entry of this type, oldest first, including the new one
 * @param {object}   saved    the entry just created
 * @returns {{ headline: string, lines: [string, string][], notes: string[] }}
 */
function receipt(entries, saved) { … }
```

- Pure function. No DOM, no store access — so it is unit-testable under Node like the rest.
- Built on the existing `derive()`; it must not recompute anything by hand, or the screen
  and the Trends tab will drift.
- A domain that does not implement `receipt` simply skips the screen. `js/app.js` checks
  `domain.receipt?.(…)` and falls back to today's toast-and-timeline.

**Everything else:**

- `index.html` — one `<section id="view-saved" class="view" hidden>`, not in the tab bar.
- `js/app.js` — in `submit()`, on create only: render the receipt and `show('saved')`.
  `show()` already handles hiding the other views; `RENDER.saved` is a no-op because the
  content is rendered at save time from the entry that was just written.
- `styles.css` — reuse `.card`, `.stat`, `.migrate-facts` patterns. No new visual language.
- `sw.js` — bump `CACHE`.
- No change to: `store.js`, `registry.js`, `form.js`, `analytics.js`, `charts.js`,
  `summary.js`, anything under `server/`.

## 7. Edge cases

| Case | Expected |
|---|---|
| First episode ever | §5.1 copy, no comparison lines |
| Backdated episode | §5.2 comparisons and the "more recent" line |
| Two episodes with the same start date | Gap of 0 days; do not divide by zero anywhere |
| Episode saved with no symptoms and no test | Screen still shows; ordinal and test count only |
| Saved while offline, signed in | Identical. The screen says nothing about sync |
| Saved while signed out | Identical |
| The only other episode is still open | "Usually lasts" is omitted (no recovery data) |
| 50+ episodes | Layout must not overflow; the line set is fixed, so it cannot |

## 8. Testing

Extend the existing suites — no new test infrastructure.

**`tests/logic.test.mjs`** — `receipt()` is pure, so test it directly:

- first episode → headline is the first-episode copy, `lines` is empty
- second episode → ordinal "2nd", last-one and gap lines present, "usually lasts" absent
- third with two recoveries → "usually lasts" present and equal to `derive().avgDuration`
- backdated save → gap compares to the chronological neighbour, "more recent" note present
- untested episodes → "Tested 0 of 3" and no prompting language
- assert the receipt contains none of `/diagnos|should|recommend|take |dose|prescrib/i`
- assert every number matches `derive()` — the anti-drift check

**`tests/browser.mjs`**

- save a new episode → the screen appears, ordinal correct, timeline not shown
- **Done** → Log tab, form reset and ready
- **See timeline** → Timeline tab, episode present
- edit an existing episode → no screen, existing toast behaviour intact
- "Mark as recovered" → no screen
- 390×700: no horizontal scroll, both buttons ≥44px, everything above the fold

**Regression bar:** all 182 existing checks must still pass, unchanged.

## 9. Rollout

One change, no flag. It is visible on the first save after deploy, and it cannot corrupt
anything because it only reads.

## 10. How we will know if it worked

There is no analytics in this product and none is being added. This is judged by asking
the first user, after she has logged two or three episodes:

1. Without opening the app — roughly how often do you get these, and when was the last one?
2. Did the app ever tell you something about yourself you hadn't noticed?

If she can answer the first from memory, the screen is doing its job. If the answer to the
second is "it showed me most of them were never tested", it is doing better than its job.

**It has failed if** logging starts to feel slower, or if she taps past it without reading
— in which case the content is wrong, not the idea, and it should be cut back to the
ordinal line alone rather than expanded.

## 11. Open questions

1. **Average or median gap?** `derive().avgGap` is the mean. With few episodes one unusual
   gap skews it badly. Median is more honest at n=3–5 but adds a second number to maintain
   and would disagree with the Trends tab unless both change. *Proposal: keep the mean for
   now, and label it "Gap before this" per-episode rather than claiming a typical gap until
   there are ≥5 episodes.*
2. **Should the first-episode screen exist at all,** or is a toast enough for someone who has
   nothing to compare against? *Proposal: keep it — it sets the expectation that logging
   again will pay off, which is the whole point of the lever.*
3. **Ordinal wording** — "This is your 4th episode" is a count of what was *recorded*, not of
   what happened. Worth a word that carries that? *Proposal: leave it; the summary header
   already states the record is self-reported.*

## 12. Estimate

One domain function, one view, a handful of CSS rules, and the tests above. Roughly a day
including the test work, and it touches no code that is currently carrying risk.
