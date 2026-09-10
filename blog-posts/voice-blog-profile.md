# blog

Platform register for Foleyard's development blog at foleyard.com/blog. Long-form
posts published by Dalen, the sole developer. Read with `soul.md`.

Content is stored as Markdown in Convex and rendered with `marked`, so: standard
Markdown only, images as `![alt](/blog-images/name.png)`, no MDX, no JSX, no
front-matter rendered to the page.

## Length and shape

1,200 to 2,200 words. Long enough to tell one story properly, short enough to read
in a sitting.

No fixed template. Two posts in a row must not share a section skeleton. Headings
are written as sentences about this specific post, never as slots:

- Good: "The pitch I turned down", "15,000 files, 0 tags", "Why the width wouldn't change"
- Banned: "The Problem", "What We Built", "What Made The Cut", "Key Takeaways",
  "Questions readers ask", "What this means for the next release"

No TL;DR box. No FAQ block. No comparison table unless two things are genuinely
being compared and the table is the fastest way to see the difference. Tables are
allowed roughly once per post, never twice.

## How a post opens

Cold, on a concrete moment or a specific number. The first sentence carries the
story, not the setup. Delete any first paragraph that could be moved to any other
post.

- "Waveform generation used to be instant. Then it wasn't, and I couldn't tell you when it stopped."
- "The auto-tagger ran against my real library for the first time on a Sunday night. 15,000 untagged files. It tagged zero of them."

Never open with a definition, a rhetorical question, or the word "Foleyard" as the
grammatical subject of the first sentence.

## Audience

People who work with sound: video editors, game developers, sound designers,
producers. Plus developers who like reading about how tools get built. They have
never seen the repo, never read an internal audit, and do not know what a "brief"
or a "ticket" or a "track" refers to.

This is the rule the earlier drafts broke. Never reference an internal artifact as
though the reader has read it. "The audit brief was specific" means nothing. Write
the finding, not the document that contains it.

## The agent pairing

Foleyard v2 was built by Dalen working with coding agents, and the blog says so
plainly. This is where the story lives: the pitch he rejected, the design he called
weaker than the original, the prompt he wrote to force a rebuild from scratch.

- Quote real exchanges when they carry the decision. Trim profanity, keep the edge.
  "That is not what I asked for" is fine where the original was louder.
- Never invent a quote, a date, a number, or a reaction.
- The agent is a collaborator, not a punchline and not a miracle. When it produced
  something good, say so.

## Technical depth

Go deep where the detail is genuinely interesting: audio decoding, indexing,
SQLite, Electron boundaries, permissions, embeddings. Show a code block only when
the code is the point, and keep it under about 15 lines. Diagrams do the
architecture work; prose does not re-narrate the diagram.

Every image needs a caption line under it saying what it is and whether it shipped.
Prototypes must be labelled as prototypes so a screenshot never implies a shipping
interface.

## Release honesty

Foleyard v2 is unreleased. 0.1.8 is what the public has. Every post that describes
unreleased work says so once, in the writer's own words, without a compliance
banner. No ship dates. No invented version numbers beyond "v2" itself. If something
is a sketch, it is called a sketch.

## Excerpt style (for the blog index)

Two sentences, taken from the story rather than summarizing it. Same voice.
