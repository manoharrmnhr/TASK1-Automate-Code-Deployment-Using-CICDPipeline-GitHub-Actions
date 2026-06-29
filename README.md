# nodejs-demo-app — CI/CD Pipeline with GitHub Actions & Docker

A minimal Node.js (Express) web app wired to a GitHub Actions pipeline that
automatically **tests → builds → pushes** a Docker image to DockerHub on
every push to `main`. Includes a placeholder deploy job you can point at
any host.

## Architecture

```
 Developer
    │  git push main
    ▼
┌─────────────────────────────────────────────────────────────────┐
│                      GitHub Actions (CI/CD)                     │
│                                                                   │
│   ┌──────────┐      ┌────────────────┐      ┌─────────────┐     │
│   │   test   │ ───▶ │ build-and-push │ ───▶ │   deploy    │     │
│   │ npm ci   │      │ docker build   │      │ (placeholder│     │
│   │ npm test │      │ docker push    │      │  / EC2 SSH) │     │
│   └──────────┘      └────────┬───────┘      └──────┬──────┘     │
└────────────────────────────────┼─────────────────────┼──────────┘
                                 ▼                       ▼
                          ┌─────────────┐         ┌─────────────┐
                          │  DockerHub  │ ───────▶ │  Host / EC2 │
                          │  (registry) │  pull    │  (runtime)  │
                          └─────────────┘         └─────────────┘
```

* **`test`** runs on every push *and* every PR into `main` — catches
  breakage before anything is built.
* **`build-and-push`** only runs on an actual push to `main` (not on PRs),
  and only after `test` passes. Pushes two tags: `latest` and the commit
  SHA, so you can always trace an image back to the exact commit.
* **`deploy`** is a placeholder — swap in the commented EC2/SSH block (or
  ECS, App Runner, a plain VM, etc.) once you have a target host.

## Repo structure

```
nodejs-demo-app/
├── .github/workflows/main.yml   # the CI/CD pipeline
├── server.js                    # Express app (/ and /health routes)
├── server.test.js               # Jest + Supertest tests
├── package.json
├── package-lock.json
├── Dockerfile                   # multi-stage-style, non-root user, HEALTHCHECK
├── .dockerignore
└── .gitignore
```

## Prerequisites

