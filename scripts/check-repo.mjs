#!/usr/bin/env node
// Repo checks the Agent Skills spec doesn't cover: README tables and typography.
// Usage: node scripts/check-repo.mjs [--list-public]

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const errors = [];

function readSkills() {
  const dir = join(root, "skills");
  return readdirSync(dir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(dir, d.name, "SKILL.md")))
    .map((d) => {
      const text = readFileSync(join(dir, d.name, "SKILL.md"), "utf8");
      const frontmatter = text.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";
      const internal = /^metadata:\s*\n(?:[ \t]+.*\n)*?[ \t]+internal:\s*true\s*$/m.test(frontmatter + "\n");
      return { name: d.name, internal };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

function tableRows(markdown, heading) {
  const section = markdown.split(/^## /m).find((s) => s.startsWith(heading));
  if (!section) return null;
  return section
    .split("\n")
    .filter((line) => /^\|\s*\[?`/.test(line))
    .map((line) => line.match(/`([^`]+)`/)[1]);
}

const skills = readSkills();
const publicSkills = skills.filter((s) => !s.internal).map((s) => s.name);

if (process.argv.includes("--list-public")) {
  console.log(publicSkills.join("\n"));
  process.exit(0);
}

const readme = readFileSync(join(root, "README.md"), "utf8");

const listed = tableRows(readme, "Skills") ?? [];
for (const name of publicSkills) {
  if (!listed.includes(name)) errors.push(`README Skills table is missing \`${name}\`.`);
}
for (const name of listed) {
  const skill = skills.find((s) => s.name === name);
  if (!skill) errors.push(`README Skills table lists \`${name}\`, but skills/${name}/SKILL.md doesn't exist.`);
  else if (skill.internal) errors.push(`README Skills table lists \`${name}\`, which is marked internal.`);
}
if (listed.join() !== [...listed].sort().join()) {
  errors.push("README Skills table isn't in alphabetical order.");
}

const prefixes = (tableRows(readme, "Naming conventions") ?? []).map((p) => p.replace(/-$/, ""));
for (const name of publicSkills) {
  const prefix = name.split("-")[0];
  if (!prefixes.includes(prefix)) errors.push(`README prefix table is missing \`${prefix}-\` (used by \`${name}\`).`);
}

// Em dashes, en dashes and curly quotes read as AI-written; see the Humanizer pass.
const banned = /[–—‘’“”]/;
function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (entry.name.endsWith(".md")) checkTypography(path);
  }
}
function checkTypography(path) {
  readFileSync(path, "utf8")
    .split("\n")
    .forEach((line, i) => {
      if (banned.test(line)) {
        errors.push(`${path.replace(root, "")}:${i + 1} contains an em dash, en dash or curly quote.`);
      }
    });
}
walk(join(root, "skills"));
walk(join(root, "template"));
["README.md", "CONTRIBUTING.md"].forEach((f) => checkTypography(join(root, f)));

if (errors.length) {
  for (const e of errors) console.error(`::error::${e}`);
  console.error(`\n${errors.length} problem(s) found.`);
  process.exit(1);
}
console.log(`OK: ${publicSkills.length} public skills, ${skills.length - publicSkills.length} internal.`);
