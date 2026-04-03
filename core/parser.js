const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

class GDDParser {
  static parse(filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    return GDDParser.parseString(raw, filePath);
  }

  static parseString(raw, sourcePath) {
    const { frontmatter, body } = GDDParser.splitFrontmatter(raw);
    const meta = yaml.load(frontmatter) || {};
    const sections = GDDParser.extractSections(body, meta);
    const features = GDDParser.extractFeatures(body);
    const tasks = GDDParser.extractTasks(body);
    const openQuestions = GDDParser.extractOpenQuestions(body);
    const statusSummary = GDDParser.buildStatusSummary(sections, features, tasks, meta);

    return {
      meta,
      body,
      sections,
      features,
      tasks,
      open_questions: openQuestions,
      status_summary: statusSummary,
      source_path: sourcePath || null,
      parsed_at: new Date().toISOString()
    };
  }

  static splitFrontmatter(raw) {
    const match = raw.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/);
    if (!match) return { frontmatter: "", body: raw };
    return { frontmatter: match[1], body: match[2] };
  }

  static parseYAML(yaml) {
    const result = {};
    const lines = yaml.split("\n");
    let currentKey = null;
    let currentObj = null;
    let currentArr = null;
    let arrKey = null;
    let indent = 0;
    const stack = [{ obj: result, indent: -1 }];

    const getTop = () => stack[stack.length - 1];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (!line.trim() || line.trim().startsWith("#")) continue;

      const lineIndent = line.search(/\S/);
      const trimmed = line.trim();

      if (trimmed.startsWith("- ")) {
        const val = trimmed.slice(2).trim();
        const top = getTop();
        if (!Array.isArray(top.obj[top.lastKey])) top.obj[top.lastKey] = [];

        if (val.includes(": ")) {
          const obj = {};
          top.obj[top.lastKey].push(obj);
          stack.push({ obj, indent: lineIndent, lastKey: null });
          const [k, v] = val.split(/:\s+(.*)/, 2);
          obj[k.trim()] = GDDParser.parseScalar(v?.trim() || "");
        } else {
          top.obj[top.lastKey].push(GDDParser.parseScalar(val));
        }
        continue;
      }

      while (stack.length > 1 && lineIndent <= stack[stack.length - 1].indent) {
        stack.pop();
      }

      if (trimmed.includes(": ")) {
        const colonIdx = trimmed.indexOf(": ");
        const key = trimmed.slice(0, colonIdx).trim();
        const val = trimmed.slice(colonIdx + 2).trim();
        const top = getTop();

        if (val === "" || val === null) {
          top.obj[key] = {};
          top.lastKey = key;
          stack.push({ obj: top.obj[key], indent: lineIndent, lastKey: null });
        } else {
          top.obj[key] = GDDParser.parseScalar(val);
          top.lastKey = key;
        }
      } else if (trimmed.endsWith(":")) {
        const key = trimmed.slice(0, -1).trim();
        const top = getTop();
        top.obj[key] = {};
        top.lastKey = key;
        stack.push({ obj: top.obj[key], indent: lineIndent, lastKey: null });
      }
    }

    return result;
  }

  static parseScalar(val) {
    if (!val || val === "null" || val === "~") return null;
    if (val === "true") return true;
    if (val === "false") return false;
    if (val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1);
    if (val.startsWith("'") && val.endsWith("'")) return val.slice(1, -1);
    if (val.startsWith("[") && val.endsWith("]")) {
      return val.slice(1, -1).split(",").map(s => s.trim().replace(/^["']|["']$/g, ""));
    }
    const num = parseFloat(val);
    if (!isNaN(num) && String(num) === val) return num;
    return val;
  }

  static extractSections(body, meta) {
    const sections = [];
    const h2Regex = /^## (.+)$/gm;
    const commentRegex = /<!--\s*status:\s*(\w+)\s*\|?\s*(?:owner:\s*([^|]+?)\s*\|?)?\s*(?:updated:\s*([\d-]+)\s*)?\s*-->/;
    let match;

    while ((match = h2Regex.exec(body)) !== null) {
      const title = match[1].trim();
      const pos = match.index;
      const nextPos = body.indexOf("\n## ", pos + 1);
      const slice = body.slice(pos, nextPos > -1 ? nextPos : undefined);
      const commentMatch = slice.match(commentRegex);

      const metaSection = (meta.sections || []).find(s => s.title === title);

      sections.push({
        title,
        position: pos,
        status: commentMatch?.[1] || metaSection?.status || "unknown",
        owner: commentMatch?.[2]?.trim() || metaSection?.owner || null,
        updated: commentMatch?.[3]?.trim() || null,
        word_count: slice.split(/\s+/).filter(Boolean).length,
        id: metaSection?.id || title.toLowerCase().replace(/[^a-z0-9]+/g, "_")
      });
    }

    return sections;
  }

  static extractFeatures(body) {
    const features = [];
    const featureCommentRegex = /<!--\s*feature_status:\s*(\w+)\s*\|?\s*(?:milestone:\s*(\w+)\s*\|?)?\s*(?:priority:\s*(\w+)\s*)?\s*-->/g;
    const h3Regex = /^### (.+)$/gm;

    let match;
    while ((match = featureCommentRegex.exec(body)) !== null) {
      const beforePos = body.lastIndexOf("### ", match.index);
      let name = "Unknown Feature";
      if (beforePos > -1) {
        const h3Line = body.slice(beforePos, body.indexOf("\n", beforePos));
        name = h3Line.replace(/^### /, "").trim();
      }

      features.push({
        name,
        status: match[1],
        milestone: match[2] || null,
        priority: match[3] || null,
        position: match.index
      });
    }

    return features;
  }

  static extractTasks(body) {
    const tasks = [];
    const checkboxRegex = /^-\s+\[([x ])\]\s+(.+)$/gm;
    let match;

    while ((match = checkboxRegex.exec(body)) !== null) {
      tasks.push({
        done: match[1].toLowerCase() === "x",
        text: match[2].trim(),
        position: match.index
      });
    }

    return tasks;
  }

  static extractOpenQuestions(body) {
    const oqs = [];
    const oqRegex = /\|\s*(OQ-\d+)\s*\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|\s*([^|]+)\|/g;
    let match;

    while ((match = oqRegex.exec(body)) !== null) {
      oqs.push({
        id: match[1].trim(),
        question: match[2].trim(),
        owner: match[3].trim(),
        deadline: match[4].trim(),
        status: match[5].trim().replace(/`[^`]*`\s*/g, "").trim()
      });
    }

    return oqs;
  }

  static buildStatusSummary(sections, features, tasks, meta) {
    const sectionsByStatus = {};
    for (const s of sections) {
      sectionsByStatus[s.status] = (sectionsByStatus[s.status] || 0) + 1;
    }

    const featuresByStatus = {};
    for (const f of features) {
      featuresByStatus[f.status] = (featuresByStatus[f.status] || 0) + 1;
    }

    const tasksDone = tasks.filter(t => t.done).length;
    const tasksTotal = tasks.length;

    const milestones = (meta.milestones || []).map(m => ({
      ...m,
      days_until: m.target_date ? GDDParser.daysUntil(m.target_date) : null
    }));

    const nextMilestone = milestones.find(m => m.status !== "done" && m.days_until !== null);

    return {
      sections_total: sections.length,
      sections_by_status: sectionsByStatus,
      features_total: features.length,
      features_by_status: featuresByStatus,
      tasks_done: tasksDone,
      tasks_total: tasksTotal,
      tasks_pct: tasksTotal > 0 ? Math.round(tasksDone / tasksTotal * 100) : 0,
      milestones,
      next_milestone: nextMilestone || null,
      open_questions_count: 0
    };
  }

  static daysUntil(dateStr) {
    const target = new Date(dateStr);
    const now = new Date();
    return Math.ceil((target - now) / (1000 * 60 * 60 * 24));
  }
}

class StatusExtractor {
  static inlineStatuses(body) {
    const statuses = [];
    const inlineRegex = /`([~+ox!?])\s+([\w_]+(?:\s+[\w]+)*)`/g;
    let match;
    while ((match = inlineRegex.exec(body)) !== null) {
      statuses.push({ symbol: match[1], label: match[2].trim(), position: match.index });
    }
    return statuses;
  }

  static tableStatuses(body) {
    const statuses = { done: 0, in_progress: 0, planned: 0, blocked: 0, cut: 0, review: 0 };
    const symbolMap = { "+": "done", "~": "in_progress", "o": "planned", "!": "blocked", "x": "cut", "?": "review" };

    const inlineRegex = /`([~+ox!?])\s+[\w\s]+`/g;
    let match;
    while ((match = inlineRegex.exec(body)) !== null) {
      const status = symbolMap[match[1]];
      if (status) statuses[status]++;
    }

    return statuses;
  }
}

module.exports = { GDDParser, StatusExtractor };
