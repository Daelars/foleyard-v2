# Filesystem access and desktop grants

Library reads resolve canonical paths under configured Library roots. The server owns session grants for output directories. The desktop picker authenticates to the grant endpoint with a process secret shared at startup, and returns an opaque token to the renderer. The renderer sends this token with Gatherer and Make Pack destinations. The server resolves existing ancestors before accepting new output paths, rejecting traversal and junction escapes.

The shared implementation is src/lib/filesystem-boundary.ts. Extension services receive the same checks through the host context, including generated output paths. Drop Rules apply/preview through the execute route now resolve via `resolveDropRuleCommand` (target authorized against the destination grant, sources against Library roots); direct service calls without the route remain unguarded (finding E04 class, expected-to-fail). Desktop reveal uses the server's grants. Restarting the app expires all tokens.

Drop Rules stages drag copies in owned directories under its configured staging directory. Later drags remove owned stages older than 24 hours. User directories and directory links are excluded from cleanup.

The app retains its unauthenticated loopback-server trust model. The folder-grant endpoint additionally authenticates the desktop process. Filesystem checks do not provide atomic protection against another local process replacing directories between validation and use.

Permanent file deletion unlinks files without using the recycle bin. It requires an indexed file inside a Library root. Janitor folder deletion rechecks containment and emptiness immediately before removing the folder.
