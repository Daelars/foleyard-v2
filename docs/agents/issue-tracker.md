# Issue tracker: GitHub

Issues and specs live in GitHub Issues for `Daelars/foleyard-v2`. Use the `gh` CLI from this repository.

## Operations

- Create: `gh issue create --title "..." --body-file <file>`
- Read: `gh issue view <number> --comments`
- List: `gh issue list --state open --json number,title,body,labels`
- Comment: `gh issue comment <number> --body-file <file>`
- Close: `gh issue close <number> --comment "..."`
- Label: `gh issue edit <number> --add-label "..."`

## Publishing

When a skill says "publish to the issue tracker", create a GitHub issue. When a skill says "fetch the relevant ticket", read the issue and its comments.

## Dependencies

Use GitHub's native issue dependencies where available. Otherwise place `Blocked by: #<number>` at the top of the dependent issue.

## Pull requests

PRs as a request surface: no.
