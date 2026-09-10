# Research brief: Ten variants to get one button right

- Post: POST-009, order 9 of 10
- Slug: `ten-variants-one-button`
- Development state: **in-progress**
- Date range: 2026-09-09 to 2026-09-10
- Confidence: high
- Article: `blog-posts/posts/ten-variants-one-button/index.md` (1186 words)

## Story

Ten labelled component variants A to J on one page, G chosen, I extracted into a real library, and the app rebuilt on top of it as app-v3.

## Release context

Foleyard v2, unreleased. Public version is 0.1.8. See `release-horizon.md`.

## What existed before

shadcn/ui geometry with Foleyard colors, which variant A documents as the shipped baseline.

## Problem or motivation

Recoloring a default is not a redesign, and a component library designed away from its app cannot be judged.

## What changed

Variants A-J in src/app/prototype/component-library, src/components/variant-i/, src/app/prototype/app-v3/. All uncommitted.

## Evidence

- prototype index variant names: A shipped shadcn geometry, B console wells and keys, D mockup match, E house style, F D grid E palette, G F in motion, H G plus the rest, I H plus leftovers, J app new parts
- variant A page text: the shared components as shipped, Shadcn geometry with Foleyard colours
- variant G page text: F's grid with alive controls
- threads 2ec4601f, c15b7ccb, ee78ec00, 9db717c4, 3d421f55; separate repos yard-ui and yardui, threads 61751f73 and 0ab09f38, same morning

## Quotes and wording from the development record

- DO NOT: redesign the page, change the page structure, change the card grid, add a sidebar ... turn everything into generic solid orange buttons (user brief)
- Same layout/Visuals as D. But use E's command pallete ... Use e's command pallete but jazz it up with D's visuals (user)
- No I meant the actual elements themselves. not the page (user, on animation)
- So, my favourite is G, look through the repo, and check if theres any indivual compnents we kinda missed out on, and add/redesign the missing ones in a H varient (user)

## Commits

- none

## Issues and PRs

- none

## T3 threads

- `2ec4601f`
- `d6e08527`
- `da57cfe9`
- `c15b7ccb`
- `ee78ec00`
- `9db717c4`
- `3d421f55`
- `f92766d1`

## Images used

- /blog-images/complib-A.png
- /blog-images/complib-B.png
- /blog-images/complib-D.png
- /blog-images/complib-G.png
- /blog-images/complib-I.png
- /blog-images/app-v3.png

## What must NOT be claimed

- app-v3 is a prototype twin. Never the new app.
- Report the open bugs: sidebar tab needs reload, missing pagination, oversized file lists.

## Unknowns

- Whether app-v3 replaces the current interface.
