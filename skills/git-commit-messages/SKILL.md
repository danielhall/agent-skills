---
name: git-commit-messages
description: Writes git commit messages that follow the Conventional Commits 1.0.0 specification, with a lowercase subject line. Use whenever creating a git commit, writing or suggesting a commit message, amending a commit message, or when the user asks to commit changes.
---

# Git commit messages

Every commit message follows [Conventional Commits 1.0.0](https://www.conventionalcommits.org/en/v1.0.0/).

## Format

```
<type>[optional scope][!]: <description>

[optional body]

[optional footer(s)]
```

## Subject line

- Start with a type from the table below, then an optional scope in parentheses, then `: `.
- Write the subject in lowercase. Only names and abbreviations keep their usual capitals, e.g. `GitHub`, `PostgreSQL`, `API`, `README`.
- Use the imperative mood: "add", not "added" or "adds".
- Don't end it with a full stop.
- Keep the whole line within 72 characters.

| Type | Use for |
| ---- | ------- |
| `feat` | A new feature for users |
| `fix` | A bug fix |
| `docs` | Documentation only |
| `style` | Formatting or whitespace, with no change in behaviour |
| `refactor` | A code change that neither fixes a bug nor adds a feature |
| `perf` | A performance improvement |
| `test` | Adding or fixing tests |
| `build` | Build system or dependencies |
| `ci` | CI configuration and scripts |
| `chore` | Maintenance that fits none of the above |
| `revert` | Reverting an earlier commit |

If a change fits more than one type, it probably belongs in more than one commit. Suggest splitting it before committing.

### Scope

The scope is optional. When you use one, make it a short noun naming the part of the codebase that changed, e.g. `feat(auth):` or `fix(parser):`. Run `git log --oneline -n 30` and reuse scopes the repo already uses rather than inventing new ones.

## Body

Add a body only when the subject and the diff don't explain the change on their own, for example when the reason for the change isn't obvious, or there was an alternative you rejected.

- Leave one blank line after the subject.
- Write normal sentences with normal capitalisation. The lowercase rule applies to the subject only.
- Explain why the change was made, not what each line does. The diff already shows the what.
- Wrap lines at 72 characters.

## Breaking changes

Mark a breaking change with `!` before the colon, and add a `BREAKING CHANGE:` footer that tells users what to do:

```
feat(api)!: remove v1 endpoints

BREAKING CHANGE: the /v1 routes are gone. Clients must call /v2,
which accepts the same payloads.
```

`BREAKING CHANGE` must be uppercase. It is the only part of the message that is case-sensitive.

## Footers

Footers come after the body, separated by a blank line. Use `Token: value` or `Token #value`, with hyphens in place of spaces in the token:

```
Refs: #123
Reviewed-by: Name
```

Keep any trailers that the user's tools or instructions require, such as `Co-Authored-By`.

## Steps

1. Read the staged diff with `git diff --staged`. If nothing is staged, check with the user which changes to commit.
2. Pick the type, and a scope if one fits.
3. Write the subject line, then check it against the rules above.
4. Add a body or footers only if needed.
5. For multi-line messages, pass the message through a heredoc so the formatting survives:

```bash
git commit -F - <<'EOF'
fix(auth): refresh expired tokens before retrying

The retry loop reused the expired token, so every retry failed with
a 401 until the user logged in again.

Refs: #482
EOF
```

## Examples

| Good | Problem with the bad version |
| ---- | ---------------------------- |
| `feat(search): add fuzzy matching for product names` | `Feat(search): Add fuzzy matching` is capitalised |
| `fix: handle empty CSV uploads` | `fix: handled empty CSV uploads.` is past tense and ends with a full stop |
| `docs: update README install steps` | `docs: Update readme` lowercases an abbreviation and capitalises a verb |
| `chore(deps): bump React to 19.1` | `update stuff` has no type and no detail |
