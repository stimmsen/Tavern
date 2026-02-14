## What is Tavern?

Tavern is a **voice-first communication platform** that's open-source, decentralized, and built for people who want to own their infrastructure.

- **Click a link → you're talking.** No signup. No email. No friction.
- **P2P by default.** Small groups connect directly via WebRTC mesh. No server in the middle.
- **Self-hostable.** Run the whole stack with `docker-compose up`.
- **Desktop app.** Native Tauri app for macOS, Windows, and Linux.
- **Open-source forever.** AGPLv3. Community-driven. No data harvesting.

If Tavern-the-company disappears tomorrow, the network keeps running.

---

## Features

| Feature | Status |
|---|---|
| P2P voice (WebRTC + Opus) | ✅ Done |
| Push-to-talk & voice activity detection | ✅ Done |
| RNNoise suppression (Krisp-quality, open-source) | ✅ Done |
| Ed25519 identity + token file backup/restore | ✅ Done |
| Tavern creation & voice channels | ✅ Done |
| Multi-server sidebar (join multiple Taverns) | ✅ Done |
| Multi-peer mesh (≤8 participants) | ✅ Done |
| Desktop app (Tauri — macOS, Windows, Linux) | ✅ Done |
| System tray, global PTT hotkey, audio device selection | ✅ Done |
| Per-user volume controls | ✅ Done |
| 3 built-in themes (dark, light, retro) + community skins | ✅ Done |
| SQLite persistence (Tavern state survives restarts) | ✅ Done |
| Self-hosting via Docker + coturn | ✅ Done |
| Architecture & self-hosting docs | ✅ Done |
| End-to-end encryption (MLS) | ⚪ Planned |
| Invite via QR code | ⚪ Planned |
| Spatial audio for gaming/hangouts | ⚪ Planned |
| Text chat (Matrix-compatible) | ⚪ Phase 2 |
| Screen sharing & video | ⚪ Phase 3 |
| Bot/plugin API | ⚪ Phase 3 |

---

## Quick Start (Users)

### Desktop App

Download the latest release for your platform:

- **macOS** — `.dmg`
- **Windows** — `.msi`
- **Linux** — `.AppImage` / `.deb`

