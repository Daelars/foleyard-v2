/*
 * Variant I component library.
 *
 * A reusable library of controls and compositions extracted from the
 * variant I specimen at `/prototype/component-library?variant=I` (and its
 * D/G/H kit sources). The library owns component appearance only; the app
 * routes own arrangement. See README.md for imports, props, styles and
 * portal requirements.
 */

export { VariantIProvider, VariantIKeyframes } from "./components/provider";

export {
  Button,
  IconButton,
  PlayButton,
} from "./components/button";
export type { ButtonProps, ButtonTone, ButtonSize } from "./components/button";
export { Field, Kbd, Select, PageButton } from "./components/field";
export { Switch, Checkbox, Radio } from "./components/controls";
export {
  StatusBadge,
  Tag as TagChip,
  AIScore,
  Alert,
  Progress,
  Toast,
  DotMatrixStatus,
} from "./components/feedback";
export {
  Surface,
  Card,
  Tabs,
  TabPanel,
  Rail,
  Accordion,
} from "./components/containers";
export {
  Dialog,
  DialogTitle,
  DialogDescription,
  DialogDivider,
  DialogFooter,
  Menu,
  MenuItem,
  MenuSeparator,
  CommandPanel,
  CommandRow,
  CommandSection,
  CommandFooter,
  TooltipBubble,
} from "./components/overlays";
export {
  Slider,
  Scrubber,
  Waveform,
  TransportPanel,
} from "./components/player";
export {
  BulkBar,
  type RemoveStage,
  ScanStat,
  ExtensionRow,
  ValidationMsg,
  ShortcutRow,
  CoverRow,
  QueueCard,
  QUEUE_PAGE_SIZE,
  ProvTag,
  StepDot,
  StepLine,
  OnboardingStepper,
  Breadcrumb,
  DirectoryRow,
  EmptyState,
  DropOffer,
  ToolCard,
  TagChip as OrganizeTagChip,
  ColorSwatch,
  TagEditor,
  TagComposer,
  NewTagButton,
  SettingRow,
  SettingSwitchRow,
  PackSourceOption,
  PackFormatOption,
  SkeletonRow,
  ShortcutHint,
} from "./components/compositions";