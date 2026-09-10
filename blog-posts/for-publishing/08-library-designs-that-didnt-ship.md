Foleyard v2 has an Organize view, a redesigned command palette, quieter popups and
a rounded transport console. None of those came from someone sitting down and
designing the app. They came out of a review where I looked at five versions of
each element and replied with letters.

Most of what got made that week is not in the app and never will be. This post is
about that part.

## Five of everything, then pick

The method was simple enough to explain in a sentence: four new elements, five
designs each, plus a popup language, three more takes on the transport console,
and the organize page. Interact with whatever invites it, then name a winner per
element.

![The design showcase: five directions for the command palette, side by side, with fake data](/blog-images/design-showcase.png)

*The showcase page. Five command palettes on one scroll, each labeled, all fake
data. Prototype, dev-only route.*

The instruction at the top of that page tells you how the review actually worked.
You reply with something like "palette F, popups B, console T-F, organize O-E".
Not paragraphs about which felt more premium. Letters.

I cannot overstate how much better this is than iterating on one design. When you
have a single mockup, every note you give is a correction, and corrections drift.
When you have five side by side, you compare, and comparison is a thing humans are
genuinely good at. It also kills the polite trap where a design gets slowly better
without ever becoming right.

The winners from that round were the palette F direction, the quiet popup
language, the rounded console, and the W-H organize layout. All four went into a
full app mock so I could see them living together rather than as specimens.

![The app-v2 mock with the winning designs wired in: library rows, waveforms, the icon rail](/blog-images/design-app-v2.png)

*The full mock with the winners wired in. The banner at the top names them. This
is a throwaway prototype, not the shipping app.*

## The reskin that made everything worse

The other track that week was a straight visual reskin, and it went badly for
about a day.

The problem was that "simplify" got read as "remove". The colors stopped working.
The gradients went. The waveforms lost their weight. My note at the time was that
the whole thing had been made more simple and the point was to make it better,
which are not the same instruction.

There is a specific version of this failure worth naming, because I hit it more
than once: a redesign that is objectively cleaner and subjectively weaker. Fewer
borders, more whitespace, less contrast. It photographs well. Then you use it and
you cannot see where anything is. My exact reaction to one round was that it was
just weaker than the original, which is the most useful sentence in a design
review and the hardest one to act on.

There was also a focus ring that would not die. I said it did not need to be there
at all. It was still there. It was still there on hover. I mention it because
Foleyard's redesign prototype is stamped `rev 28` in the corner of the page, and
that number is made of things like a focus ring surviving three consecutive
attempts to remove it.

![The rich redesign prototype: studio console layout, icon rail, row waveforms, transport bar](/blog-images/design-redesign.png)

*The redesign prototype at revision 28. Throwaway, fake data.*

## The settings dialog

The settings dialog took five goes and I did not get it, so it stayed roughly
where it started.

The sequence, honestly: I asked for it to be rethought completely while keeping
every existing setting. What came back was the same dialog. I said so. What came
back was the same dialog again. Then a version appeared with most of its content
behind conditional rendering, which is not how the real app works and made the
prototype useless as a comparison. Then a round where the actual details from the
app's settings were missing entirely, so there was nothing to judge.

At one point I described a version as tragically awful and told it to undo the lot.
The nadir was a change I asked for that should have taken one line, removing a
count chip next to the word Library, which came back after twenty-one minutes with
several unrelated things moved and the chip still there.

What I take from that is not that the agent was bad at design. It is that I had
given a bad brief. "Rethink it completely but keep everything" is a contradiction
I never resolved, and every round faithfully produced one half of it. The rounds
that worked all week were the ones with a comparison in them. The settings rounds
had no comparison, just my dissatisfaction, and dissatisfaction is not a
specification.

Settings did not get redesigned in v2. That is the honest outcome, and I would
rather ship the old one than the fourth attempt at the new one.

## The one I cannot explain

There is a design in the history that I cannot tell you the reason for.

One of the organize variants, W-G, was a set of small compact layouts. It was
committed, then removed, and replaced in the next commit by three fresh takes,
W-H, W-I and W-J. W-H is the one that won and went into the app mock.

I went back through the record for this post to find out why W-G was dropped, and
there is nothing. No ticket, no message, no note. Best guess is that I looked at it
and asked for different ones, which is not evidence, so I am leaving it as an
unknown rather than inventing a design rationale after the fact. Not every decision
in a project leaves a trace, and pretending otherwise is how development history
turns into a story.

## What actually shipped

The Organize view. Collections and tags in one place, which was the W-H direction
from the showcase, and it is now a real page in the app rather than two things
scattered across other screens.

![The Organize view in the current build: tags and collections in one place](/blog-images/app-organize.png)

*Current development build. This is the shipped descendant of the W-H organize
layout.*

Alongside it: the palette, the popup language, tag and collection colors that
persist, a floating transport capsule, inline confirmation instead of a dialog
asking whether you are sure, and a pile of smaller things from a numbered ticket
list that ran through that week.

## The thing I would tell myself

Design work with an agent has exactly one failure mode worth planning around: it
will iterate forever without ever being told what better means, and you will
mistake motion for progress. Five variants and a letter reply cuts through that in
one round.

Where I had that, the work was good. Where I did not, I got a settings dialog five
times and rejected it five times, which cost most of an evening and produced
nothing.

Next: what happened when I applied the same method to individual components, went
from A all the way to J, and rebuilt the entire app with the winner.
