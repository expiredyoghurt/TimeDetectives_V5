# Time Detectives v5.1c — hint content and cost

- **Hints are written for every case** (all 36): a nudge, a pointer to the evidence, and a guiding question, stored in `CASE_HINTS` in `index.html` and attached to each case as `hints`. Edit the wording there. Cases without an entry fall back to the skill-level text.
- **Each hint costs 10 points** (`HINT_COST`), taken off the case's first completion, and never below 0. Opening the panel is free; a hint is only charged when the pupil presses "Show hint N (−10 pts)". The button and a note state the cost, and the resolution card shows it, for example "80 points earned (100 − 20 for hints)".
- Hints are free on a case already completed, and for the beta tester account, because no points are at stake.
- Hints used still count towards the case even if they are opened during the earlier evidence steps.

# Time Detectives v5.1b — hints, timer, credentials

**Hints**
- The Hint button opens an in-page panel instead of a browser alert. Three levels, revealed one at a time: a nudge, a pointer back to the evidence, then the skill question.
- A case can supply its own wording with an optional `hints: ["nudge", "pointer", "question"]` array. Cases without it fall back to the skill-level text, so no case content had to change.
- The most hints opened (1-3) is recorded on the pupil's first completion of a case and shown to the teacher in Manage.

**Timer**
- New setting, **When time runs out**: *Remind only* (default) never auto-submits; *Strict* keeps the old behaviour.
- Pupils get a badge change and a polite screen-reader announcement one minute before, and a calm "No rush" message at zero in remind-only mode.
- In strict mode, an answer the pupil has selected but not locked in is submitted, instead of a passive answer. The time-out message is kinder.
- Per-pupil extra time (0-60 minutes) in Class, then Manage. A pupil's own saves cannot change it.
- Existing installs default to *Remind only* until a teacher changes it.

**Credentials**
- The built-in fallback admin login (`Administrator` / `password4admin`) is removed. Admin sign-in needs both `Admin_User` and `Admin_Password` secrets (password 12+ characters). Until they are set, admin sign-in returns a clear "disabled" message; teacher accounts already in the database still work.
- The `Kirito` beta tester account is unchanged.

# Time Detectives v5.1 — UI/UX pass

**Pupil experience**
- Confirm before locking in: on scored decisions a tap now selects an answer; **Lock in answer** commits it. Pupils can change their mind until then. (Formative lead/compare steps stay one-tap.)
- Progress tracker at the top of every screen inside a case (Briefing, Decision, Check — or Briefing, Evidence, Compare, Judgement, Check for full cases).
- Knowledge check is one question at a time with a progress bar. After each answer pupils see the best answer, an optional per-question `why` (add a `why: "..."` string to any question to show it), a skill-level reminder for missed reasoning questions, and a results summary at the end.
- Case menu grouped into 7 chapters (from the review checkpoints) with per-chapter progress, the current chapter open, and a **Continue** card.

**Accounts**
- Email is no longer collected. Sign-up and sign-in use detective name + password (or PIN). Existing accounts keep working. The `email` column/field remains as an internal account id (`pupil:<name>` for new accounts) and is not shown anywhere.
- Detective names may not contain `< > & " \``.
- Failed sign-in throttle: 10 wrong tries per name in 15 minutes locks that name for the rest of the window (teacher reset clears it). Needs the new `login_attempts` table — **re-run schema.sql**; sign-in still works if you don't, just without the throttle.

**Teacher dashboard**
- Split into tabs: **Class** (roster, set up a class, skill matrix), **Cases** (assignments, illustrations, walkthrough), **Settings** (retry/hints/timer, AI), **Archivist** (log), **Admin** (teacher accounts, admin only). A sticky save bar with an "Unsaved changes" note serves the Cases and Settings tabs.
- **Set up a class:** paste names, choose a 4-digit PIN or 8-character password, optional suffix (e.g. `7B`). Creates accounts in batches, shows the codes once, with Copy, CSV and printable slips. Duplicates, reserved and invalid names are skipped and reported.
- Manage-pupil dialog can reset to a new 4-digit PIN as well as a password. Roster and CSV no longer include email.

**Tests:** smoke test updated for the new flows (teacher login form, lock-in step, one-at-a-time knowledge check) and extended with checks for no-email sign-up, bulk set-up, PIN throttle, chapters, confirm step and dashboard tabs. All checks pass.

# Time Detectives v5.0 — requested patch

## Beta tester account
- Added dedicated `Kirito` / `beater` beta account, automatically provisioned on first sign-in.
- Pre-unlocked all 36 cases, trophies, completionist badges, Atlas entries, content mastery and review checkpoints.
- Beta account bypasses pupil-facing teacher restrictions (case assignment, retry, hints and time limits).
- Beta account can access the Archivist even when the normal AI master switch is off, subject to the site's Workers AI binding and global AI cap.


