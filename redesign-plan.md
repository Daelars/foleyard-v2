# Foleyard UI Redesign Plan

This document outlines the plan to unify the visual language of Foleyard, focusing on consistency, interaction states, and adherence to the design tokens defined in `src/app/globals.css`.

## 1. Core Foundations

### 1.1 Typography
- **Issue**: `layout.tsx` currently injects Geist, while `globals.css` defines `DM Sans` as the primary sans font.
- **Action**: Remove Geist from `layout.tsx` and ensure `DM Sans` (or the system stack defined in `globals.css`) is used throughout.
- **Standard**: Use `font-sans` for general UI and `font-mono` for metadata/time/stats.

### 1.2 Color & Glassmorphism
- **Issue**: Inconsistent use of background opacities and backdrop blurs (`blur-xl`, `blur-2xl`, etc.).
- **Action**: Standardize on a "Glass" palette:
  - **Surface**: `bg-card/60 backdrop-blur-xl`
  - **Elevated Surface**: `bg-card/80 backdrop-blur-2xl shadow-xl`
  - **Overlay**: `bg-background/40 backdrop-blur-md`
- **Standard**: Use `border-border/40` for most borders to keep them subtle.

### 1.3 Shadow & Depth
- **Issue**: Manual shadow definitions (e.g., `shadow-[0_0_24px_...]`) are used instead of CSS variables.
- **Action**: Migrate all shadows to use the variables defined in `globals.css` (`--shadow-sm`, `--shadow-md`, `--shadow-lg`, `--shadow-2xl`).

---

## 2. Interaction States

### 2.1 Hover & Selection
- **Issue**: Hover states vary between components (`bg-primary/8`, `bg-muted`, `bg-accent`).
- **Action**: Unify hover states:
  - **Buttons/Items**: `hover:bg-accent/50 hover:text-accent-foreground`
  - **Active/Selected**: `bg-primary/10 text-primary shadow-[inset_3px_0_0_var(--primary)]` (consistent with FileTable selection).
- **Scale**: Apply `active:scale-[0.98] transition-transform` to all primary interactive elements (buttons, sidebar items, file rows).

### 2.2 Focus States
- **Issue**: Some elements lack visible focus rings.
- **Action**: Ensure all interactive elements have `focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2`.

---

## 3. Component-Specific Refinements

### 3.1 Sidebar
- **Refinement**: Standardize the "section" headers (Playlists, Tags) to use identical typography (`text-[10px] font-bold uppercase tracking-widest text-muted-foreground/70`).
- **Refinement**: Ensure the "Status" widget at the bottom matches the "Glass" standard of the rest of the app.

### 3.2 FileTable
- **Refinement**: Standardize the `FileTableFileRow` hover and selection.
- **Refinement**: Fix the "Grip" icon and "More" button to be consistently positioned and styled across desktop/web views.
- **Refinement**: Unify the "badge" style for formats (`.wav`, `.mp3`) to use a consistent `bg-muted/50 ring-1 ring-border/50`.

### 3.3 Audio Player
- **Refinement**: The player is currently very "heavy". Clean up the gradients and standardize the button styles to match the rest of the UI.
- **Refinement**: Ensure the `AudioScrubber` uses colors derived from the theme (`--primary`) instead of hardcoded RGBA.

### 3.4 Sound Shelf & Extensions
- **Refinement**: Update `SoundShelf` items to match the "Glass" card style of the rest of the app. Standardize the hover state to use the unified `bg-accent/50`.
- **Refinement**: Update `ExtensionGrid` cards. Remove hardcoded border colors (`emerald-500/40`) and replace with themed states (e.g., using `primary` for enabled extensions).
- **Refinement**: Ensure the "Skeleton" loaders in `ExtensionGrid` use the same animation and colors as the `FileTable` loaders.

### 3.5 Modals & Dialogs
- **Refinement**: Ensure `SettingsDialog` and extension detail modals use consistent `rounded-2xl`, `p-6`, and `bg-card/95 backdrop-blur-2xl`.
- **Refinement**: Standardize the close button position and style.

### 3.6 UI Primitives (src/components/ui)
- **Standard**: Audit `badge.tsx`, `card.tsx`, and `input.tsx` to ensure they use the `border-border/40` and `bg-card/60` standards.
- **Standard**: Ensure all dropdown menus and context menus use `bg-popover/95 backdrop-blur-xl`.

---

## 4. Implementation Steps

1.  **Phase 1: Foundation (The "Source of Truth")**
    - Clean up `layout.tsx` fonts.
    - Audit `globals.css` to ensure all necessary tokens are present.

2.  **Phase 2: Global UI Shell**
    - Update `Sidebar.tsx` and `HomeContent` (in `page.tsx`) to use the standardized Glass palette.
    - Standardize the `DesktopTitleBar`.

3.  **Phase 3: Interactive Components**
    - Update `Button` (in `ui/button.tsx`) to ensure variants match the new standard.
    - Refactor `FileTableFileRow` for consistent hover/active states.

4.  **Phase 4: Complex Components**
    - Freshen up `AudioPlayerShell`.
    - Audit `SettingsDialog` for layout consistency.

5.  **Phase 5: Final Polish**
    - Review all tooltips, context menus, and dropdowns for consistent border-radius and background blur.
    - Ensure all icons use consistent sizing (`size-4` for most, `size-3.5` for secondary).
