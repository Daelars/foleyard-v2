# Library root detachment

Removing a Library root is a soft operation by default (#271). A root's
indexed Audio files are marked *detached*: their rows survive, with tags,
favourites, Collection membership and embeddings intact, but every Library
read treats them as not owned — search, browse, directory listing, counts,
favourites, Collection and tag reads, playback and waveform generation. The
contract is one shared predicate (`ownedFileWhere` in
`src/lib/database/file-ownership.ts`, `isOwnedAudioFile` in yard-core), not a
per-call-site guess.

Re-adding the same root *reattaches* the detached records by path and
identity, restoring them with their organization data. Detached records are
never resurrected on their own: nothing clears detachment except re-adding the
root that owns them (a scan of an owned root re-attaches files it discovers
there, which is the same fact).

Root removal is one recoverable operation, following the journal-then-act
shape of permanent deletion (#269). A durable intent row is committed first
(`pending_root_changes`, schema version 3), then a single SQLite transaction
drops the root from settings and marks (or deletes) its files, then the intent
is cleared. A crash in between is reconciled on the next scan: a root the
settings no longer own finishes detaching, a root still owned drops the
intent.

A separate, explicit `forget` action removes the root **and** deletes its files
and organization data. Detachment is the default; forgetting is the deliberate
destructive alternative and never happens implicitly.

Consequences:

- `files.detached_at` records detachment per row; reads share the ownership
  predicate and never filter roots ad hoc.
- Re-adding a root is idempotent and restores organization data because the
  rows were never deleted.
- The `forget` action deletes `files`, `file_tags`, `file_collections` and
  `file_embeddings` rows for the root in one transaction.
- Overlapping roots remain a separate defect (#309): a detached root nested
  inside an owned root is rediscovered by that owned root's scan.
