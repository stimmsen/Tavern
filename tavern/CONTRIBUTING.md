```markdown
# Contributing to Tavern

First off - thanks for wanting to contribute to Tavern! 
Whether it's a bug fix, a feature, docs, or just an idea - you're welcome here.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Development Setup](#development-setup)
- [Branching Strategy](#branching-strategy)
- [Making Changes](#making-changes)
- [Commit Messages](#commit-messages)
- [Pull Request Guidelines](#pull-request-guidelines)
- [Code Style](#code-style)
- [Testing](#testing)
- [Reporting Bugs](#reporting-bugs)
- [Suggesting Features](#suggesting-features)
- [License](#license)

---

## Code of Conduct

Be kind. Be respectful. We're building something for everyone.
Harassment, discrimination, and toxicity have no place here.
Full CoC coming soon - for now, follow the [Contributor Covenant](https://www.contributor-covenant.org/).

---

## Getting Started

1. **Fork** the repository
2. **Clone** your fork locally
3. **Create a branch** from `develop` (see [Branching Strategy](#branching-strategy))
4. **Make your changes**
5. **Push** to your fork and **open a Pull Request** against `develop`

---

## Project Structure

```

tavern/

├── packages/

│   ├── signaling-server/    # Node.js WebSocket signaling server

│   ├── voice-engine/        # WebRTC + Opus voice transport

│   ├── crypto/              # MLS / Noise encryption layer

│   ├── client-desktop/      # Tauri desktop app shell

│   └── shared/              # Shared types, utils, constants

├── docker/

│   ├── Dockerfile.signaling

│   └── docker-compose.yml

├── docs/                    # Project documentation

├── .github/

│   └── workflows/           # CI/CD (GitHub Actions)

├── LICENSE                  # AGPLv3

├── README.md

└── CONTRIBUTING.md

```

---

## Development Setup

### Prerequisites

- **Node.js 20+** — [Download](https://nodejs.org/)
- **Rust toolchain** — [Install via rustup](https://rustup.rs/)
- **Tauri CLI** — `cargo install tauri-cli`
- **Docker** (optional, for self-hosting / integration tests)

### Install & Run

```

# Clone and enter the repo

git clone https://github.com/<your-fork>/tavern.git

cd tavern

# Install dependencies

npm install

# Run the signaling server (dev mode)

npm run dev --workspace=packages/signaling-server

# Run the desktop client (dev mode)

npm run dev --workspace=packages/client-desktop

```

### Verify Your Setup

Open two browser tabs pointing at the local dev client. If you can hear yourself - you're good.

---

## Branching Strategy

| Branch      | Purpose                                      |
|-------------|----------------------------------------------|
| `main`      | Stable releases only. Protected.             |
| `develop`   | Integration branch. All PRs target this.     |
| `feat/*`    | New features (e.g. `feat/spatial-audio`)     |
| `fix/*`     | Bug fixes (e.g. `fix/ice-restart-crash`)     |
| `docs/*`    | Documentation changes                        |
| `chore/*`   | Tooling, CI, refactors, dependency updates   |

**Rules:**
- Never push directly to `main` or `develop`.
- All changes go through a PR.
- `main` is updated via release merges from `develop`.

---

## Making Changes

1. Always branch from `develop`:
```

git checkout develop

git pull origin develop

git checkout -b feat/my-feature

```
2. Keep changes focused — one feature or fix per PR.
3. If your change touches multiple packages, note that in the PR description.

---

## Commit Messages

We use **Conventional Commits**:

```

<type>(<scope>): <short description>

[optional body]

[optional footer]

```

### Types

| Type       | When to use                          |
|------------|--------------------------------------|
| `feat`     | A new feature                        |
| `fix`      | A bug fix                            |
| `docs`     | Documentation only                   |
| `style`    | Formatting, no code change           |
| `refactor` | Code change that neither fixes nor adds |
| `test`     | Adding or updating tests             |
| `chore`    | Build, CI, tooling, dependencies     |

### Scopes

Use the package name: `signaling`, `voice`, `crypto`, `desktop`, `shared`, `docker`, `ci`

### Examples

```

feat(signaling): add room capacity limit

fix(voice): handle ICE restart on network change

docs: update self-hosting guide for coturn config

chore(ci): add Node 22 to test matrix

```

---

## Pull Request Guidelines

### Before Submitting

- [ ] Your branch is up to date with `develop`
- [ ] All existing tests pass (`npm test`)
- [ ] New code has tests where applicable
- [ ] Linting passes (`npm run lint`)
- [ ] Build succeeds (`npm run build`)

### PR Description

Include:
- **What** changed and **why**
- **How** to test it (steps to reproduce or verify)
- **Screenshots** if there's a UI change
- Link to a related **issue** if one exists

### Review Process

- At least **1 approval** required before merge.
- CI must pass (lint + build + test).
- Squash merge into `develop` is preferred for clean history.

---

## Code Style

- **Language:** TypeScript (strict mode) for all Node.js / web packages. Rust for Tauri and crypto.
- **Linter:** ESLint with the project config — run `npm run lint` before committing.
- **Formatter:** Prettier is configured. Format on save is recommended.
- **Naming:**
  - `camelCase` for variables and functions
  - `PascalCase` for classes and types
  - `SCREAMING_SNAKE_CASE` for constants
  - `kebab-case` for file and folder names
- **Comments:** Explain *why*, not *what*. Code should be self-documenting where possible.
- **No `any`** - seriously.

---

## Testing

```

# Run all tests

npm test

# Run tests for a specific package

npm test --workspace=packages/signaling-server

# Run linting

npm run lint

```

- Unit tests live alongside the code they test (`*.test.ts`).
- Integration tests live in a top-level `tests/` directory (Playwright for browser-based voice tests).
- If you add a feature, add a test. If you fix a bug, add a regression test.

---

## Reporting Bugs

Open an issue with:

- **Title:** Short, descriptive summary
- **Environment:** OS, browser/app version, Node version
- **Steps to reproduce**
- **Expected behavior** vs. **actual behavior**
- **Logs / screenshots** if available

Label it `bug`.

---

## Suggesting Features

Open an issue with:

- **Title:** `[Feature] Short description`
- **Problem:** What's missing or frustrating?
- **Proposed solution:** How should it work?
- **Alternatives considered** (if any)

Label it `enhancement`. Discussion happens in the issue before any code is written.

---

## License

By contributing to Tavern, you agree that your contributions will be licensed under the **AGPLv3** license.

---

**Pull up a chair. Let's build something great.** 
```