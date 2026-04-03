# GDD Living Template System

<img width="1920" height="1080" alt="GddTemplateSystem" src="https://github.com/user-attachments/assets/e6519e51-a5d3-49a8-8e42-928c50204186" />

A Markdown + YAML hybrid Game Design Document system built for version control. Every design decision links to an implementation status. The document is the source of truth - not a static Word file sitting on someone's desktop.

Open `dashboard.html` in a browser. Or run `node tools/build.js --all` to generate all output formats from the command line.

---

## What's in the box

```
gdd-system/
  dashboard.html          live GDD editor and status board - open in any browser
  README.md               this file
  data/
    gdd.md                full example GDD for Echo Veil (19 sections, all genres)
  core/
    parser.js             YAML front matter parser, section/feature/task extractor
    exporters.js          HTML, JSON, CSV, print-ready HTML, status report exporters
  tools/
    build.js              CLI build tool with watch mode
  examples.js             6 runnable code examples
  output/                 generated files land here
```

---

## The file format

Every GDD is a single `.md` file with a YAML front matter block. The YAML is machine-readable - all tools parse it. The Markdown below is human-readable - designers write it directly.

```markdown
---
gdd_version: "1.0.0"
last_updated: "2025-01-15"
game:
  title: "My Game"
  tagline: "One sentence."
  genre: [action, platformer]
  platform: [PC, Switch]
  engine: "Godot 4.3"
  expected_playtime: "8 hours"
  monetization_model: "premium"
team:
  studio: "My Studio"
milestones:
  - id: M1
    name: Vertical Slice
    target_date: "2025-06-01"
    status: in_progress
    description: First playable build.
sections:
  - id: overview
    title: Game Overview
    owner: Your Name
    status: done
---

## Game Overview

<!-- status: done | owner: Your Name | updated: 2025-01-15 -->

Your game description here.
```

**Everything after the closing `---` is plain Markdown.** Write it however you want.

---

## Status system

Two ways to tag status in the document:

**Section comments** (one per `##` section):
```markdown
<!-- status: in_progress | owner: Priya Nair | updated: 2025-01-12 -->
```

**Feature comments** (one per `###` subsystem):
```markdown
<!-- feature_status: in_progress | milestone: M1 | priority: critical -->
```

**Inline status badges** in tables and prose:
```markdown
| Echo pickup | `~ in_progress` |
| Movement    | `+ done` |
| Rewind      | `o planned` |
```

**Status symbols:**

| Symbol | Status | Color |
|--------|--------|-------|
| `+` | Done | Green |
| `~` | In Progress | Amber |
| `o` | Planned | Blue |
| `!` | Blocked | Red |
| `x` | Cut | Gray |
| `?` | In Review | Purple |

**Checklist items** are also extracted:
```markdown
- [x] Movement finalized
- [ ] Steam page live
- [ ] Chapter 1 complete
```

**Open questions** are extracted from tagged table rows:
```markdown
| OQ-01 | Wwise vs FMOD? | Priya | 2025-02-01 | `~ in_progress` |
```

---

## Dashboard

Open `dashboard.html` in Chrome, Firefox, or Edge.

**Left panel** lists all sections with colored status dots. Click any section to open it in the editor panel on the right, where you can change owner, status, and updated date without touching the raw Markdown. Search filters the list by name or owner.

The Quick Add form at the bottom adds a new `##` section to the document body and registers it in the YAML front matter simultaneously.

**Dashboard tab** shows section progress bar, milestone countdown, feature status list, checklist, and open questions - all derived live from the document.

**Preview tab** renders the Markdown as styled HTML with color-coded status badges. This is what the exported HTML looks like.

**MD Editor tab** is a raw Markdown editor. Click Apply to re-parse the document and update all views.

**YAML Editor tab** edits the front matter directly. Click Apply to update game metadata, milestones, and team info.

**Saved tab** stores snapshots with section count and task completion percentage. Load any snapshot back instantly.

