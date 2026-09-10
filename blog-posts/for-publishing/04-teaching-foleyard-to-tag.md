My library has 15,877 files in it. I have tagged a few hundred of them by hand,
which took long enough that I stopped, which is exactly how libraries end up in
the state Foleyard exists to fix.

Auto Tag is the answer to that in v2. It reads your library and puts tags on
things. The first decision I made about it had nothing to do with accuracy.

Before a single tag got written I wanted to know who wrote it.

## Why that came first

Automatic tagging has an obvious failure mode. Six months from now you search for
`glass` and get 400 results, and you have no idea which of those a machine
guessed, which came from a filename, and which you typed yourself because you
actually listened to the file. At that point your tags are noise, and a search
that returns noise is worse than a search that returns nothing, because you trust
it for a while first.

So the foundation for the whole feature is one migration to the tag storage.
Every tag attachment now carries an origin and a confidence value. There are three
origins: `manual`, `deterministic`, and `semantic_ai`. Manual wins on read without
anyone having to ask for it.

Everything else in this post sits on top of that.

![How a tag gets onto a file: three routes, three levels of trust, each recorded with an origin](/blog-images/diagram-auto-tag.png)

*The three ways a tag can arrive, and what each of them is stamped with.*

## Route one: rules that cannot surprise you

The first route is deterministic. Filename and existing metadata go in, tags come
out, and it is a pure function you could work out on paper. If your file is called
`ANIMALS - dragon roar 1 (SFX).mp3`, there is not a lot of mystery about what it
should be tagged.

The important part is the preview. The tool shows you the plan before a single
write happens. Everything it does write is stamped `deterministic`, so if you
decide later that the rules were too eager, you can find every tag they made and
remove exactly those.

Auto Tag v2 registers switched off. It does nothing at all until you enable it and
approve its permissions, and its permission list is seven items long out of the
twenty-one the registry knows about. It can read your library and write tags. It
cannot copy, rename or delete anything, because it never asked.

## Route two: a queue that writes nothing

The second route is suggestions, and suggestions get a gate.

Candidates sit in a paged queue and perform no writes while you look through them.
Promoting one creates the tag and attaches it as `manual`, because you made that
call and it should be recorded as yours. Dismissing one is remembered, so it stops
coming back. Words you have already tagged leave the queue on their own.

This is the part I would defend hardest if someone told me it was friction. It is
friction. It is the friction that makes the other two routes safe to switch on,
because there is one place where the machine has to stop and ask.

## Route three: the model, entirely optional

The third route uses a model, and it is opt-in from top to bottom.

Foleyard does not ship a model. If you want semantic tagging you consent to a
download, roughly 400 MB of quantized CLAP towers, and the download reports the
actual byte count so the number you agree to is a real one, with progress and a
cancel. It runs against an approved vocabulary rather than inventing labels, and
only tags that clear a confidence bar are considered at all.

The inference backend is deliberately an injected seam rather than a bundled
runtime. The reason is boring and real: onnxruntime has no Electron-ABI rebuild in
this repo, and bundling it would break the packaged desktop build. Until that seam
is filled, an inference call fails with a message naming what is missing instead
of quietly returning nothing.

I am telling you that because the alternative is showing you a screenshot of a
tagging feature and letting you assume the model side is finished. It is not
finished. The download works, the vocabulary works, the trigger works, the board
works. Model behavior is the part still moving, and the next post in this series
is entirely about the night it ran against my real library and tagged nothing.

The same route leaves something useful behind either way. Every analyzed file gets
a model-keyed vector in an embedding store, and those vectors back a "find similar"
entry on file rows that ranks neighbors by cosine distance. Move a file and its
origins and vectors move with it rather than being dropped.

## Where you actually see this

The origin is not an internal detail. It shows up in the file rows as a small
mark, and the library has an origin filter across the top: All, Manual, Rules, AI.

![The library with tags carrying M marks and the origin filter across the top right](/blog-images/app-library-files.png)

*Current development build. Every tag carries its origin, and the filter at the
top right narrows the library by who did the tagging. Several files here have no
tags at all, which is honest.*

Because the origin travels with the tag, you can revert in bulk by origin. Decide
the model was wrong about your whole library and its work comes off without
touching anything you typed. That is the promise the origins exist to make good on.

## The board, and the argument about it

The coverage board is where you watch this happen: how much of the library carries
tags, which tags are thin against their goal, what landed in the last run, what it
missed.

![The Auto tag page in the current development build: 13 percent coverage, per-tag goals, trend charts, and a missed list](/blog-images/app-auto-tag.png)

*Current development build, running against my real library. 2,083 of 15,877 files
tagged. The right column is the last 500 arrivals: 65 tagged, 435 missed.*

Getting there took an argument. The first port of the board lost the charts, and I
said so bluntly: what you were supposed to add was the prototype in full, with the
charts, everything, including tag origins, with the exact same styling, and you
will have to install recharts.

Then, once it existed, the second argument was about fit. The board looked fine
and the things around it did not belong. The file list navigation, the candidate
review, the pills, the run panel with its "tagged 0, attached 0, skipped 500"
readout. Individually reasonable, collectively a pile of unrelated controls
sitting under a chart.

So I asked for the current state annotated with its own problems, next to
alternatives, in one prototype.

![Six structural alternatives for the auto-tag surface, next to the current UI annotated with its problems](/blog-images/autotag-fit-current.png)

*The current surface with its own findings marked on it. Prototype, dev-only route.*

![The command bar variant: run controls pinned directly to the number they change](/blog-images/autotag-fit-command.png)

*The command bar direction, which is the one I liked. Prototype, not shipped.*

The version I liked pinned the run controls to the number they change instead of
leaving them floating in their own panel. Then I asked for one more variant: the
same thing, smaller, so the whole board fits in one view and I never have to
scroll to see whether a run did anything.

One panel got cut in that pass. There was a separate Tag origins tab, and I could
not work out why it existed. My note on it was that it should be ignored unless it
could be made to convey useful information, because in that state it did not. A
tab that shows you a breakdown you can already read from the marks on every row is
a tab that exists because the data existed.

## What is settled and what is not

Settled: origins on every write, an explicit accept step where it counts, disabled
by default everywhere, and a permission list a tool cannot argue its way past.

Not settled: the vocabulary, the thresholds, which vector store earns the job long
term, and the board layout. None of this is in 0.1.8.

Next: the night I pointed it at 15,000 untagged files and it tagged none of them.
