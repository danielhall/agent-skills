# Agent Skills

A collection of [Agent Skills](https://agentskills.io) for AI coding agents such as Claude Code, Cursor, Codex, OpenCode and GitHub Copilot.

A skill is a folder containing a `SKILL.md` file: a set of instructions (plus optional scripts and reference files) that an agent loads when a task matches the skill's description.

## Skills

| Skill | Description |
| ----- | ----------- |
| [`code-comments`](skills/code-comments/SKILL.md) | Comments only where the code can't explain itself, two lines at most, with longer docs in `/docs/` |
| [`code-dependency-vetting`](skills/code-dependency-vetting/SKILL.md) | Check whether a package, CLI, Action, hook or MCP server is trustworthy before adding it, ending in a short verdict |
| [`dotnet-solution-setup`](skills/dotnet-solution-setup/SKILL.md) | .NET solution layout: `global.json`, shared build props, central package management, layering and tests |
| [`figma-site-to-design`](skills/figma-site-to-design/SKILL.md) | Rebuild a running website in Figma as editable frames backed by variables, text styles and components, desktop and mobile |
| [`git-commit-messages`](skills/git-commit-messages/SKILL.md) | Commit messages that follow Conventional Commits 1.0.0, with a lowercase subject line |
| [`media-video-download`](skills/media-video-download/SKILL.md) | Download video or audio with yt-dlp, with sensible formats and fixes for common failures |
| [`nextjs-cloudflare-deploy`](skills/nextjs-cloudflare-deploy/SKILL.md) | Deploy Next.js to Cloudflare Workers with OpenNext, including environments, variables and ISR caching |
| [`web-accessibility-testing`](skills/web-accessibility-testing/SKILL.md) | WCAG 2.2 AA testing with Playwright and axe, keyboard tests and a blocking CI job |
| [`writing-uk-english`](skills/writing-uk-english/SKILL.md) | British English spelling and conventions in all prose |

<!-- Keep this table sorted alphabetically. One row per folder in skills/. -->

## Installation

Install these skills with Vercel's [`skills` CLI](https://github.com/vercel-labs/skills). It supports 40+ agents and runs through `npx`, so all you need is Node.js.

### Install interactively

```bash
npx skills add danielhall/agent-skills
```

The CLI lists the skills in this repo and asks which ones to install and which agents to install them for.

### See what's available

```bash
npx skills add danielhall/agent-skills --list
```

### Install specific skills

```bash
npx skills add danielhall/agent-skills --skill <skill-name>

# Several at once
npx skills add danielhall/agent-skills --skill <skill-one> --skill <skill-two>
```

### Choose agents and scope

By default skills are installed into the current project. Use `-g` to install them for your user account across all projects, and `-a` to target specific agents:

```bash
# Global install for Claude Code only
npx skills add danielhall/agent-skills --skill <skill-name> -g -a claude-code

# Every skill, every detected agent, no prompts
npx skills add danielhall/agent-skills --all
```

| Flag | What it does |
| ---- | ------------ |
| `-l, --list` | List the skills in the repo without installing |
| `-s, --skill <names…>` | Install specific skills (`'*'` for all) |
| `-a, --agent <agents…>` | Target specific agents, e.g. `claude-code`, `cursor` (`'*'` for all) |
| `-g, --global` | Install to your user directory instead of the project |
| `-y, --yes` | Skip confirmation prompts (useful in CI) |
| `--copy` | Copy files instead of symlinking them |
| `--all` | Shorthand for `--skill '*' --agent '*' -y` |

### Update or remove

```bash
npx skills list                 # show installed skills
npx skills update               # pull the latest version of installed skills
npx skills remove <skill-name>  # uninstall a skill
```

See the [`skills` CLI README](https://github.com/vercel-labs/skills) for the full command reference.

### Manual installation

Skills are plain folders, so you can also copy one into your agent's skills directory yourself. For Claude Code:

```bash
git clone https://github.com/danielhall/agent-skills.git
cp -r agent-skills/skills/<skill-name> ~/.claude/skills/        # personal
cp -r agent-skills/skills/<skill-name> .claude/skills/          # project
```

Other agents use their own directory; check your agent's documentation.

## Repository structure

```
agent-skills/
├── README.md
├── CONTRIBUTING.md          # How to write and name a skill
├── .github/                 # CI workflows and Dependabot
├── scripts/check-repo.mjs   # README and typography checks run in CI
├── commitlint.config.mjs    # Commit message rules
├── lychee.toml              # Link checker config
├── skills/                  # One folder per skill; the CLI discovers these
│   └── <skill-name>/
│       ├── SKILL.md         # Required: frontmatter + instructions
│       ├── scripts/         # Optional: executable helpers the skill calls
│       ├── references/      # Optional: longer docs loaded only when needed
│       └── assets/          # Optional: templates, schemas, example files
└── template/
    └── SKILL.md             # Starting point for new skills
```

Every skill sits directly under `skills/`, with no category folders. Related skills are grouped by a shared name prefix instead, so moving a skill to a different group never changes its path.

## Naming conventions

Skill names follow the pattern `<area>-<task>`, all lowercase with hyphens. Putting the area first means related skills sort next to each other.

| Good | Why |
| ---- | --- |
| `git-commit-messages` | Clear area, clear task |
| `react-component-review` | Says exactly what the agent will do |

| Avoid | Why |
| ----- | --- |
| `helper`, `utils`, `misc` | Says nothing about when to use it |
| `GitCommits`, `git_commits` | Spec allows only lowercase letters, numbers and hyphens |
| `claude-git-commits` | Skills are agent-agnostic; don't name the agent |
| `git-commit-messages-v2` | Use git history for versions, not the name |

Rules from the [Agent Skills spec](https://agentskills.io/specification):

- 1 to 64 characters, using only `a-z`, `0-9` and `-`
- No leading, trailing or consecutive hyphens
- The folder name must match the `name` field in `SKILL.md`

Current area prefixes (add new ones as needed, and list them here):

| Prefix | For |
| ------ | --- |
| `code-` | How code itself is written: style, comments, structure |
| `dotnet-` | .NET and C# projects |
| `figma-` | Figma files: building designs from code, design systems, design-to-code |
| `git-` | Commits, branches and other version control work |
| `media-` | Downloading and processing audio, video and images |
| `nextjs-` | Next.js apps |
| `web-` | Websites in general, whatever the framework |
| `writing-` | Prose for people to read: docs, posts, UI text |

See [CONTRIBUTING.md](CONTRIBUTING.md) for how to write a new skill.

## License

_TBD_
