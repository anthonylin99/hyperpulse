# Self-hosting HyperPulse on a DigitalOcean droplet

This runbook moves HyperPulse off Vercel + Neon onto a single droplet running the
whole stack in Docker: **Caddy** (auto-HTTPS) → **web** (Next.js) + **workers**,
backed by a **self-hosted Postgres** container.

Everything is driven by two compose files and one `.env`:

```
docker-compose.yml            # base: web + workers + migrate (already in repo)
docker-compose.prod.yml       # overlay: postgres + caddy + DB gate on
.env                          # your secrets (from .env.production.example)
```

Define a shell alias so the commands below stay short:

```bash
alias dc='docker compose -f docker-compose.yml -f docker-compose.prod.yml'
```

---

## 1. Create the droplet

- **Image:** Ubuntu 24.04 LTS
- **Size:** 2 GB RAM minimum (the Next.js build needs it); **4 GB recommended** so
  the build + Postgres + workers run comfortably. You can resize down later.
- Add your SSH key. Note the public IPv4.

SSH in and add swap (protects the build on a 2 GB box):

```bash
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

## 2. Install Docker

```bash
curl -fsSL https://get.docker.com | sh
docker compose version   # confirm the compose plugin is present
```

## 3. Firewall (do this before exposing anything)

```bash
ufw default deny incoming && ufw default allow outgoing
ufw allow OpenSSH
ufw allow 80/tcp && ufw allow 443/tcp
ufw enable
```

> Note: Docker's port publishing can bypass ufw. That's why `.env` sets
> `WEB_PORT=127.0.0.1:3000` and Postgres publishes **no** host port — only Caddy
> (80/443) is public.

## 4. Get the code + secrets

```bash
git clone https://github.com/anthonylin99/hyperpulse.git /opt/hyperpulse
cd /opt/hyperpulse
git checkout selfhost-digitalocean     # until this is merged to main
cp .env.production.example .env
nano .env
```

Fill in `.env`:
- `DOMAIN` = `hyperpulsehl.com`
- `POSTGRES_PASSWORD` = `openssl rand -base64 24` (set the **same** value inside
  `DATABASE_URL`)
- `NEXT_PUBLIC_PRIVY_APP_ID` = your Privy app id (or leave blank for read-only)
- Telegram vars if you want momentum alerts

## 5. Build

```bash
dc build
```

## 6. Create the schema (one-time, and after any new migration)

```bash
dc run --rm migrate
```

Expect it to apply the `migrations/*.sql` files and create `schema_migrations`.

## 7. Start everything

```bash
dc up -d
dc ps          # postgres healthy, web/caddy/workers up
dc logs -f caddy   # watch the TLS cert get issued
```

## 8. Point DNS + verify

1. **Before** cutover, lower the `hyperpulsehl.com` A-record TTL (e.g. 300s) at your
   DNS provider so you can roll back fast.
2. Set the **A record** → droplet IPv4. (Remove the Vercel record.)
3. Once DNS propagates, Caddy issues the cert automatically. Verify:

```bash
curl -sI https://hyperpulsehl.com | head -n1        # HTTP/2 200
curl -s  https://hyperpulsehl.com/api/health         # ok
curl -s 'https://hyperpulsehl.com/api/market' | grep -o 'xyz:BRENTOIL' | head -1
```

Open the site: Markets tab shows crypto + HIP-3, charts load.

## 9. Confirm the warehouse is filling

```bash
dc logs --tail=50 market-collector reaction-map
dc exec postgres psql -U hyperpulse -d hyperpulse -c "\dt"
dc exec postgres psql -U hyperpulse -d hyperpulse -c "select count(*) from market_context_snapshots;"
```

Row counts should grow over the first few minutes (workers self-schedule).

## 10. Backups

```bash
./deploy/backup-postgres.sh          # writes backups/hyperpulse-<ts>.sql.gz
crontab -e
# 15 3 * * * cd /opt/hyperpulse && ./deploy/backup-postgres.sh >> /var/log/hp-backup.log 2>&1
```

Optional off-box copy to DigitalOcean Spaces: set `SPACES_BUCKET` (+ `aws` creds and
`AWS_ENDPOINT_URL`) in `.env` — the script uploads each dump.

## 11. Decommission (after 24–48h stable)

- Delete the Vercel project (`hyperpulse`).
- Delete / downgrade the Neon database. (We started the warehouse fresh, so there's
  nothing to migrate — the workers rebuilt it here.)

---

## Operations cheat-sheet

| Task | Command |
|------|---------|
| Deploy new code | `git pull && dc build && dc run --rm migrate && dc up -d` |
| View logs | `dc logs -f web` (or `caddy`, `market-collector`, …) |
| Restart a service | `dc restart web` |
| Psql shell | `dc exec postgres psql -U hyperpulse -d hyperpulse` |
| Stop all | `dc down` (add `-v` to also wipe the DB volume — destructive) |
| Restore a dump | see header of `deploy/backup-postgres.sh` |

## Notes

- Workers self-schedule via `*_INTERVAL_MS` loops — there is no external cron to port.
- `@vercel/analytics` / `@vercel/speed-insights` are harmless no-ops off Vercel. Remove
  the components in `src/app/layout.tsx` (and the deps) if you want them gone.
- To add more builder DEXs or tune workers, see the env vars in `docker-compose.yml`.
