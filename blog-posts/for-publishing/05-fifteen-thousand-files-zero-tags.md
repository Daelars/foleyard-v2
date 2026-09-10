The run panel said this, and I sat looking at it for a while:

> Last run 9/7 19:25. CLAP: tagged 0, attached 0, skipped 500. Nothing cleared the
> bar.

Fifteen thousand untagged files out of sixteen thousand in the library. The
feature I had spent the week building looked at 500 of them and did not tag a
single one.

This is the post about that week. Not the launch version of it.

## What a zero actually tells you

A zero is a bad result and quite a good signal, because it rules things out
quickly. Nothing crashed. Nothing wrote garbage into my library. The job ran, it
processed 500 files, and every candidate tag scored below the confidence bar, so
nothing was attached.

The tagger being too shy is a much better failure than the tagger being confident
and wrong. If it had attached 500 bad tags to my real files I would have been
undoing that for an hour, and I would have trusted the feature less afterwards.
The origins model exists precisely so that undo would be one filter and one bulk
action, but I would still rather not need it.

What I could not tell from a zero was why. Thresholds too strict, vocabulary too
narrow, the inference seam not loaded, or the model genuinely having nothing to
say about a folder full of game-menu blips. Four candidates, one number, no way to
separate them from the outside. That question is still open as I write this, and I
am not going to pretend I have diagnosed it.

## The bug I was more annoyed about

Here is the thing that actually cost me the evening.

I clicked "Analyze untagged files with CLAP". It analyzed. And nothing on the page
moved. Not the coverage number, not the charts, not the tag counts, not the
origins.

My first report of it was a complaint about affordance: the model row said
`Semantic tagging ready, 163016336 / 400000000 bytes`, there was a download
button, there was an analyze button, and clicking either gave no indication that
anything at all was happening. Later the same evening it got blunter, and I will
paraphrase myself with the capitals removed: the numbers and the charts are not
changing when things are being analyzed, no new tags are showing, do not edit any
code, go and find out why the numbers do not update.

The answer is not exotic. Server state was being fetched once and cached in
component state, so the page rendered a snapshot from whenever it mounted. A job
running in the background had no route back into the interface. Every number on
that page was a photograph of the past.

It is a genuinely important bug and it looks like nothing. A feature whose entire
job is to work in the background is worthless if you cannot see it working. I was
looking at a zero and could not distinguish it from a page that had simply not
been told anything.

There is a related one I made a note about at the time: a run that failed reported
itself as "Semantic tagging ended as interrupted", which is not a sentence that
helps anyone. Errors that a person is going to read need to be written for that
person, not derived from a state machine's vocabulary.

## The other thing I could not do

While I was in there I hit a wall on the candidate queue.

I could not promote anything. And when I looked at the button I realized I could
not have told you precisely what promoting was supposed to do to my library, which
is a bad sign about a control I had specified myself. Does it create the tag?
Attach it? Both? Does the queue learn from it?

The answer, once it was pinned down, is that promoting creates or finds the tag,
attaches it as manual because you made the decision, and grows the vocabulary that
future matching runs against. That is a good answer. It should have been legible
from the interface without me having to go and ask.

Around the same time I asked for something separate: a written assessment of
whether any of the TanStack libraries would help here, given that the interface
was not updating live. Not an implementation, a plan. That plan exists and nothing
has been adopted from it. I am listing it because it is an open question in v2,
not a feature.

## Where it stands tonight

Three days later, the same board looks like this.

![The Tag origins panel: 15,877 files, 1,256 manual, 615 rule, 249 AI](/blog-images/app-auto-tag-origins.png)

*Current development build, my real library. The note under the heading matters: a
file can count in more than one origin category.*

15,877 files. 1,256 with a tag I typed. 615 tagged by filename rules. 249 tagged
by the model.

249 is not a victory. It is roughly one and a half percent of the library, and I
would like it to be a great deal larger. But it is not zero, and every one of
those 249 is labeled as the model's work and can be removed as a group if I
decide the model was wrong.

The coverage view puts the same story less kindly: 13 percent of the library
carries any tag at all, and of the last 500 files that landed, 65 got tagged and
435 did not, most of them with the note "no rule fired".

![The coverage view: 13 percent tagged, per-tag progress against goal, and a list of missed files](/blog-images/app-auto-tag.png)

*The same build. 2,083 of 15,877 tagged. The right-hand column is the last 500
arrivals and what happened to them.*

## Why I am publishing the failure

Because the alternative is a screenshot of the same page with the good number
cropped out, and because the shape of this week is the honest shape of the whole
feature.

The infrastructure works: the trigger fires after a scan, jobs run in chunks and
survive being cancelled, origins are recorded on every write, tags can be reverted
by who made them, and the queue refuses to write anything without a person
pressing a button. That is the part that took the architecture from the rest of
this series, and it is done.

The intelligence is early. The model tags a small fraction of my library and I
cannot yet tell you exactly why that fraction is small. When I can, that will be
its own post with actual numbers in it.

Next: why waveforms in Foleyard used to appear instantly, stopped, and what it
took to get that back.
