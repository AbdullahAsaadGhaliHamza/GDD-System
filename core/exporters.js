const fs   = require("fs");
const path = require("path");

function hexToRgba(hex, alpha) {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0,2),16);
  const g = parseInt(h.slice(2,4),16);
  const b = parseInt(h.slice(4,6),16);
  return `rgba(${r},${g},${b},${alpha})`;
}

const STATUS_COLORS = {
  done:        "#43a047",
  in_progress: "#f4a800",
  planned:     "#1e88e5",
  blocked:     "#e53935",
  cut:         "#78909c",
  review:      "#8e24aa",
  unknown:     "#555e6e"
};

const STATUS_LABELS = {
  done:        "Done",
  in_progress: "In Progress",
  planned:     "Planned",
  blocked:     "Blocked",
  cut:         "Cut",
  review:      "In Review",
  unknown:     "Unknown"
};

class MarkdownRenderer {
  static renderInlineStatus(md) {
    return md
      .replace(/`\+\s+([\w\s]+)`/g, (_, l) => `**[Done]** ${l}`)
      .replace(/`~\s+([\w\s]+)`/g,  (_, l) => `**[In Progress]** ${l}`)
      .replace(/`o\s+([\w\s]+)`/g,  (_, l) => `**[Planned]** ${l}`)
      .replace(/`!\s+([\w\s]+)`/g,  (_, l) => `**[BLOCKED]** ${l}`)
      .replace(/`x\s+([\w\s]+)`/g,  (_, l) => `~~**[Cut]** ${l}~~`)
      .replace(/`\?\s+([\w\s]+)`/g, (_, l) => `**[Review]** ${l}`);
  }

  static buildStatusReport(gdd) {
    const { meta, sections, features, tasks, open_questions, status_summary } = gdd;
    const game = meta.game || {};
    const now = new Date().toISOString().split("T")[0];

    const lines = [
      `# ${game.title || "GDD"} - Status Report`,
      ``,
      `> Generated: ${now}`,
      ``,
      `## Overview`,
      ``,
      `| Field | Value |`,
      `|-------|-------|`,
      `| Sections | ${status_summary.sections_total} |`,
      `| Tasks done | ${status_summary.tasks_done} / ${status_summary.tasks_total} (${status_summary.tasks_pct}%) |`,
      `| Open questions | ${(open_questions || []).length} |`,
      ``,
      `## Section Status`,
      ``,
      `| Section | Owner | Status | Updated |`,
      `|---------|-------|--------|---------|`,
      ...sections.map(s =>
        `| ${s.title} | ${s.owner || "-"} | ${STATUS_LABELS[s.status] || s.status} | ${s.updated || "-"} |`
      ),
      ``,
      `## Feature Status`,
      ``,
      `| Feature | Status | Milestone | Priority |`,
      `|---------|--------|-----------|---------|`,
      ...features.map(f =>
        `| ${f.name} | ${STATUS_LABELS[f.status] || f.status} | ${f.milestone || "-"} | ${f.priority || "-"} |`
      ),
      ``,
      `## Milestones`,
      ``,
      `| Milestone | Target | Status | Days |`,
      `|-----------|--------|--------|------|`,
      ...(status_summary.milestones || []).map(m => {
        const days = m.days_until !== null ? (m.days_until > 0 ? `+${m.days_until}` : m.days_until) : "-";
        return `| ${m.name} | ${m.target_date} | ${STATUS_LABELS[m.status] || m.status} | ${days} |`;
      }),
      ``,
      `## Open Questions`,
      ``,
      `| ID | Question | Owner | Deadline |`,
      `|----|---------|-------|---------|`,
      ...(open_questions || []).map(q =>
        `| ${q.id} | ${q.question} | ${q.owner} | ${q.deadline} |`
      )
    ];

    return lines.join("\n");
  }
}

