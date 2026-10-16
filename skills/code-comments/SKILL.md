---
name: code-comments
description: Keeps code comments to a minimum. Comments are written only when the code cannot explain itself, are never longer than two lines, and longer explanations go into the /docs/ folder. Use whenever writing or editing code, adding comments or docstrings, documenting a function or module, or when the user asks to explain code in comments.
---

# Code comments

Write no comment by default. Add one only when a reader would otherwise get something wrong, and keep it to two lines at most. Anything longer goes in `/docs/`.

## Before writing a comment

Try these first, in this order:

1. **Rename.** Give the variable, function or type a name that says what it is for.
2. **Extract.** Move the tricky part into a well-named function or constant, e.g. `MAX_RETRIES = 3` instead of a bare `3` with a comment.
3. **Restructure.** Simplify the logic so it no longer needs explaining.
4. **Document.** If the explanation is about design, architecture or behaviour across several files, write it in `/docs/` (see below).

Write a comment only if none of these work.

## When a comment is allowed

A comment must explain why, never what. Good reasons:

- A workaround for a bug in a dependency, browser or external service. Link the issue.
- A constraint the code can't show: required ordering, a security or performance reason, or a limit imposed by an external API.
- Something that looks wrong but is deliberate, so nobody "fixes" it.
- A complex regex or formula that can't be made clearer with naming.
- A `TODO` that references an issue, e.g. `// TODO(#123): remove once the v1 API is retired`. Never write a `TODO` without an issue.

## Never write

- Comments that repeat what the code says (`// increment counter`).
- Comments about the change itself (`// added for new login flow`, `// fixed bug`). That belongs in the commit message.
- Commented-out code. Delete it, since git keeps the history.
- Author names, dates or changelogs.
- Section divider or banner comments.

## The two-line limit

A comment is never longer than two lines, counting every line of a block comment. If the explanation needs more room, write it in `/docs/` and leave a one-line pointer in the code:

```ts
// Retries use jittered backoff to avoid a thundering herd; see docs/payments/retries.md
```

## Documentation in /docs/

- Put docs in `/docs/` at the repository root, and create the folder if it doesn't exist.
- Organise by topic or feature, not by source file: `docs/payments/retries.md`, not `docs/src-lib-retry-ts.md`.
- Use lowercase kebab-case file names.
- Update an existing doc before creating a new one. If the repo has an index such as `docs/README.md`, add new pages to it.
- Write for someone new to the codebase: what the thing does, why it works this way, and which alternatives were rejected.

## Public API doc comments

Doc comments on exported or public functions, classes and types (JSDoc, TSDoc, Python docstrings, C# XML docs and similar) are exempt from the two-line limit, because editors show them on hover and doc generators read them.

- Use them only on the public surface, never on private or internal code.
- Start with a one-line summary.
- Describe parameters, return values and errors only when the names and types don't already make them clear.
- Put long explanations and examples in `/docs/` and link to them.

## Existing comments

When you change lines of code, fix the comments attached to those lines:

- Delete comments that repeat the code or have gone out of date.
- Trim comments longer than two lines, moving the detail into `/docs/`.
- Delete commented-out code.

Leave comments in the rest of the file alone, even if they break these rules, so the diff stays focused on the task.

Tool directives such as `eslint-disable`, `@ts-expect-error`, `# type: ignore` or `#pragma` aren't explanatory comments, so keep them where needed. Add a short reason on the same line when the tool allows it.

## Example

Before:

```python
# This function gets the user from the database.
# It takes a user id and returns the user.
# We use a cache here because the database was slow
# and the dashboard was taking 4 seconds to load.
# Added by Sam in March.
def get(id):
    ...
```

After:

```python
def get_user(user_id: str) -> User:
    # Cached because the dashboard makes ~40 lookups per render; see docs/performance/caching.md
    ...
```
