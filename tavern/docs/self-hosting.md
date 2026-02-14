# Self-Hosting Tavern

Run your own Tavern signaling server and TURN relay with a single command.

---

## Prerequisites

| Requirement | Minimum | Notes |
|---|---|---|
| **Docker** | 20.10+ | [Install Docker](https://docs.docker.com/get-docker/) |
| **Docker Compose** | v2.0+ | Included with Docker Desktop |
| **Machine** | 1 vCPU, 512 MB RAM | VPS, bare metal, or local dev machine |
| **Domain** *(optional)* | — | Required for TLS / WSS in production |
| **TLS cert** *(optional)* | — | Let's Encrypt via reverse proxy recommended |

> **Not required:** Node.js, Rust, or any other build tools — the Docker image handles everything.

---

## Quick Start

```bash
git clone https://github.com/tavern/tavern.git
cd tavern/docker
docker compose up -d
```

Verify it's running:

```bash
curl http://localhost:3001/health
# → {"status":"ok","taverns":0}
```

Your signaling server is live on port **3001** and the TURN relay on port **3478**.

---

## Configuration

All configuration is done via environment variables. Set them in a `.env` file next to `docker-compose.yml`, or pass them directly.

### Signaling Server

| Variable | Description | Default |
|---|---|---|
| `TAVERN_PORT` | Host port mapped to the signaling server | `3001` |
| `TAVERN_STORE` | Persistence backend: `memory` or `sqlite` | `sqlite` |
| `TAVERN_DB_PATH` | SQLite database file path inside the container | `/data/tavern.db` |
| `PORT` | Internal server listen port (rarely changed) | `3001` |

### TURN Relay (coturn)

| Variable | Description | Default |
|---|---|---|
| `TAVERN_TURN_SECRET` | Shared secret for TURN authentication. **Change this in production.** | `tavern-dev-secret` |
| `TAVERN_DOMAIN` | Realm / domain for the TURN server | `localhost` |

### Example `.env`

```env
TAVERN_PORT=3001
TAVERN_TURN_SECRET=my-super-secret-turn-key
TAVERN_DOMAIN=tavern.example.com
TAVERN_STORE=sqlite
TAVERN_DB_PATH=/data/tavern.db
```

---

## TLS / Reverse Proxy

In production, you should terminate TLS at a reverse proxy so clients connect over `wss://` instead of plain `ws://`.

### nginx Example

```nginx
server {
    listen 443 ssl;
    server_name tavern.example.com;

    ssl_certificate     /etc/letsencrypt/live/tavern.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/tavern.example.com/privkey.pem;

    # WebSocket signaling
    location / {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # Health check (plain HTTP behind the proxy)
    location /health {
        proxy_pass http://127.0.0.1:3001/health;
    }
}

# Redirect HTTP → HTTPS
server {
    listen 80;
    server_name tavern.example.com;
    return 301 https://$host$request_uri;
}
```

> **Tip:** Use [Certbot](https://certbot.eff.org/) to auto-provision Let's Encrypt certificates.

---

## Firewall / Ports

Open these ports on your server's firewall:

| Port | Protocol | Service | Required? |
|---|---|---|---|
| **3001** | TCP | Signaling server (WebSocket) | Yes |
| **3478** | UDP + TCP | TURN/STUN listener | Yes |
| **49152–65535** | UDP | TURN relay media range | Yes |

> **Note:** The default `docker-compose.yml` maps a narrower relay range (`49152–49252`) for local development. For production, expand the range in `docker-compose.yml`:
>
> ```yaml
> ports:
>   - "49152-65535:49152-65535/udp"
> ```
>
> and update the coturn `--min-port` / `--max-port` flags accordingly.

### Cloud Provider Quick Reference

- **AWS:** Security Group inbound rules for the ports above.
- **DigitalOcean:** Cloud Firewall with matching rules.
- **Hetzner:** Firewall → Add rules for TCP 3001, UDP 3478, UDP 49152–65535.

---

## Persistence

By default the Docker stack uses **SQLite** for persistence. Taverns and channels survive container restarts because the database is stored on a Docker volume.

### Where is my data?

The `tavern-data` volume is mounted at `/data` inside the container. The SQLite file lives at `/data/tavern.db`.

### Backing Up

```bash
# Copy the database out of the volume
docker compose cp signaling:/data/tavern.db ./tavern-backup.db
```

Or, if you prefer:

```bash
# Find the volume's host path
docker volume inspect docker_tavern-data --format '{{ .Mountpoint }}'
# Copy the file directly
```

### Restoring from Backup

```bash
docker compose down
docker compose cp ./tavern-backup.db signaling:/data/tavern.db
docker compose up -d
```

### Switching Persistence Backends

- **Memory mode** (no persistence): Set `TAVERN_STORE=memory`. Taverns are lost on restart — useful for testing.
- **SQLite mode** (default): Set `TAVERN_STORE=sqlite`. Data survives restarts.

---

## Updating

Pull the latest images and restart:

```bash
cd tavern/docker
git pull
docker compose build --no-cache
docker compose up -d
```

Your SQLite data volume is preserved across rebuilds — no data loss.

---

## Troubleshooting

### Health check returns connection refused

- Verify the container is running: `docker compose ps`
- Check logs: `docker compose logs signaling`
- Ensure port 3001 is not already in use on the host.

### TURN relay not working

- Confirm UDP port 3478 is open on your firewall.
- Confirm the relay port range (49152+) is open for UDP.
- Test STUN connectivity: use [Trickle ICE](https://webrtc.github.io/samples/src/content/peerconnection/trickle-ice/) with `turn:your.domain:3478`.
- Ensure `TAVERN_TURN_SECRET` matches between signaling server config and coturn.

### Clients can't connect (WebSocket error)

- If using TLS, verify the nginx proxy is running and certs are valid.
- Check browser console for mixed-content warnings (HTTPS page → WS connection). Use `wss://`.
- Ensure `proxy_read_timeout` is high enough (WebSocket connections are long-lived).

### SQLite database locked

- Only one signaling server instance should write to the same database file. Don't scale `signaling` to multiple replicas with a shared SQLite volume.
- For multi-node setups, wait for Layer 2 replication (coming in a future release).

### Container exits immediately

- Check logs: `docker compose logs signaling`
- Common cause: missing or invalid `TAVERN_DB_PATH` directory. The container auto-creates it, but volume mount issues can interfere.

---

## Architecture Reference

See [architecture.md](architecture.md) for details on the signaling protocol, identity system, and audio pipeline.