> Releases coming soon. For now, build from source (see [Development](#development)).

### Web Client

Open the web client in your browser and connect to any signaling server.

---

## Self-Hosting

Run your own Tavern signaling server + TURN relay with one command:

```

git clone https://github.com/stimmsen/Tavern.git

cd Tavern/docker

docker-compose up -d

```

That's it. Your signaling server is live on port `3001` with SQLite persistence and a coturn TURN relay.

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `TAVERN_STORE` | Persistence backend (`memory` or `sqlite`) | `sqlite` |
| `TAVERN_DB_PATH` | SQLite database file path | `/data/tavern.db` |
| `TAVERN_PORT` | Signaling server port | `3001` |
| `TAVERN_TURN_SECRET` | Shared secret for TURN auth | (required) |
| `TAVERN_DOMAIN` | Domain for TLS/certs (optional for local dev) | — |

### Health Check

```

curl http://localhost:3001/health

# {"status":"ok","taverns":0}

```

See docs/self-hosting.md for the full guide — TLS setup, nginx reverse proxy, firewall rules, backups, and troubleshooting.

---

## Development

### Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org/)
- **Rust toolchain** — [rustup.rs](https://rustup.rs/)
- **Tauri CLI** — `cargo install tauri-cli`

### Run Locally

```

# Clone the repo

git clone https://github.com/stimmsen/Tavern.git

cd Tavern

# Install dependencies

npm install

# Start the signaling server

npm run dev --workspace=packages/signaling-server

# In another terminal — start the web client

npm run dev --workspace=packages/client-desktop

```

### Run the Desktop App

```

# From the monorepo root

cargo tauri dev

```

---

## Architecture

```

┌─────────────────────────────────────┐

│           Client Layer              │

│  Desktop (Tauri) • Web • Mobile     │

└──────────────┬──────────────────────┘

│

┌──────────────▼──────────────────────┐

│          Protocol Layer             │

│  WebRTC Voice • Ed25519 Identity    │

│  WebSocket Signaling                │

└──────────────┬──────────────────────┘

│

┌──────────────▼──────────────────────┐

│       Infrastructure Layer          │

│  Signaling Server • coturn (TURN)   │

│  SQLite Persistence                 │

└─────────────────────────────────────┘

```

### How Routing Works

| Group Size | Method | Cost |
|---|---|---|
| ≤8 peers | Direct P2P (WebRTC mesh) | Free forever |
| NAT issues | TURN relay (coturn, self-hosted) | Free (self-host) |
| Large groups | SFU architecture | Phase 2+ |

### Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Voice transport | WebRTC | P2P, low latency, battle-tested |
| Audio codec | Opus | Low latency, high quality |
| Signaling | WebSocket (Node.js) | Simple, reliable |
| Desktop client | Tauri v2 (Rust + web) | ~10x lighter than Electron |
| Noise suppression | RNNoise (@shiguredo/rnnoise-wasm) | Open-source, runs locally |
| Identity | Ed25519 keypairs | No email/password required; portable |
| Persistence | SQLite (better-sqlite3) | Tavern state survives restarts |
| Bundler | esbuild | Fast builds |
| Encryption | MLS (planned) | Group E2EE, IETF standard |

### Audio Pipeline

**Outbound:** `getUserMedia` → `AudioContext` → NoiseSuppressor → `MediaStreamDestination` → `RTCPeerConnection`

**Inbound:** `MediaStream` → `MediaStreamSource` → `AnalyserNode` (speaking indicator) → `GainNode` (per-user volume) → `MediaStreamDestination` → `<audio>` element

### Project Structure

```

Tavern/

├── packages/

│   ├── signaling-server/    # Node.js WebSocket signaling + TavernStore

│   ├── voice-engine/        # WebRTC + Opus + RNNoise

│   ├── crypto/              # Ed25519 identity, key export/import

│   ├── client-desktop/      # Tauri v2 app shell + web UI

│   └── shared/              # Shared types, utils, constants

├── docker/

│   ├── Dockerfile.signaling

│   └── docker-compose.yml

├── docs/

│   ├── self-hosting.md

│   └── architecture.md

├── .github/workflows/

├── LICENSE                  # AGPLv3

├── README.md

└── CONTRIBUTING.md

```

See docs/architecture.md for the full deep-dive — signaling protocol, identity system, persistence layers, and theming.

---

## Roadmap

### Phase 1 — Voice MVP ✅
- ✅ WebRTC voice engine with Opus
- ✅ P2P connections with STUN/TURN fallback
- ✅ Tavern creation + voice channels + invite links
- ✅ Ed25519 identity + token file backup/restore
- ✅ Multi-server sidebar
- ✅ Desktop app (Tauri v2 — macOS, Windows, Linux)
- ✅ RNNoise noise suppression
- ✅ 3 built-in themes + community skin loading
- ✅ SQLite persistence + Docker self-hosting
- ✅ Architecture & self-hosting documentation
- ⬜ E2EE via MLS
- ⬜ Testing & hardening

### Phase 2 — Text + Federation
- Encrypted text chat (Matrix-compatible)
- Federation between self-hosted instances
- Roles and permissions
- Mobile app (beta)
- Seed phrase recovery (BIP-39)

### Phase 3 — Rich Features
- Screen sharing and video
- Bot/plugin API (open, self-hostable)
- Custom emoji and reactions
- Thread support
- Community skin gallery

### Phase 4 — Scale + Ecosystem
- Plugin marketplace
- Enterprise features (SSO, audit, compliance)
- Localization / i18n
- Public relay node incentive program

---

## Contributing

We'd love your help! Check out CONTRIBUTING.md for:

- Development setup
- Branching strategy (`main` / `develop` / `feat/*` / `fix/*`)
- Commit conventions (Conventional Commits)
- PR guidelines
- Code style (TypeScript strict, Rust for Tauri/crypto)

---

## Why Tavern?

> **"Pull up a chair. Own the room."**

- **No signup.** Click a link and talk.
- **No tracking.** No ads. No data sales. Ever.
- **Your choice.** Self-host or use managed infrastructure.
- **Community-built.** Open-source means you build what you need — not what a PM decided ships this quarter.

---

## License

Tavern is licensed under the **GNU Affero General Public License v3.0** (AGPLv3).

See [`LICENSE`](LICENSE) for details.
Pull up a chair. Let's build something great. 🍺
