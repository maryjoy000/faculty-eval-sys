# Workflow Updates — HR Analytics, Bootstrap Accounts, Evaluation Rules, Faculty Sections

Changes made to close the four gaps found when comparing the system against
the client's written workflow. Each section documents the workflow BEFORE
and AFTER the change.

---

## 1. HR access to Analytics and Sentiment

**Before:** Analytics was admin-only (`/api/analytics/overview` rejected HR
with 403). HR's sidebar had no Analytics menu, and the HR dashboard showed
only evaluation progress — no sentiment.

**After:** HR gets the same analytics/sentiment access as Admin.

### Workflow (HR)
1. HR logs in and opens **Analytics and Sentiment** in the sidebar
   (`hr-analytics.html`).
2. The page loads `GET /api/analytics/overview` and renders:
   - Student evaluation sentiment donut
   - Peer-to-peer sentiment donut
   - Sentiment by evaluation source (stacked bars)
   - Average rating by sentiment
   - Common feedback themes, key testimonials, latest 10 comments
3. The HR dashboard also shows a **Sentiment Analysis Distribution** card
   (donut + legend + average sentiment score) sourced from
   `GET /api/evaluations/dashboard-sentiment`.

### Files
| File | Change |
|---|---|
| `backend/app/routes/analytics.py` | `@roles_required("admin")` → `@roles_required("admin", "hr")` |
| `src/pages/hr/hr-analytics.html` | New page (HR shell, same template as admin) |
| `src/js/pages/analytics.js` | Mounts into `#admin-page-content` **or** `#hr-page-content` |
| `src/js/components/hr-sidebar.js` | New "Analytics and Sentiment" nav item + bar-chart icon |
| `src/pages/hr/hr-dashboard.html` | Sentiment card + Chart.js include |
| `src/js/pages/hr-dashboard.js` | Donut + average score renderer |

Note: classroom observation and HR evaluation comments do not exist, so the
sentiment charts summarize student and peer feedback only (same as before).

---

## 2. Bootstrap default Admin + HR accounts

**Before:** `seed.py` only created evaluation configuration. A fresh database
had zero users, and account creation is admin-only — so there was no way to
log in for the first time. The "HR is also a default account" line in the
workflow notes was not implemented.

**After:** `seed.py` creates the first Admin and HR accounts when missing.

### Workflow (deployment)
1. Configure credentials in `backend/.env` (or accept the defaults):

   | Env var | Default | Purpose |
   |---|---|---|
   | `DEFAULT_ADMIN_USERNAME` | `admin-jane` | First admin login |
   | `DEFAULT_ADMIN_PASSWORD` | `Secret123!` | First admin password |
   | `DEFAULT_HR_USERNAME` | `hr-bob` | First HR login |
   | `DEFAULT_HR_PASSWORD` | `HrPass1!` | First HR password |

2. Run `python seed.py` (from `backend/`, venv active).
3. The script prints which accounts it created. Re-runs and existing
   databases are safe: each account is created only if **no user with that
   role exists** — credentials are never overwritten.
4. Admin logs in → the system **requires two-factor enrollment** on first
   login (TOTP, per `docs/2FA_WORKFLOW.md`).
5. Admin creates the rest of the accounts through Accounts Management.

**Security:** change both default passwords immediately after deployment.
Set `DEFAULT_*` env vars before seeding so the defaults never appear in
production.

### Files
| File | Change |
|---|---|
| `backend/seed.py` | New `seed_default_accounts()` (runs before the config early-return) |
| `backend/.env.example` | Documents the four `DEFAULT_*` variables |

---

## 3. Classroom Observation is rating-only (server-enforced)

**Before:** The Admin UI sent `comments: null`, but the API still accepted a
comment payload for `classroomObservation` — the "no comments" rule lived
only in the browser.

**After:** The API drops comments for classroom observation before storage
and sentiment analysis. No comment text can be stored for that type,
regardless of client behavior.

### Workflow
1. Admin opens the Classroom Observation form → rates all domains.
2. Submit sends ratings only (comments field is not rendered).
3. Server sanitizes any accidental comment payload to `None`; sentiment
   columns stay empty for this evaluation.
4. Student, peer, and HR evaluations keep full comment + sentiment support.

### Files
| File | Change |
|---|---|
| `backend/app/utils/evaluation_rules.py` | New `sanitize_comments(type_code, comments)` |
| `backend/app/routes/evaluations.py` | Applies the rule before `analyze_sentiment` |
| `backend/tests/test_evaluation_rules.py` | New unit tests (5 cases) |

---

## 4. Faculty "My Subjects & Sections" view

**Before:** Faculty could see their advisory class, but there was no view of
the teaching subjects/sections the Admin assigned to them (those records
only drove student evaluation eligibility).

**After:** The Faculty Dashboard has a **My Subjects & Sections** card.

### Workflow
1. Admin assigns subjects/sections in Faculty Management.
2. Faculty logs in → Dashboard → "My Subjects & Sections" shows:
   - **Subjects** — code + name (e.g. `MATH101 — Mathematics`)
   - **Sections** — grade level + section (e.g. `11 STEM-A`)
3. Empty states show "No subjects/sections assigned yet."

Data comes from `GET /api/faculty/{linked_faculty_id}` (already returned by
`/api/auth/me` as `linked_faculty_id`); no backend change was needed.

### Files
| File | Change |
|---|---|
| `src/pages/faculty/faculty-dashboard.html` | New card with `#my-subjects-list` / `#my-sections-list` |
| `src/js/pages/faculty-dashboard.js` | `renderMySubjectsAndSections()` + HTML escaping |

---

## Verification performed

