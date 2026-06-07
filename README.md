# NexTalk

NexTalk is a real-time messaging platform with a premium dark UI, Firebase authentication, and a FastAPI backend. It supports direct and group chats, read receipts, typing indicators, contacts, message requests, group invitations, and in-app notifications.

---

## Table of contents

- [Architecture](#architecture)
- [Features](#features)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Prerequisites](#prerequisites)
- [Docker](#docker)
- [Development setup](#development-setup)
  - [1. PostgreSQL](#1-postgresql)
  - [2. Firebase](#2-firebase)
  - [3. Backend](#3-backend)
  - [4. Frontend](#4-frontend)
- [Environment variables](#environment-variables)
- [API overview](#api-overview)
- [WebSocket protocol](#websocket-protocol)
- [Scripts reference](#scripts-reference)
- [Production notes](#production-notes)

---

## Architecture

NexTalk is a monorepo with two apps:

| Layer | Directory | Role |
|-------|-----------|------|
| **Frontend** | `Frontend/` | React SPA/SSR app — auth, chat UI, profile |
| **Backend** | `Backend/` | REST + WebSocket API, PostgreSQL, file uploads |

```mermaid
flowchart TB
  subgraph client [Frontend — localhost:5173]
    UI[React + TanStack Router]
    FBAuth[Firebase Auth SDK]
    UI --> FBAuth
    UI -->|REST Bearer token| API
    UI -->|WebSocket ?token=| WS
  end

  subgraph server [Backend — localhost:8000]
    API[FastAPI REST /api/v1]
    WS[WebSocket /api/v1/ws]
    FirebaseAdmin[Firebase Admin SDK]
    API --> FirebaseAdmin
    WS --> FirebaseAdmin
    API --> DB[(PostgreSQL)]
    WS --> DB
    API --> Static[/static/uploads]
  end

  FBAuth -->|ID token| Firebase[(Firebase Auth)]
  FirebaseAdmin -->|verify token| Firebase
```

**Auth flow**

1. The user signs in on the frontend via Firebase (email/password or Google).
2. Firebase returns an ID token.
3. The frontend sends that token as `Authorization: Bearer <token>` on REST calls and as `?token=` on the WebSocket.
4. The backend verifies the token with Firebase Admin and maps it to an app user in PostgreSQL (`POST /api/v1/auth/sync` on first sign-in).

**Real-time messaging**

- One persistent WebSocket per user (`/api/v1/ws`).
- Conversation events (messages, typing, receipts) are multiplexed over that single connection.
- REST endpoints exist as fallbacks (e.g. `POST /api/v1/messages`).

**Current integration status**

- **Auth & profile** — wired to the live API (`Frontend/src/lib/auth.tsx`, `Frontend/src/lib/api.ts`).
- **Chat UI** — currently driven by mock data (`Frontend/src/lib/mock-data.ts`) for layout and UX; backend endpoints are ready for full wiring.

---

## Features

### Authentication & users
- Email/password sign-up and sign-in
- Google OAuth sign-in
- Password reset flow (`/reset-password`)
- Profile page with username updates (`/profile`)
- Account deletion (`DELETE /api/v1/auth/me`)

### Messaging
- Direct (1:1) and group conversations
- Real-time delivery over WebSocket
- Text and image messages (JPEG, PNG, GIF, WebP up to 10 MB)
- Message history with cursor-based pagination
- Read receipts: `sent` → `delivered` → `read`
- Typing indicators with auto-stop after 3 seconds
- Per-user rate limiting (default: 60 messages/minute)

### Social & discovery
- Contact list and contact requests
- Message requests inbox (accept / decline)
- User search by username

### Groups
- Create groups with name and description
- Invite members (pending → accepted / rejected)
- Admin and member roles
- Per-member bubble colors
- Group metadata editing, member add/remove
- Soft-delete conversations (resurface on new activity)

### Notifications
- In-app notifications for contact requests, group invitations, and invitation responses
- Unread count and mark-as-read endpoints
- Real-time push over WebSocket for group invitations

### UI
- Glassmorphism dark theme with light mode toggle
- Responsive layout (sidebar / chat / right panel)
- Mobile-friendly chat navigation

---

## Tech stack

### Frontend (`Frontend/`)

| Category | Technology |
|----------|------------|
| Framework | React 19, TanStack Start, TanStack Router |
| Data fetching | TanStack Query |
| Styling | Tailwind CSS 4, Radix UI, Lucide icons |
| Auth | Firebase Auth (Web SDK) |
| Forms | React Hook Form + Zod |
| Build | Vite 7, Nitro (SSR/production build) |
| Language | TypeScript |

### Backend (`Backend/`)

| Category | Technology |
|----------|------------|
| Framework | FastAPI |
| Server | Uvicorn |
| Database | PostgreSQL + SQLAlchemy 2 (async) + asyncpg |
| Auth | Firebase Admin SDK (ID token verification) |
| Real-time | Native WebSockets |
| Migrations | Alembic (listed in deps; tables auto-created in dev) |
| Language | Python 3.11 |

---

## Project structure

```
NexTalk/
├── Frontend/
│   ├── src/
│   │   ├── routes/              # File-based routes (/, /auth, /profile, /reset-password)
│   │   ├── components/
│   │   │   ├── nextalk/         # Chat shell (Sidebar, ChatView, RightPanel, …)
│   │   │   ├── profile/         # Profile settings
│   │   │   └── ui/              # Shared Radix/shadcn-style primitives
│   │   ├── lib/
│   │   │   ├── auth.tsx         # AuthProvider + Firebase session
│   │   │   ├── api.ts           # REST client (sync, profile)
│   │   │   ├── firebase.ts      # Firebase app init
│   │   │   └── mock-data.ts     # Mock conversations (UI dev)
│   │   ├── router.tsx
│   │   └── server.ts            # SSR error wrapper
│   ├── vite.config.ts
│   └── package.json
│
└── Backend/
    ├── src/
    │   ├── main.py              # FastAPI app entry
    │   ├── api/
    │   │   ├── deps.py          # Auth dependencies
    │   │   └── routes/          # auth, users, contacts, conversations, …
    │   ├── core/                # config, firebase, rate_limit
    │   ├── db/                  # engine, session, models registry
    │   ├── models/              # SQLAlchemy models
    │   ├── schemas/             # Pydantic request/response schemas
    │   └── services/            # messaging, websocket, notifications, receipts
    ├── static/uploads/          # Uploaded images (gitignored)
    ├── requirements.txt
    └── .env.example
```

---

## Prerequisites

- **Node.js** 20+ and npm
- **Python** 3.11 (use the project venv in `Backend/.venv`)
- **PostgreSQL** 14+ running locally or remotely
- A **Firebase** project with:
  - Authentication enabled (Email/Password + Google)
  - A Web app registered (for frontend config)
  - A service account JSON key (for backend Admin SDK)

---

## Docker

Run the full stack (PostgreSQL + Backend + Frontend) with Docker Compose.

### Quick start

```bash
# 1. Configure environment
cp .env.example .env
# Edit .env — add Firebase Web SDK vars and FIREBASE_PROJECT_ID

# 2. Add Firebase Admin credentials (service account JSON)
cp /path/to/your-firebase-adminsdk.json Backend/firebase-credentials.json

# 3. Start development stack
docker compose up --build
```

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| PostgreSQL | localhost:5432 |

### Environment files

| File | Purpose |
|------|---------|
| `.env` (repo root) | Used by Docker Compose — Postgres, backend, frontend vars |
| `.env.example` (repo root) | Template for Docker Compose |
| `Backend/.env` | Local backend dev only (without Docker) |
| `Frontend/.env` | Local frontend dev only (without Docker) |

Docker Compose reads the root `.env` and injects `DATABASE_URL` pointing at the `db` service. `VITE_API_URL` must stay as `http://localhost:8000` so the browser can reach the API from your host machine.

### Common commands

```bash
# Development (hot reload on backend src + frontend)
docker compose up --build

# Run in background
docker compose up -d --build

# View logs
docker compose logs -f backend

# Stop and remove containers
docker compose down

# Stop and remove containers + database volume
docker compose down -v
```

### Production compose

Builds optimized images (no source mounts). Frontend is served on port **3000**.

```bash
cp .env.example .env
# Set VITE_API_URL and CORS_ORIGINS for your production domain
# Set FRONTEND_URL=http://localhost:3000 (or your domain)

docker compose -f docker-compose.prod.yml up --build -d
```

### Docker architecture

```mermaid
flowchart LR
  subgraph compose [docker compose]
    FE[frontend :5173]
    BE[backend :8000]
    DB[(postgres :5432)]
  end

  Browser --> FE
  Browser --> BE
  BE --> DB
  BE --> Firebase[(Firebase Admin)]
  FE --> FirebaseAuth[(Firebase Auth)]
```

**Volumes**
- `postgres_data` — database persistence
- `backend_uploads` — uploaded images
- `frontend_node_modules` — cached npm packages (dev only)

---

## Development setup

Run locally without Docker, or use [Docker](#docker) above.

Run PostgreSQL, the backend, and the frontend in separate terminals.

### 1. PostgreSQL

Create a database and user:

```bash
createdb nextalk
# Or via psql:
# CREATE DATABASE nextalk;
# CREATE USER nextalk WITH PASSWORD 'changeme';
# GRANT ALL PRIVILEGES ON DATABASE nextalk TO nextalk;
```

Default connection string used by the backend:

```
postgresql+asyncpg://nextalk:changeme@localhost:5432/nextalk
```

Tables are auto-created on backend startup in development. Use Alembic migrations for production.

### 2. Firebase

**Frontend** — Firebase Console → Project settings → Your apps → Web app. Copy the config values into `Frontend/.env` (see [Environment variables](#environment-variables)).

**Backend** — Firebase Console → Project settings → Service accounts → Generate new private key. Save the JSON file inside `Backend/` and set `FIREBASE_CREDENTIALS_PATH` in `Backend/.env`.

Enable sign-in methods under Authentication → Sign-in method:
- Email/Password
- Google (optional but supported)

For password reset, add your dev URL (`http://localhost:5173`) to **Authorized domains** in Firebase Authentication settings.

### 3. Backend

Always use the project virtual environment — do not run `uvicorn` from the system Python.

```bash
cd Backend

# Create venv with Python 3.11 (Homebrew: brew install python@3.11)
python3.11 -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate

# Confirm you're in the venv (path should include Backend/.venv)
which python uvicorn

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env — set DATABASE_URL, FIREBASE_CREDENTIALS_PATH, CORS_ORIGINS

# Start the API server (must be run with venv activated)
uvicorn src.main:app --reload --port 8000
```

Verify:
- Health check: [http://localhost:8000/health](http://localhost:8000/health)
- Interactive API docs: [http://localhost:8000/docs](http://localhost:8000/docs)

### 4. Frontend

```bash
cd Frontend

npm install

# Create .env (see Environment variables below)
# VITE_API_URL must point at the backend

npm run dev
```

Open [http://localhost:5173](http://localhost:5173).

**Typical dev URLs**

| Service | URL |
|---------|-----|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8000 |
| API docs | http://localhost:8000/docs |
| WebSocket | ws://localhost:8000/api/v1/ws?token=&lt;firebase_id_token&gt; |

---

## Environment variables

### Frontend (`Frontend/.env`)

Copy from `.env.example`:

```bash
cp Frontend/.env.example Frontend/.env
```

```env
# Firebase Web SDK — Firebase Console → Project settings → Your apps
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

# Backend API base URL
VITE_API_URL=http://localhost:8000
```

### Docker Compose (root `.env`)

Used when running `docker compose up`. Copy from the repo root:

```bash
cp .env.example .env
```

See [Docker](#docker) for the full variable list and Firebase credentials setup.

### Backend (`Backend/.env`)

Copy from `.env.example`:

```env
# PostgreSQL (asyncpg driver)
DATABASE_URL=postgresql+asyncpg://nextalk:changeme@localhost:5432/nextalk

# Firebase Admin SDK
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CREDENTIALS_PATH=path-to-service-account.json

# CORS — must include the frontend origin
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,http://127.0.0.1:5173

# Rate limiting
MESSAGE_RATE_LIMIT_PER_MINUTE=60
```

> **Security:** Never commit `.env` files, Firebase service account JSON, or API keys. These paths are covered by `.gitignore`.

---

## API overview

All REST routes are prefixed with `/api/v1`. Authenticated routes require:

```
Authorization: Bearer <firebase_id_token>
```

| Route prefix | Description |
|--------------|-------------|
| `POST /auth/sync` | Create or fetch app user after Firebase sign-in |
| `DELETE /auth/me` | Delete account (Firebase + DB) |
| `GET/PATCH /users/me` | Profile read/update |
| `GET /users/search` | Search users by username |
| `GET/POST/DELETE /contacts` | Contact list, send request, remove |
| `GET /contacts/search` | Search contacts |
| `GET /message-requests` | Pending inbound requests |
| `POST /message-requests/{id}/accept\|decline` | Handle requests |
| `GET/POST /conversations` | List / create (direct or group) |
| `GET /conversations/unread-counts` | Unread badges |
| `GET /conversations/{id}/messages` | Paginated history |
| `POST /conversations/{id}/read` | Mark conversation read |
| `POST /conversations/{id}/invite` | Invite to group |
| `POST /uploads/image` | Upload image attachment |
| `GET /notifications` | Notification inbox |
| `GET /health` | Health check (no auth) |

Static uploads are served at `/static/uploads/<filename>`.

---

## WebSocket protocol

**Connect:** `ws://localhost:8000/api/v1/ws?token=<firebase_id_token>`

**Client → server events**

| type | Payload | Description |
|------|---------|-------------|
| `ping` | — | Keep-alive; server replies `pong` |
| `join_conversation` | `conversation_id` | Subscribe to a conversation |
| `leave_conversation` | `conversation_id` | Unsubscribe |
| `send_message` | `conversation_id`, `body?`, `image_url?` | Send a message |
| `typing` | `conversation_id`, `is_typing` | Typing indicator |
| `mark_read` | `conversation_id` | Mark messages read |

**Server → client events (examples)**

| type | Description |
|------|-------------|
| `message_sent` | New message in a joined conversation |
| `receipt_updated` | Read/delivered status change |
| `typing_started` / `typing_stopped` | Another user is typing |
| `group_invitation` | Real-time group invite notification |
| `joined_conversation` / `left_conversation` | Join/leave ack |
| `error` | Validation or handler error |

A legacy per-conversation endpoint also exists at `/api/v1/ws/{conversation_id}?token=`.

---

## Scripts reference

### Frontend

```bash
npm run dev       # Start Vite dev server (port 5173)
npm run build     # Production build
npm run preview   # Preview production build
npm run lint      # ESLint
npm run format    # Prettier
```

### Backend

```bash
uvicorn src.main:app --reload --port 8000   # Development
uvicorn src.main:app --host 0.0.0.0 --port 8000   # Production-style
```

---

## Production notes

- Replace auto `create_all` with **Alembic migrations** for schema changes.
- Serve the frontend build via your hosting provider (Nitro/Cloudflare target is configured in the Vite TanStack config).
- Store uploads on durable object storage in production instead of local disk if scaling horizontally.
- Set `CORS_ORIGINS` to your production frontend URL(s).
- Use environment-specific Firebase projects for staging and production.
- Configure `MESSAGE_RATE_LIMIT_PER_MINUTE` as needed for abuse prevention.

---

## License

Private project — all rights reserved unless otherwise specified.
