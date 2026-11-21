# 12 Movies of Christmas

A small Express and Prisma/SQLite app for a private movie calendar with friend accounts,
ratings, comments, reactions and Friends' Pick voting.

## Production setup

Run this app on a Node.js 22+ host and put it behind HTTPS (a managed host or a
reverse proxy such as Caddy or nginx). Configure these environment variables:

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | Yes | Set to `production` to enable secure session cookies and production checks. |
| `SECRET` | Yes | At least 32 random bytes, kept private and stable between restarts. |
| `ADMIN_USER` | Yes | Initial or bootstrap administrator username (3–32 letters, numbers, dots, underscores or hyphens). |
| `ADMIN_PASS` | Yes | Initial or bootstrap administrator password (12+ characters, no more than 72 UTF-8 bytes). |
| `DB_PATH` | Yes for hosted deployments | Absolute path to a SQLite file on persistent, writable storage. |
| `DATABASE_URL` | Yes for Prisma CLI deploys | SQLite Prisma URL, for example `file:/absolute/path/advent.db`. |
| `PORT` | Usually provided by the host | Port for the HTTP server. |
| `TRUST_PROXY_HOPS` | Only behind a proxy | Number of trusted proxy hops, such as `1` for one reverse proxy. Keep the app port inaccessible except through that proxy. |
| `REGISTRATION_ENABLED` | No | Public sign-up is disabled by default in production. Set to `true` to allow it; admins can always add accounts. In development, sign-up is enabled unless set to `false`. |
| `APP_BASE_URL` | Yes for email reset | Public HTTPS base URL, for example `https://movies.example.com`. |
| `BREVO_API_KEY` | Yes for email reset | Brevo API key kept in the host's secret settings. |
| `BREVO_SENDER_EMAIL` | Yes for email reset | Verified Brevo sender email address. |
| `BREVO_SENDER_NAME` | No | Email sender name; defaults to `12 Movies of Christmas`. |

Generate a signing secret with a cryptographically secure random generator, for
example `openssl rand -hex 32`. Do not commit secrets or `.env` files. The app
does not load `.env` files itself; configure variables in the host's secret or
environment-variable settings.

For a custom domain, point the DNS records required by your host at the
deployment, add the domain in the host or reverse proxy, and enable its TLS
certificate. Only expose the app through that HTTPS endpoint. When there is one
trusted proxy in front of the app, set `TRUST_PROXY_HOPS=1`.

SQLite data is only durable if `DB_PATH` is on persistent storage. The default
database path is inside the application directory and is suitable only for
local development. Back up the database volume independently: the admin JSON
backup contains door/movie and vote configuration, but not accounts, ratings,
comments, reactions or watch progress.

Run one app instance against the SQLite database. The login/signup throttles
keep their counters in process memory, and this setup is not intended for a
multi-instance deployment.

`ADMIN_USER` and `ADMIN_PASS` bootstrap the admin account on every start. Keep
these values stable and private; changing `ADMIN_PASS` rotates that account's
password at the next restart. Use the admin page to create friend accounts.
Set `REGISTRATION_ENABLED=true` only if you want anyone to be able to create an
account from the public registration page.

## Local development

```sh
npm install
npm start
```

After pulling password-reset changes locally, apply migrations and generate the
Prisma client:

```sh
npx prisma migrate dev
npx prisma generate
npm start
```

The existing SQLite data is preserved. The migration adds `mustChange` and
`tokenVersion` to friend accounts with safe defaults.

Create a local `.env` from the template:

```sh
cp .env.example .env
```

Then set `BREVO_API_KEY` and `BREVO_SENDER_EMAIL`. The sender email must be
verified in Brevo. Keep `.env` untracked; it is already excluded by `.gitignore`.

## Production migrations

Run migrations after installing dependencies and before starting the application:

```sh
npx prisma migrate deploy
npm start
```

For a build-and-start hosting platform, add `npx prisma migrate deploy` to the
release or deploy command, before the start command. Use the existing persistent
`DB_PATH` database and configure `DATABASE_URL`/Prisma's SQLite datasource when
the host requires it.

Without production environment variables, the app generates an ephemeral
development signing secret at startup. Existing development sessions therefore
expire when the server restarts.
