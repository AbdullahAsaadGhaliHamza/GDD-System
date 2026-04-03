const path = require("path");
const fs   = require("fs");
const { GDDParser } = require("./core/parser");
const { HTMLExporter, JSONExporter, CSVExporter, MarkdownRenderer } = require("./core/exporters");

const gddPath = path.join(__dirname, "data/gdd.md");

function example_basic_parse() {
  console.log("=== Example 1: Parse and inspect a GDD ===\n");

  const gdd = GDDParser.parse(gddPath);
  const game = gdd.meta.game || {};

  console.log(`  Game     : ${game.title}`);
  console.log(`  Tagline  : ${game.tagline}`);
  console.log(`  Platform : ${(game.platform||[]).join(", ")}`);
  console.log(`  Engine   : ${game.engine}`);
  console.log(`  Sections : ${gdd.sections.length}`);
  console.log(`  Features : ${gdd.features.length}`);
  console.log(`  Tasks    : ${gdd.tasks.length} (${gdd.tasks.filter(t=>t.done).length} done)`);
  console.log(`  Open Qs  : ${gdd.open_questions.length}\n`);
}

function example_section_status() {
  console.log("=== Example 2: Section status breakdown ===\n");

  const gdd = GDDParser.parse(gddPath);
  const STATUS = { done:"\x1b[32m+\x1b[0m", in_progress:"\x1b[33m~\x1b[0m", planned:"\x1b[34mo\x1b[0m", blocked:"\x1b[31m!\x1b[0m", cut:"\x1b[90mx\x1b[0m", unknown:"\x1b[90m?\x1b[0m" };

  console.log("  " + "Title".padEnd(30) + "Owner".padEnd(18) + "Status");
  console.log("  " + "-".repeat(60));

  for (const s of gdd.sections) {
    const sym = STATUS[s.status] || STATUS.unknown;
    console.log(`  ${sym}  ${s.title.slice(0,28).padEnd(30)}${(s.owner||"-").padEnd(18)}${s.status}`);
  }
  console.log();
}

function example_milestone_check() {
  console.log("=== Example 3: Milestone timeline ===\n");

  const gdd = GDDParser.parse(gddPath);
  const milestones = gdd.status_summary.milestones;

  console.log("  " + "Milestone".padEnd(25) + "Date".padEnd(14) + "Days".padEnd(10) + "Status");
  console.log("  " + "-".repeat(60));

  for (const m of milestones) {
    const days = m.days_until !== null
      ? (m.days_until > 0 ? `+${m.days_until}` : `OVERDUE`)
      : "-";
    console.log(`  ${m.name.padEnd(25)}${m.target_date.padEnd(14)}${days.padEnd(10)}${m.status}`);
  }
  console.log();
}

function example_ci_check() {
  console.log("=== Example 4: CI/CD status check ===\n");

  const gdd = GDDParser.parse(gddPath);
  const ci  = JSONExporter.exportCIStatus(gdd);

  const passLabel = ci.pass ? "\x1b[32mPASS\x1b[0m" : "\x1b[31mFAIL\x1b[0m";
  console.log(`  CI Result        : ${passLabel}`);
  console.log(`  Blocked features : ${ci.blocked_features}`);
  console.log(`  Critical blocked : ${ci.critical_blocked}`);
  console.log(`  Tasks done       : ${ci.tasks_pct}%`);
  if (ci.next_milestone) {
    const { name, target_date, days_until } = ci.next_milestone;
    console.log(`  Next milestone   : ${name} (${target_date}) - ${days_until > 0 ? days_until + " days" : "OVERDUE"}`);
  }
  if (ci.critical_blocked_list.length > 0) {
    console.log(`  Blocked items    : ${ci.critical_blocked_list.join(", ")}`);
  }
  console.log();
}

function example_export_all() {
  console.log("=== Example 5: Export all formats ===\n");

  const gdd = GDDParser.parse(gddPath);
  const outDir = path.join(__dirname, "output");
  fs.mkdirSync(outDir, { recursive: true });
  const gameName = (gdd.meta.game?.title || "gdd").replace(/\s+/g, "_").toLowerCase();

  const htmlPath = path.join(outDir, gameName + "_ex5.html");
  fs.writeFileSync(htmlPath, HTMLExporter.export(gdd));
  console.log(`  HTML         : ${htmlPath}`);

  const jsonPath = path.join(outDir, gameName + "_ex5_status.json");
  fs.writeFileSync(jsonPath, JSON.stringify(JSONExporter.export(gdd), null, 2));
  console.log(`  JSON         : ${jsonPath}`);

  const csvPath = path.join(outDir, gameName + "_ex5.csv");
  fs.writeFileSync(csvPath, CSVExporter.exportAll(gdd));
  console.log(`  CSV          : ${csvPath}`);

  const srPath = path.join(outDir, gameName + "_ex5_status_report.md");
  fs.writeFileSync(srPath, MarkdownRenderer.buildStatusReport(gdd));
  console.log(`  Status report: ${srPath}`);
  console.log();
}

function example_open_questions() {
  console.log("=== Example 6: Open questions and risks ===\n");

  const gdd = GDDParser.parse(gddPath);

  console.log(`  Open questions (${gdd.open_questions.length}):\n`);
  for (const q of gdd.open_questions) {
    console.log(`  ${q.id}  ${q.question}`);
    console.log(`       Owner: ${q.owner}  Deadline: ${q.deadline}\n`);
  }
}

example_basic_parse();
example_section_status();
example_milestone_check();
example_ci_check();
example_export_all();
example_open_questions();
