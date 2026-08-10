# kodepi

A desktop client for the [pi coding agent](https://www.npmjs.com/package/@earendil-works/pi-coding-agent).

It reads pi's own agent directory — `~/.pi/agent`, or wherever `PI_CODING_AGENT_DIR`
points — and draws it as the design in
[`ant-pi Desktop.dc.html`](https://claude.ai/design/p/248dd7df-3e22-4fa3-9e07-56a3da70b62e):
a project and session rail, a transcript with inline diffs and terminal output, a
Diff / Agents / Terminal / Workflow inspector, a command palette and a settings sheet. Both
themes ship. A copy of the design source is in `design/`.

Nothing is stored in a second place, and nothing is written back. Delete this app and every
session is still in `~/.pi/agent/sessions`, readable by `pi` on the command line.

Verified against **pi 0.84.1** on macOS (Apple silicon), session file `version: 3`.

```bash
pnpm install
pnpm dev          # electron-vite dev server + the app, HMR in the renderer
pnpm build        # typecheck, then bundle main / preload / renderer into out/
pnpm start        # run the production bundle without packaging it
pnpm test         # vitest, headless
pnpm typecheck    # tsc for both projects, no emit
pnpm dist         # build, then an arm64 .dmg in dist/
```

## State of the build

**It is a reader.** Everything on screen is read from pi's own files. What it cannot do yet
is talk to a live pi process, so it cannot send a prompt, answer an approval, or rewind a
session. Those need `pi --mode rpc`, which is the next pass.

Affordances that would need a live process are absent rather than present and inert: there is
no Send, no Rewind, and the model / thinking / permission menus report what pi recorded and
say so in their own footers.

## How it reads pi

```
┌── renderer (React 19) ───────────────────────────────────────────────┐
│  components/  ← one per region; steps/ is one per step kind          │
│  lib/store.ts ← one module-level state + useSyncExternalStore        │
│  lib/api.ts   ← the only place window.api is touched                 │
└───────────────────────────┬──────────────────────────────────────────┘
                            │ contextBridge, sandboxed CJS preload,
                            │ one ipcMain.handle per channel
┌───────────────────────────┴──────────────────────────────────────────┐
│  main                                                                │
│    services/sessions.ts   head+tail scan → the rail                  │
│    pi/transcript.ts       session entries → Step[]  (pure)           │
│    pi/diff.ts             edit arguments → real line diffs           │
│    services/settings.ts   settings.json, models.json, pi's version   │
│    services/workflows.ts  workflow-runs/*.json                       │
│    services/git.ts        one question: which branch is cwd on?      │
└──────────────────────────────────────────────────────────────────────┘
```

- **The cwd comes from inside the file.** pi's session directories encode the cwd by replacing
  every separator with a dash, which is lossy — one directory on this machine decodes to
  `----`. The header line of each `.jsonl` carries the real path, so that is what is read.
- **The rail is cheap.** `~/.pi/agent/sessions` is 80 MB here. A summary needs the header
  line, the first user message and the last turn's stop reason, so each file is read at the
  head and the tail only. A session is reduced in full when it is opened.
- **The reducer is pure.** `pi/transcript.ts` never touches the filesystem, so it is tested
  against a genuine recording in `src/main/pi/__fixtures__/session.jsonl`.
- **Steps are upserted by id.** Today they arrive in one batch. That is the seam a streaming
  pi event feeds later: one transcript row rewritten, not a list that grows.
- **The reducer formats nothing.** Durations and timestamps cross as numbers, so the renderer
  can localise a clock and refresh a relative age without another round trip.
- **`auth.json` is never opened.** The scan touches `sessions/`, `workflow-runs/`,
  `settings.json` and `models.json`, and nothing else.

### pi's tools, and the cards they become

| pi tool | Card |
| --- | --- |
| `read` | READ row, with the line count from the result |
| `edit`, `write` | EDIT card with a real inline diff |
| `bash`, `bash_output` | RUN card, and a line in the terminal pane |
| `task` | SUBAGENTS card, and a row in the Agents tab |
| `advisor` | ADVISOR block |
| `workflow` | Workflow card, linked to the run store when the ids match |
| `ask_user` | QUESTION card, showing the answer pi recorded |
| `grep`, `find`, `ls`, `lsp_diagnostics`, `web_*` | A generic tool row — the design has no card for these |

`custom` entries carry the rest: `turn-duration` closes a turn into the summary card, `usage`
fills the meters, and a `compaction` entry becomes its own collapsed row.

## Decisions worth knowing

**The window is the window.** The design draws a fixed 1600×1000 card on a `--desk` backdrop.
The app opens at exactly 1600×1000 and resizes down to 1120×720 — below that the 268px rail,
the 880px transcript column and the 408px inspector start to collide.

**The traffic lights are real.** The design paints three coloured circles; macOS draws its own
at x=16, y=20. The rail keeps a 60×14 spacer for them.

**Fonts are bundled.** The design pulls Inter and JetBrains Mono from Google Fonts. A desktop
app should render offline and should not phone home on launch, so both come from `@fontsource`
and the CSP has no external `font-src`.

**Diff hunks carry no line numbers.** pi's `edit` result has no patch; the call records
`edits[] = { oldText, newText }`. The diff is computed from those pairs, which is real — but
pi does not record *where* in the file the text sat, so there is no gutter at all rather than
numbers that would read as file lines and be wrong.

**The preload is CommonJS, on purpose.** `package.json` is `"type": "module"`, so
electron-vite would emit `index.mjs`. Electron loads a sandboxed preload as a classic script:
an ESM preload dies on its first `import` and leaves `window.api` undefined with no visible
error. `electron.vite.config.ts` forces `format: "cjs"` — do not remove it.

**Security posture.** `contextIsolation: true`, `nodeIntegration: false`, a sandboxed preload,
a CSP installed from the main process, `will-navigate` blocked, `setWindowOpenHandler` denying
everything while sending `http(s):` links to the OS browser. Git is invoked with `execFile`,
never a shell, with `GIT_DIR` / `GIT_WORK_TREE` / `GIT_INDEX_FILE` scrubbed.

## What the design asked for, and what pi has

| Design element | What ships | Why |
| --- | --- | --- |
| Two footer meters with bars | Context, with a bar; session cost, without one | pi records a context window per model, so that fraction is real. Nothing in the agent directory states a spend limit, so cost gets a figure and no bar. |
| "Session usage" / "Weekly limit" | Removed | pi never reads provider rate-limit headers. There is no source. |
| "Response style" (concise / normal / detailed) | Removed | pi has no verbosity control anywhere in its settings. |
| "Advisor model" as a setting | A role, chosen from the ones pi has | It is real — `settings.advisor.model` — and takes a *role* name, so the panel offers the roles the active `models` profile defines rather than a model. A model there would be left behind by the next `/provider` switch. |
| A model picker per setting | One panel of combinations | The `models` block names a model for every job — session, frontier, fast, cheap — and every setting that resolves one names a *role*. So the Combinations panel edits those, and the Model panel reports pi's `defaultProvider`/`defaultModel` rather than writing them: they are the `session` role said twice, and two controls on one setting would take turns undoing each other. A configuration whose combination in force names no `session` role — including one with no `models` block at all — gets the direct picker back, because then nothing else writes them. |
| Permissions menu ("Read only", "Auto Mode") | pi's own mode and rule counts | pi's modes are its own, and its documentation says trust is *not* a sandbox. The menu says so. |
| Six effort levels | Seven | pi has `off, minimal, low, medium, high, xhigh, max`. |
| "A fresh worktree is cut from `main`" | The session's real cwd and branch | pi cuts no worktrees. |
| Rewind, Send, Approve / Deny | Absent | Each one writes. They arrive with the RPC pass. |
| Workflow phases and agent grid | An empty state that explains itself | pi writes phases only once a run starts agents. Every run in this store was created or cancelled first, so there is nothing to draw. |
| "Merge to main" / "Comment" | Removed | There is no merge or comment channel, and a button that cannot fire is worse than no button. |

## Testing

`pnpm test` runs vitest headlessly. There is no jsdom: renderer components are rendered with
`react-dom/server` and asserted on their markup, which catches what actually breaks here — a
crash on an empty session, a missing class the CSS keys off, an empty state that never
appears. The reducer and the diff are pure functions and are tested directly, the reducer
against a real recorded session.

`src/main/pi/__fixtures__/session.jsonl` is a copy of a real session from the machine this was
built on. Swap it for any other pi session file; the assertions are about shape.

## Licence

MIT.
