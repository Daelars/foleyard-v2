# Auto Tag v2

Deterministic filename-rule tagging on the v2 extension engine (issue
#190). Displayed as **Auto Tag v2**. Bundled internal port, disabled
by default, explicit enable/disable, no settings of its own (on/off is
the extension enabled flag), no auto-migration from anything. There is
no v1 auto-tag; the filename rules first appeared as the throwaway
`prototype/auto-tag` mocks.

Tag new arrivals with the seed rules. Preview plans first, tag in the
background, every write marked deterministic. Semantic suggestions
arrive through CLAP over the approved vocabulary, every write marked
semantic with its confidence.

## Layout

- `src/definition.ts` — v2 definition: id `auto-tag-v2`, nine
  commands (`.tag-files`, `.preview`, `.list-candidates`,
  `.promote-candidate`, `.dismiss-candidate`, `.find-similar`,
  `.clap-status`, `.download-model`, `.tag-semantic`). Permissions:
  `library:read`, `files:read`, `tags:read`, `tags:write`,
  `settings:read`, `embeddings:read`, `embeddings:write`.
  No `requiredCapabilities`.
- `src/semantic.ts` — pure zero-shot ranking: cosine over the
  approved vocabulary, `SEMANTIC_THRESHOLD` (0.5) floor,
  `SEMANTIC_TOP_K` (3) cap, CLAP prompt template.
- `src/rules.ts` — pure vocabulary: twelve seed token rules, the
  `MAX_TAG_FILES` (500) bound, case-insensitive matching,
  uncovered-word extraction, queue aggregation with examples and
  counts, and input cleaning. Caps: `MAX_QUEUE_FILES` (2000) files
  walked, `MAX_CANDIDATES` (100) entries per listing.
- `src/handlers.ts` — preview (immediate, no side effects),
  tag-files (immediate in `direct` mode; progress plus cancellation
  in `job` mode), list-candidates (immediate paged walk, no writes),
  promote-candidate (find-or-create by name, attach as manual),
  dismiss-candidate (persisted dismissed set in extension state).
  Rule tags attach with the deterministic origin. No v1 imports, no
  direct filesystem access.

## Run-mode contract

- **preview** — immediate. Plan lines per file, untagged files,
  distinct uncovered words as candidates, unknown IDs as missing.
  No side effects.
- **tag-files** — `direct` tags synchronously and settles
  immediately; `job` walks the files with progress and honours
  cancellation. Unknown IDs report as missing and per-file failures
  carry reasons; neither fails the whole run. Shared tag names are
  created once per run.
- **find-similar** — ranks stored vectors by cosine and returns the
  closest sounds. With no vectors for the target it reports
  unavailable with a reason instead of failing. Removed sounds never
  rank, and at most 50 results return.

## Policies

- **Manual wins.** The repository upgrades an attachment to manual
  and never away from it, so a hand tag is never clobbered by a rule
  firing later on the same file.
- **Deterministic only.** This slice never invents tags: a file gets
  exactly what the rules fire, and uncovered words queue up as
  candidates instead of guesses.
- **Bounds.** At most `MAX_TAG_FILES` (500) sounds per call; larger
  batches reject with a reason instead of truncating silently.
- **Off means off.** Disabled or unapproved, the tool writes nothing
  and fetches nothing: no model, no inference, no migration pressure.

## Use it

1. Settings → Extensions → **Auto Tag v2** → enable.
2. Approve the declared permissions.
3. Run Preview auto-tag from the palette, then Auto-tag files — or
   just scan: every finished scan hands its arrivals to tag-files as
   background jobs (#194), with progress and cancellation through the
   job routes.

## Semantic tagging (CLAP, opt-in)

Three commands, one model, no bundled weights:

- **CLAP model status** reports whether `Xenova/clap-htsat-unfused`
  (quantized, about 400 MB from Hugging Face) is downloaded and
  whether inference is installed. Safe to run any time, including
  offline.
- **Download CLAP model** fetches with progress and cancellation,
  but only with explicit confirmation naming the size. Interrupted
  downloads clean their sidecars; completed files skip, so retrying
  resumes per file. First run offline simply finds nothing.
- **Tag with CLAP** embeds each sound, ranks the approved tags by
  cosine, and attaches matches at or above 0.5 (at most 3 per file)
  with confidence, marked semantic. Vectors land in the embedding
  store, so find-similar improves with every run. Nothing is
  invented: with no approved tags the command refuses, and manual
  tags stay untouchable.

Inference itself is an injected seam (`setClapBackendFactory` in
`src/lib/audio-analysis/clap.ts`): onnxruntime ships no
Electron-ABI rebuild in this repo, so bundling it would break the
packaged desktop build. Until a backend is installed, semantic
commands fail naming this step instead of pretending. Audio reaches
the backend as mono 48 kHz decoded through the existing ffmpeg path.