**Export buttons (top bar):**
- `HTML` - dark-themed shareable HTML, self-contained single file
- `JSON` - full status data for CI/CD pipelines and tooling
- `CSV` - sections, features, and milestones in spreadsheet-ready format
- `MD` - the full document as a `.md` file, ready for Git

---

## CLI build tool

Requires Node.js 14+.

```bash
node tools/build.js --all
node tools/build.js --html --json --report
node tools/build.js --gdd=data/my_game.md --out=./dist --all
node tools/build.js --ci
node tools/build.js --watch --all
```

**Options:**

| Flag | What it does |
|------|--------------|
| `--gdd=path` | Input GDD file (default: data/gdd.md) |
| `--out=path` | Output directory (default: ./output) |
| `--all` | Build all output formats |
| `--html` | Dark-themed shareable HTML |
| `--pdf-html` | Print-optimized HTML for browser PDF export |
| `--json` | Full status JSON |
| `--ci` | CI status JSON (pass/fail, exits 0 or 1) |
| `--csv` | CSV export (sections + features + milestones) |
| `--status` | Status report Markdown |
| `--report` | Print colored summary to console |
| `--watch` | Watch for file changes and rebuild |

**CI integration:**

The `--ci` flag builds `ci_status.json` and exits with code 1 if any critical-priority feature is blocked. Use in GitHub Actions:

```yaml
- name: Validate GDD
  run: node tools/build.js --ci --gdd=docs/gdd.md
```

The CI JSON looks like:
```json
{
  "timestamp": "...",
  "pass": true,
  "blocked_features": 0,
  "critical_blocked": 0,
  "critical_blocked_list": [],
  "tasks_pct": 62,
  "next_milestone": { "name": "Alpha", "target_date": "2025-07-01", "days_until": 180 }
}
```

---

## Using it in code

```js
const { GDDParser } = require("./core/parser");
const { HTMLExporter, JSONExporter, CSVExporter } = require("./core/exporters");

const gdd = GDDParser.parse("data/gdd.md");

console.log(gdd.meta.game.title);
console.log(gdd.sections);
console.log(gdd.features);
console.log(gdd.tasks.filter(t => !t.done));
console.log(gdd.open_questions);

const html = HTMLExporter.export(gdd);
const json = JSONExporter.export(gdd);
const ci   = JSONExporter.exportCIStatus(gdd);
const csv  = CSVExporter.exportAll(gdd);
```

Run `node examples.js` to see all 6 examples.

---

## Git workflow

The GDD is a single text file. It diffs cleanly, merges like any Markdown document, and works in any Git host.

Suggested branching approach:
- `main` or `design/main` - the canonical GDD, always reflects the current approved design
- `design/feature-name` - branches for major design changes before they are approved
- Tags at each milestone: `M1-vertical-slice`, `M2-alpha`, etc.

Status comments and inline badges survive merges. If two designers edit different sections, the merge is usually clean. If they edit the same section, standard conflict resolution applies.

---

## Output formats

**HTML** - a dark-themed self-contained single file. Color-coded status badges. Sidebar with progress bar and section navigation. Works offline. Send it to collaborators or publishers without needing them to install anything.

**Print HTML** - same content, white background, sidebar hidden. Open in a browser and print to PDF.

**JSON status** - structured data extracted from the GDD. Section statuses, feature statuses, milestone dates, task completion, open questions. Use it to feed dashboards, Slack bots, or CI checks.

**CSV** - sections table, features table, and milestones table in one file. Paste into a spreadsheet or import into a project tracker.

**Status report Markdown** - a compact summary document generated from the GDD. Good for weekly updates or publisher check-ins without sending the whole GDD.

---

## Example GDD

The included `data/gdd.md` is a complete GDD for a fictional game called Echo Veil - a puzzle-platformer. It covers all 13 section types:

Game Overview, Core Game Loop, Design Pillars, Mechanics & Systems, Level Design, Narrative & World, Art Direction, Audio Direction, UI / UX, Technical Design, Monetization & Business, Milestones & Schedule, Risks & Open Questions.

Every section has realistic content, status tags, feature comments, tables, checklists, and open questions. Use it as a starting point or as a reference for the format.
