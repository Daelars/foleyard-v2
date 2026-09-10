# Foleyard v2 release chronicle

Ten publication-ready posts building toward **Foleyard v2**, plus the research they
stand on. Built with the `orchestrator-v1` skill and the rest of `blog-skills`.

Foleyard v2 is unreleased. The public version is `0.1.8`. No post claims a version
number beyond "v2" or a ship date.

## Read these first

1. `release-horizon.md`: where Foleyard stands, and two corrections to earlier passes
2. `release-train.md`: the ten posts, in publication order, and why that order
3. `gaps.md`: what the evidence does not establish, and must not be published

## Layout

```text
blog-posts/
  README.md                  this file
  release-horizon.md         state of the release, pass 3
  release-train.md           editorial sequence, 10 posts
  timeline.md                dated development timeline, research source of truth
  gaps.md                    unverified claims, do not publish
  posts.json                 machine-readable post index
  artefacts.json             every image, with provenance and status
  voice-soul.md              voice profile, cross-platform core
  voice-blog-profile.md      voice profile, blog register
  component-choices.md       earlier pass, component decision notes

  posts/<slug>/
    index.md                 the article, with YAML frontmatter
    research.md              evidence brief behind the article

  for-publishing/
    NN-<slug>.md             body only, ready to paste into /admin/blog
    index.json               title, slug, excerpt, tags, cover per post

  artefacts/
    diagrams/                6 authored diagrams (PNG)
    diagrams/src/            their HTML sources, re-render with the script below
    screenshots/             53 captures from the running dev server
```

## Publishing

The site stores blog posts in Convex with `title`, `slug`, `content`, `excerpt`,
`tags`, `coverImage` and `publishedAt` as separate fields, and renders `content`
through `marked`. So **do not paste `posts/<slug>/index.md` into the content box**,
because the YAML frontmatter would render as text.

Use `for-publishing/` instead:

- `for-publishing/index.json` has the field values for each post
- `for-publishing/NN-<slug>.md` is the content body on its own

All 59 images are already copied to `repos/foleyard/public/blog-images/` and every
`![...](/blog-images/...)` reference in every post resolves. Publication order is
`posts.json → publication_order`.

Note: 13 images from an earlier pass are still in that folder and nothing links to
them any more: `app-v2-mock.png`, `auto-tag-board.png`, `auto-tag-fit-command.png`,
`auto-tag-fit-current.png`, `auto-tag-fit-minimal.png`, `component-library-b.png`,
`component-library-g.png`, `component-library-i.png`, `extensions-diagram.png`,
`performance.png`, `repo-audit.png`, `showcase.png`, `tag-origins.png`. Safe to
delete whenever you like; I left them alone rather than removing files I did not
create.

## Regenerating

```bash
python blog-posts/.research/build-artefacts.py   # artefacts.json from the image folders
python blog-posts/.research/build-research.py    # research.md per post
python blog-posts/.research/build-publish.py     # for-publishing/, verifies image refs
bash   blog-posts/.research/render-diagrams.sh   # diagrams from artefacts/diagrams/src
```

`.research/` holds the T3 SQLite backup, the capture scripts and the generators. It
is gitignored because it contains a copy of private conversation history.

## Truth model

- Git and the working tree prove what exists. Conversations explain why.
- Unreleased work is described as unreleased. Prototypes are labeled as prototypes
  in the caption, not only in the prose.
- Quotes from development conversations are real, trimmed for profanity, never
  invented. Where a reason is not recorded, the post says so instead of guessing.
- Performance figures are microbenchmarks and every post that uses them says so.

## Voice

First person singular, matching the site's own "Why I Built Foleyard" and "Foleyard
is currently built by one person". The posts say openly that v2 was built by pairing
with coding agents, because the arguments in those sessions are where the decisions
actually happened.

The profile lives at `~/.config/ghostwriter/soul.md` and `~/.config/ghostwriter/blog.md`
for the `ghostwriter` skill, mirrored here. It was derived from the published
About/Founder prose and roughly 600 of the user's own messages, not invented.
