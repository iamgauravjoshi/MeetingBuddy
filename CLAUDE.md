# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

MeetingBuddy is a Windows desktop app (Electron + React + TypeScript). It answers one question: "What changed in the project because of this meeting?" It keeps a versioned **project state**: typed items such as requirement, decision, task, risk, deadline and question. It records meetings without a bot (mic plus system loopback audio) and asks an LLM to propose changes to that state. Every proposal must carry verbatim transcript evidence. Approved proposals are then applied as a new state version. It is **not** a meeting summarizer, so keep features oriented around project-state change.

## Commands

```bash
npm run dev                         # electron-vite dev with hot reload
npm run build                       # bundle main/preload/renderer into out/
npm start                           # run the built app (electron-vite preview)
npm run typecheck                   # tsc for tsconfig.node.json (main/preload/shared) and tsconfig.web.json (renderer)
npm test                            # vitest run (test/**/*.test.ts)
npx vitest run test/analysis.test.ts        # single file
npx vitest run -t "drops changes whose"     # single test by name
npm run dist:win                    # build + electron-builder → release/MeetingBuddy Setup x.y.z.exe
```

To run the app against throwaway data instead of `%APPDATA%\MeetingBuddy`, pass `--user-data-dir=<dir>`, for example `npx electron . --user-data-dir=<dir> --remote-debugging-port=9333`. The remote-debugging port lets a CDP script drive the UI.

There is no linter configured.

## Toolchain constraints (non-obvious)

- **SQLite is `node:sqlite`** (built into Electron 44 / Node 24), not better-sqlite3. There are no native modules to rebuild, so keep it that way.
- **electron-vite 5 requires Vite 7.** Don't bump `vite` to 8, or `@vitejs/plugin-react` past 5.
- **TypeScript 7:** `baseUrl` was removed, so `paths` use `./`-relative targets. The root `tsconfig.json` is solution-style (`files: []` plus `references` to `tsconfig.node.json` and `tsconfig.web.json`) so editors pick the right config per file. The tsconfigs are not `composite`, because the renderer type-imports `src/main/api.ts`.
- **AI SDK v7:** `generateObject` is deprecated. Use `generateText({ instructions, prompt, output: Output.object({ schema }) })` and read `result.output`. Tests use `MockLanguageModelV4` from `ai/test`.
- **npm 11 blocks install scripts** by default. `esbuild` and `electron-winstaller` were approved with `npm install-scripts approve`. Electron's install script is also blocked, so after a fresh install `node_modules/electron` has no `dist/` or `path.txt`, and `npm run dev` fails with `Error: Electron uninstall`. Fix it with `node node_modules/electron/install.js`, or permanently with `npm install-scripts approve electron`.
- **`overrides.global-agent: ^4.1.3`** in `package.json` fixes `npm audit` (GHSA-hp3w-g68c-fv3c). electron-builder's `app-builder-lib` still pins `@electron/get@3`, which pulls in `global-agent@3` → `roarr@2` → a vulnerable `sprintf-js`; `global-agent@4` drops roarr and keeps the `bootstrap()` API that `@electron/get` calls. Don't override `@electron/get` itself to v5: it is ESM-only and `app-builder-lib` loads it with `require()`. Never run `npm audit fix --force`, because it downgrades electron-builder. Remove the override once electron-builder ships with `@electron/get` ≥ 4.
- The `@shared/*` alias maps to `src/shared/*`. It is configured in `electron.vite.config.ts`, both tsconfigs and `vitest.config.ts`.

## Architecture

### Process split and IPC

- `src/main/api.ts` exports a single `api` object. `index.ts` registers every key as an IPC handler on channel `api:<name>`.
- The preload (`src/preload/index.ts`) exposes `window.mb.invoke(name, ...args)` plus an allow-listed `on(channel)` for main→renderer events.
- `src/renderer/src/api.ts` is a `Proxy` typed as `Remote<typeof api>`. Renderer calls like `api.listItems(id)` are therefore fully typed against main's implementation.
- **To add a backend capability, add a function to `api` in `api.ts`. No other wiring is needed.**
- To add a new main→renderer event, add it to `EVENTS` in the preload and send it with `broadcast()` from `api.ts`.

