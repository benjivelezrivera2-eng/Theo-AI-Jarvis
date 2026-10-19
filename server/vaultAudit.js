import fs from "node:fs/promises";
import path from "node:path";

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  ".trash",
  ".Trash",
]);

const SECRET_NAMES = new Set([
  ".env",
  ".env.local",
  ".env.production",
  "credentials.json",
  "secrets.json",
]);

const MAX_FILES = 2000;
const MAX_FILE_BYTES = 200 * 1024;
const MAX_DEPTH = 12;

function isSecretPath(relPosix) {
  const base = path.posix.basename(relPosix).toLowerCase();
  if (SECRET_NAMES.has(base)) return true;
  if (base.endsWith(".pem") || base.endsWith(".key")) return true;
  if (base === "id_rsa" || base === "id_ed25519") return true;
  return false;
}

function extractInlineTags(text) {
  const tags = [];
  const re = /(?:^|\s)#([A-Za-z0-9/_-]+)/g;
  let m;
  while ((m = re.exec(text))) {
    tags.push(m[1]);
  }
  return tags;
}

function extractFrontmatterTags(text) {
  if (!text.startsWith("---")) return [];
  const end = text.indexOf("\n---", 3);
  if (end === -1) return [];
  const fm = text.slice(3, end);
  const tags = [];
  const block = fm.match(/^tags:\s*\n((?:\s*-\s*.+\n?)+)/m);
  if (block) {
    for (const line of block[1].split("\n")) {
      const t = line.match(/^\s*-\s*(.+)\s*$/);
      if (t) tags.push(t[1].replace(/^["']|["']$/g, ""));
    }
  }
  const inline = fm.match(/^tags:\s*\[([^\]]*)\]/m);
  if (inline) {
    for (const part of inline[1].split(",")) {
      const t = part.trim().replace(/^["']|["']$/g, "");
      if (t) tags.push(t);
    }
  }
  return tags;
}

function namingIssues(relPosix) {
  const base = path.posix.basename(relPosix);
  const issues = [];
  if (/^untitled/i.test(base)) issues.push("untitled_name");
  if (/\s{2,}/.test(base)) issues.push("double_spaces");
  if (/^[0-9]{10,}/.test(base)) issues.push("epoch_looking_name");
  if (base === base.toLowerCase() && /[a-z]/.test(base) && base.includes(" ")) {
    issues.push("spaces_lowercase");
  }
  if (/copy( \([0-9]+\))?(\.|$)/i.test(base)) issues.push("copy_suffix");
  return issues;
}

function dateSignals(relPosix, frontmatterChunk) {
  const signals = [];
  const nameDates = relPosix.match(
    /(?:^|\/|_|-)(20\d{2}[-_.]?(0[1-9]|1[0-2])[-_.]?(0[1-9]|[12]\d|3[01]))(?:[_./-]|$)/g,
  );
  if (nameDates) signals.push(...nameDates.map((d) => `filename:${d}`));
  const created = frontmatterChunk.match(/^created:\s*(.+)$/m);
  const updated = frontmatterChunk.match(/^updated:\s*(.+)$/m);
  const date = frontmatterChunk.match(/^date:\s*(.+)$/m);
  if (created) signals.push(`fm_created:${created[1].trim()}`);
  if (updated) signals.push(`fm_updated:${updated[1].trim()}`);
  if (date) signals.push(`fm_date:${date[1].trim()}`);
  return signals;
}

async function walk(root, dir, depth, acc) {
  if (depth > MAX_DEPTH || acc.files.length >= MAX_FILES) return;
  let entries;
  try {
    entries = await fs.readdir(dir, { withFileTypes: true });
  } catch {
    acc.errors.push({ path: dir, error: "unreadable_directory" });
    return;
  }

  for (const entry of entries) {
    if (acc.files.length >= MAX_FILES) break;
    const abs = path.join(dir, entry.name);
    const rel = path.relative(root, abs).split(path.sep).join("/");

    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      if (entry.name === ".obsidian") {
        acc.folders.push(rel);
        continue;
      }
      acc.folders.push(rel);
      await walk(root, abs, depth + 1, acc);
      continue;
    }

    if (!entry.isFile()) continue;
    if (isSecretPath(rel)) {
      acc.skippedSecrets.push(rel);
      continue;
    }
    if (!rel.toLowerCase().endsWith(".md")) {
      acc.otherFiles += 1;
      continue;
    }

    let stat;
    try {
      stat = await fs.stat(abs);
    } catch {
      acc.errors.push({ path: rel, error: "stat_failed" });
      continue;
    }

    const fileInfo = {
      path: rel,
      bytes: stat.size,
      tags: [],
      namingIssues: namingIssues(rel),
      dateSignals: [],
      truncated: false,
    };

    if (stat.size > MAX_FILE_BYTES) {
      fileInfo.truncated = true;
      acc.files.push(fileInfo);
      continue;
    }

    try {
      const text = await fs.readFile(abs, "utf8");
      const fmEnd =
        text.startsWith("---") && text.indexOf("\n---", 3) !== -1
          ? text.indexOf("\n---", 3) + 4
          : 0;
      const fmChunk = fmEnd ? text.slice(0, fmEnd) : "";
      fileInfo.tags = [
        ...new Set([
          ...extractFrontmatterTags(text),
          ...extractInlineTags(text.slice(0, 8000)),
        ]),
      ];
      fileInfo.dateSignals = dateSignals(rel, fmChunk);
    } catch {
      acc.errors.push({ path: rel, error: "read_failed" });
    }

    acc.files.push(fileInfo);
  }
}

function summarize(acc, vaultRoot) {
  const tagCounts = new Map();
  const namingIssueCounts = new Map();
  let withDates = 0;
  let withoutDates = 0;
  let truncated = 0;

  for (const f of acc.files) {
    for (const t of f.tags) {
      tagCounts.set(t, (tagCounts.get(t) || 0) + 1);
    }
    for (const issue of f.namingIssues) {
      namingIssueCounts.set(issue, (namingIssueCounts.get(issue) || 0) + 1);
    }
    if (f.dateSignals.length) withDates += 1;
    else withoutDates += 1;
    if (f.truncated) truncated += 1;
  }

  const topTags = [...tagCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 40)
    .map(([tag, count]) => ({ tag, count }));

  const topFolders = acc.folders
    .filter((f) => !f.includes("/"))
    .slice(0, 50);

  const sampleNamingProblems = acc.files
    .filter((f) => f.namingIssues.length)
    .slice(0, 25)
    .map((f) => ({ path: f.path, issues: f.namingIssues }));

  const depthBuckets = {};
  for (const f of acc.files) {
    const depth = f.path.split("/").length - 1;
    depthBuckets[depth] = (depthBuckets[depth] || 0) + 1;
  }

  return {
    mode: "read_only_report",
    vaultRoot,
    limits: {
      maxFiles: MAX_FILES,
      maxFileBytes: MAX_FILE_BYTES,
      maxDepth: MAX_DEPTH,
      hitFileCap: acc.files.length >= MAX_FILES,
    },
    counts: {
      markdownNotes: acc.files.length,
      folders: acc.folders.length,
      otherFilesSkipped: acc.otherFiles,
      secretsSkipped: acc.skippedSecrets.length,
      truncatedReads: truncated,
      notesWithDateSignals: withDates,
      notesWithoutDateSignals: withoutDates,
      errors: acc.errors.length,
    },
    topLevelFolders: topFolders,
    folderSample: acc.folders.slice(0, 80),
    topTags,
    namingIssueCounts: Object.fromEntries(namingIssueCounts),
    sampleNamingProblems,
    notesByDepth: depthBuckets,
    skippedSecrets: acc.skippedSecrets.slice(0, 20),
    errors: acc.errors.slice(0, 20),
    guidance:
      "This is a find-and-report audit only. No files were moved, renamed, tagged, or deleted. Propose a cleanup plan for the user to approve in a later version.",
  };
}

/**
 * Resolve and pin the vault root. Rejects escapes outside the configured root.
 */
export async function resolveVaultRoot(configuredRoot, optionalSubpath) {
  if (!configuredRoot) {
    const err = new Error(
      "VAULT_PATH is not set. Add it to server/.env (absolute path to your Obsidian vault).",
    );
    err.status = 400;
    throw err;
  }

  const rootReal = await fs.realpath(path.resolve(configuredRoot));
  if (!optionalSubpath) return rootReal;

  const candidate = path.resolve(rootReal, optionalSubpath);
  const candidateReal = await fs.realpath(candidate).catch(() => candidate);
  const rel = path.relative(rootReal, candidateReal);
  if (rel.startsWith("..") || path.isAbsolute(rel)) {
    const err = new Error("Path escapes the pinned vault root.");
    err.status = 403;
    err.code = "PATH_ESCAPE";
    throw err;
  }
  return candidateReal;
}

export async function auditVault(configuredRoot, optionalSubpath) {
  const vaultRoot = await resolveVaultRoot(configuredRoot, optionalSubpath);
  const acc = {
    files: [],
    folders: [],
    otherFiles: 0,
    skippedSecrets: [],
    errors: [],
  };
  await walk(vaultRoot, vaultRoot, 0, acc);
  return summarize(acc, vaultRoot);
}
