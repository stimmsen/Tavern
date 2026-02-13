tavern/
├── packages/
│   ├── signaling-server/    # Node.js
│   ├── voice-engine/        # WebRTC + Opus wrapper
│   ├── crypto/              # MLS / Noise encryption layer
│   ├── client-desktop/      # Tauri app shell
│   └── shared/              # Shared types, utils, constants
├── docker/
│   ├── Dockerfile.signaling
│   └── docker-compose.yml
├── docs/
├── .github/
│   └── workflows/           # CI/CD
├── LICENSE                   # AGPLv3
├── README.md
└── CONTRIBUTING.md