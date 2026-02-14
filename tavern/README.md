<p align="center">
  <h1 align="center">Tavern</h1>
  <p align="center">
    <strong>Pull up a chair. Own the room.</strong><br>
    Open-source, peer-to-peer voice chat — encrypted, self-hostable, zero signup.
  </p>
  <p align="center">
    <a href="#features">Features</a> •
    <a href="#quick-start-users">Users</a> •
    <a href="#quick-start-self-hosting">Self-Host</a> •
    <a href="#quick-start-development">Develop</a> •
    <a href="#roadmap">Roadmap</a> •
    <a href="#contributing">Contributing</a>
  </p>
  <p align="center">
    <img src="https://img.shields.io/badge/license-AGPLv3-blue" alt="License">
    <img src="https://img.shields.io/badge/status-alpha-orange" alt="Status">
    <img src="https://img.shields.io/badge/voice-P2P%20%7C%20E2EE-green" alt="Voice">
  </p>
</p>

---

<!-- TODO: Replace with actual screenshot of the Retro theme -->
<!-- <p align="center"><img src="docs/screenshot-retro.png" width="720" alt="Tavern desktop app — retro theme"></p> -->

## Features

- **P2P Voice** — WebRTC mesh with Opus. Your audio goes directly to your friends, not through a server.
- **Noise Suppression** — RNNoise (open-source, Krisp-quality) runs locally in WASM. No cloud processing.
- **Push-to-Talk & VAD** — Hold a key to talk, or let voice activity detection handle it.
- **Zero Signup** — Ed25519 identity keypair generated on first launch. Your tag is `TVN-XXXX-XXXX`. No email. No password.
- **Taverns & Channels** — Create a Tavern, add voice channels, invite friends with a link.
- **Themes** — Dark, Light, and Retro built-in. Custom CSS themes supported.
- **Desktop App** — Tauri (Rust + web). ~10x lighter than Electron. Windows, macOS, Linux.
- **Self-Hostable** — `docker compose up -d` and you own the entire stack.
- **SQLite Persistence** — Taverns and channels survive server restarts.
- **TURN Relay** — coturn fallback for peers behind restrictive NATs.

---

## Quick Start (Users)

> **Desktop app downloads coming soon.** For now, run from source or use the web client.

Connect to any Tavern by opening an invite link — no account needed. Set a display name and start talking.

---

## Quick Start (Self-Hosting)

Run your own Tavern server with Docker:

```bash
git clone https://github.com/tavern/tavern.git
cd tavern/docker
docker compose up -d
```

Verify:

```bash
curl http://localhost:3001/health
# → {"status":"ok","taverns":0}
```

| Variable | Description | Default |
|---|---|---|
| `TAVERN_PORT` | Signaling server port | `3001` |
| `TAVERN_TURN_SECRET` | TURN auth secret (**change in production**) | `tavern-dev-secret` |
| `TAVERN_DOMAIN` | Domain for TURN realm / TLS | `localhost` |
| `TAVERN_STORE` | Persistence: `memory` or `sqlite` | `sqlite` |
| `TAVERN_DB_PATH` | SQLite file path (inside container) | `/data/tavern.db` |

Full guide: [`docs/self-hosting.md`](docs/self-hosting.md)

---

## Quick Start (Development)

### Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org/)
- **Rust toolchain** — [rustup.rs](https://rustup.rs/) (for the desktop app)
- **Tauri CLI** — `cargo install tauri-cli`

### Run Locally

```bash
# Clone the repo
git clone https://github.com/tavern/tavern.git
cd tavern

# Install dependencies
npm install

# Start the signaling server
npm run dev --workspace=packages/signaling-server

# In another terminal — start the desktop client
npm run dev --workspace=packages/client-desktop
```

Open two clients. If you can hear yourself — it's working.

---

## Tech Stack

| Component | Technology | Why |
|---|---|---|
| Voice transport | WebRTC | P2P, low-latency, battle-tested |
| Audio codec | Opus | Optimized for voice, tunable bitrate |
| Signaling | WebSocket (ws) | Simple, real-time, bidirectional |
| Noise suppression | RNNoise (WASM) | Open-source, runs locally, no cloud |
| Desktop app | Tauri (Rust + web) | ~10x lighter than Electron |
| Identity | Ed25519 | Zero-signup, cryptographic identity |
| Persistence | SQLite (better-sqlite3) | Zero-config, single-file, fast |
| Containerization | Docker + coturn | One-command self-hosting |

---

## Architecture

```
Client (Tauri / Browser)
    ├── Voice Engine ─── WebRTC mesh ──→ Peers
    ├── Crypto ────── Ed25519 identity
    └── WebSocket ──→ Signaling Server ──→ SQLite
                         └──→ coturn (TURN relay)
```

Full architecture docs: [`docs/architecture.md`](docs/architecture.md)

---

## Project Structure

```
tavern/
├── packages/
│   ├── signaling-server/    # WebSocket signaling + SQLite persistence
│   ├── voice-engine/        # WebRTC + Opus + RNNoise audio engine
│   ├── crypto/              # Ed25519 identity + recovery
│   ├── client-desktop/      # Tauri desktop app shell
│   └── shared/              # Cross-package types and utilities
├── docker/
│   ├── Dockerfile.signaling # Multi-stage production build
│   └── docker-compose.yml   # Signaling + coturn stack
├── docs/
│   ├── self-hosting.md      # Self-hosting guide
│   └── architecture.md      # Architecture deep-dive
├── CONTRIBUTING.md
└── LICENSE                  # AGPLv3
```

---

## Roadmap

### Phase 1 — Voice MVP ← **current**
- [x] WebRTC voice engine with Opus
- [x] P2P mesh connections with STUN/TURN fallback
- [x] Tavern & channel creation
- [x] Push-to-talk & voice activity detection
- [x] RNNoise noise suppression
- [x] Ed25519 identity (TVN-XXXX-XXXX)
- [x] Desktop app (Tauri)
- [x] Self-hosting via Docker
- [x] SQLite persistence
- [ ] E2EE via MLS
- [ ] Invite links & QR codes

### Phase 2 — Text + Federation
- Encrypted text chat (Matrix-compatible)
- Federation between self-hosted instances
- Roles and permissions
- Mobile app (beta)

### Phase 3 — Rich Features
- Screen sharing and video
- Bot/plugin API
- Custom emoji and reactions
- Spatial audio

### Phase 4 — Scale + Ecosystem
- Plugin marketplace
- Enterprise features (SSO, audit, compliance)
- Localization / i18n

---

## Contributing

We'd love your help! See [`CONTRIBUTING.md`](CONTRIBUTING.md) for development setup, branching strategy, commit conventions, and code style guidelines.

---

## License

**GNU Affero General Public License v3.0** (AGPLv3) — see [`LICENSE`](LICENSE).

If Tavern-the-company disappeared tomorrow, the network keeps running.

---

<p align="center">
  <strong>Pull up a chair. Let's build something great.</strong>
</p>
```