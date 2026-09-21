# Two-Factor Authentication (TOTP) — Workflow

Staff-only 2FA using authenticator apps (Google Authenticator, Authy, etc.).
Replaces the old placeholder toggle that flipped a boolean with no real
verification behind it.

## Scope decisions

| Decision | Choice | Why |
|---|---|---|
| Who gets 2FA | Staff only (admin / hr / faculty) | Students log in with LRN + derived last-name password; enrolling them in TOTP would be a support burden with little security gain |
| Recovery | 8 one-time backup codes + admin reset | Backup codes are self-service; admin reset is the audited last resort |
| Enforcement | Admins: forced on first login. HR/faculty: opt-in | Avoids a Day-1 lockout wave while protecting the highest-privilege role |

## Login flows

### Staff without 2FA (hr / faculty)
```
POST /api/auth/login {username, password}
  -> 200 {id, username, name, role}        (unchanged from before)
```

### Staff with 2FA enabled
```
POST /api/auth/login {username, password}
  -> 202 {two_factor_required: true}       (NOT logged in; pending_2fa set in session)
  -> /api/auth/me returns 401              (pending state grants nothing)
POST /api/2fa/verify-login {code}
  -> 200 {id, username, name, role}        (full login, redirect by role)
  -> 401 generic error on wrong code
  -> 403 after 5 failed attempts (15-minute lockout)
```

### Admin without 2FA (first login)
```
POST /api/auth/login {username, password}
  -> 202 {two_factor_setup_required: true} (pending_2fa set; /me still 401)
POST /api/2fa/setup                        (works under pending session)
  -> {otpauth_url, qr_svg, manual_key}
POST /api/2fa/verify-setup {code}
  -> 200 {id, username, name, role, backup_codes}  (auto-completes login)
```

### Students
Unchanged. LRN + password -> 200. No 2FA tab, no 2FA endpoints.

## Enrollment (profile page)

Profile > Two-Factor Authentication tab (admin / hr / faculty pages):

1. **Set Up** -> `POST /api/2fa/setup` generates a fresh secret, returns
   QR (SVG) + manual key. Flag stays OFF.
2. **Confirm & Enable** -> `POST /api/2fa/verify-setup {code}` checks the
   code, turns the flag ON, issues 8 backup codes (shown exactly once).
3. Re-running setup replaces the previous unverified secret.
4. **Disable** -> `POST /api/2fa/disable {password}` requires the current
   password (same re-confirmation rule as changing the password), then
   clears the secret and all backup codes.

## Recovery

- **Backup codes**: 8 codes at enrollment, stored hashed (werkzeug),
  one-time use, marked `used` on consumption. Entered in the same code
  box at login.
- **Admin reset**: `POST /api/2fa/admin/reset/<user_id>` (admin only,
  cannot target self) clears the target's 2FA so they can log in with
  password only and re-enroll. Logged to the activity log.

## Security measures

- **Secret encryption at rest**: TOTP secrets are Fernet-encrypted with a
  key derived from `SECRET_KEY` (SHA-256 -> urlsafe-b64). Never plaintext
  in the database.
- **Replay protection**: last consumed TOTP time-counter is stored and
  same/older counters are rejected; additionally a fingerprint of the
  last accepted code is kept for 120s to block cross-window replays that
  `valid_window=1` would otherwise accept.
- **Rate limiting**: 5 failed code attempts -> 15-minute lockout
  (`totp_locked_until`). Counters reset on success.
- **Generic errors**: wrong code returns the same "Invalid username or
  password" message style — no account enumeration.
- **Pending session isolation**: `pending_2fa` only marks that the
  password step passed. It grants no auth; `/me` and all protected
  routes stay 401 until verification completes.
- **Stale-flag cleanup**: the migration resets `two_factor_enabled` for
  accounts that had it ON with no secret (impossible state from the old
  placeholder toggle) so nobody gets locked out by the upgrade.
- **No raw flag writes**: `PUT /api/profile` no longer accepts
  `two_factor_enabled`; the flag can only change via the verified
  `/api/2fa` endpoints.

## Files

### Backend
| File | Purpose |
|---|---|
| `backend/app/utils/totp.py` | Fernet encrypt/decrypt, secret generation, provisioning URI, QR-as-SVG, code verification, replay fingerprint, backup code generation |
| `backend/app/models/backup_code.py` | `backup_codes` table (hash, used, used_at) |
| `backend/app/models/user.py` | New columns: `totp_secret`, `totp_failed_attempts`, `totp_locked_until`, `totp_last_counter`, `totp_last_code_hash`, `totp_last_code_at` |
| `backend/app/routes/two_factor.py` | `/api/2fa` blueprint: setup, verify-setup, verify-login, disable, admin/reset |
| `backend/app/routes/auth.py` | Login returns 202 challenges; logout clears pending state |
| `backend/app/routes/profile.py` | Raw `two_factor_enabled` write removed |
| `backend/migrations/versions/a3f1c9e27b4d_*.py` | Schema + stale-flag data fix |
| `backend/requirements.txt` | `pyotp==2.10.0`, `qrcode==8.2`, `pytest==9.1.1` |

### Frontend
| File | Purpose |
|---|---|
| `src/index.html` | Hidden 2FA code panel + admin first-login setup panel (QR, manual key, backup codes) |
| `src/js/pages/login.js` | Handles 202 responses, code entry, setup flow, Enter-key handling |
| `src/pages/admin/profile.html` | Real 2FA panel (setup QR, backup codes, disable) |
| `src/pages/hr/hr-profile.html` | Same panel |
| `src/pages/faculty/faculty-profile.html` | Same panel |
`.js` | initTwoFactorPanel replacing the old toggle; students skipped (tab already hidden) |

## Testing

`backend/tests/` (new pytest suite, SQLite, no ML deps — transformers is
stubbed in conftest):

```
cd backend
python -m pytest tests/ -q     # 10 passed
```

Covers: unchanged plain login, enrollment + QR + backup codes, 202
challenge flow, wrong code, replay rejection (same window + adjacent
window), 5-attempt lockout, backup code single-use, admin forced setup,
disable with password, admin reset (target cleared, self blocked).

## Deployment notes

1. `pip install -r requirements.txt` then `flask db upgrade` (applies
   the new columns + `backup_codes` table + stale-flag fix).
2. **Server clock must be NTP-synced** — TOTP codes are time-based; a
   skewed VPS clock makes every valid code fail.
3. **Do not rotate `SECRET_KEY` casually** — TOTP secrets are encrypted
   with a key derived from it. Changing it makes every enrolled
   authenticator undecryptable (users must re-enroll via admin reset).
4. Serve over HTTPS (`SESSION_COOKIE_SECURE=true`) — TOTP secrets and
   codes must never travel over plain HTTP.