- Reduced PBKDF2-SHA256 password-hashing iterations from 150,000 to 100,000 in both password-generation and password-verification paths.
- Separated teacher/admin authentication from the pupil sign-in form.
- Added a small **Teacher log-in** link below the launch-page account controls; it opens a dedicated teacher/admin sign-in screen.
- Added fallback admin credentials `Administrator` / `password4admin` when the corresponding Pages secrets are absent or blank. `Admin_User` and `Admin_Password` secrets override the fallbacks.
- Kept the existing minimum admin-password length check (12 characters).

# Changelog

## 3.0

Consolidates Chrono Heist into Time Detectives, hardens admin access, and adds an optional AI study helper.

**Content**
- Cases: 32 -> 25. Cut seven templated imports (v2.0 Cases 23, 24, 25, 26, 27, 29, 31): they repeated existing civilisation-and-skill pairs, gave every lead the same decision, and had placeholder legacy text.
- Kept and rewrote three as full cases with evidence-specific leads and distinct decisions: Case 23 The Vanishing Woodblock (ids stay 28), Case 24 The Tampered Draft (30), Case 25 The Future Blueprint (32). Saved progress keys are unchanged.
- Continuity and Change: 4 cases, level with the other skills (Sourcing 5, others 4).
- In-world consequence for every misstep option (73 across all cases).
- Cumulative transfer checkpoint kept, moved to after Case 25, over Cases 23-25, with two extra cross-skill questions (sourcing, contextualization).

**Features**
- Situation map (offline SVG, keyboard accessible, shows locked / ready / solved-by-tier).
- Chrono Agency framing: first-visit welcome, per-case dispatch, closing message.
- Archivist and practice quiz on Workers AI. Off by default, admin-only switch, per-pupil and site-wide daily limits, completion gate, server-held case notes, input caps, injection refusal, teacher-visible log, pupil report button, plain-text rendering.
- Teacher walkthrough (printable, Markdown, and `teacher-docs/TEACHER_WALKTHROUGH.md`).

**Security**
- Admin username and password are Cloudflare secrets `Admin_User` and `Admin_Password`. Removed the hard-coded defaults from the backend, client, tests and README.
- Admin sign-in fails closed if either secret is missing, or if the password is under 12 characters.
- Constant-time credential comparison; username match is case-insensitive.
- `SESSION_SECRET` is required (32+ characters); the API no longer falls back to a public development string.
- AI settings can only be changed by the admin; a teacher saving class settings cannot alter them.

**Database**: three new tables (`ai_usage`, `ai_global`, `ai_log`). Re-run `schema.sql`; it is safe on an existing database.

**Tooling**: `tools/build-case-notes.mjs`, `tools/build-walkthrough.mjs`; the smoke test verifies both outputs are current (162 checks).

## 4.0

Eight new cases, taking the total to 33.

- Marco Polo and the Silk Road (Corroboration) — Yuan China, testing his travel-book claims against independent Chinese and Persian sources.
- The Ottoman Empire (Contextualization) — reading records of its treatment of religious minorities against the standards of the 1500s.
- British India: Company to Crown (Continuity and change) — what changed and what continued when the Crown took over from the East India Company in 1858.
- The Emancipation Proclamation (Close reading) — reading its exact wording, scope and exceptions.
- Women's suffrage (Causation vs. correlation) — separating underlying causes, enabling conditions and the trigger behind Britain's 1918 vote.
- Singapore's 1915 mutiny (Contextualization) — reading the 5th Light Infantry's rising in its wartime, colonial setting.
- The Battle of Midway (Sourcing) — weighing an after-action report, a wartime propaganda announcement and a postwar memoir.
- The fall of the Berlin Wall (Causation vs. correlation) — underlying causes against the trigger of a muddled press conference.

**Content:** skill balance is now 5-6 cases per skill (was 4-5). New checkpoint `cp6` "Global Turning Points Review" after the last case, covering all eight new cases. All 40 new misstep options carry an in-world consequence; all eight cases have an Agency dispatch.

**Map:** extended east to place the Battle of Midway at its real position across the Pacific; viewBox widened from 1104x359 to 1311x359. Existing pins keep the same coordinates.

**No backend, schema, or secret changes.**

**Tooling:** smoke test grows to 170 checks (33-case count, the eight new case ids, skill balance, cp6, map pin count, walkthrough coverage).

## 5.0

Three new cases, taking the total to 36 and balancing all six skills at 6 cases each.

- The Golden Pilgrim (Corroboration) — Mali Empire, corroborating Mansa Musa's 1324 hajj and its effect on Cairo's gold price against independent Arabic and European sources.
- The Knotted Record (Close reading) — Inca quipu, reading a knotted-cord record's structure and testing claims about what quipu could and could not encode.
- Between Two Worlds (Continuity and change) — the French Revolution, testing "changed everything overnight" against "nothing changed for peasants" using the 1789 Declaration, parish records, and the exclusions it left in place.

**Checkpoint:** new `cp7` "Widening the World Review" after the last case, covering all three.

**Map:** extended south (viewBox height 359 -> 386) to place Cuzco at its real position in the Andes. Existing pins are unchanged.

**No backend, schema, or secret changes.**

**Tooling:** smoke test grows to 173 checks (36-case count, the three new case ids, exact 6-per-skill balance, cp7, map pin count, walkthrough coverage).
