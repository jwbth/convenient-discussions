---
name: release
description: Publish a CD release on GitHub, which deploys it to the wikis. Use when the user says to release.
---

Publishing a GitHub release triggers [`prod-build.yml`](../../../.github/workflows/prod-build.yml), which builds, tests, and deploys to the wikis. `deploy.js` takes the version from the release's tag for its edit summaries.

1. `git pull --rebase --autostash origin main`: Translatewiki pushes localisation commits to `origin`. Resolve trivial conflicts yourself; on a non-trivial one, stop and ask the user. Then `git push origin main`.
2. Find the previous release: `gh release list --limit 1 --json tagName -q '.[0].tagName'`.
3. Pick the version: minor bump if `git log <prev>..HEAD` has any `feat` commit, patch bump otherwise. If any commit is breaking (`!` before the colon, or `BREAKING CHANGE` in the body), stop and ask the user.
4. Create the release on the pushed commit, title equal to the tag:

   ```sh
   gh release create <new> --target <HEAD SHA> --title <new> --notes-file <file>
   ```

   Notes list every `feat`, `fix`, and `ui` commit since the previous release (oldest first, each type in its own section, an empty section omitted), then the diff link:

   ```md
   Feature commits:
   - [feat(form): add programmatic autosubmit](https://github.com/jwbth/convenient-discussions/commit/<full SHA>)

   Fix commits:
   - [fix(form): …](https://github.com/jwbth/convenient-discussions/commit/<full SHA>)

   UI commits:
   - [ui(form): …](https://github.com/jwbth/convenient-discussions/commit/<full SHA>)

   **Full Changelog**: https://github.com/jwbth/convenient-discussions/compare/<prev>...<new>
   ```

5. `git fetch --tags origin`.
6. Watch the deploy run: get its ID with `gh run list --workflow prod-build.yml --event release --limit 1 --json databaseId,headSha` (confirm `headSha` is the released commit; the run may take a few seconds to appear), then run `gh run watch <id> --exit-status` in the background. The run takes about 2 minutes.
7. Report the release URL and the run's outcome. On failure, include the failed step and its log tail (`gh run view <id> --log-failed`). On success, quote the per-page deploy results, as a code block, from `gh run view <id> --log | rg -o '(Successfully edited|No changes in) .*'`, and link https://en.wikipedia.org/wiki/Project:Village_pump_(technical), where the user tests the release.
