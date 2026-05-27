# Issue tracker: GitHub

Issues and PRDs for this repo live as GitHub issues. Use the `gh` CLI for all operations.

> **Repo state (2026-05-26):** CIC is not yet a git repo. The planned GitHub home is `CryerWorks/CIC` (per the war-room-2026 pattern). All `gh` commands below begin working once the repo is initialised and pushed:
>
> ```
> git init
> gh repo create CryerWorks/CIC --private --source=. --remote=origin
> git push -u origin main
> ```
>
> Until that's done, skills that try to call `gh` will fail loudly — treat that as the intended signal to set up the repo, not as a bug.

## Conventions

- **Create an issue**: `gh issue create --title "..." --body "..."`. Use a heredoc for multi-line bodies.
- **Read an issue**: `gh issue view <number> --comments`, filtering comments by `jq` and also fetching labels.
- **List issues**: `gh issue list --state open --json number,title,body,labels,comments --jq '[.[] | {number, title, body, labels: [.labels[].name], comments: [.comments[].body]}]'` with appropriate `--label` and `--state` filters.
- **Comment on an issue**: `gh issue comment <number> --body "..."`
- **Apply / remove labels**: `gh issue edit <number> --add-label "..."` / `--remove-label "..."`
- **Close**: `gh issue close <number> --comment "..."`

Infer the repo from `git remote -v` — `gh` does this automatically when run inside a clone.

## When a skill says "publish to the issue tracker"

Create a GitHub issue.

## When a skill says "fetch the relevant ticket"

Run `gh issue view <number> --comments`.
