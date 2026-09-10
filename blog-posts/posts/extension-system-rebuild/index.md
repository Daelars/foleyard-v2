---
title: "I threw away Foleyard's extension system"
slug: "extension-system-rebuild"
excerpt: "The honest rating of my plan to improve Foleyard's extension system was 7 out of 10. I asked what a 10 looked like, read the answer, and started again from an empty folder."
release_target: "foleyard-v2"
development_status: "implemented-unreleased"
development_start: "2026-09-06"
development_end: "2026-09-10"
series: "building-foleyard-v2"
tags: ["foleyard-v2", "extensions", "architecture"]
cover: "/blog-images/diagram-extensions-v2.png"
---

Foleyard's tools are the optional bits. Make a pack out of a selection. Keep a
shelf of maybes while you search. Save a search as a collection that keeps itself
up to date. Clean junk out of a folder. Gather scattered sounds into one place.
Decide what happens when you drag a sound out into your editor.

Six of them shipped in 0.1.8, and the audit had just told me the system holding
them up was the reason a pack export could delete one of your files.

So I asked for a proposal to improve it, without touching the existing tools, with
diagrams, because I cannot argue with an architecture I cannot see. Then I asked
the question that decided the next month:

> Scale of 1 to 10, how much better is the new system?

## A 7 is not worth the disruption

The answer was about 7 out of 10 as a design, if implemented well. Building new
tools would get much easier. Reliability and consistency would improve. Existing
users, before any migration, would notice absolutely nothing.

It also came with its own reasons not to score higher: it would add complexity by
running two hosts side by side, it had not proved its API against a real working
example, and it did nothing about isolating untrusted code. The deciding test it
set for itself was whether a realistic extension actually became simpler to build,
or whether the code had just been rearranged.

That is a fair rating, and it is exactly the rating you should refuse. A 7 buys
you a migration, two systems to maintain, and a design that is better the way a
slightly different filing cabinet is better.

So I asked how to make it a 10, read that, and wrote a build prompt with four
constraints in it. Build v2 from scratch, not on top of v1. Rebuild one of the
existing tools on it as a working reference, so the API has to survive contact
with something real. Touch every surface, docs included. Hand the whole thing over
as one job.

## What a tool has to say for itself now

The old system's failure mode was politeness. It offered a tool a filesystem
service and hoped. The new one makes a tool declare what it is before it is
allowed to do anything, and the host holds the keys.

![How a tool runs in Foleyard v2: contract, catalog, registry, availability, permissions, enforced filesystem, jobs, preview](/blog-images/diagram-extensions-v2.png)

*The v2 path. Every box before "Jobs" is a gate the old system did not have.*

The parts that matter in practice:

**A tool is data before it is code.** Commands, settings, surfaces and permissions
are declared in a manifest. The host turns that into a sanitized catalog, and the
interface reads the catalog. The app never imports the tool. The tool never
imports the app.

**One place answers "can this run here, now?"** Enabled, approved, in scope, valid
selection. In the old system that logic sat across call sites, which is another
way of saying it was slightly different in each of them.

**Permissions stopped being a suggestion.** The manifest becomes a permission
checker. A handler that calls something it never declared throws, and the host
turns that into a plain `permission-denied` result rather than a crash or, worse,
a silent write.

![What a tool could reach before and after: the v1 context bag versus 7 declared permissions out of 21](/blog-images/diagram-extension-reach.png)

*Auto Tag v2 asks for seven of the twenty-one permissions the registry knows
about. It cannot delete a file, because it never asked, and the host will not hand
that over.*

**Long work is a job, not a function call.** Progress, cancellation, and recovery
if the app closes halfway through. The audit's exact complaint was that a command
was one call that either returned or threw, which is fine for making a folder and
useless for anything that touches fifteen thousand files.

**A tool can show you what it is about to do.** Preview, review, apply. This is the
one that would have caught the gatherer overwriting your audio, because you would
have seen the plan first.

**Switching a tool off means something.** It rejects new work, cancels live jobs,
and removes its UI once the work it owns has settled.

## Make Pack first, on purpose

Make Pack got rebuilt first, as the reference. That was the point of the
constraint: if the API is going to be wrong, I would rather find out while porting
one tool than after porting six. Sound Shelf, Smart Collections, Folder Janitor,
Library Gatherer and Drop Rules followed, each with a parity table in its README
recording what matches the old behavior and what does not.

![The v2 development workbench: contributions through the production adapters, catalog inspection, fixture commands, job outcomes](/blog-images/ext-v2-workbench.png)

*The workbench I used to exercise v2 against fixtures instead of against my real
library. Prototype, dev-only route.*

The first time the ports showed up in the running app they looked wrong, and I said
so at some volume. The settings panel opened as a dropdown when everything else in
Foleyard opens as a dialog. It rendered as a tall thin column that would not widen
no matter what got adjusted. New tools did not appear on the Tools page at all,
only in settings, which is not where anybody would look for them.

None of that is architecture. All of it is the difference between a system that
exists and a system you would use. It took a few rounds.

## The pull request I closed after 85 seconds

By September 9th the v2 ports were merged and the old tools were still running the
product. Two systems, which is exactly the complexity the 7 out of 10 warned
about. So I asked for a written plan to remove v1 safely, and then told the agent
to stop describing the plan and just open the pull request itself.

It did. The plan opened at 22:26:01 and I closed it at 22:27:26.

The funny part is that the plan was right, and being right is why I closed it. Its
own verdict, in its own summary, was **do not delete v1 in one shot**. Every
product workflow still ran on v1. No tool had actually migrated. It sequenced the
deletion into five slices with rollback notes, which is a careful way to describe
something that should not be started yet. A plan whose first line is "do not do
this" is a note, not a plan.

What it needed was not a deletion order. It needed the migration to have already
happened.

## Then I retired them properly

The night after, I asked how far along the removal actually was, then said retire
them, and make sure each v2 tool inherits the dialog its v1 counterpart had.

That version worked, and the mechanism is the interesting bit. Each retired tool
gets an adoption path. On the first boot after retirement the host finds no v2
enablement row and a v1 one, adopts the value, deletes the v1 row, and grants the
v2 tool's declared permissions if the tool was switched on, because v2 denies
without approval. Listed settings move to the new namespace the same way. The
Sound Shelf's contents move from the old key shape to the new one. Deleting the
old rows is what makes adoption run exactly once.

Nothing asks you to set your tools up again. That was the whole requirement.

![The Tools page in the current development build: seven v2 extensions, each with its own settings count and switch](/blog-images/app-extensions.png)

*Current development build. Every tool on this page runs on v2, and the v1 tool
packages are gone from my working tree.*

`POST /api/extensions/execute` now fails closed on every id, and the v1
registration table is deliberately left in place but empty, so old routes return a
clean 404 instead of breaking in an interesting way.

It did not go smoothly. Within the hour I was reporting that v2 extensions had
stopped registering in the Extensions tab at all, and then that every tool except
Make Pack had lost its dialog. That is what a cutover looks like from the inside,
and it is still settling in my working tree as I write this.

## Where this stands

The extension system is the largest thing in Foleyard v2 and the one you will
notice least, which is the right outcome for plumbing. Seven tools run on it. The
old tool packages are deleted. None of it is in 0.1.8, and I am not putting a date
on when it will be.

Next: what happened when I asked for three brand new extensions, liked one of
them, and deleted the other two.
