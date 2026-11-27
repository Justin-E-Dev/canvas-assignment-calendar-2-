# Mileage Assist (Vercel version)

Daily mileage log with biometric sign-in, editable spreadsheets, Excel templates and a
reimbursement dashboard. Runs on Vercel with a Neon Postgres database. No AI is used.

## Put it online (one-time, about 5 minutes)

1. **Make an encryption key.** In PowerShell, run:
   ```powershell
   $b = New-Object byte[] 32; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($b); [Convert]::ToBase64String($b)
   ```
   Copy the result and **save it somewhere safe** (a password manager). If it's lost, the stored
   data can't be read; if it leaks, change it before more data is added.
2. In Vercel: **Add New → Project →** import this GitHub repository.
   - **Root Directory:** `mileage-assist-web`
   - **Framework Preset:** Other
3. Under **Environment Variables**, add:
   - `MA_DATA_KEY` = the key from step 1
   - `MA_ALLOWED_SIGNUP_EMAILS` = your email (comma-separate several). Nobody else can create an account.
4. Click **Deploy**.
5. In the new project: **Storage → Create Database → Neon (Postgres)** → connect it to this project.
   This adds `DATABASE_URL` automatically.
6. **Deployments → ⋯ → Redeploy**, then open the project's `.vercel.app` address and create your account.

Every push to `main` redeploys automatically.

## Security
| Area | How |
|---|---|
| Stored data | Client names, locations, programs, initials, name, email and templates are encrypted with AES-256-GCM in the app before reaching the database; each value is bound to its owner and field |
| Passwords | Argon2id (64 MB, 3 passes); never stored or logged in plain text |
| Biometric login | Passkeys (WebAuthn) with user verification required; only a public key is stored |
| Accounts | Sign-ups closed except emails in `MA_ALLOWED_SIGNUP_EMAILS` |
| Sessions | Random token in a `__Host-` HttpOnly, Secure, SameSite=Strict cookie; server-side; 2 h idle / 8 h max |
| Brute force | 5 wrong passwords locks the email, 30 locks the network address, for 15 minutes |
| CSRF | Double-submit token plus same-origin check on every change |
| Isolation | Every query is scoped to the signed-in user |
| Browser | Strict Content-Security-Policy, HSTS, no framing, no referrer, not indexed by search engines |
| Uploads | .xlsx only, 4 MB max, zip-bomb check |
| Exports | CSV formula injection neutralised |
| Database link | TLS with certificate verification |

## Develop locally
Needs Node 22 and a Postgres database.
```bash
npm install
DATABASE_URL=postgres://user@localhost:5432/mileage npm run dev
npm test
```
