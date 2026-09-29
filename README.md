# Time Detectives — Cloudflare Pages + D1 backend

This package is the full game (`index.html`) plus a real server-side backend
(`functions/api/[[path]].js`, a Cloudflare **Pages Function**) backed by
**D1** (Cloudflare's SQLite database), replacing the earlier Workers KV
backend. Cloudflare Pages deploys the static file and the function together
from one folder — no separate Worker to manage.

**If you're currently running the Workers KV version of this game**, jump to
["Migrating from KV to D1"](#migrating-from-kv-to-d1) below — this package is
a drop-in replacement, not a rewrite from scratch, and your pupils' accounts
carry over.

## Why this version exists: the KV write-limit problem

The KV version saved a pupil's progress to Workers KV on (almost) every
change — answering a question, opening a clue, and so on — debounced to at
most one write every 700ms per pupil while they were actively playing. That
sounds conservative, but it adds up fast across a whole class:

- 35 pupils playing continuously for 25 minutes, saving roughly once every
  700ms–1s each, comes out to **well over 1,000 write operations** — the
  daily limit on Cloudflare's free Workers KV tier. A single lesson could
  burn through the whole day's quota (one class saw ~1,500 writes in 25
  minutes, 500 over the limit) and further saves for the rest of the day
  would start failing.
- D1's free tier is far more generous for this shape of workload — **100,000
  rows written per day**, not ~1,000 write *operations* — so the identical
  save pattern that overshot KV comfortably fits D1's free tier with a lot of
  headroom for a full school timetable, not just one lesson.

This package makes two changes together, because either alone helps but both
together give the most headroom:

1. **Storage: D1 instead of KV** (this package). Same data, same account
   model, much higher free-tier write ceiling, and — as a bonus — the
   teacher roster and leaderboard now come from a single SQL query instead
   of a `list()` + per-key `get()` loop, so they're faster too as a class
   grows across terms.
2. **Save frequency: a 5-minute interval instead of near-instant.** See
   below.

## Save frequency: what changed and why

Progress now saves to the server on:

- **A 5-minute interval**, and only when there's actually something new to
  save (no pupil, no wasted write).
- **The pupil clicking the new "Save" button**, which appears in the
  bottom-right corner for any signed-in (non-guest) pupil. Clicking it always
  sends a save immediately, so it's a reliable "make sure this is saved
  right now" action — useful right after finishing a case, or before closing
  a laptop.
- **Closing or switching away from the tab**, as a safety net — if there's
  unsaved progress when the tab is hidden or closed, the game force-flushes
  one last save immediately rather than waiting for the next 5-minute tick.
  This only sends a request when there's something unsaved, so it doesn't
  add to write volume during normal play.

Progress is still written to the browser's local storage **instantly** on
every change, exactly as before — this only changes how often that local
progress gets mirrored to the server. A pupil never sees lag or a "waiting
to save" delay in the game itself; the small "Unsaved — autosaves every 5
min" pill just tells them (honestly) that the very latest bit of progress is
sitting locally and hasn't reached the server yet. It clears the moment the
next save — interval, button, or close-flush — lands.

**What this means for a class of 35:** roughly 35 saves every 5 minutes from
the interval alone (one per active pupil), plus however many pupils click
Save manually or close their laptop mid-case. A 25-minute lesson lands
somewhere around 150–250 saves total, comfortably inside D1's daily
100,000-row budget even before accounting for D1's much higher ceiling than
KV's stricter one.

**Trade-off to know about:** if a device crashes, loses power, or the
browser is force-quit (not just closed normally) between autosaves, up to
~5 minutes of progress that never reached the button or the close-flush
could be missing next time that pupil signs in on a different device. Their
local copy on that same device is unaffected. If your class does a lot of
closing laptops mid-case, remind pupils that clicking "Save" before closing
the lid is the reliable way to be sure.

If 5 minutes ever turns out to be too long or too short for how your classes
actually play, it's one constant: `AUTOSAVE_INTERVAL_MS` near the top of the
sync section in `index.html` (search for it) — change the number, save,
redeploy.


## Version 5.0: three more cases

Adds three cases, chosen to widen the game's geographic and thematic range: Mali Empire (Corroboration), the Inca quipu (Close reading of primary evidence), and the French Revolution (Continuity and change).

- **36 cases total, with all six skills now exactly balanced at 6 cases each.**
- **A new checkpoint**, `cp7` "Widening the World Review", after the last case, covering all three.
- **Map extended south** to place Cuzco correctly in the Andes; the viewBox is taller as a result (existing pins keep the same coordinates).
- Earlier versions (trimmed case set, in-world consequences, situation map, Agency framing, the Archivist, admin-secret setup, teacher walkthrough) are all unchanged — see `CHANGELOG.md` for the full history of every version.

**Upgrading from v4.0:** no database or secret changes. Redeploy, and re-run the two build scripts if you edit any case text.

## What's in this package

```
index.html                - the whole game UI + client logic (HTML + CSS + JS)
functions/api/[[path]].js - the backend: auth, save/load progress, teacher dashboard (D1-backed)
schema.sql                 - D1 table definitions — run this once against a new database
migrate-kv-to-d1.mjs       - one-time script to copy data out of an old KV namespace into D1
wrangler.toml               - Cloudflare project config, including the D1 binding
_headers                    - security headers + no-cache on /api/*
smoke-test.mjs              - end-to-end test (see "Testing" below)
shared/caseNotes.js         - AUTO-GENERATED case notes the Archivist reads (see "The Archivist")
tools/                      - build scripts: build-case-notes.mjs, build-walkthrough.mjs
CHANGELOG.md                - what changed in each version
README.md                   - this file
```

The answer key lives **outside** this folder, in `../teacher-docs/`, on purpose.
Everything inside this folder is deployed and publicly downloadable (including
this README, `schema.sql` and `shared/caseNotes.js`). None of it contains a
secret, but don't put an answer key or credentials in here.

## Backend setup (do this once, before your first deploy)

**Already running the KV version and want to bring your existing pupils and
teachers along?** Skip to ["Migrating from KV to D1"](#migrating-from-kv-to-d1)
instead — it covers steps 1–2 below plus copying your existing data across.

### 1. Create the D1 database

```
npm install -g wrangler       # if you don't have it already
wrangler login
wrangler d1 create time-detectives-db
```

This prints something like:

```
[[d1_databases]]
binding = "TD_DB"
database_name = "time-detectives-db"
database_id = "a1b2c3d4-e5f6-..."
```

Copy that `database_id` value into `wrangler.toml`, replacing
`REPLACE_WITH_YOUR_D1_DATABASE_ID`.

*(Prefer the dashboard? Workers & Pages -> D1 -> Create database, name it
anything. You'll bind it to the Pages project as `TD_DB` in step 4's
dashboard alternative below.)*

### 2. Create the tables

```
wrangler d1 execute time-detectives-db --remote --file=schema.sql
```

This creates the `players`, `teachers`, and `settings` tables. Safe to
re-run — it only creates tables that don't already exist.

### 3. Set the secrets

Three secrets are **required**. There are no defaults and no fallbacks:

| Secret | Purpose | Rules |
|---|---|---|
| `SESSION_SECRET` | Signs sign-in tokens. | Random string, **32+ characters**. If it is missing or short, the whole API refuses to run (a missing secret must never become a guessable one). |
| `Admin_User` | Admin sign-in username. | Optional. Defaults to `Administrator` if the secret is absent/blank. Matching is case-insensitive, and pupils and teachers can't register it. A Pages secret overrides the fallback. |
| `Admin_Password` | Admin sign-in password. | Optional. Defaults to `password4admin` if the secret is absent/blank. The fallback and any secret must be **12+ characters**. A Pages secret overrides the fallback. |

Secret names are case-sensitive: type `Admin_User` and `Admin_Password` exactly. They are optional because the package includes fallback admin credentials for initial access; set the Pages secrets to replace those fallbacks before normal use.

Set them after the first deploy, since Pages secrets attach to an existing project:

```
openssl rand -base64 48                                             # generates a good SESSION_SECRET
wrangler pages secret put SESSION_SECRET --project-name=time-detectives
wrangler pages secret put Admin_User     --project-name=time-detectives
wrangler pages secret put Admin_Password --project-name=time-detectives
```

In the dashboard: project -> **Settings** -> **Variables and Secrets** -> add each as type **Secret**, for **both Production and Preview**. Then redeploy so the Function sees them.

**Rotating credentials.** Change `Admin_User` or `Admin_Password` by putting a new value and redeploying. Sign-in tokens are stateless, so an already signed-in admin stays signed in until their token expires (10 hours). To end all sessions at once, also rotate `SESSION_SECRET` (pupils will simply sign in again).

**Recommended: rate-limit sign-in attempts.** In Cloudflare, add a rate-limiting rule for `/api/teacher/login` and `/api/player/login` (for example, 10 requests per minute per IP, then block). The app itself doesn't throttle attempts; the long admin password is your main protection.

**Local development:** create a `.dev.vars` file next to `wrangler.toml` (never commit it) with `SESSION_SECRET=...`, `Admin_User=...`, `Admin_Password=...`, then run `wrangler pages dev .`.

### 4. Deploy

**Option A — Wrangler CLI (recommended, handles the D1 binding for you):**

```
wrangler pages deploy . --project-name=time-detectives
```

First deploy: Wrangler offers to create the Pages project — accept it, then
go back and run the `secret put` commands from step 3, then deploy again so
the Function picks them up.

**Option B — Dashboard drag-and-drop:**

1. [dash.cloudflare.com](https://dash.cloudflare.com) -> **Workers & Pages**
   -> **Create** -> **Pages** -> **Upload assets**.
2. Drag this whole folder in (must include the `functions/` subfolder —
   that's what makes the backend work).
3. After the first deploy: go to the project -> **Settings** -> **Functions**
   -> **D1 database bindings** -> add binding `TD_DB` pointing at the
   database you created in step 1.
4. Also in **Settings** -> **Variables and Secrets**, add `SESSION_SECRET`
   as a secret. `Admin_User` and `Admin_Password` are optional secrets that
   override the built-in fallback admin credentials; if you set them, add
   them for both Production and Preview. If you want the Archivist, also add a **Workers AI** binding named
   `AI` under **Settings** -> **Functions** -> **Workers AI binding**.
5. Redeploy (upload again, or **Retry deployment**) so the new bindings and
   variables take effect.

Either way, you'll get a URL like `time-detectives.pages.dev` within about
a minute. Share that with your class.

## Migrating from KV to D1

If you have an existing deployment on the Workers KV package, this section
copies your real pupil accounts, teacher accounts, and class settings across
without anyone losing progress or needing to re-register. It's a **snapshot
migration**, not a live sync: pick a moment pupils aren't actively playing
(a lunch break or after school is plenty — you don't need to announce it a
week in advance), because anything saved to the old KV backend after the
snapshot and before you deploy this package won't carry over automatically.

1. **Find your KV namespace ID.** It's the `id` value under
   `[[kv_namespaces]]` in your *old* package's `wrangler.toml`, or run
   `wrangler kv namespace list` and find the one bound as `TD_KV`.

2. **Create the D1 database and tables** — steps 1–2 of "Backend setup"
   above (`wrangler d1 create time-detectives-db`, then
   `wrangler d1 execute time-detectives-db --remote --file=schema.sql`).
   Do this from inside *this* (D1) package's folder, so `wrangler.toml`
   already has the right `pages_build_output_dir` and binding name to fill
   in.

3. **Generate the migration SQL.** From inside this package's folder:

   ```
   node migrate-kv-to-d1.mjs --kv-namespace-id=<the id from step 1>
   ```

   This only *reads* from KV — it writes a plain SQL file
   (`migration-data.sql` by default) and touches nothing else. Open it and
   skim it if you'd like; it's ordinary, readable `INSERT` statements.

4. **Load it into D1:**

   ```
   wrangler d1 execute time-detectives-db --remote --file=migration-data.sql
   ```

5. **Spot-check it landed:**

   ```
   wrangler d1 execute time-detectives-db --remote --command="SELECT detective_name, email, points FROM players;"
   ```

   You should see your real pupils and their current point totals.

6. **Set your secrets** (step 3 of "Backend setup") — if you're redeploying
   to the *same* Pages project you used for the KV version, `SESSION_SECRET`
   is probably already set, but the admin credentials are **not** the old
   `TEACHER_ADMIN_*` names any more: use the optional `Admin_User` and
   `Admin_Password` secrets if you want to override the built-in fallbacks.
   Existing pupil sign-in tokens keep working since the token format
   didn't change.

7. **Deploy this package** the same way you deployed the old one (step 4 of
   "Backend setup"). If you're deploying to the same Pages project, the new
   Function replaces the old one automatically — you don't need to do
   anything to "turn off" KV, though you can delete the old KV namespace
   afterwards once you've confirmed everything looks right
   (`wrangler kv namespace delete --namespace-id=<id>`, optional, and
   obviously only after you're confident the migration succeeded).

Detailed comments on every step (including what each generated `INSERT`
does, and what to do if your Wrangler version uses slightly different `kv
key` subcommand names) are in the header of `migrate-kv-to-d1.mjs` itself.

## Updating game content later

All 36 cases, tiers, misstep consequences, glossary, and legacy briefings live
inside `index.html` as inline JavaScript data (`const CASES = [...]` near the
top of the `<script>` block). The Agency dispatches and closing message are in
`const AGENCY = {...}` further down.

After editing any case text, run two small scripts from this folder, then
redeploy:

```
node tools/build-case-notes.mjs     # refreshes shared/caseNotes.js (what the Archivist reads)
node tools/build-walkthrough.mjs    # refreshes ../teacher-docs/TEACHER_WALKTHROUGH.md
```

`node smoke-test.mjs` fails if `shared/caseNotes.js` or the walkthrough file is
out of date, so you can't forget. Editing cases never touches the backend or
anyone's saved progress. Every decision needs exactly one option of each tier
(ideal, plausible, passive, misstep), and the misstep option carries a
`consequence` sentence.

**MCQ option order is randomised at render time, not stored.** In the
underlying data, each question's `options` array is written with the
correct answer wherever it naturally falls (often first or second) — that's
fine, because every place that displays a question (`renderKnowledgeCheck`,
`openCheckpointQuiz`) draws it through `shuffleQuestionOptions()` first,
which returns a freshly shuffled copy without touching the stored data. So
if you add or edit a question, you don't need to manually vary where you
put the correct option — pupils never see the stored order anyway.

## How accounts and the teacher dashboard work now

- A pupil signs up once with a detective name, email, and password (6+
  characters). That's their identity — the game finds their record by
  either the name or the email at sign-in.
- Progress saves to the local browser instantly (so the game never feels
  laggy or breaks offline) and syncs to the D1 backend on the schedule
  described in "Save frequency" above — a 5-minute interval, the Save
  button, or a close-tab flush. If the connection drops mid-lesson, play
  continues from the local copy and catches up once it's back and the next
  save trigger fires.
- Teacher/admin access is separate from pupil sign-in. A small **Teacher
  log-in** link below the launch-page account controls opens a dedicated
  teacher/admin sign-in form. Teacher/admin credentials are checked on the
  server.
- The roster, skill matrix, and CSV export in the teacher dashboard are
  populated by `GET /api/teacher/roster`, which now runs a single SQL query
  against every pupil's D1 row — so it's the same list no matter which
  computer the teacher signs in from, and stays fast as the roster grows.
- Only the admin account can create additional teacher
  accounts (from within the dashboard); those accounts get full dashboard
  access but can't create further teacher accounts themselves — same rule
  as before.

## Managing pupils from the teacher dashboard

Each row in the **Student roster** table has a **Manage** button (next to a
**Last active** column, so you can see at a glance who's actually been
playing). Manage opens a small panel with two tools:

- **Reset password.** Generates a fresh, random 8-character temporary
  password and shows it on screen once — write it down or read it out to
  the pupil, then they sign in with it immediately. Their old password
  stops working the moment you do this. There's no email-based reset flow
  (that would need this to send real email, which it currently doesn't) —
  Admin resetting it from the dashboard is the intended path. Pupils see a
  reminder of this on the sign-in screen if they've forgotten their
  password.
- **Reset a case.** Clears that one case's score, tier, and content-check
  answers so the pupil can play it again from scratch, without needing you
  to toggle the class-wide "Allow retry" setting for everyone else. Their
  Atlas card for that case is deliberately kept — retrying a case shouldn't
  take lore they've already unlocked away from them.

Both actions ask for confirmation before doing anything, since they change
a pupil's saved data immediately and can't be undone from the UI.

## Legacy illustrations

Every "legacy" the game shows — each case's artifact (in the Trophy
Cabinet) and every civilisation-wide legacy (in the Legacy Briefing screen
and the Atlas) — has a placeholder illustration box until a teacher adds
real artwork. Pupils never see a broken image or an empty gap; the
placeholder (a dashed box with a picture icon and "Illustration coming
soon") fills that space until then.

**Adding artwork:** from the teacher dashboard, open **Legacy
illustrations** at the bottom of the page. It's grouped into one
collapsible section per case — expand a case to see its trophy artifact
plus every legacy listed in that case's briefing. For each one you can
either:

- **Paste an image URL** — any publicly reachable `http(s)://` image link, or
- **Upload a file** — read entirely in the browser and sent to the
  backend as a base64-encoded image (kept under ~1.5MB; the panel rejects
  anything larger before it's even sent, with a clear message).

Click **Save** on that row. It takes effect immediately for every pupil —
the game checks for illustrations once when it loads, so a pupil already
mid-session won't see it appear until their next visit, but anyone loading
the game fresh sees it right away. **Remove** clears it back to the
placeholder.

Any signed-in teacher (not just the admin account) can manage these — it's
content curation, not an account-security action like creating teacher
accounts or resetting a pupil's password.

**Reasoning-skill icons.** The same panel also has a "Reasoning skill
icons" section at the top, covering the game's six reasoning skills
(Sourcing, Contextualization, Corroboration, Causation vs. correlation,
Close reading of primary evidence, Continuity and change) — set art for
these the same way (URL or upload), and it appears as a small badge on
every case card, in the header of every case using that skill, and in the
column headers of the teacher skill-matrix table below, all from the one
save. Until you set one, a plain default emoji is shown for each skill
instead of the dashed placeholder box the case/legacy illustrations use —
a badge that size looks better with a simple icon than an empty box.

**Where this data lives:** a new `legacy_illustrations` table in the same
D1 database everything else uses (see `schema.sql` — it's included
automatically the first time you run `wrangler d1 execute ... --file=schema.sql`,
including for existing deployments migrating from KV). URLs and uploaded
images are both just stored as text (an uploaded image is a data: URI), so
there's nothing extra to configure — no separate image bucket or CDN
needed for a class-sized set of illustrations.

**A note on uploaded images and D1 size limits:** D1 rows have a practical
size ceiling, which is why uploads are capped client-side at ~1.5MB (a
base64-encoded image runs about a third larger than the original file, so
this comfortably covers a decent-quality photo or illustration while
staying well inside that ceiling). If you're illustrating a lot of
legacies with large source photos, resizing them to roughly 800px on the
long edge before uploading (or just linking to an already-hosted, resized
image via the URL option) keeps things comfortably small and the game
loading quickly for pupils.

## Staying informed while playing

- A small **"Unsaved / Saving… / Saved"** pill appears in the bottom-right
  corner reflecting whether a pupil's most recent progress has reached the
  server yet, so it's visible (briefly, once saved) that progress is
  actually being saved, not just sitting on the device.
- A **"Save"** button sits just below that pill for any signed-in pupil —
  click it any time to save right now instead of waiting for the next
  5-minute autosave.
- If a pupil's connection drops, a banner appears at the top of the screen
  letting them know their progress is still saving locally and will catch
  up once they're back online — it disappears automatically when the
  connection returns.
- Closing the tab, switching apps, or the screen turning off flushes any
  pending save immediately, so the usual way progress could go missing
  between autosaves is covered.
- A small **"A / A+"** control (top-left, on every screen) lets a pupil
  switch to larger text. The choice is remembered on that device.

## The situation map and Agency framing

The **Map** button on the case menu opens an offline world map (drawn from data embedded in `index.html`, so it makes no external requests). Each case has a pin: dashed for locked, gold with a ring for ready, and coloured by result once solved (green, amber, grey or red). Pins work with the keyboard and screen readers. Cases your teacher hasn't assigned show as locked.

Framing is deliberately light: a one-time welcome from the Chrono Agency (per browser), a short dispatch at the top of each case, and a closing message when every case is solved. All text is in `AGENCY` in `index.html`.

## In-world consequences

When a pupil chooses the misstep option, the feedback is followed by a "What happened next" note showing what the mistake cost in the story. They are teaching aids, not extra scoring: points, tiers and mastery are unchanged.

## The Archivist and practice quiz (optional AI)

After finishing a case, a signed-in pupil can ask the Archivist short questions about that case and take a three-question practice quiz. It runs on **Cloudflare Workers AI**, so no third-party account is needed. It is **off by default**.

**Turning it on**
1. Make sure the `AI` binding exists (`wrangler.toml` already declares it; in dashboard deploys add a Workers AI binding named `AI`).
2. Re-run `schema.sql` so the three `ai_*` tables exist.
3. Sign in as **admin**, open the teacher dashboard, tick *Let pupils use the Archivist and practice quiz*, choose the daily limit, and save. Only the admin sees this switch enabled; other teachers see it locked.
4. Untick it and save to switch the feature off for everyone immediately.

**Guardrails (all enforced on the server)**
- Admin-only master switch, off by default, plus an admin-set per-pupil daily limit (1-50, default 10) and a site-wide daily cap (`AI_GLOBAL_DAILY_CAP`, default 1000).
- Signed-in pupils only, so guests never reach it, and only for a case that pupil has already completed.
- The model sees **only** the server-held notes in `shared/caseNotes.js`. The browser sends just a case id and a question, so the endpoint can't be turned into a general chatbot, and nothing a pupil sends can change the model's instructions.
- The system prompt limits answers to the case notes, about 110 words, no off-topic help, no personal questions, and a kind redirect to a teacher if a pupil sounds upset.
- Questions are capped at 200 characters with control characters stripped. Obvious "ignore your instructions" phrasing is refused without calling the model.
- Answers are displayed as plain text, never parsed as HTML.
- Every question and answer is logged and shown in **Archivist activity** on the teacher dashboard (most recent 200 shown; 500 kept; the admin can clear it). Pupils are told their teacher can see what they ask, and each answer has a **Report this answer** link that highlights it for you.
- Nothing here affects points, tiers, skill mastery, trophies or the leaderboard.
- If the model returns a malformed quiz twice, the pupil gets the case's own authored questions instead.

**What the guardrails can't do.** The model can still be wrong or occasionally odd, and a small model is not a safety filter. That is why the answer is labelled as AI, why pupils can report it, and why you have the log. Review the log in the first few lessons, and consider a school policy statement for pupils and families.

**Privacy.** The log stores the pupil's email, detective name, questions and answers in your own D1 database. Text is sent to Cloudflare Workers AI to generate a reply. Check that this fits your school's data-protection rules before switching it on.

**Optional variables:** `AI_MODEL` (default `@cf/meta/llama-3.1-8b-instruct`), `AI_GLOBAL_DAILY_CAP`, and `AI_DAY_OFFSET_HOURS` (default 8, so the daily limit resets at midnight Singapore time; use 0 for UTC).

## Teacher walkthrough

In the teacher dashboard, **Teacher walkthrough** offers a printable view and a Markdown download. It lists every case, every decision, all four answers with tier and points, the feedback pupils see, the in-world consequence, and the knowledge-check answers. The same file is written to `../teacher-docs/TEACHER_WALKTHROUGH.md` by `node tools/build-walkthrough.mjs`. The dashboard button is hidden from pupils, but the answers do exist in `index.html` (as they always have), so treat it as classroom protection rather than security.

## Testing

`smoke-test.mjs` drives the real `index.html` in a headless DOM (jsdom) and
exercises it against the real backend code (with an in-memory stand-in for
D1) — signup, cross-"device" sign-in, wrong-password rejection, the
admin gate (including wrong-password checks), teacher roster
visibility, guest play staying fully offline, the knowledge-check
double-tap fix, teacher-driven password/case resets, the sync status
pill/offline banner, the manual Save button, the flush-on-close behaviour,
MCQ option shuffling, and the legacy illustrations panel (placeholder by
default, a teacher-saved URL actually rendering for a fresh pupil session,
oversized uploads being rejected, Remove reverting to the placeholder, and
the six reasoning-skill icons sharing the same mechanism and updating the
case card, case header, and skill-matrix table live). v4.0 adds checks for the eight new cases and the new checkpoint, on top of the checks
the admin secrets (fail-closed when missing or weak, old defaults rejected,
forged-token rejection, reserved names), the trimmed case set and skill
balance, consequences on every misstep, the situation map, the Agency
framing, the walkthrough, and the whole Archivist guardrail list (off by
default, admin-only switch, completion gate, server-held context, length and
injection limits, daily and site-wide caps, logging and reporting, safe
rendering). To run it locally:

```
npm install jsdom
node smoke-test.mjs
```

This doesn't touch your real Cloudflare account or D1 database — it's pure
Node, safe to run any time you edit `index.html` or the Function.

## Troubleshooting

- **"set the SESSION_SECRET secret" error on every request:** `SESSION_SECRET` is missing or under 32 characters. Set it (step 3) and redeploy.
- **Teacher/admin sign-in:** if no `Admin_User` or `Admin_Password` Pages secrets are set, the built-in fallback is `Administrator` / `password4admin`. Setting either secret overrides its fallback. The password must be at least 12 characters.
- **The Archivist button never appears:** the admin switch is off (or unsaved), the pupil is playing as a guest, or the case isn't finished. If pupils see "not set up on this site yet", the `AI` binding is missing.
- **"Backend not configured" errors, or progress not syncing:** the `TD_DB`
  D1 binding isn't set. Check `wrangler.toml` has a real `database_id` (not
  the placeholder), or the dashboard binding from step 3 of "Deploy" above,
  then redeploy.
- **Teacher sign-in doesn't show pupils / roster looks stuck loading:** open
  the browser console — a 401 usually means `SESSION_SECRET` isn't set (or
  changed between deploys, invalidating old tokens — pupils just sign in
  again). A network error means the D1 binding is missing.
- **"Detective name is already in use" but you don't recognize the name:**
  someone else already claimed it — detective names are unique across the
  whole class/school, not per-device. Pick another.
- **Blank page after deploy:** make sure `index.html` is at the root of
  what you uploaded/deployed, and that the `functions/` folder came along
  with it — a missing `functions/` folder means the game still loads but
  every sign-in fails with a network error.
- **A pupil forgot their password:** Admin (or any teacher account) can
  reset it from the roster's Manage panel — see "Managing pupils from the
  teacher dashboard" above. There's no self-service reset by design.
- **Migration script errors with "unknown command":** your installed
  Wrangler version uses slightly different `kv key list` / `kv key get`
  subcommand names (some older versions use `wrangler kv:key list` with a
  colon). Run `wrangler kv --help` to see the exact names, and adjust the
  two `runWrangler()` calls near the top of `migrate-kv-to-d1.mjs`
  accordingly.
- **A pupil's progress from right before a crash/power loss is missing:**
  expected if it happened between one autosave and the next and nobody
  clicked "Save" — see the trade-off note in "Save frequency" above.