### Recording pipeline (spans renderer and main)

1. **Capture happens in the renderer**, in `recorder.ts`:
   - `getUserMedia` provides the mic, which is always the local user (`settings.selfName`).
   - `getDisplayMedia` provides system loopback audio, which is everyone else. Main's `setDisplayMediaRequestHandler` in `index.ts` answers it with `audio: 'loopback'`, and the video track is discarded.
   - The main window uses `backgroundThrottling: false` so recording continues while the window is hidden in the tray.
2. **Each stream gets two MediaRecorders:**
   - A continuous one. Every 5 s its data is appended to `<source>.webm` on disk via `appendRecordingChunk`, through a per-stream promise queue that keeps writes in order. `stop()` waits for that queue, so a crash loses only the last few seconds.
   - A rolling chunk recorder, every `chunkSeconds`. Its chunks go through `recordingChunk` for the live transcript preview. `recordingChunk` drops any result that arrives after the meeting has left `recording`.
3. **On stop**, `api.stopRecording` calls `finishMeeting`, which:
   - re-transcribes the **full** files with `Promise.allSettled`. A stream that fails, or returns nothing, keeps its live-preview segments.
   - runs `mergeStreams` to drop mic echo of speaker audio,
   - **replaces** the `mic`/`system` segments atomically with `db.replaceSegments`,
   - saves any failure in `meetings.error` (shown on the meeting page),
   - then auto-runs `analyzeMeeting` and shows a notification.

   The full-file pass exists because diarization speaker numbers are not consistent across independent chunks. Speech-to-text requests time out after `CHUNK_TIMEOUT_MS` (60 s) for chunks and `FILE_TIMEOUT_MS` (10 min) for full files.

   **Interruptions:**
   - Quitting while recording shows a "Stop recording and quit?" dialog (`before-quit` in `index.ts`). On yes, main sends `app:quit-requested`; the renderer stops and saves the recording, then calls `window.mb.quitReady()`. A 15 s fallback timer quits anyway if the renderer doesn't answer.
   - At startup, `db.recoverInterruptedMeetings` moves meetings stuck in `recording`/`transcribing` to `ready` with an error. The meeting page then offers **Transcribe recording** (`api.transcribeRecording`); it is never started automatically.

4. **Meeting detection** lives in `detector.ts`. It polls the Windows `CapabilityAccessManager\ConsentStore\microphone` registry: an app is using the mic when `LastUsedTimeStop == 0`.
   - It emits `start` and `end` events.
   - `index.ts` turns `start` into a notification and banner.
   - It turns `end` (while recording) into the `meeting:ended` event, which auto-stops recording.
   - **Recording state is owned by the renderer (`App.tsx`)**. It reports back via `window.mb.setRecordingState` so that main's tray menu and hotkeys stay in sync.
   - Global hotkeys only broadcast `hotkey:record` and `hotkey:mark`.

### Analysis (`src/main/analysis.ts`): the core

- **Short refs in the prompt:** `buildRefs` gives the model short IDs instead of UUIDs:
  - items: `REQ-n`, `DEC-n`, `TSK-n`, `RSK-n`, `DL-n`, `Q-n`
  - transcript lines: `S1…Sn`

  `validateChanges` maps them back.

- **Output schema:** the model returns `{ summary, changes[] }`. Each change has a `category`:
  - user-facing categories: requirement, decision, action_item, scope_change, timeline_change, risk, blocker, open_question, conflict
  - an `op`: create / update / close / supersede / flag
  - an `item_type` that the change creates or modifies
