# Writing a skill

## 1. Pick a name

Use `<area>-<task>` in lowercase kebab-case (see [Naming conventions](README.md#naming-conventions)). Check the area prefix table in the README first and reuse an existing prefix if one fits.

## 2. Copy the template

```bash
cp -r template skills/<skill-name>
```

Then edit `skills/<skill-name>/SKILL.md`:

- Set `name` to exactly the folder name.
- Remove the `metadata.internal: true` line (it only exists to keep the template itself hidden from the CLI).
- Write the description and instructions.

## 3. Write a good description

The agent decides whether to load a skill from its `description` alone, so a vague description means the skill never gets used.

- Say what the skill does and when to use it, using the words a user would actually type ("Use when the user asks to…").
- Write in the third person ("Generates…", not "I generate…" or "You can…").
- Keep it under 1024 characters.

## 4. Keep `SKILL.md` lean

Agents load the whole `SKILL.md` once the skill triggers, so every line costs context.

- Aim for under ~500 lines. Move long reference material into `references/` and link to it from `SKILL.md` so it's only read when needed.
- Put deterministic work (parsing, validation, file generation) into `scripts/` rather than describing it in prose.
- Prefer concrete steps and examples over general advice the agent already knows.
- Reference bundled files with relative paths, e.g. `[API notes](references/api.md)` or `scripts/validate.py`.

## 5. Test it

Install it locally from your working copy and try it in a real agent session:

```bash
npx skills add . --skill <skill-name> -a claude-code
```

Check that it triggers on the prompts you expect and doesn't trigger on ones you don't.

## 6. Add it to the README

Add a row to the Skills table in alphabetical order. If you used a new area prefix, add it to the prefix table too.

## 7. Run the checks

CI runs these on every pull request and push to `main`. To run them yourself first:

```bash
node scripts/check-repo.mjs                     # README tables, em dashes and curly quotes
lychee --config lychee.toml "./**/*.md"         # links (brew install lychee)
uvx --from "git+https://github.com/agentskills/agentskills#subdirectory=skills-ref" \
  skills-ref validate skills/<skill-name>       # Agent Skills spec (brew install uv)
```

| Workflow | Checks |
| -------- | ------ |
| `validate.yml` | Each skill against the Agent Skills spec, the README tables, typography, and that the `skills` CLI lists exactly the public skills |
| `links.yml` | Links in every Markdown file, on pull requests and weekly. The weekly run opens an issue instead of failing |
| `commits.yml` | Commit messages and pull request titles follow Conventional Commits (see `commitlint.config.mjs`) |

Capitalisation in the subject line isn't checked automatically, because the rule allows capitals for names and abbreviations. Follow [`git-commit-messages`](skills/git-commit-messages/SKILL.md).

## Work in progress

To commit a skill that isn't ready to share, add this to its frontmatter:

```yaml
metadata:
  internal: true
```

The `skills` CLI hides it unless `INSTALL_INTERNAL_SKILLS=1` is set.
