# Manual Test Checklist

Use this checklist when testing Tavern before a release or when validating a new deployment.

## Prerequisites

- [ ] Signaling server running (local or Docker)
- [ ] Desktop client or web voice-engine UI available
- [ ] Two devices or browser tabs for multi-user testing

---

## 1. Connection & Identity

- [ ] Open the app / web UI — identity is auto-generated
- [ ] TVN-XXXX-XXXX tag is displayed
- [ ] Display name can be set and is shown in the UI

## 2. Tavern Management

- [ ] Create a new Tavern — verify it appears with a name
- [ ] Default "General" channel is auto-created
- [ ] Create a second channel — verify it appears in the channel list
- [ ] `get-tavern-info` returns correct tavern data (channels, name, timestamps)

## 3. Channel Voice Chat

- [ ] Join a voice channel — "channel-joined" state shown, participant list includes self
- [ ] **Second user** joins the same channel — both appear in participant list
- [ ] Voice audio flows between both users (test with microphone)
- [ ] Speaking indicator activates when speaking
- [ ] Leave channel — other user sees the departure

## 4. Voice Modes

- [ ] **Push-to-Talk (PTT):** Hold key → audio transmits, release → silence
- [ ] **Voice Activity Detection (VAD):** Audio transmits when speaking, stops when silent

## 5. Audio Devices

- [ ] Open settings → Audio section
- [ ] Change input device → verify audio still works
- [ ] Change output device → verify audio still works
- [ ] Volume controls work (if present)

## 6. Themes

- [ ] Open settings → Appearance
- [ ] Switch to **Dark** theme → UI updates
- [ ] Switch to **Light** theme → UI updates
- [ ] Switch to **Retro** theme → UI updates with retro styling

## 7. Identity Export & Import

- [ ] Export identity to `.tavern-key` file
- [ ] Open a new browser context / clear data (fresh identity)
- [ ] Import the `.tavern-key` file
- [ ] Verify TVN-XXXX-XXXX tag matches the original

## 8. Signaling Server Resilience

- [ ] Disconnect a client (close tab / kill process)
- [ ] Other peers see `peer-left-channel` within seconds
- [ ] Reconnect — rejoin works without duplicate peers

## 9. Docker Self-Hosted Setup

- [ ] `docker compose up` starts signaling server + TURN
- [ ] `/health` endpoint returns `{ "status": "ok" }`
- [ ] `/metrics` endpoint returns JSON with all fields
- [ ] Create tavern, restart container → data persists (SQLite volume)

## 10. Edge Cases

- [ ] Send malformed JSON via WebSocket → server ignores, no crash
- [ ] Rapid-fire messages → rate limiting kicks in after threshold
- [ ] Same identity connects twice → first connection gets `session-replaced`

---

## Reporting Issues

If any step fails, please [open a GitHub issue](https://github.com/stimmsen/Tavern/issues/new?template=bug-report.md) with:
- The step number that failed
- Your OS and browser version
- Any error messages or screenshots
- Whether you're using Docker or running locally
