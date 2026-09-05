// Local ESLint plugin: theme-token law and root-height chain (#142).
//
// These constraints used to live in source-text tests (theme-tokens.test.ts,
// root-height-chain.test.ts), which noted in their own comments that CI was
// the wrong place to catch them. They now fail at author time, in lint.

const ACCENT_HEXES = ["#f0503c", "#ff5a44", "#ff7a66"];

const OLD_SKIN_TOKENS = [
  "muted-foreground",
  "border-border",
  "bg-card",
  "bg-muted",
  "text-foreground",
  "bg-accent/",
  "text-accent-foreground",
  "hover:bg-accent/",
  "bg-primary",
  "text-primary",
  "border-primary",
];

function checkStringLiterals(context, needles, messageId, messages) {
  const lowered = needles.map((needle) => needle.toLowerCase());
  const check = (value, node) => {
    if (typeof value !== "string") return;
    const haystack = value.toLowerCase();
    const hit = lowered.find((needle) => haystack.includes(needle));
    if (hit) {
      context.report({ node, messageId, data: { token: hit, messages } });
    }
  };
  return {
    Literal(node) {
      check(node.value, node);
    },
    TemplateLiteral(node) {
      for (const quasi of node.quasis) check(quasi.value.cooked, quasi);
    },
  };
}

const plugin = {
  meta: { name: "foleyard-theme" },
  rules: {
    "no-hardcoded-accent-hex": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Ratified accent values live in the theme layer (globals.css); surfaces must use the accent-fill utilities.",
        },
        messages: {
          hardcoded: "Hard-coded accent value '{{token}}'. Use the accent-fill utilities instead.",
        },
      },
      create: (context) =>
        checkStringLiterals(context, ACCENT_HEXES, "hardcoded"),
    },
    "no-old-skin-tokens": {
      meta: {
        type: "problem",
        docs: {
          description:
            "Inventoried surfaces carry zinc/white outlines and accent-fill utilities, never old-skin tokens.",
        },
        messages: {
          oldSkin: "Old-skin token '{{token}}'. Use the inventoried surface tokens instead.",
        },
      },
      create: (context) =>
        checkStringLiterals(context, OLD_SKIN_TOKENS, "oldSkin"),
    },
    "no-viewport-height-units": {
      meta: {
        type: "problem",
        docs: {
          description:
            "The root height chain must use percentage heights only: viewport units do not track root CSS zoom.",
        },
        messages: {
          viewport:
            "Viewport height unit '{{token}}'. Use percentage heights so the workspace survives zoom.",
        },
      },
      create: (context) =>
        checkStringLiterals(context, ["h-screen", "100vh", "100dvh", "100svh"], "viewport"),
    },
  },
};

export default plugin;
