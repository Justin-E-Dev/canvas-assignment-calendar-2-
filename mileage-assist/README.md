# Mileage Assist

A daily mileage log for desktop and mobile, written in Java (Spring Boot 3.5, Java 21).
It uses no AI and no paid services at runtime: everything runs on your own server.

## Features
- Sign up with email, first name and password; sign in with password or **biometrics**
  (passkeys: Face ID, Touch ID, Windows Hello, Android fingerprint).
- Daily log: initials (remembered and offered as a drop-down / tap chips), start and end
  location, odometer start and end, date filled in automatically, trip miles calculated.
- Spreadsheet view: every trip in an editable grid (click/tap a cell, saves automatically),
  **Export as CSV**, and **Open in Excel** (downloads a native `.xlsx`).
- Installable on phones as a home-screen app (web app manifest).

## Security
| Area | How |
|---|---|
| Passwords | Argon2id hashing (Spring Security + Bouncy Castle), done on the server; never sent to a third party |
| Biometric login | WebAuthn passkeys via Spring Security; fingerprints/face data never leave the device |
| Brute force | 5 wrong passwords locks the email for 15 minutes |
| Sessions | HttpOnly session cookie, SameSite, session id rotated at login, 8 h timeout |
| CSRF | Token required on every write |
| Data isolation | Every SQL query is scoped to the signed-in user's id |
| Data at rest | H2 database file encrypted with AES |
| Browser | Strict Content-Security-Policy (no inline scripts), no framing, no referrer |
| Exports | CSV cells starting with `= + - @` are neutralised against formula injection |

## Run locally
Requires Java 21 and Maven.
```bash
cd mileage-assist
mvn spring-boot:run
```
Open http://localhost:8080. Passkeys work on `localhost`; elsewhere they need HTTPS.

## Tests
```bash
mvn test
```

## Production settings (environment variables)
| Variable | Example | Purpose |
|---|---|---|
| `MA_DB_PASSWORD` | `<long-random-file-key> <long-random-db-password>` | **Required.** Two words: the AES file key, then the DB password. Set once; changing it later makes existing data unreadable. |
| `MA_DB_URL` | `jdbc:h2:file:/data/mileage;CIPHER=AES` | Where the database file lives (use a persistent disk). |
| `MA_RP_ID` | `mileage.example.com` | Domain for passkeys. |
| `MA_ALLOWED_ORIGINS` | `https://mileage.example.com` | Exact https origin for passkeys. |
| `MA_SECURE_COOKIES` | `true` | Cookies only over HTTPS. |
| `MA_FORWARD_HEADERS` | `native` | Set when running behind a proxy/load balancer. |
| `PORT` | `8080` | HTTP port. |

Note: this Java server cannot run on Vercel (the repo's `.vercelignore` keeps it out of the
existing site). It needs a host that runs Java with a persistent disk; hosting is still to be chosen.
