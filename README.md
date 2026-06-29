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
├── Dockerfile                   # non-root user, HEALTHCHECK
├── .dockerignore
└── .gitignore
```

## Prerequisites

- A GitHub account and this repo pushed to it
- A [DockerHub](https://hub.docker.com) account
- Node.js 18+ installed locally (only needed to run the app outside Docker)
- Git, and optionally the GitHub CLI (`gh`) — CLI steps below are optional,
  the GitHub UI works fine too

---

## Step-by-Step Execution Guide

Follow these in order. Each step has a ✅ check — confirm it before moving on.

### Step 1 — Get the files onto your machine

```bash
unzip nodejs-demo-app.zip
cd nodejs-demo-app
ls -la
```
✅ You should see `server.js`, `package.json`, `Dockerfile`,
`.github/workflows/main.yml`, and this `README.md`.

### Step 2 — Sanity-check the app locally (recommended)

```bash
npm install
npm test
```
✅ Expect `Tests: 2 passed, 2 total`. If this fails, stop and fix it
before touching GitHub.

```bash
npm start
```
In a second terminal:
```bash
curl http://localhost:3000/health
```
✅ Returns `{"status":"healthy"}`. Then `Ctrl+C` to stop the server.

### Step 3 — Create the GitHub repo

**Console**
1. github.com → **New repository**
2. Name: `nodejs-demo-app`
3. Do **not** initialize with a README (you already have one)
4. Create repository

**CLI** (also wires the remote — skip the console part above and the
`remote add` line in Step 4 if you use this)
```bash
gh repo create nodejs-demo-app --public --source=. --remote=origin
```

### Step 4 — Push your code

```bash
git init
git add .
git commit -m "Initial commit: Node.js app + CI/CD pipeline"
git branch -M main
git remote add origin https://github.com/<your-username>/nodejs-demo-app.git
git push -u origin main
```

✅ Refresh the repo page on GitHub — your files should be there. Click
the **Actions** tab — a workflow run will appear and fail (no secrets
yet). That's expected — continue.

### Step 5 — Create a DockerHub access token

1. Log into hub.docker.com
2. **Account Settings → Security → New Access Token**
3. Name: `github-actions-nodejs-demo`, permissions: **Read & Write**
4. Copy the token immediately — DockerHub shows it only once

### Step 6 — Add the two secrets to your GitHub repo

The pipeline needs `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN`. Without
these, `build-and-push` fails at the login step.

**Console**
Repo → **Settings → Secrets and variables → Actions → New repository
secret** — add both:

| Name | Value |
|---|---|
| `DOCKERHUB_USERNAME` | your DockerHub username |
| `DOCKERHUB_TOKEN` | the token from Step 5 |

**CLI**
```bash
gh secret set DOCKERHUB_USERNAME --body "<your-dockerhub-username>"
gh secret set DOCKERHUB_TOKEN --body "<your-dockerhub-token>"
```

✅ `gh secret list` shows both names (values stay masked — that's normal).

### Step 7 — Trigger the pipeline for real

```bash
git commit --allow-empty -m "Trigger pipeline with secrets configured"
git push origin main
```
Open the **Actions** tab and watch it run.

✅ Three jobs run in sequence and turn green: **test** →
**build-and-push** → **deploy**. If `test` passes but `build-and-push`
fails, check the Troubleshooting table below — almost always a secret
name typo or a token scope issue.

### Step 8 — Verify the image landed on DockerHub

hub.docker.com → your repositories → `nodejs-demo-app`.

✅ Two tags present: `latest` and a long commit SHA.

### Step 9 — Pull and run the image, end to end

```bash
docker pull <your-dockerhub-username>/nodejs-demo-app:latest
docker run -p 3000:3000 <your-dockerhub-username>/nodejs-demo-app:latest
curl http://localhost:3000/health
```
✅ Same healthy response as Step 2 — but now served from the image
GitHub Actions itself built and pushed. The loop is closed.

### Step 10 — Prove the PR safety guard (optional, good for a demo)

```bash
git checkout -b feature/test-branch
git commit --allow-empty -m "test PR-only trigger"
git push origin feature/test-branch
```
Open a PR into `main` on GitHub.

✅ Only the **test** job runs; `build-and-push` and `deploy` are
skipped. This proves the `if:` guard stops an untrusted branch from
publishing an image.

---

## Verification checklist

- [ ] Repo pushed to GitHub with `.github/workflows/main.yml` present
- [ ] `DOCKERHUB_USERNAME` and `DOCKERHUB_TOKEN` secrets added
- [ ] A push to `main` shows three green jobs: `test` → `build-and-push` → `deploy`
- [ ] Image appears on DockerHub with `latest` and a commit-SHA tag
- [ ] `docker pull ... && docker run ...` works locally from the pushed image
- [ ] A PR into `main` runs **only** the `test` job (confirms the `if:` guard)

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| `build-and-push` fails at "Log in to DockerHub" | Secret name typo or missing secret | Re-check exact names: `DOCKERHUB_USERNAME`, `DOCKERHUB_TOKEN` |
| `denied: requested access to the resource is denied` on push | Token scope is Read-only, or username/repo mismatch | Recreate token with **Read & Write**; confirm `IMAGE_NAME` matches your DockerHub namespace |
| `test` job fails on `npm ci` | No `package-lock.json` committed, or lockfile out of sync with `package.json` | Run `npm install` locally once, commit the resulting `package-lock.json` |
| Workflow doesn't trigger at all | Pushed to a branch other than `main`, or workflow file not under `.github/workflows/` | Confirm branch name and exact path |
| `build-and-push` / `deploy` skipped on a `main` push | `if:` condition only matches `push` events — `pull_request` events are intentionally excluded | Expected; merge to `main` to trigger the full chain |
| Container exits immediately | App crashed on start (check `PORT` env var, missing deps) | `docker logs <container_id>`; rebuild after `npm ci --omit=dev` succeeds |


## Key CI/CD concepts to remember

- **Why separate `test` from `build-and-push`**: fail fast — never build
  or publish an image from code that doesn't pass its own tests.
- **Why gate on `github.event_name == 'push'`**: explicitly excluding PRs
  from the build/push/deploy stages is the clear, auditable way to keep
  untrusted branches from publishing images or touching secrets.
- **Why tag with both `latest` and the commit SHA**: `latest` is
  convenient, but only the SHA tag gives you an immutable, traceable
  artifact — the difference between "deploy the newest thing" and
  "deploy exactly this commit."
- **Why `npm ci` instead of `npm install` in CI**: `ci` installs strictly
  from the lockfile and fails if `package.json`/`package-lock.json` are
  out of sync — deterministic builds, no surprise version drift.
- **Why a non-root `USER node` in the Dockerfile**: defense in depth — if
  the app is compromised, the attacker doesn't get root inside the
  container.
