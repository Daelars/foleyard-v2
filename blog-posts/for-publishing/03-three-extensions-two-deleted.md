A new extension system proves nothing on its own. The test I set for Foleyard v2
was whether a realistic tool got easier to build on it, so the night the port
work finished I stopped writing plumbing and started designing tools.

The brief was short. Suggest three new extensions, your choice, they have to have
real value, they have to bring their own interface surfaces, and they have to look
like they belong in Foleyard. Build them as single-file prototypes. Do not merge
anything, do not implement anything, do not write tests. Just make the thing I can
look at.

Five of those prototype files are still sitting in the repo. Two of the ideas
survived in some form. One of them became the biggest feature in v2, and it got
there by being the one I almost rejected.

## The first three were not good

I could not even open them at first, which is a very ordinary way for a design
session to begin. Once they were served and in front of me, the problem was
obvious and it was not a visual problem.

They did not know what Foleyard is.

You can tell immediately. A tool built for a sound library assumes things: that
you have far more files than you can remember, that filenames are unreliable, that
you are usually looking for one specific hit in a hurry. Generic productivity
ideas dressed in the right colors do not assume any of that.

Two of the three went straight in the bin. The third got a maybe, and the maybe is
the whole reason this post exists.

## The maybe

The idea that survived was a coverage board. A wall of cards showing how much of
your library carries tags, which tags are thin, and which are missing entirely.

On its own that is a dashboard, and a dashboard is not a tool. What made it
interesting was the thing sitting next to it in the prototype: a switch, and a
list of rules turning filename words into tags.

![The coverage board concept: an auto-tag switch, filename rules, and cards showing per-tag coverage against a goal](/blog-images/concept-auto-tag.png)

*The concept that got a maybe. Throwaway prototype, September 6th. The line along
the bottom is the pitch: turn auto-tag off and new files land untagged, turn it on
and the board moves.*

So I gave it back with a shape attached. Make it part of an auto-tagging
extension. When files get indexed and the extension is on, it tags each file in
the background and the board moves. The board stops being a report about your
library and becomes the readout of something that is actually working.

That is the entire origin of Auto Tag, which is now a real page in the app with a
real tagging pipeline behind it. It came out of a batch of three ideas where the
other two were useless, and it arrived as a dashboard I had to argue into being a
tool.

## Round two, and the elements I actually liked

I asked for three more, with one extra instruction: you have the real app in front
of you, so at least make them look like they belong.

The second batch was better looking and still wrong. But this time there were
pieces I liked, and I said which ones by name. A take-comparison desk with a
ranked shortlist and a library-candidates panel. Not the idea. The elements.

![Take Compare: an A/B desk with a ranked shortlist and library candidates](/blog-images/concept-take-compare.png)

*Take Compare. The concept did not survive. The ranked shortlist and the
candidates panel did.*

This is the part of design work that is hard to explain to anyone who was not
there. The idea was not right, the layout had two components in it that were
obviously right, and the correct response is not "keep iterating on this idea." It
is: take those two components, throw the rest away, and build a different tool
around them.

So that is what I asked for. Reuse the elements I liked, put them into one design,
and introduce genuinely new features. I threw out a suggestion to aim at, which
was an editor where you could apply reverb to a sound and export it. Foleyard has
never touched audio, only catalogued it. Being able to hear a door slam in a large
room without leaving the app and coming back is a different kind of product.

## Sound Rack

The third batch is where it landed.

![Sound Rack: dry and processed A/B, a waveform, reverb amount and room size, save take, export WAV](/blog-images/concept-sound-rack.png)

*Sound Rack. A dry and processed A/B on one waveform, reverb with amount and room
size, save a take, export a WAV. Prototype only. None of this is implemented.*

My reaction, in full: these are actually great, there are too many elements, I
really like Sound Rack, it still feels clunky and bloated, delete the other two
concepts and work on the layout.

All four of those things are true at once, and I do not think that is a
contradiction. The direction was right. The execution had the standard problem of
a first design, which is that everything anybody might want is on screen at the
same time.

Sound Rack is not built. It is not scheduled. It sits in the repo as a single HTML
file, and I am showing it to you as a prototype rather than a promise. What it did
was answer the question the new extension system needed answering: yes, a tool
with its own real interface, its own audio processing, and its own export path is
a thing you can now imagine adding to Foleyard without editing the app.

That was not true before. Adding a tool used to mean touching the app in several
places.

## What I keep from a night like this

Two of six ideas were worth anything. One of the two was rescued from a rejection
by changing what it was attached to. That ratio sounds bad and I think it is
normal.

The thing I would not have got any other way is the sharpening. Every rejection
made the next brief more specific: has to understand what a sound library is, has
to look like it belongs, has to reuse these two components, has to do something
Foleyard cannot do at all today. By the end the brief was doing most of the work.

Next: what happened when the coverage board got built for real, and why the first
question I asked about it was who made each tag.
