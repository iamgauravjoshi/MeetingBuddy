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
   - A continuous one, saved via `saveRecordingFile` on stop.
   - A rolling chunk recorder, every `chunkSeconds`. Its chunks go through `recordingChunk` for the live transcript preview.
3. **On stop**, `api.stopRecording` calls `finishMeeting`, which:
   - re-transcribes the **full** files,
   - **replaces** the chunked `mic`/`system` segments,
   - runs `mergeStreams` to drop mic echo of speaker audio,
   - then auto-runs `analyzeMeeting` and shows a notification.

   The full-file pass exists because diarization speaker numbers are not consistent across independent chunks.

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
- **Evidence validation is mandatory.** Each quote must match its cited segment, using `quoteMatches`: an exact match after normalization, or at least 85% of the quote's words found in order. A neighbouring line is also accepted.
  - Proposals with no valid evidence are dropped and counted in `report.droppedCount`.
  - Unknown target refs are downgraded to `create`.
  - An unknown speaker falls back to the speaker of the evidence segment.
- **`applyApproved`** applies only `accepted` proposals, inside one transaction:
  - It writes `item_history` rows, which are the per-item "blame".
  - It writes one `state_versions` row containing a before/after diff.
  - `supersede` marks the old item `superseded` and creates a new one.
  - `flag` (a conflict) creates an open `question` item named "Resolve conflict: …".
- **Previous meetings feed the next analysis:** each meeting's report summary is passed into later analyses via `recentMeetingSummaries`.

### Data and settings

- `db.ts` is a thin query layer over the `node:sqlite` `DatabaseSync`. Columns are snake_case and get mapped to the camelCase types in `src/shared/types.ts`.
- `db.tx()` uses a plain `BEGIN`/`COMMIT`, which **does not nest**. Don't call `addSegments` or `saveReport` (which open their own transactions) inside another `tx`.
- A meeting keeps only its latest report: `saveReport` deletes older ones.
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
