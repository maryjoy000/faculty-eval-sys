# Deployment Guide — Hostinger VPS

Full-stack deployment: Flask backend (gunicorn) + MySQL + static frontend
(nginx) + the XLM-R sentiment model pulled from Hugging Face.

Tested target: **Ubuntu 24.04 LTS, KVM 2 (2 vCPU / 8 GB RAM / 100 GB)**
The sentiment model needs ~2–3 GB RAM at runtime, so 8 GB is the safe floor.

---

## 0. Prerequisites

- VPS provisioned (Ubuntu 24.04 LTS), root SSH access
- GitHub repo: `https://github.com/maryjoy000/faculty-eval-sys.git`
- Hugging Face token with **read** access to the private model repo
  (`MODEL_HF_ID`), e.g. `maryjoy1228/fes-xlmr-finetuned`

---

## 1. Base server setup

```bash
apt update && apt upgrade -y
apt install -y python3 python3-venv python3-pip mysql-server nginx git ufw

# Keep TOTP (2FA) working: NTP-synced clock is mandatory
timedatectl set-ntp true
timedatectl status

# 2 GB swap (safety margin for model loading spikes)
fallocate -l 2G /swapfile && chmod 600 /swapfile
mkswap /swapfile && swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab

# Firewall
ufw allow OpenSSH && ufw allow 'Nginx Full' && ufw --force enable
```

## 2. MySQL

```bash
mysql -u root <<'SQL'
CREATE DATABASE fes CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
CREATE USER 'fes_user'@'localhost' IDENTIFIED BY 'CHANGE_ME_STRONG_PASSWORD';
GRANT ALL PRIVILEGES ON fes.* TO 'fes_user'@'localhost';
FLUSH PRIVILEGES;
SQL
```

## 3. Application code

```bash
mkdir -p /var/www && cd /var/www
git clone https://github.com/maryjoy000/faculty-eval-sys.git fes
cd fes/backend

python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip
pip install -r requirements.txt

# XLM-R is ~1 GB; give pip room and time (CPU-only torch is fine)
```

## 4. Environment file

Create `backend/.env` (never commit it):

```ini
SECRET_KEY=<paste output of: python -c "import secrets; print(secrets.token_hex(32))">
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=fes
DB_USER=fes_user
DB_PASSWORD=CHANGE_ME_STRONG_PASSWORD

# Frontend is served by nginx and calls /api on the same origin, so CORS
# only matters for stray origins; set the real domain anyway.
CORS_ORIGINS=https://fes.your-domain.com

FLASK_ENV=production

# Sentiment model (private HF repo)
MODEL_PATH=
MODEL_HF_ID=maryjoy1228/fes-xlmr-finetuned
HF_TOKEN=hf_xxx_read_token

# Password-reset email (SMTP). Gmail: create an App Password (requires
# 2-Step Verification) — the 16 characters, without spaces.
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USERNAME=your.sender@gmail.com
MAIL_PASSWORD=xxxxxxxxxxxxxxxx
MAIL_FROM=your.sender@gmail.com
MAIL_FROM_NAME=Faculty Evaluation System

# Public frontend base URL used in reset links (no trailing slash).
FRONTEND_BASE_URL=https://fes.your-domain.com

# Seed-time bootstrap accounts (change before first seed)
DEFAULT_ADMIN_USERNAME=admin-jane
DEFAULT_ADMIN_PASSWORD=CHANGE_ME
DEFAULT_HR_USERNAME=hr-bob
DEFAULT_HR_PASSWORD=CHANGE_ME
```

> **SECRET_KEY warning:** TOTP secrets are encrypted with a key derived
> from `SECRET_KEY`. Changing it later makes every enrolled authenticator
> unusable (users must re-enroll via admin reset). Set it once and keep it.

## 5. Database migrate + seed

```bash
cd /var/www/fes/backend
source venv/bin/activate

# .env is loaded automatically by the app (python-dotenv)
flask --app run.py db upgrade
python seed.py
```

