## Sprint 3 — Encryption *(Week 4–5)*

### 3.1 — Identity & Keypairs

- [ ]  Generate **Ed25519** keypair on first launch
    - Store in local storage (browser) or keychain (Tauri desktop)
    - Public key = your identity. No email, no password.
- [ ]  Display a human-readable identity:
    - Option A: Truncated public key hash (e.g., `TVN-a3f8-9bc2`)
    - Option B: Deterministic name from key (e.g., "CrimsonWolf-7742")
- [ ]  Allow setting a **display name** (stored locally, sent to peers on connect)
- [ ]  Export/import keypair for cross-device portability (stretch goal for Phase 1)