class HTMLExporter {
  static renderMarkdown(md) {
    let html = md
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/^#### (.+)$/gm, "<h4>$1</h4>")
      .replace(/^### (.+)$/gm, "<h3>$1</h3>")
      .replace(/^## (.+)$/gm, (_, t) => `<h2 id="${t.toLowerCase().replace(/[^a-z0-9]+/g,"-")}">${t}</h2>`)
      .replace(/^# (.+)$/gm, "<h1>$1</h1>")
      .replace(/<!--[\s\S]*?-->/g, "")
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/~~(.+?)~~/g, "<del>$1</del>")
      .replace(/`([~+ox!?])\s+([\w\s]+)`/g, (_, sym, label) => {
        const statusMap = {"+":"done","~":"in_progress","o":"planned","!":"blocked","x":"cut","?":"review"};
        const status = statusMap[sym] || "unknown";
        const color = STATUS_COLORS[status];
        return `<span class="status-badge status-${status}" style="background:${hexToRgba(color,0.15)};color:${color};border:1px solid ${hexToRgba(color,0.35)}">${STATUS_LABELS[status]}</span>`;
      })
      .replace(/`([^`]+)`/g, "<code>$1</code>")
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>')
      .replace(/^> (.+)$/gm, "<blockquote>$1</blockquote>")
      .replace(/^```(\w*)\n([\s\S]*?)^```/gm, (_, lang, code) =>
        `<pre class="code-block"><code class="language-${lang}">${code.replace(/&lt;/g,"<").replace(/&gt;/g,">").replace(/&amp;/g,"&")}</code></pre>`)
      .replace(/^---$/gm, "<hr>")
      .replace(/^- \[x\] (.+)$/gm, '<li class="task-done"><span class="check">&#10003;</span> $1</li>')
      .replace(/^- \[ \] (.+)$/gm, '<li class="task-todo"><span class="check">&#9675;</span> $1</li>')
      .replace(/^- (.+)$/gm, "<li>$1</li>")
      .replace(/(<li>[\s\S]*?<\/li>)/g, (m) => `<ul>${m}</ul>`)
      .replace(/<\/ul>\s*<ul>/g, "");

    html = HTMLExporter.renderTables(html);

    html = html.split(/\n{2,}/).map(para => {
      const t = para.trim();
      if (!t) return "";
      if (/^<(h[1-6]|ul|ol|li|pre|blockquote|hr|table)/.test(t)) return t;
      if (/<\/h[1-6]>$/.test(t)) return t;
      return `<p>${t.replace(/\n/g, "<br>")}</p>`;
    }).join("\n");

    return html;
  }

  static renderTables(html) {
    return html.replace(/(\|.+\|\n\|[-| :]+\|\n(?:\|.+\|\n?)+)/g, (table) => {
      const rows = table.trim().split("\n");
      const headers = rows[0].split("|").map(c => c.trim()).filter(Boolean);
      const body = rows.slice(2);

      const headerHtml = headers.map(h => `<th>${h}</th>`).join("");
      const bodyHtml = body.map(row => {
        const cells = row.split("|").map(c => c.trim()).filter(Boolean);
        return "<tr>" + cells.map(c => {
          const withBadge = c.replace(/`([~+ox!?])\s+([\w\s]+)`/g, (_, sym, label) => {
            const statusMap = {"+":"done","~":"in_progress","o":"planned","!":"blocked","x":"cut","?":"review"};
            const status = statusMap[sym] || "unknown";
            const color = STATUS_COLORS[status];
            return `<span class="status-badge status-${status}" style="background:${hexToRgba(color,0.15)};color:${color};border:1px solid ${hexToRgba(color,0.35)}">${STATUS_LABELS[status]}</span>`;
          });
          return `<td>${withBadge}</td>`;
        }).join("") + "</tr>";
      }).join("");

      return `<table><thead><tr>${headerHtml}</tr></thead><tbody>${bodyHtml}</tbody></table>`;
    });
  }

  static buildSidebar(gdd) {
    const { sections, status_summary, meta } = gdd;
    const { milestones } = status_summary;

    const sectionLinks = sections.map(s => {
      const color = STATUS_COLORS[s.status] || STATUS_COLORS.unknown;
      return `<a href="#${s.title.toLowerCase().replace(/[^a-z0-9]+/g,"-")}" class="nav-link">
        <span class="nav-dot" style="background:${color}"></span>
        ${s.title}
      </a>`;
    }).join("");

    const nextM = status_summary.next_milestone;
    const milestoneHtml = nextM
      ? `<div class="sidebar-section">
          <div class="sidebar-section-title">Next milestone</div>
          <div class="milestone-card">
            <div class="milestone-name">${nextM.name}</div>
            <div class="milestone-date">${nextM.target_date}</div>
            ${nextM.days_until !== null ? `<div class="milestone-days ${nextM.days_until < 14 ? "urgent" : ""}">${nextM.days_until > 0 ? nextM.days_until + " days" : "Overdue"}</div>` : ""}
          </div>
        </div>`
      : "";

    const sTotal = status_summary.sections_total;
    const byS = status_summary.sections_by_status;
    const barItems = Object.entries(STATUS_COLORS).filter(([k]) => byS[k]).map(([k, c]) => {
      const pct = (byS[k] / sTotal * 100).toFixed(1);
      return `<div class="prog-seg" style="width:${pct}%;background:${c}" title="${STATUS_LABELS[k]}: ${byS[k]}"></div>`;
    }).join("");

    return `
      <div class="sidebar-section">
        <div class="sidebar-section-title">Progress</div>
        <div class="progress-bar">${barItems}</div>
        <div class="progress-legend">
          ${Object.entries(STATUS_COLORS).filter(([k]) => byS[k]).map(([k, c]) =>
            `<span class="prog-leg-item"><span style="background:${c};width:8px;height:8px;border-radius:50%;display:inline-block;margin-right:4px"></span>${STATUS_LABELS[k]}: ${byS[k]}</span>`
          ).join("")}
        </div>
      </div>
      ${milestoneHtml}
      <div class="sidebar-section">
        <div class="sidebar-section-title">Sections</div>
        <nav>${sectionLinks}</nav>
      </div>`;
  }

  static export(gdd, opts = {}) {
    const { meta, body } = gdd;
    const game = meta.game || {};
    const now = new Date().toISOString().split("T")[0];
    const contentHtml = HTMLExporter.renderMarkdown(body);
    const sidebar = HTMLExporter.buildSidebar(gdd);
    const forPrint = opts.forPrint || false;

    return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1.0"/>
<title>${game.title || "GDD"} - Game Design Document</title>
<style>
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
:root{
  --bg:#0f1117;--bg2:#161b25;--bg3:#1e2533;
  --border:rgba(255,255,255,0.08);--border2:rgba(255,255,255,0.13);
  --text:#e8eaf0;--text2:#8b919e;--text3:#555e6e;
  --accent:#378ADD;
  --sidebar-w:240px;
}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--bg);color:var(--text);font-size:15px;line-height:1.75}
${forPrint ? `body{background:#fff;color:#111;font-size:12pt}` : ""}
.layout{display:flex;min-height:100vh}
.sidebar{width:var(--sidebar-w);background:var(--bg2);border-right:1px solid var(--border);padding:20px 16px;position:sticky;top:0;height:100vh;overflow-y:auto;flex-shrink:0}
${forPrint ? ".sidebar{display:none}" : ""}
.sidebar::-webkit-scrollbar{width:4px}.sidebar::-webkit-scrollbar-thumb{background:var(--border2);border-radius:2px}
.content{flex:1;max-width:860px;padding:40px 48px;margin:0 auto}
.game-header{margin-bottom:40px;padding-bottom:24px;border-bottom:1px solid var(--border)}
.game-title{font-size:32px;font-weight:700;letter-spacing:-0.02em;color:var(--text);margin-bottom:6px}
.game-tagline{font-size:16px;color:var(--text2);margin-bottom:12px}
.game-meta-chips{display:flex;flex-wrap:wrap;gap:6px}
.chip{font-size:11px;padding:3px 9px;border-radius:20px;background:var(--bg3);border:1px solid var(--border2);color:var(--text2)}
h1{font-size:28px;font-weight:700;color:var(--text);margin:40px 0 16px}
h2{font-size:22px;font-weight:600;color:var(--text);margin:40px 0 14px;padding-top:8px;border-bottom:1px solid var(--border);padding-bottom:8px}
h3{font-size:17px;font-weight:600;color:var(--text);margin:28px 0 10px}
h4{font-size:14px;font-weight:600;color:var(--text2);margin:20px 0 8px;text-transform:uppercase;letter-spacing:0.05em}
p{margin:0 0 16px;color:var(--text2)}
${forPrint ? "p,h2,h3,h4{color:#111}" : ""}
strong{color:var(--text);font-weight:600}
em{color:var(--text2);font-style:italic}
del{color:var(--text3)}
blockquote{border-left:3px solid var(--accent);padding:10px 16px;margin:16px 0;background:rgba(55,138,221,0.08);border-radius:0 6px 6px 0}
blockquote p{margin:0;color:var(--text)}
code{font-family:"SF Mono","Fira Code",monospace;font-size:12px;background:var(--bg3);padding:2px 6px;border-radius:4px;border:1px solid var(--border2);color:#90caf9}
${forPrint ? "code{background:#f5f5f5;border:1px solid #ddd;color:#1a237e}" : ""}
pre.code-block{background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:16px;margin:16px 0;overflow-x:auto}
pre.code-block code{background:none;border:none;padding:0;font-size:13px;color:#e0e0e0}
${forPrint ? "pre.code-block{background:#f5f5f5;border:1px solid #ddd} pre.code-block code{color:#111}" : ""}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:13px}
th{text-align:left;padding:8px 12px;background:var(--bg3);border-bottom:2px solid var(--border2);color:var(--text3);font-size:11px;text-transform:uppercase;letter-spacing:0.05em;font-weight:600}
td{padding:8px 12px;border-bottom:1px solid var(--border);color:var(--text2);vertical-align:top}
tr:last-child td{border-bottom:none}
tr:hover td{background:rgba(255,255,255,0.02)}
${forPrint ? "th{background:#f0f0f0;color:#333;border-bottom:2px solid #ccc} td{color:#333;border-bottom:1px solid #ddd}" : ""}
.status-badge{font-size:10px;font-weight:600;padding:2px 8px;border-radius:20px;white-space:nowrap;text-transform:uppercase;letter-spacing:0.05em}
ul{padding-left:20px;margin:12px 0}
li{margin-bottom:4px;color:var(--text2)}
${forPrint ? "li{color:#333}" : ""}
.task-done{color:var(--text3)}
.task-todo{color:var(--text2)}
.check{margin-right:6px;font-size:11px}
hr{border:none;border-top:1px solid var(--border);margin:32px 0}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
.sidebar-section{margin-bottom:20px}
.sidebar-section-title{font-size:10px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.08em;margin-bottom:8px}
.nav-link{display:flex;align-items:center;gap:7px;padding:5px 8px;border-radius:6px;font-size:12px;color:var(--text2);text-decoration:none;margin-bottom:2px;transition:background 0.1s}
.nav-link:hover{background:var(--bg3);color:var(--text)}
.nav-dot{width:7px;height:7px;border-radius:50%;flex-shrink:0}
.progress-bar{height:6px;border-radius:3px;background:var(--bg3);overflow:hidden;display:flex;margin-bottom:6px}
.prog-seg{height:100%;transition:width 0.3s}
.progress-legend{display:flex;flex-wrap:wrap;gap:4px}
.prog-leg-item{font-size:10px;color:var(--text3)}
.milestone-card{background:var(--bg3);border:1px solid var(--border);border-radius:8px;padding:10px}
.milestone-name{font-size:12px;font-weight:600;color:var(--text)}
.milestone-date{font-size:11px;color:var(--text3);margin-top:2px}
.milestone-days{font-size:13px;font-weight:600;color:var(--accent);margin-top:4px}
.milestone-days.urgent{color:#e53935}
.gen-note{font-size:11px;color:var(--text3);text-align:center;margin-top:40px;padding-top:20px;border-top:1px solid var(--border)}
@media(max-width:768px){.sidebar{display:none}.content{padding:24px 20px}}
@media print{.sidebar{display:none}body{background:#fff;color:#111}.content{max-width:100%;padding:0}}
</style>
</head>
<body>
<div class="layout">
  <div class="sidebar">${sidebar}</div>
  <div class="content">
    <div class="game-header">
      <div class="game-title">${game.title || "Game Design Document"}</div>
      <div class="game-tagline">${game.tagline || ""}</div>
      <div class="game-meta-chips">
        ${(game.genre || []).map(g => `<span class="chip">${g}</span>`).join("")}
        ${(game.platform || []).map(p => `<span class="chip">${p}</span>`).join("")}
        ${game.engine ? `<span class="chip">${game.engine}</span>` : ""}
        ${game.target_rating ? `<span class="chip">${game.target_rating}</span>` : ""}
        ${game.expected_playtime ? `<span class="chip">${game.expected_playtime}</span>` : ""}
      </div>
    </div>
    ${contentHtml}
    <div class="gen-note">Generated by GDD Living Template System &mdash; ${now}</div>
  </div>
</div>
</body>
</html>`;
  }

  static exportPrintReady(gdd) {
    return HTMLExporter.export(gdd, { forPrint: true });
  }
}

class JSONExporter {
  static export(gdd) {
    const { meta, sections, features, tasks, open_questions, status_summary, parsed_at } = gdd;

    return {
      schema: "gdd-status/1.0.0",
      exported_at: new Date().toISOString(),
      parsed_at,
      game: meta.game || {},
      team: meta.team || {},
      status: {
        sections: sections.map(s => ({
          id: s.id,
          title: s.title,
          status: s.status,
          owner: s.owner,
          updated: s.updated,
          word_count: s.word_count
        })),
        features: features.map(f => ({
          name: f.name,
          status: f.status,
          milestone: f.milestone,
          priority: f.priority
        })),
        tasks: {
          done: tasks.filter(t => t.done).length,
          total: tasks.length,
          pct: status_summary.tasks_pct,
          items: tasks
        },
        milestones: status_summary.milestones,
        open_questions: open_questions || [],
        summary: {
          sections_by_status: status_summary.sections_by_status,
          features_by_status: status_summary.features_by_status,
          next_milestone: status_summary.next_milestone
        }
      }
    };
  }

  static exportCIStatus(gdd) {
    const { status_summary, features } = gdd;
    const blocked = features.filter(f => f.status === "blocked");
    const critical_blocked = blocked.filter(f => f.priority === "critical");

    return {
      timestamp: new Date().toISOString(),
      pass: critical_blocked.length === 0,
      blocked_features: blocked.length,
      critical_blocked: critical_blocked.length,
      critical_blocked_list: critical_blocked.map(f => f.name),
      tasks_pct: status_summary.tasks_pct,
      next_milestone: status_summary.next_milestone
        ? { name: status_summary.next_milestone.name, target_date: status_summary.next_milestone.target_date, days_until: status_summary.next_milestone.days_until }
        : null
    };
  }
}

class CSVExporter {
  static exportSections(gdd) {
    const { sections } = gdd;
    const header = ["id","title","status","owner","updated","word_count"].join(",");
    const rows = sections.map(s =>
      [s.id, `"${s.title}"`, s.status, `"${s.owner||""}"`, s.updated||"", s.word_count].join(",")
    );
    return [header, ...rows].join("\n");
  }

  static exportFeatures(gdd) {
    const { features } = gdd;
    const header = ["name","status","milestone","priority"].join(",");
    const rows = features.map(f =>
      [`"${f.name}"`, f.status, f.milestone||"", f.priority||""].join(",")
    );
    return [header, ...rows].join("\n");
  }

  static exportMilestones(gdd) {
    const { status_summary } = gdd;
    const header = ["id","name","target_date","status","days_until","description"].join(",");
    const rows = (status_summary.milestones || []).map(m =>
      [m.id, `"${m.name}"`, m.target_date, m.status, m.days_until ?? "", `"${m.description||""}"`].join(",")
    );
    return [header, ...rows].join("\n");
  }

  static exportAll(gdd) {
    return [
      "=== SECTIONS ===",
      CSVExporter.exportSections(gdd),
      "",
      "=== FEATURES ===",
      CSVExporter.exportFeatures(gdd),
      "",
      "=== MILESTONES ===",
      CSVExporter.exportMilestones(gdd)
    ].join("\n");
  }
}

module.exports = { MarkdownRenderer, HTMLExporter, JSONExporter, CSVExporter };