- A GitHub account and a new (or existing) repo
- A [DockerHub](https://hub.docker.com) account
- Node.js 18+ installed locally (only needed if you want to run the app
  outside Docker)
- Git and the GitHub CLI (`gh`) installed locally — CLI steps below are
  optional; the GitHub UI works fine too

## Setup

### 1. Push this repo to GitHub

**Console (GitHub UI)**
1. Create a new empty repo on GitHub (no README/license, to avoid
   merge conflicts).
2. From this project folder:
   ```bash
   git init
   git add .
   git commit -m "Initial commit: Node.js app + CI/CD pipeline"
   git branch -M main
   git remote add origin https://github.com/<your-username>/nodejs-demo-app.git
   git push -u origin main
   ```

**CLI (`gh`)**
```bash
gh repo create nodejs-demo-app --public --source=. --remote=origin --push
```

### 2. Create a DockerHub access token

1. DockerHub → **Account Settings → Security → New Access Token**.
2. Name it something like `github-actions-nodejs-demo`, scope:
   **Read & Write**. Copy the token — it's shown only once.

### 3. Add the two required secrets to your GitHub repo

The pipeline needs `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`. Without
these, the `build-and-push` job will fail at the login step.

**Console (GitHub UI)**
Repo → **Settings → Secrets and variables → Actions → New repository
secret** → add both:
| Name | Value |
|---|---|
| `DOCKERHUB_USERNAME` | your DockerHub username |
| `DOCKERHUB_TOKEN` | the access token from step 2 |

**CLI (`gh`)**
```bash
gh secret set DOCKERHUB_USERNAME --body "<your-dockerhub-username>"
gh secret set DOCKERHUB_TOKEN --body "<your-dockerhub-token>"
```

### 4. Trigger the pipeline

Push any change to `main` (or merge a PR into it):
```bash
git commit --allow-empty -m "Trigger pipeline"
git push origin main
```
Watch it run under the repo's **Actions** tab.

## Run it locally (optional, before pushing)

```bash
npm install
npm test                 # should show 2 passed
npm start                # serves on http://localhost:3000

# Docker
docker build -t nodejs-demo-app .
docker run -p 3000:3000 nodejs-demo-app
curl http://localhost:3000/health
```
> Verified in this environment: `npm install` and `npm test` were run
> end-to-end here and both pass cleanly (2/2 tests). Docker wasn't
> available in this sandbox to test-build the image, so do a local
> `docker build` once before your first push, just to confirm.

## Verification checklist

- [ ] Repo pushed to GitHub with `.github/workflows/main.yml` present
- [ ] `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets added
- [ ] A push to `main` shows three green jobs in the **Actions** tab:
      `test` → `build-and-push` → `deploy`
- [ ] Image appears on DockerHub at `<username>/nodejs-demo-app` with
      `latest` and a commit-SHA tag
- [ ] `docker pull <username>/nodejs-demo-app:latest && docker run -p 3000:3000 <username>/nodejs-demo-app` works locally
- [ ] Opening a PR (not pushing directly to main) runs **only** the
      `test` job — confirms the `if:` guard on the later jobs works

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `build-and-push` fails at "Log in to DockerHub" | Secret name typo or missing secret | Re-check exact names: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` |
| `denied: requested access to the resource is denied` on push | Token scope is Read-only, or username/repo mismatch | Recreate token with **Read & Write**; confirm `IMAGE_NAME` matches your DockerHub namespace |
| `test` job fails on `npm ci` | No `package-lock.json` committed, or lockfile out of sync with `package.json` | Run `npm install` locally once, commit the resulting `package-lock.json` |
| Workflow doesn't trigger at all | Pushed to a branch other than `main`, or workflow file not under `.github/workflows/` | Confirm branch name and exact path |
| `build-and-push` / `deploy` skipped even on a `main` push | `if:` condition checks `github.event_name == 'push'` — this also runs on `pull_request` events, which are intentionally excluded | Expected behavior for PRs; merge to `main` to trigger the full chain |
| Container exits immediately | App crashed on start (check `PORT` env var, missing deps) | `docker logs <container_id>`; rebuild after `npm ci --omit=dev` step succeeds |

## Cost notes

- **GitHub Actions**: free for public repos; private repos on the Free
  plan get 2,000 minutes/month — this pipeline runs in well under a
  minute per push, so cost is a non-issue at this scale.
- **DockerHub**: free tier allows unlimited public repositories; private
  repos and pull-rate limits apply on the free tier if you go private or
  pull very frequently from CI.
- No AWS resources are provisioned by this pipeline itself — cost only
  enters the picture once you wire up the `deploy` job to a real host
  (e.g., an EC2 instance you're already running for the AWS module work).

## Cleanup

- DockerHub: delete the `nodejs-demo-app` repository from your namespace
  if you no longer need the images.
- GitHub: remove the two repo secrets (Settings → Secrets and variables →
  Actions) if you're decommissioning the pipeline, or delete the repo
  entirely.
- Local: `docker rmi nodejs-demo-app` and `docker system prune` to
  reclaim disk space from test builds.

## Key CI/CD concepts to remember

- **Why separate `test` from `build-and-push`**: fail fast — never build
  or publish an image from code that doesn't pass its own tests.
- **Why gate on `github.event_name == 'push'`**: PRs from forks could
  otherwise exfiltrate your DockerHub secrets or publish untrusted
  images — `pull_request` events from forks don't get secrets by default
  in GitHub Actions, but explicitly gating is the clearer, safer pattern.
- **Why tag with both `latest` and the commit SHA**: `latest` is
  convenient, but only the SHA tag gives you an immutable, traceable
  artifact — this is the difference between "deploy the newest thing"
  and "deploy exactly this commit."
- **Why `npm ci` instead of `npm install` in CI**: `ci` installs strictly
  from the lockfile and fails if `package.json`/`package-lock.json` are
  out of sync — deterministic builds, no surprise version drift.
- **Why a non-root `USER node` in the Dockerfile**: defense in depth — if
  the app is compromised, the attacker doesn't get root inside the
  container.
