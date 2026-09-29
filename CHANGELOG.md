# Time Detectives v5.0 — requested patch

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
