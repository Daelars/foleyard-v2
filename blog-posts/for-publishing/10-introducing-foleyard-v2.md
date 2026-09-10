Foleyard points at a folder of sound on your machine and gives you a better way to
work with it. Index it, search it, preview it, favorite things, group them. The
files never move and nothing gets uploaded anywhere.

That is still the whole idea. Foleyard v2 does not change it. What v2 changes is
almost everything underneath it, and one thing on top.

None of this has been released. The version you can download is 0.1.8. I am
writing this while it is still in development, because the last eight posts have
been about the pieces and this is the shape they make together.

## What v2 is

![How Foleyard is put together: Electron shell, Next.js renderer, yard-core, and your machine](/blog-images/diagram-system.png)

*The whole system. Highlighted boxes are new or rebuilt for v2. There is no
Foleyard server in this picture, because there isn't one.*

Three things, in the order they matter.

### A real extension system

Foleyard's tools are the optional parts: pack a selection, keep a shelf of maybes,
save a search as a live collection, clean a folder, gather scattered sounds, decide
what happens when you drag a sound out.

In 0.1.8 those run on a system that hands each tool a bag of services and trusts
it. That trust is why an audit found that a pack export could delete one of your
files and a gather could overwrite your audio.

In v2 a tool declares what it is and what it needs before it can do anything. Its
manifest becomes a permission checker, the filesystem is one enforced seam rather
than an optional courtesy, long work runs as a job with progress and cancellation
and recovery, and a tool can show you its plan before it acts.

Seven tools run on it: Make Pack, Sound Shelf, Smart Collections, Folder Janitor,
Library Gatherer, Drop Rules, and Auto Tag. The six that existed before have been
retired to their v2 ports, and their settings and enablement move across on their
own the first time the app boots. Nobody has to set their tools up again.

![The Tools page: seven v2 extensions with their settings counts and switches](/blog-images/app-extensions.png)

*Current development build.*

### Tagging that shows its work

Auto Tag is the feature you would actually notice. It puts tags on your library
without you typing them.

The part I care about more is that every tag records who made it. Three origins:
you, filename rules, or the model. Manual wins on read. The origin shows up as a
small mark on every tag in every row, the library has an origin filter across the
top, and because the origin travels with the tag you can revert the machine's work
in bulk without touching yours.

![The library showing tags with origin marks and the All / Manual / Rules / AI filter](/blog-images/app-library-files.png)

*Current development build. Note that several files here have no tags at all.*

Rules are deterministic and previewable. Suggestions sit in a queue that writes
nothing until you accept them. Semantic tagging is opt-in, downloads its model only
if you say yes, and works against an approved vocabulary.

It is early. On my library it has tagged 249 files out of 15,877, and I have
written a whole post about the night it tagged zero.

### An engine that stopped making you wait

Waveforms draw instantly again, because the decode moved into the browser where
fifty rows can decode at once instead of queueing behind a single server slot. The
WAV parser got a specialized path for 16-bit PCM, which took a five-minute file
from 1,093 ms to 160 ms. A valid cached waveform no longer waits for a generation
slot before anyone checks whether it needs one.

The scanner was split into discovery, a bounded metadata queue, progress and
reconciliation, so a big folder is taken in gulps rather than swallowed whole. Scan
setup reads a narrow projection instead of the entire index, and unchanged files
get a timestamp-only touch.

Those figures are microbenchmarks on generated fixtures, on my machine, and they
are not the same claim as "your scan is five times faster". I have not measured
that end to end yet.

## What is not in it

I would rather list this than have you find it.

**Settings did not get redesigned.** I tried five times, rejected all five, and the
old dialog stands. My brief was contradictory and I never fixed it.

**Semantic tagging is not finished.** The download, the vocabulary, the trigger,
the queue and the board are real. The model tags a small fraction of a real library
and I cannot yet tell you exactly why that fraction is small.

**app-v3 is a prototype.** The whole app rebuilt on the new component language runs
beside the real one. It has open bugs. Whether it becomes the interface is not
decided.

**Sound Rack does not exist.** The audio-editing concept in the third post is a
single HTML file. It is not scheduled and I am not promising it.

**No Rust.** The question got asked properly and answered with measurements. The
TypeScript work delivered the gain, a worker did not help, and Rust was never
benchmarked, so it stays a question.

**No date.** I do not have one.

## What actually changed about how I build it

Foleyard is made by one person, and for the last week that person has been working
with coding agents on essentially every file in the repository.

The parts of this release I am happiest with all came from the same shape of
process: put several real options side by side, label them, and pick. Five designs
per element with letter replies. Ten component variants where the winner was an
assembly of two others. A rating out of ten that I refused, followed by a rebuild
from scratch.

The parts that went badly all had the same shape too, which is me expressing
dissatisfaction with one thing and expecting a better one to appear. That is how
you get the same settings dialog five times.

The other thing that made this possible is the least interesting: 410 tests that
checked source text got deleted and replaced with 56 that open a real database and
write real files, and CI now runs the production build it used to skip. Rebuilding
four systems in a week is only sane if something is checking.

## Try the current one, tell me what breaks

0.1.8 is out, it is open source, and it is the version I would like feedback on
today. Everything above is on a development branch and in my working tree.

If you keep a folder of sound effects, music cues, samples or field recordings and
you have ever opened ten files in a row looking for one that fits, point Foleyard at
it. If something is confusing, slower than it should be, or wrong, open an issue
with as much detail as you can. That is genuinely the most useful thing anyone can
send me, and several of the things in this post exist because a session with my own
library made me angry enough to write them down.

The next posts in this series will be about whatever breaks next.
