// Conventional Commits, matching skills/git-commit-messages.
// subject-case is off because commitlint can't allow capitals only for names and abbreviations.
export default {
  extends: ["@commitlint/config-conventional"],
  rules: {
    "header-max-length": [2, "always", 72],
    "subject-case": [0],
    "subject-full-stop": [2, "never", "."],
    // Off so Dependabot's long URL lines don't fail the check.
    "body-max-line-length": [0],
    "footer-max-line-length": [0],
  },
};