- **Evidence validation is mandatory.** Each quote must match its cited segment (or a neighbouring line) via `matchQuote`, which compares whole words:
  - at least 3 words, with at least 85% of the quote's words found in order;
  - the quote must cover at least 75% of the matched transcript span, so scattered words don't count;
  - a negation (not, no, never, n't…) may not be added or dropped.

  The stored `Evidence.quote` is the **transcript's own span** returned by `matchQuote`, never the model's text.
  - Proposals with no valid evidence are dropped and counted in `report.droppedCount`.
  - Unknown target refs are downgraded to `create`.
  - An unknown speaker falls back to the speaker of the evidence segment.
- **`analyzeMeeting`** allows one analysis per meeting at a time:
  - A second call while one is running gets the same promise.
  - The meeting is `analyzing` while it runs, and goes back to its previous status if the analysis fails.
  - A meeting that is `applied`, or has any applied proposal, is refused, because re-analyzing would replace the report the project state came from.
- **`applyApproved`** applies only `accepted` proposals, inside one transaction. It returns `{ applied, skipped }`:
  - Each proposal stores `targetVersion`, the target item's version at analysis time. `update`/`close`/`supersede` proposals whose target was deleted or has a different version are **skipped**. They stay `accepted` and are reported with a reason, and never fall back to creating a new item.
  - Staleness is checked for all proposals before any is applied, so changes in the same batch don't invalidate each other.
  - It refuses to run while the meeting is `analyzing`. The meeting becomes `applied` only if something was applied.
  - It writes `item_history` rows, which are the per-item "blame", and one `state_versions` row containing a before/after diff.
  - `supersede` marks the old item `superseded` and creates a new one.
  - `flag` (a conflict) creates an open `question` item named "Resolve conflict: …".
- **`db.updateItem` ignores patches that change nothing:** the version, `updatedAt`, history and state diff are left alone. `api.updateItem` records only the fields that changed. `api.updateProposal` refuses to edit applied proposals or mark one applied.
- **Previous meetings feed the next analysis:** each meeting's report summary is passed into later analyses via `recentMeetingSummaries`.

### Data and settings

- `db.ts` is a thin query layer over the `node:sqlite` `DatabaseSync`. Columns are snake_case and get mapped to the camelCase types in `src/shared/types.ts`.
- **Schema changes go through `MIGRATIONS` in `db.ts`**, tracked by `PRAGMA user_version`:
  - Append a new migration; never edit one that has shipped.
  - Each migration runs in its own transaction.
  - Before migrating an existing database, `openDb` snapshots it with `VACUUM INTO` to `meetingbuddy.db.bak-v<oldVersion>`, keeping only the latest backup.
  - A database with a newer `user_version` than the app knows is refused.
- `db.tx()` nests: the outermost call is `BEGIN`/`COMMIT`, and inner calls become savepoints. Helpers that open their own transaction (`addSegments`, `saveReport`) can run inside a larger `tx`, and an inner failure rolls back only its own work.
- A meeting keeps only its latest report: `saveReport` deletes older ones.
- Recordings live in `<userData>/audio/<meetingId>/{mic,system}.webm`. `audio.ts` owns that folder:
  - `meetingAudioDir` only accepts meeting UUIDs, so an id from IPC can't reach paths outside it.
  - `api.deleteMeeting` and `api.deleteProject` delete the audio along with the rows. For a project, the meeting ids are collected before the cascade.
  - At startup, `removeOrphanedAudio` deletes UUID folders that have no meeting row.
- `settings.ts` stores `settings.json` and `secrets.json` in userData.
  - API keys are encrypted with Electron `safeStorage` and never returned to the renderer. The renderer only sees `settings.hasKey`.
  - LLM and STT keys share one secrets map, keyed by provider id.
- `llm.ts` builds the model from settings. OpenRouter, Ollama and custom endpoints all go through `@ai-sdk/openai-compatible`.
- `stt.ts` calls Deepgram REST directly (with `diarize` only for the system stream) or an OpenAI-compatible `/audio/transcriptions` endpoint (OpenAI/Groq, without diarization).

## Tests

- `test/analysis.test.ts` and `test/transcript.test.ts` cover pure logic. They `vi.mock` the Electron-dependent modules (`settings`, `db`, `llm`).
- `test/pipeline.test.ts` runs the real analyze → approve → apply flow on an in-memory `node:sqlite` database with a mock model. Extend it whenever you change prompt refs, validation or apply semantics.

## Known limitations

- Windows only: the detector and loopback capture are Windows-specific.
- No local speech-to-text yet (whisper.cpp is planned).
- Single-user, with no app icon or code signing.
