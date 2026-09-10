---
title: "Waveforms used to be instant"
slug: "waveforms-used-to-be-instant"
excerpt: "Foleyard drew waveforms the moment you opened a folder, and then at some point it stopped. Getting that back meant moving the decode off the server, and it turned into the fastest week of work in v2."
release_target: "foleyard-v2"
development_status: "in-progress"
development_start: "2026-09-06"
development_end: "2026-09-10"
series: "building-foleyard-v2"
tags: ["foleyard-v2", "performance", "audio", "scanning"]
cover: "/blog-images/diagram-waveform.png"
---

Foleyard draws a small waveform next to every file in a list. It is one of the
things that makes browsing sound feel different from browsing files, because you
can see the shape of a hit before you play it.

It used to appear instantly. One morning I noticed it did not, and I could not
tell you when that changed:

> waveform generation used to be instant? its not anymore?

Then I added the constraint that made this interesting, and I want to put it up
front because it is the whole reason the fix is any good:

> we need a way to keep it near instant for everything, not using caches, just
> like it used to.

Caching harder is the obvious answer and it is the wrong one. A cache makes the
second visit fast. Opening a folder you have never opened is the exact moment the
app needs to feel quick, and that is precisely when a cache has nothing in it.

## What was actually wrong

The audit had already found this one and described it better than I would have:
warm waveforms wait behind cold generation.

Every row asking for a waveform sent a request to one server route, and that route
decoded audio through a limited number of generation slots. Open a folder with
fifty sounds in it and row fifty waits for the forty-nine in front of it. Worse,
even a file whose peaks were already sitting in the cache had to queue for a slot
before anyone checked whether it needed one.

So the first fix is embarrassingly small. Validate the cache entry *before*
acquiring a generation slot, not after. A valid hit now completes in about 1.3 ms
with both generation slots held open by a test, where the old path measured
264.5 ms.

That helps the second visit. It does nothing for the first one, which was the
actual brief.

## Moving the decode to where the parallelism already is

The real fix is that the browser can decode audio, and there are not two of it.

![Why waveforms stopped being instant and how they got fast again: server queue versus browser decode](/blog-images/diagram-waveform.png)

*Before, every row queued behind one decoder. After, the browser decodes them in
parallel and the server route stays as a fallback.*

Rows and the player now decode through the Web Audio API and reduce each file to
512 peaks, in parallel, in the renderer. There is no server slot to queue for. The
IndexedDB cache is keyed on the file's modification time and size, and reading it
is strictly best effort with a bounded wait, so a cold cache, a blocked upgrade, or
another tab holding an old connection never stalls a row. It falls through to a
live decode instead.

The server route is still there for formats the browser refuses.

That is the change that made lists feel right again, and it works on a cold cache,
which was the requirement.

## Then I sped up the decoder itself

With the queueing fixed, the remaining cost is the decode. Foleyard parses WAV
files itself for the server path, and the parser was doing generic per-sample reads
and per-frame bin arithmetic for every format.

Most of what people actually have is 16-bit PCM. So that case now gets a
specialized path: select the decoder once by sample format, read through an
`Int16Array` view, and compute bin boundaries per run rather than per frame. Other
formats keep the generic loop until each one has been measured and checked.

Generating peaks for a five-minute PCM16 file went from 1,093.5 ms to 159.8 ms.

All 512 peaks are compared against the original algorithm for silence, full scale,
opposite-phase stereo, mono with odd frame counts and trailing bins, so this is a
faster way to compute the same answer rather than a cheaper approximation.

## "I didn't ask you to make it faster"

Halfway through I asked to look at file indexing, and got back an implementation.
My reply was short:

> i didn't ask you to to make it faster, I asked you to look at how we can make it
> faster

I stand by the pedantry. Indexing touches the database and the filesystem for
every file you own. Guessing at that and shipping the guess is how you get a
subtle correctness bug in something that runs unattended over sixteen thousand
files. Measure first, then choose, then implement.

So it got measured, on a scratch database with generated fixtures, and my real
library was never opened during any of it.

**Scan setup was reading the entire index.** Before discovery even began, the
scanner materialized every existing record. A narrow projection containing only
the fields removal reconciliation actually consumes loads 100,000 rows in 44.1 ms
against 206.5 ms for the full read.

**Unchanged files were being rewritten.** The touch statement rewrote the removal
timestamp and the library root on every row even when neither had changed.
Timestamp-only updates for already-active rows took 40.8 ms for 10,000 rows,
against 237.5 ms.

**Browsing was doing a temporary sort.** A partial index on active filenames, plus
actually running `ANALYZE` after a big import, turned deep filename paging over
100,000 rows from 189.2 ms into 3.25 ms. Most of that came from the statistics
rather than the index, and I want to say so, because attributing all of it to a new
index would be a more flattering story and a false one.

**The metadata backlog was unbounded.** A real 1,000-file scan reached 872
outstanding metadata jobs. The queue now has awaitable admission with a default
capacity of 500 and an index-based deque instead of shifting a growing array, and
reconciliation waits for admission so discovery pauses rather than piling up.

## The Rust question, answered with numbers instead of vibes

Somewhere in the middle of this I asked what the slow parts would look like
outside JavaScript entirely. That question deserves an honest answer, and the
honest answer turned out to be no, not yet.

A persistent worker did not help: the same PCM work took 167.9 ms on the main
thread and 173.5 ms in the worker, with 641 ms of worker startup on top. The
specialized loop delivered the throughput gain that a worker was supposed to buy,
without the coordination.

Rust was not benchmarked at all, and I am not going to pretend these TypeScript
numbers predict what it would do. The decision written down is: keep TypeScript,
take the measured wins, revisit this later. A rewrite is easy to propose and
expensive to be wrong about.

Two other things got deferred on purpose. A duration-sort index made the first page
of a duration-sorted browse 23.8 times faster, 16.0 ms down to 0.67 ms, and made
10,000 metadata updates go from 26.7 ms to 84.8 ms. That trade needs a realistic
import benchmark before I take it. Cursor pagination is not worth a contract change
now that an indexed page costs around 3 ms.

## What these numbers are and are not

Every figure above is a microbenchmark on generated fixtures and scratch
databases, on one machine: a Ryzen 7 5700X, 16 logical CPUs, Node 24, Windows.
They are not application latency. "Loading 100,000 rows got 4.7 times faster" is
not the same claim as "your scan is 4.7 times faster", and I have not measured the
second one end to end yet.

Scan concurrency is a good example of measuring something and then changing
nothing. Metadata throughput was 201.0 ms at concurrency 16, 193.8 ms at 32, and
225.0 ms at 64. The gap between 16 and 32 is not enough to justify moving the
default, so it stayed at 16.

## Where this stands

The browser waveform decode is on the development branch. The cache admission fix,
the PCM16 loop, the browse indexes and the bounded scan queue are implemented and
measured in my working tree and not yet committed, which is why this post is a
progress report rather than a release note.

Next: the 410 tests I deleted, and why the suite got better afterwards.
