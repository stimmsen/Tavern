```markdown
<p align="center">
  <h1 align="center">Tavern</h1>
  <p align="center">
    <strong>Open-source, decentralized, voice-first communication.</strong><br>
    Think Discord meets Matrix meets Mumble — but actually easy to use.
  </p>
  <p align="center">
    <a href="#features">Features</a> •
    <a href="#quick-start">Quick Start</a> •
    <a href="#self-hosting">Self-Hosting</a> •
    <a href="#architecture">Architecture</a> •
    <a href="#roadmap">Roadmap</a> •
    <a href="#contributing">Contributing</a> •
    <a href="#license">License</a>
  </p>
  <p align="center">
    <img src="https://img.shields.io/badge/license-AGPLv3-blue" alt="License">
    <img src="https://img.shields.io/badge/status-alpha-orange" alt="Status">
    <img src="https://img.shields.io/badge/voice-P2P%20%7C%20E2EE-green" alt="Voice">
  </p>
</p>

---

## What is Tavern?

Tavern is a **voice-first communication platform** that's open-source, decentralized, and encrypted by default.

- **Click a link → you're talking.** No signup. No email. No friction.
- **P2P by default.** Small groups connect directly. No server in the middle.
- **End-to-end encrypted.** Your conversations are yours.
- **Self-hostable.** Run the whole stack with `docker-compose up`.
- **Open-source forever.** AGPLv3. Community-driven. No data harvesting.

If Tavern-the-company disappears tomorrow, the network keeps running.

---

## Features

| Feature | Status |
|---|---|
| P2P voice (WebRTC + Opus) | 🟡 In Progress |
| Push-to-talk & voice activity detection | 🟡 In Progress |
| RNNoise suppression (Krisp-quality, open-source) | 🟡 In Progress |
| End-to-end encryption (MLS) | 🟡 In Progress |
| No account required — join with a display name | 🟡 In Progress |
| Invite via link or QR code | ⚪ Planned |
| Spatial audio for gaming/hangouts | ⚪ Planned |
| Desktop app (Tauri — macOS, Windows, Linux) | 🟡 In Progress |
| Self-hosting via Docker | ⚪ Planned |
| Text chat (Matrix-compatible) | ⚪ Phase 2 |
| Screen sharing & video | ⚪ Phase 3 |
| Bot/plugin API | ⚪ Phase 3 |

---

## Quick Start

### Prerequisites

- **Node.js 20+** — [nodejs.org](https://nodejs.org/)
- **Rust toolchain** — [rustup.rs](https://rustup.rs/)
- **Tauri CLI** — `cargo install tauri-cli`

### Run Locally

```

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

Open two browser tabs pointing at the local client. If you can hear yourself — it's working.

---

## Self-Hosting

Run your own Tavern infrastructure with a single command:

```

git clone https://github.com/tavern/tavern.git

cd tavern

docker-compose up -d

```

### Environment Variables

| Variable | Description | Default |
|---|---|---|
| `TAVERN_PORT` | Signaling server port | `8080` |
| `TAVERN_DOMAIN` | Domain for TLS/certs | `localhost` |
| `TAVERN_TURN_SECRET` | TURN server auth secret | (required) |

See [`docs/self-hosting.md`](docs/self-hosting.md) for the full guide.

---

## Architecture

```

┌─────────────────────────────────────┐

│           Client Layer              │

│  Desktop (Tauri) • Mobile • Web     │

└──────────────┬──────────────────────┘

│

┌──────────────▼──────────────────────┐

│          Protocol Layer             │

│  WebRTC Voice • MLS Encryption      │

│  libp2p Signaling                   │

└──────────────┬──────────────────────┘

│

┌──────────────▼──────────────────────┐

│       Infrastructure Layer          │

│  DHT Discovery • Community Relays   │

│  Tavern Pro Servers (SFU)           │

└─────────────────────────────────────┘

```

### How Routing Works

| Group Size | Method | Cost |
|---|---|---|
| ≤8 peers | Direct P2P (WebRTC mesh) | Free forever |
| NAT issues | Community relay nodes (volunteer-run) | Free |
| Large groups / Pro | Tavern Pro dedicated servers (SFU) | Paid |

### Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Voice transport | WebRTC | P2P, low latency, battle-tested |
| Signaling | libp2p / WebSocket | Decentralized discovery + relay |
| Audio codec | Opus | Low latency, high quality |
| Desktop client | Tauri (Rust + web) | ~10x lighter than Electron |
| Noise suppression | RNNoise | Open-source, runs locally |
| Identity | Ed25519 keypairs | No email/password required |
| Encryption | MLS (IETF standard) | Group E2EE |

---

## Project Structure

```

tavern/

├── packages/

│   ├── signaling-server/    # Node.js WebSocket signaling

│   ├── voice-engine/        # WebRTC + Opus wrapper

│   ├── crypto/              # MLS / Noise encryption layer

│   ├── client-desktop/      # Tauri app shell

│   └── shared/              # Shared types, utils, constants

├── docker/

│   ├── Dockerfile.signaling

│   └── docker-compose.yml

├── docs/

├── .github/workflows/       # CI/CD

├── LICENSE                  # AGPLv3

├── [README.md]

└── [CONTRIBUTING.md]

```

---

## Roadmap

### Phase 1 - Voice MVP *(Months 1–3)* ← **We are here**
- WebRTC voice engine with Opus
- P2P connections with STUN/TURN fallback
- Tavern creation + invite links
- Desktop app (Tauri)
- Self-hosting via Docker
- RNNoise integration
- E2EE via MLS

### Phase 2 - Text + Federation *(Months 4–6)*
- Encrypted text chat (Matrix-compatible)
- Federation between self-hosted instances
- Roles and permissions
- Mobile app (beta)
- Tavern Pro launch

### Phase 3 - Rich Features *(Months 7–12)*
- Screen sharing and video
- Bot/plugin API (open, self-hostable)
- Custom emoji and reactions
- Thread support

### Phase 4 - Scale + Ecosystem *(Year 2+)*
- Plugin marketplace
- Enterprise features (SSO, audit, compliance)
- Localization / i18n
- Public relay node incentive program

---

## Contributing

We'd love your help! Check out [`CONTRIBUTING.md`](CONTRIBUTING.md) for:

- Development setup
- Branching strategy (`main` / `develop` / `feat/*` / `fix/*`)
- Commit conventions (Conventional Commits)
- PR guidelines
- Code style (TypeScript strict, Rust for Tauri/crypto)

---

## Why Tavern?

> **"Pull up a chair. Own the room."**

- **No signup.** Click a link and talk.
- **No tracking.** E2EE by default. No ads. No data sales. Ever.
- **Your choice.** Self-host or use managed infrastructure.
- **Community-built.** Open-source means you build what you need - not what a PM decided ships this quarter.

---

## License

Tavern is licensed under the **GNU Affero General Public License v3.0** (AGPLv3).

See [`LICENSE`](LICENSE) for details.

---

<p align="center">
  <strong>Pull up a chair. Let's build something great.</strong> 
</p>
```