`seed.py` creates:
- evaluation types, criteria/questions, rating scales, weighting
- the first Admin + HR accounts (from `DEFAULT_*` env vars)
- Admin must complete TOTP setup on first login (forced)

## 6. Gunicorn service

```bash
cat > /etc/systemd/system/fes.service <<'UNIT'
[Unit]
Description=FES Flask API
After=network.target mysql.service

[Service]
User=www-data
Group=www-data
WorkingDirectory=/var/www/fes/backend
EnvironmentFile=/var/www/fes/backend/.env
ExecStart=/var/www/fes/backend/venv/bin/gunicorn \
    --workers 1 --threads 4 --timeout 120 \
    --bind 127.0.0.1:5000 run:app
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT

chown -R www-data:www-data /var/www/fes/backend
systemctl daemon-reload
systemctl enable --now fes
systemctl status fes
```

> `--workers 1` keeps a single copy of the ~1 GB model in RAM (threads
> handle concurrency). More workers = more RAM per worker.

## 7. Nginx (static frontend + /api proxy)

```bash
cat > /etc/nginx/sites-available/fes <<'CONF'
server {
    listen 80;
    server_name fes.your-domain.com;

    # Static frontend — MUST be the project root (pages reference
    # ../../../dist/output.css from src/pages/...)
    root /var/www/fes;

    # Pages must load through /src/... so their relative paths (js/,
    # assets/) resolve correctly; send the bare root there.
    location = / {
        return 302 /src/index.html;
    }

    location / {
        try_files $uri $uri/ =404;
    }

    # API + session cookies on the same origin (no CORS needed)
    location /api/ {
        proxy_pass http://127.0.0.1:5000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
CONF

ln -sf /etc/nginx/sites-available/fes /etc/nginx/sites-enabled/fes
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
```

The frontend auto-detects the environment: served from a real hostname it
calls `/api` on the same origin (proxied above); on `localhost:5500` it
calls `http://127.0.0.1:5000/api` for local development.

## 8. HTTPS

```bash
apt install -y certbot python3-certbot-nginx
certbot --nginx -d fes.your-domain.com
```

Then set `SESSION_COOKIE_SECURE=true` in `.env` (if used by config) and
restart: `systemctl restart fes`.

## 9. Post-deploy verification checklist

1. `https://fes.your-domain.com/src/index.html` loads with styles.
2. HR login (`hr-bob` / your `DEFAULT_HR_PASSWORD`) → HR dashboard.
3. Admin login → **forced 2FA setup**: QR renders, code verifies, backup
   codes shown → admin dashboard.
4. Admin → Faculty Management → create a faculty (default creds shown).
5. Assign advisory + section; faculty logs in → adds a student.
6. Admin opens an evaluation period → student logs in (LRN + last name)
   → submits an evaluation with a comment.
7. Admin/HR → Analytics and Sentiment shows the analysis.
8. HR releases a report → faculty sees it under My Evaluation.
9. `journalctl -u fes -n 100` — no tracebacks.

## 10. Updates

```bash
cd /var/www/fes
git pull
cd backend && source venv/bin/activate
pip install -r requirements.txt
flask --app run.py db upgrade
systemctl restart fes
```

## Troubleshooting

| Symptom | Cause / fix |
|---|---|
| Login button does nothing, broken logo/images | Page loaded at bare `/`; open via `/src/index.html` (the config above redirects `/` there). Relative `js/` and `assets/` paths 404 otherwise |
| `Unknown column 'students.last_name'` | Old DB; run `flask db upgrade` (migration `c4e8b1a7d2f6`) |
| 2FA codes always invalid | Server clock not NTP-synced (`timedatectl set-ntp true`) |
| Sentiment endpoint 500 / OOM | Not enough RAM; ensure swap + 8 GB plan, single worker |
| Styles missing on pages | nginx `root` must be the repo root, not `src/` |
| CORS errors in browser | Access via the domain (same-origin `/api`), not a file:// or split origin |
