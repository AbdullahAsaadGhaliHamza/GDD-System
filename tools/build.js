#!/usr/bin/env node

const fs   = require("fs");
const path = require("path");
const { GDDParser } = require("../core/parser");
const { HTMLExporter, JSONExporter, CSVExporter, MarkdownRenderer } = require("../core/exporters");

function parseArgs(argv) {
  const args = {};
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      const [key, val] = arg.slice(2).split("=");
      args[key] = val !== undefined ? val : true;
    }
  }
  return args;
}

function printUsage() {
  console.log(`
GDD Build Tool

Usage:
  node tools/build.js [options]

Options:
  --gdd=path       Path to GDD markdown file (default: data/gdd.md)
  --out=path       Output directory (default: ./output)
  --html           Build shareable HTML
  --pdf-html       Build print-ready HTML (for PDF via browser print)
  --json           Build JSON status export
  --ci             Build CI status JSON (pass/fail for pipeline)
  --csv            Build CSV exports (sections, features, milestones)
  --status         Build status report markdown
  --all            Build all outputs
  --report         Print status summary to console
  --watch          Watch for changes and rebuild (simple polling)

Examples:
  node tools/build.js --all
  node tools/build.js --html --json --report
  node tools/build.js --gdd=data/my_game.md --all --out=./dist
  node tools/build.js --ci
`);
}

function writeFile(outDir, filename, content, label) {
  const p = path.join(outDir, filename);
  fs.writeFileSync(p, content, "utf8");
  console.log(`  ${label.padEnd(18)} -> ${p}`);
  return p;
}

function printReport(gdd) {
  const { meta, sections, features, tasks, open_questions, status_summary } = gdd;
  const game = meta.game || {};

  const STATUS_COLORS = {
    done: "\x1b[32m", in_progress: "\x1b[33m", planned: "\x1b[34m",
    blocked: "\x1b[31m", cut: "\x1b[90m", review: "\x1b[35m"
  };
  const RESET = "\x1b[0m";
  const BOLD  = "\x1b[1m";
  const DIM   = "\x1b[90m";

  const colored = (status) => (STATUS_COLORS[status] || "") + status + RESET;

  console.log(`\n${BOLD}${game.title || "GDD"}${RESET} - Status Report`);
  console.log(DIM + `  Last updated: ${meta.last_updated || "unknown"}` + RESET);
  console.log();

  console.log(BOLD + "  Sections" + RESET);
  for (const s of sections) {
    const ind = colored(s.status);
    const owner = s.owner ? DIM + `  (${s.owner})` + RESET : "";
    console.log(`    ${ind.padEnd(40)} ${s.title}${owner}`);
  }

  console.log();
  console.log(BOLD + "  Features" + RESET);
  for (const f of features) {
    const ind = colored(f.status);
    const m = f.milestone ? DIM + ` [${f.milestone}]` + RESET : "";
    console.log(`    ${ind.padEnd(40)} ${f.name}${m}`);
  }

  console.log();
  console.log(BOLD + "  Tasks" + RESET);
  console.log(`    ${status_summary.tasks_done}/${status_summary.tasks_total} done (${status_summary.tasks_pct}%)`);

  if (status_summary.next_milestone) {
    const m = status_summary.next_milestone;
    const days = m.days_until !== null ? ` - ${m.days_until > 0 ? m.days_until + " days away" : "OVERDUE"}` : "";
    console.log();
    console.log(BOLD + "  Next milestone" + RESET);
    console.log(`    ${m.name} (${m.target_date})${days}`);
  }

  if (open_questions && open_questions.length > 0) {
    const blocked = open_questions.filter(q => q.status.includes("blocked") || q.status.includes("!"));
    console.log();
    console.log(BOLD + "  Open questions" + RESET + ` (${open_questions.length} total, ${blocked.length} blocked)`);
    for (const q of open_questions.slice(0, 5)) {
      console.log(`    ${DIM}${q.id}${RESET}  ${q.question.slice(0, 60)}`);
    }
    if (open_questions.length > 5) console.log(`    ${DIM}... and ${open_questions.length - 5} more${RESET}`);
  }

  console.log();
}

async function build(args) {
  const gddPath = path.resolve(args.gdd || "data/gdd.md");
  const outDir  = path.resolve(args.out || "output");
  const buildAll = args.all || false;

  if (!fs.existsSync(gddPath)) {
    console.error(`GDD file not found: ${gddPath}`);
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });

  const t0 = Date.now();
  const gdd = GDDParser.parse(gddPath);
  const gameName = (gdd.meta.game?.title || "gdd").replace(/\s+/g, "_").toLowerCase();

  console.log(`\nBuilding GDD: ${gdd.meta.game?.title || gddPath}`);
  console.log(`  Sections: ${gdd.sections.length}  Features: ${gdd.features.length}  Tasks: ${gdd.tasks.length}`);
  console.log();

  if (args.report) printReport(gdd);

  const built = [];

  if (buildAll || args.html) {
    const html = HTMLExporter.export(gdd);
    built.push(writeFile(outDir, `${gameName}.html`, html, "HTML"));
  }

  if (buildAll || args["pdf-html"]) {
    const phtml = HTMLExporter.exportPrintReady(gdd);
    built.push(writeFile(outDir, `${gameName}_print.html`, phtml, "PDF-ready HTML"));
  }

  if (buildAll || args.json) {
    const json = JSONExporter.export(gdd);
    built.push(writeFile(outDir, `${gameName}_status.json`, JSON.stringify(json, null, 2), "JSON status"));
  }

  if (buildAll || args.ci) {
    const ci = JSONExporter.exportCIStatus(gdd);
    const p  = writeFile(outDir, "ci_status.json", JSON.stringify(ci, null, 2), "CI status JSON");
    built.push(p);
    const passLabel = ci.pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
    console.log(`  CI result: ${passLabel} - ${ci.critical_blocked} critical blocked feature(s)`);
  }

  if (buildAll || args.csv) {
    const csv = CSVExporter.exportAll(gdd);
    built.push(writeFile(outDir, `${gameName}_export.csv`, csv, "CSV export"));
  }

  if (buildAll || args.status) {
    const sr = MarkdownRenderer.buildStatusReport(gdd);
    built.push(writeFile(outDir, `${gameName}_status_report.md`, sr, "Status report MD"));
  }

  if (!args.html && !args["pdf-html"] && !args.json && !args.ci && !args.csv && !args.status && !buildAll && !args.report) {
    console.log("  Nothing to build. Use --all or specify output flags.");
    console.log("  Run with --help for usage.\n");
    return;
  }

  const elapsed = Date.now() - t0;
  console.log(`\n  Built ${built.length} file(s) in ${elapsed}ms\n`);
}

async function watch(args) {
  const gddPath = path.resolve(args.gdd || "data/gdd.md");
  let lastMtime = 0;

  console.log(`Watching: ${gddPath}`);
  console.log("Press Ctrl+C to stop.\n");

  await build(args);

  setInterval(() => {
    try {
      const stat = fs.statSync(gddPath);
      const mtime = stat.mtimeMs;
      if (mtime > lastMtime) {
        lastMtime = mtime;
        if (lastMtime > 0) {
          console.log(`\n[${new Date().toLocaleTimeString()}] Change detected - rebuilding...`);
          build(args).catch(console.error);
        }
      }
    } catch(e) {}
  }, 500);
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || args.h) { printUsage(); return; }
  if (args.watch) { await watch(args); return; }
  await build(args);
}

main().catch(e => { console.error(e); process.exit(1); });
