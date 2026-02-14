# Security Policy

## Supported Versions

| Version | Supported          |
|---------|--------------------|
| 0.1.x   | :white_check_mark: |

## Reporting a Vulnerability

If you discover a security vulnerability in Tavern, **please do not open a public issue.**

Instead, please report it responsibly via one of these methods:

1. **Email:** Send details to the maintainer at the email listed on the [GitHub profile](https://github.com/stimmsen).
2. **GitHub Security Advisories:** Use the [private vulnerability reporting](https://github.com/stimmsen/Tavern/security/advisories/new) feature.

### What to include

- A description of the vulnerability and its potential impact.
- Steps to reproduce or a proof of concept.
- Any suggested fixes or mitigations.

### What to expect

- **Acknowledgment** within 48 hours.
- **Assessment** within 1 week.
- A fix will be developed and released as quickly as possible, and you will be credited (unless you prefer to remain anonymous).

## Scope

The following are in scope for security reports:

- **Signaling server** (`packages/signaling-server/`) — WebSocket message handling, authentication bypass, denial of service, data leakage.
- **Crypto package** (`packages/crypto/`) — Key generation, export/import, identity derivation weaknesses.
- **Desktop client** (`packages/client-desktop/`) — Tauri IPC vulnerabilities, local file access, command injection.
- **Voice engine** (`packages/voice-engine/`) — WebRTC configuration issues, ICE candidate leakage, SRTP weaknesses.

## Out of Scope

- Self-hosted deployments with intentionally weakened configurations.
- Social engineering attacks.
- Denial of service via network flooding (use rate limiting configuration).

Thank you for helping keep Tavern secure!
