Every button, switch, input and badge in Foleyard came from shadcn/ui with my
colors painted over it. That is a completely reasonable way to start an app and it
is the reason the interface never quite looked like a thing rather than a template.

Here is the honest baseline, labeled as exactly what it is.

![Variant A: the shipped components, shadcn geometry with Foleyard colors](/blog-images/complib-A.png)

*Variant A. The description on the page is "the shared components as shipped,
shadcn geometry with Foleyard colours". This is the starting point, not a proposal.*

Recoloring a default is not a redesign. The geometry is somebody else's, the
corner radii are somebody else's, the way a switch moves is somebody else's. You
can tell, and so can anyone who has used three other apps built the same way.

Fixing that took ten variants, A through J, on one page, and then rebuilding the
app on top of the one I liked.

## The rules I put on the redesign

The first attempt at this failed in the way design tasks usually fail, so the
second brief was mostly a list of things not to do. Do not redesign the page. Do
not change the page structure. Do not change the card grid. Do not add a sidebar.
Do not add navigation. Do not change the spacing between sections. Do not introduce
a new design direction. Do not replace the color palette. Do not turn everything
into generic solid orange buttons.

The job was to keep the page nearly pixel-identical and redesign only the
components inside it.

That list looks aggressive written down. It exists because "redesign the
components" reliably produces a redesigned page, and then you are comparing two
things that differ in fifty ways and you cannot tell which change did what. Pin the
layout and the comparison becomes real.

![Variant B: console treatment, wells and keycaps](/blog-images/complib-B.png)

*Variant B. Controls sunk into wells with keycap-style buttons. Prototype.*

![Variant D: matched against a reference mockup](/blog-images/complib-D.png)

*Variant D, built to match a reference image I gave it. Prototype.*

## The letters are the interesting part

What made this work was that variants stopped being alternatives and started being
parts.

By the time D and E existed I did not want either of them. I wanted a specific
recombination, and because they were both on screen with labels I could ask for it
precisely: same layout and visuals as D, but take E's command palette, restyle the
palette with D's visuals, keep the part of E where the sound and tool sections
live, and keep E's keyboard shortcuts along the bottom.

That is variant F. It is not a compromise between D and E, it is a specific
assembly of them, and it took one message to specify because both parents were
sitting there with names.

Then G, which was F with motion, after one correction. I asked for smooth
animations and got page animations. What I wanted was the elements themselves
moving: the switch traveling, the button depressing, the loading state actually
loading.

![Variant G: F's grid with alive controls, buttons in five states, toggles, badges, palette, pagination](/blog-images/complib-G.png)

*Variant G, my favorite. The page description says it best: "F's grid with alive
controls. Press the buttons, flip the switches: the motion is in the elements."*

G is the one. Every control in Foleyard v2's interface work descends from it.

## Then: what did we miss

Once there was a winner, the exercise changed shape. Twice I asked the same
question, which is a good question and one I would not have thought to ask if the
variants were not on a single page: go through the repo, find the individual
components we skipped, and add them as the next letter.

H filled the first round of gaps, and got one specific instruction attached to it,
which is that the app's transport bar had to be redesigned properly in the same
language rather than replaced with something basic.

I filled the leftovers after that.

![Variant I: H plus the remaining components, the fullest set](/blog-images/complib-I.png)

*Variant I. The complete control language, and the version that got extracted into
a real component library. Prototype.*

J is the odd one out: the app with the new parts in it, which is where this stops
being a specimen page.

## Rebuilding the app on the winner

Variant I got pulled out of the prototype into an actual reusable library in the
source tree, and then the whole app got rebuilt on top of it as app-v3.

![app-v3: the full application rebuilt with the Variant I component library](/blog-images/app-v3.png)

*app-v3, running against my real library. In-progress prototype, not the shipping
interface.*

This is a twin, not a replacement. It runs beside the real app so I can compare
them with the same data in both. As of tonight it has real bugs: the sidebar tab
needs a reload before it behaves, pagination is missing from a list that badly
needs it, and some file lists render far larger than they should.

I am showing it because that is where it actually is. Whether app-v3 becomes the
Foleyard interface or stays a study is not decided.

## The false start nobody sees

Before any of this, on the same morning, I tried building the component library as
its own thing in two separate repositories. A standalone UI library, designed on
its own terms, to be adopted by Foleyard afterwards.

Both attempts lasted about an hour, and the reason they went nowhere is worth
writing down. A component library designed away from the app it serves has no way
to be judged. Is this switch right? Right for what? There is no file row next to it,
no palette above it, no dark canvas behind it, no real tag chip to sit beside.

The moment the same work moved into a page inside Foleyard, with the app's chrome
around it and fake but plausible data in it, every variant became judgeable in
about four seconds. That is the entire difference between the failed morning and
the productive afternoon.

## What I would keep from this

Label everything. The variants are only useful because they have names, which is
what makes "D's visuals, E's palette" a sentence you can say.

Pin the layout when you are changing the components, and pin the components when
you are changing the layout. Change one and the comparison stays honest.

And when there is a winner, ask what got missed. Twice. The controls nobody
prototypes are the ones that end up as a default with new colors on them, which is
where this whole post started.

Next, and last in this run: what all of this adds up to, and what Foleyard v2
actually is.