- `python -m pytest tests/ -q` → **15 passed** (10 existing 2FA tests + 5 new
  evaluation-rule tests).
- Seed bootstrap verified against a temp SQLite database: first run creates
  `admin` + `hr`, second run skips without duplicates, and both passwords
  validate with `check_password`.
- `node --check` on all modified JavaScript files → clean.

## Deployment checklist (server)

1. `pip install -r requirements.txt` (no new dependencies were added).
2. `flask db upgrade` (no schema changes in this update).
3. `python seed.py` → creates the default Admin/HR accounts.
4. Log in as Admin → complete 2FA enrollment → change the default passwords.

---

# Follow-up Update — Log Out All Devices & Real HR Questions

## 5. "Log out of all other devices" (implemented)

**Before:** the profile button was a placeholder (`console.log`); all
sessions stayed valid until each cookie expired.

**After:** session-version invalidation. Every login stores the identity's
current `session_version` in the Flask session; the login manager checks it
per request (`app/utils/session_guard.py`). The button calls
`POST /api/auth/logout-all`, which bumps the column and re-stamps the
calling session — other devices are signed out immediately, the current
device stays signed in.

### Workflow
1. User logs in on Device A and Device B.
2. On Device A: Profile → Session Management → **Log Out of All Other Devices**.
3. Device B's next request returns 401 → back to the login page.
4. Device A continues working; `session_version` (and the activity log
   entry "Logged out all other devices") records the action.

Works for staff and students alike.

### Files
| File | Change |
|---|---|
| `backend/app/utils/session_guard.py` | New: version-aware `user_loader` + `start_session_version()` |
| `backend/app/models/user.py`, `student.py` | New `session_version` column |
| `backend/app/routes/auth.py` | Login stamps the version; new `POST /api/auth/logout-all` |
| `backend/app/routes/two_factor.py` | 2FA login completion stamps the version |
| `backend/app/__init__.py` | Login manager uses the version-aware loader |
| `backend/migrations/versions/d8f3a6b2c9e1_*` | Adds `session_version` (default 1) |
| `src/js/pages/profile.js` | Button wired to the real endpoint |
| `backend/tests/test_session_management.py` | New tests (5 cases) |

**Note:** after deploying, existing (pre-update) sessions are invalidated
once — everyone signs in again and the versions align.

## 6. HR evaluation questions (placeholders replaced)

**Before:** the HR evaluation shipped with `[Placeholder]` questions.

**After:** a complete 8-question set across two parts:

- **Document Submission and Records Management** — p1–p3
- **Professional Development and Work Ethics** — p4–p8

`seed.py` carries the final set for fresh installs; migration
`e5a9c1d4f2b7` upgrades already-seeded databases (only rows still marked
`[Placeholder]` are touched, so manual edits via HR → Evaluation Criteria
are never overwritten, and the two new questions are appended once).

If the school provides its own official HR form later, edit the questions
via **HR → Evaluation Criteria** — no code change needed.

### Files
| File | Change |
|---|---|
| `backend/seed.py` | Final HR question set |
| `backend/migrations/versions/e5a9c1d4f2b7_*` | Data upgrade for existing databases |

## Deployment steps for this update

```bash
cd /var/www/fes
git pull
cd backend && source venv/bin/activate
flask --app run.py db upgrade
systemctl restart fes
```

---

# Follow-up Update — Forgot Password via Email (SMTP)

## 7. Forgot password (implemented)

**Before:** the "Forgot Password?" modal only logged to the console.

**After:** a real email flow.

### Workflow
1. Login page → **Forgot Password?** → enter the registered email.
2. The server emails a reset link (valid for **1 hour**) if the address
   belongs to an account. The API always answers with the same generic
   message, so it cannot be used to discover which emails are registered.
3. The link opens `/src/reset-password.html?token=...` with **New Password**
   and **Confirm Password** fields, each with a show/hide (eye) toggle.
4. Submitting updates the password, signs out every existing session, and
   redirects to the login page. Links are single-use: once the password
   changes, the token's fingerprint no longer matches and old links are
   rejected. Expired/malformed links show an "invalid or expired" panel.

### Security notes
- Token: `itsdangerous` signed + timestamped, bound to the current
  password hash (auto-invalidated after use).
- Minimum password length: 8 characters.
- SMTP failures are logged server-side and never exposed to the client.

### Configuration (`.env`)
| Variable | Purpose |
|---|---|
| `MAIL_SERVER` / `MAIL_PORT` | SMTP host (Gmail: `smtp.gmail.com` / `587`) |
| `MAIL_USERNAME` / `MAIL_PASSWORD` | Sender account + **App Password** (Gmail requires 2-Step Verification) |
| `MAIL_FROM` / `MAIL_FROM_NAME` | From address and display name |
| `FRONTEND_BASE_URL` | Public base URL used in reset links, e.g. `https://headwaters-fes.tech` |

### Files
| File | Change |
|---|---|
| `backend/app/utils/mailer.py` | New: stdlib SMTP sender |
| `backend/app/utils/password_reset.py` | New: signed, expiring, single-use tokens |
| `backend/app/routes/auth.py` | `POST /api/auth/forgot-password`, `POST /api/auth/reset-password` |
| `backend/app/config.py` | MAIL_* + FRONTEND_BASE_URL settings |
| `src/js/pages/login.js` | Modal wired to the API |
| `src/reset-password.html`, `src/js/pages/reset-password.js` | New reset page (password + confirm, eye toggles) |
| `backend/tests/test_password_reset.py` | New tests (8 cases; SMTP mocked) |

### Server update
Add the `MAIL_*` and `FRONTEND_BASE_URL` variables to `backend/.env`,
then `systemctl restart fes`.

