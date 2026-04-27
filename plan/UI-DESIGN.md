# SoundSlop - Main UI Design

## 1. UI Structure

```
┌─────────────────────────────────────────────────────────────────────────┐
│  [Logo]  Search... [Filters]                              [⚙] [📁 Scan] │
├────────┬────────────────────────────────────────┬───────────────────────┤
│        │                                        │                       │
│ SIDEBAR│           RESULTS LIST                 │    PREVIEW PANEL      │
│ (180px)│           (virtualized)                │    (320px, collapsible│
│        │                                        │                       │
│ • All  │ ┌─────────────────────────────────────┐│  [Waveform]           │
│ • Favs │ │ ♪ filename.mp3    00:12   [♥] [+]  ││  ────▓▓▓▓▓▓▓▓─────   │
│ ────── │ │    drum / punch / heavy             ││  [◀][▶/❚❚][▶] 🔊━━━━  │
│ 🗂️ Col1│ └─────────────────────────────────────┘│                       │
│ 🗂️ Col2│ ┌─────────────────────────────────────┐│  Details:             │
│ 🗂️ Col3│ │ ♑ boom.wav       00:03   [♥] [+]  ││  • 44.1kHz • 16bit    │
│        │ └─────────────────────────────────────┘│  • Stereo • 234KB     │
│ [+ New]│                                        │                       │
│        │                                        │  Tags: [drum] [hit]   │
│        │                                        │  [+ Add Tag]          │
│        │                                        │                       │
│        │                                        │  Collections:         │
│        │                                        │  [Col1] [Col2] [+]    │
│        │                                        │                       │
└────────┴────────────────────────────────────────┴───────────────────────┘
```

### Components

| Component | Purpose |
|-----------|---------|
| **Header** | Logo, global search input, filter dropdown, scan button, settings |
| **Sidebar** (180px) | Navigation: All Sounds, Favorites, Collections list, create new collection |
| **Results List** | Virtualized list (react-virtual), each row: filename, duration, favorite toggle, add-to-collection button |
| **Preview Panel** (320px) | Waveform player, playback controls, file metadata, tags, collection membership |
| **Filter Bar** | Format, duration range, date range (inline dropdown) |

---

## 2. User Flow

```
Open App
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 1. LANDING STATE                                            │
│    - Sidebar: "All Sounds" selected                         │
│    - Results: Last 50 files (by date desc)                  │
│    - Preview: Empty (collapsible panel hidden)              │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 2. SEARCH (most common)                                     │
│    - User types in search bar                                │
│    - FTS5 queries on filename + tags (debounced 150ms)      │
│    - Results update instantly                               │
│    - First result auto-selected (keyboard navigation)       │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 3. PREVIEW                                                  │
│    - Click/Enter on result → plays immediately              │
│    - Waveform loads async, shows loading skeleton           │
│    - Space bar toggles play/pause                           │
│    - Arrow keys navigate results                            │
└─────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────┐
│ 4. ACTION (collect)                                         │
│    - [+] button → inline collection picker dropdown         │
│    - [♥] toggle → instant favorite                          │
│    - Keyboard: 'f' = favorite, 'c' = add to collection     │
└─────────────────────────────────────────────────────────────┘
```

---

## 3. Key Interactions

### Search
- **Input**: Global search bar in header
- **Behavior**: FTS5 full-text search on filename + tags
- **Debounce**: 150ms
- **Result limit**: Virtual scroll loads 50 at a time
- **Empty state**: Show "No results" with clear button

### Playback
- **Trigger**: Click row OR press Enter when row selected
- **Controls**: Play/Pause (space), previous/next (arrows), loop toggle
- **Waveform**: wavesurfer.js with dark theme, loads on demand
- **Persistence**: Single active playback, stops when selecting new file

### Favorites
- **Toggle**: Heart icon on each row + in preview panel
- **Feedback**: Instant optimistic update, toast on error
- **Filter**: Click "Favorites" in sidebar to view all

### Collections
- **Create**: "+ New Collection" at bottom of sidebar
- **Add**: Quick [+] button on row → dropdown of collections
- **Remove**: In preview panel, click "×" next to collection name
- **View**: Click collection in sidebar

### Keyboard Shortcuts
| Key | Action |
|-----|--------|
| `Space` | Play/Pause (when preview visible) |
| `↑/↓` | Navigate results |
| `Enter` | Play selected file |
| `f` | Toggle favorite |
| `c` | Open collection picker |
| `Esc` | Close preview panel / clear search |

---

## 4. Trade-offs of This Optimized Approach

### ✅ What We Optimize For
- **Speed**: 19K files with virtual scrolling + FTS5 = sub-100ms search
- **Single action path**: Search → Preview → Collect in 3 clicks/taps
- **Minimal clicks**: No modal dialogs, inline actions
- **Keyboard-first**: Power user efficiency

### ❌ What We Deprioritize

| Feature | Trade-off |
|---------|-----------|
| **Bulk operations** | Not in main flow; accessible via multi-select mode (shift+click) |
| **Tag management UI** | Simple inline add; dedicated tag editor behind settings icon |
| **File details** | Collapsible panel; not always visible |
| **Metadata editing** | Not in main flow; edit via right-click context menu |
| **Folder browser** | Not included; scan folders only |
| **Advanced filtering** | Simple filters only; full filter panel behind "+ Filters" |
| **Sorting options** | Default by date; other sorts in dropdown |
| **Waveform generation** | Lazy-loaded; first play may delay 500ms |

### Design Rationale
- **Preview panel collapsible**: Most users don't need it visible constantly; toggling saves screen real estate
- **Sidebar narrow**: Collections are secondary; main interaction is search
- **No persistent player bar**: Bottom player wastes vertical space; inline preview is faster for "preview then move on" workflow
- **Optimistic UI**: All mutations (favorite, add to collection) update UI immediately; sync to SQLite in background