# Variant I component library

A reusable component library extracted from the variant I specimen
(`/prototype/component-library?variant=I` and its D/G/H kit sources).
The library owns **component appearance only**; app routes own arrangement.

## Structure

```
src/components/variant-i/
  styles.css        static visual rules, tokens, state selectors, keyframes
  index.ts          named, typed public exports
  components/
    provider.tsx    VariantIProvider host (scope marker + keyframes)
    button.tsx      Button, IconButton, PlayButton
    field.tsx       Field, Kbd, Select (floating viewport-fixed popup)
    controls.tsx    Switch, Checkbox, Radio
    feedback.tsx    StatusBadge, TagChip, AIScore, Alert, Progress, Toast, DotMatrixStatus
    containers.tsx  Surface, Card, Tabs, TabPanel, Rail, Accordion
    overlays.tsx    Dialog, Menu, MenuItem, MenuSeparator, CommandPanel/Rows,
                    TooltipBubble
    player.tsx      Slider, Scrubber, Waveform, TransportPanel
    compositions.tsx BulkBar, ScanStat, ExtensionRow, ToolCard, QueueCard,
                    CoverRow, ProvTag, OnboardingStepper, Breadcrumb,
                    DirectoryRow, EmptyState, DropOffer, tag editor/composer,
                    setting rows, pack options, skeletons
```

## Usage

```tsx
// Route layout:
import "src/components/variant-i/styles.css";

// Route page:
import { VariantIProvider, Button, Field } from "@/components/variant-i";

<VariantIProvider className="h-full">
  <Button tone="primary">Analyze with CLAP</Button>
  <Field aria-label="Search" placeholder="Search sounds…" />
</VariantIProvider>
```

- `styles.css` must be imported once by the route (layout or page). Its
  tokens activate only under the `[data-variant-i]` marker rendered by
  `VariantIProvider`; the original app never mounts the provider and is
  never restyled.
- The provider emits the `vi-*` keyframes as a `<style>` tag. Keyframes are
  global once mounted; the prefixed names make collisions impossible.
- Components consume the global accent token contract
  (`--accent-fill`, `--accent-fill-hover`, `--accent-text`) through
  `color-mix`, exactly like the specimen. Local material tokens are
  `--vi-well`, `--vi-edge`, `--vi-edge-hi`, `--vi-lift`, `--vi-sink`,
  `--vi-panel`, `--vi-menu`, `--vi-tooltip`, `--vi-canvas`, `--vi-focus`.

## Portals

`Select`, `Dialog`, `Menu`, `CommandPanel` and the collection popup render
`fixed`-position surfaces inside the React tree, so they inherit the
`[data-variant-i]` tokens from the provider ancestor (CSS variables inherit
through the DOM). No Base UI portal wrappers are used by the library;
app-v3 therefore needs no per-portal scope markers.

Toasts are the one exception: the root layout mounts a global Sonner
`Toaster`. app-v3 renders its own I-styled `Toaster` and suppresses the
root one via a `data-variant-i-toasts` attribute on `<body>` (see
`src/app/prototype/app-v3/layout.tsx` and the small guard in
`src/components/ui/sonner.tsx`). On leaving app-v3 the attribute is
removed and the original presentation resumes.

## Design notes

- Every animated surface renders its end state instantly under
  `prefers-reduced-motion`.
- Dynamic values (progress, waveforms, measured positions, tag colors)
  arrive as props; the library never fabricates data.
- The library does not import from `src/app/prototype/**` or route-local
  state; specimen fixtures live in the specimen route.