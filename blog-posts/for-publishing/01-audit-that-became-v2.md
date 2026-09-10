The version of Foleyard you can download today is 0.1.8. It indexes a folder of
sound, lets you search it, preview it, favorite things, and build playlists. It
does the job I built it for. I use it most days.

On September 5th I asked for a full audit of the repository, every path, no fixes
applied, just tell me what is actually in here. The report came back with 27
findings. Four of them were rated P1, and reading those four is the reason
everything since has been a rebuild rather than a round of patches.

I want to start this series there, because "we rewrote the extension system" is a
boring sentence on its own. The interesting part is what made me willing to throw
away working code.

## What the audit actually covered

The inventory is not huge. That is part of why the findings landed so hard.

| Area | Files | Lines |
| --- | ---: | ---: |
| src | 186 | 22,466 |
| packages | 75 | 3,350 |
| test | 70 | 7,518 |
| electron | 12 | 1,161 |
| scripts | 8 | 1,421 |

The review went through the API transport, the database queries and mutations,
the scanner phases, all six extension paths, client loading and optimistic state,
waveform and playback, the desktop boundary, the tests, and the release config.
Five findings came with tests that reproduce the behavior in a scratch directory
or an in-memory database, so they are not opinions.

## The four that stopped me

**A pack export could delete one of your files.** Making a ZIP wrote a manifest to
a predictable temporary name in the destination folder, then removed that file
unconditionally when it finished. If you already had a file sitting at that name,
it was gone. Nothing exotic had to happen. You just had to be unlucky about
naming.

**Gathering sounds could overwrite audio you already had.** The gatherer checked
planned names against each other but not against what was on disk, and the copy
replaced whatever it landed on. Two different files called `hit.wav` and the
second one wins.

**Move detection could merge two different recordings.** When a file moved, the
reconciler matched on name, size and audio metadata, copied the old record's tags
and collections onto the new one, and deleted the old identity. Two distinct
same-size recordings could inherit each other's tags. There was no content
identity check, just a plausible-looking match.

**A tool could write outside the folders you granted.** Drop Rules had no
transport adapter, so raw paths went straight through to its service, which copied
directly without asking the host whether that path was allowed.

I am not going to pretend I felt calm reading that. Foleyard's entire pitch is
that your files stay where they are and the app is a better way to look at them.
"The app might quietly eat one" is the opposite of the product.

![The repo audit rendered as a browsable page: every finding, its severity, and its acceptance check](/blog-images/repo-audit-workbench.png)
*The audit, turned into a page I could actually click through. Prototype, dev-only route.*

## The finding under the findings

Fixing four bugs is an afternoon. What kept me up was three findings that were
not really bugs at all:

- Permissions relied on extensions cooperating.
- Adding a tool still meant editing the app.
- Long-running commands had no job lifecycle.

Those are shape problems. Look at how a tool actually ran and you can see why
all four P1s were possible in the first place.

![How a Foleyard tool ran before v2: the call path from a button in the library down to raw filesystem access](/blog-images/diagram-extensions-v1.png)
*The old path. The last box is the problem: the context offered a filesystem service, and every tool treated it as optional.*

The context object handed a tool a bag of services, including a filesystem
service that would resolve paths safely. Every tool wrote something along the
lines of "if the filesystem service exists, use it," and otherwise reached for
`node:fs` directly with no check against the library root. The permission call
would pass. The write would still go anywhere.

So the seam existed. It just had no teeth. And because each of the six tools
carried its own filename cleaning, its own extension matching, and its own way of
saving settings, fixing that in one place fixed it in exactly one place.

## What I decided to do about it

The obvious move is to fix the four P1s and move on. I did want them fixed, and a
long correctness track went through in the days after: query correctness, batch
endpoints, a real filesystem boundary, split scan phases, one shared database
connection.

But I did not want to spend the next year fixing the same class of thing six
times. So I asked a different question, and the answer to that question became the
whole of Foleyard v2:

> Scale of 1 to 10, how much better is a new system?

The answer came back a 7. I asked how to make it a 10, read that, and then wrote
a prompt to build v2 from scratch instead of on top of v1, with one existing tool
rebuilt as the reference port and every surface touched, docs included.

That is the version I am building toward now. New extension system, new tools
running on it, faster waveforms and scanning underneath, and a tagging feature
that could not have existed on the old foundation.

## How this series works

I build Foleyard on my own, working with coding agents, and the entire argument
that produced v2 is sitting in those conversations. The pitch I turned down. The
design I called weaker than what it replaced. The pull request I closed 85 seconds
after opening it. I am going to quote the useful parts, because the decisions are
more interesting than the changelog.

A few ground rules, so nothing here is misleading:

Foleyard v2 is not released. 0.1.8 is what the public has. Everything in this
series lives on a development branch or in my working tree, and when I show you a
prototype I will say it is a prototype. There is no ship date, because I do not
have one.

Next in the series: the extension system I threw away, and what replaced it.
