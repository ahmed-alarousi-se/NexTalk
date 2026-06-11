# NexTalk — Full System Documentation

> **Version:** 2.0.0
> **Stack:** FastAPI · PostgreSQL · React 19 · Firebase Auth · WebRTC
> **Prepared by:** System Analysis & Design Review

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Repository Structure](#2-repository-structure)
3. [Tech Stack](#3-tech-stack)
4. [Environment Configuration](#4-environment-configuration)
5. [Architecture Overview](#5-architecture-overview)
6. [Authentication](#6-authentication)
7. [Database Design](#7-database-design)
8. [REST API Reference](#8-rest-api-reference)
9. [WebSocket Protocol](#9-websocket-protocol)
10. [Real-Time Messaging](#10-real-time-messaging)
11. [Calls (WebRTC)](#11-calls-webrtc)
12. [Notifications](#12-notifications)
13. [File Uploads](#13-file-uploads)
14. [Frontend Architecture](#14-frontend-architecture)
15. [Business Rules & Constraints](#15-business-rules--constraints)
16. [Security Considerations](#16-security-considerations)
17. [Known Limitations & Roadmap](#17-known-limitations--roadmap)

---

## 1. Project Overview

NexTalk is a **real-time messaging platform** built as a full-stack monorepo. It supports:

- **Direct messaging** between two users
- **Group chats** (up to 50 members by default)
- **Contact management** (add, search, block, message requests)
- **Read receipts** per recipient — `sent → delivered → read` (like WhatsApp's tick system)
- **Typing indicators** with 3-second auto-cancel
- **Presence tracking** — online/offline + last seen timestamp
- **Audio and video calls** via WebRTC (peer-to-peer, STUN-assisted)
- **Image sharing** (inline upload, hosted on local disk)
- **In-app notifications** (persisted + real-time push)
- **PWA** manifest and offline-capable shell

The architecture is deliberately similar to **Telegram Web** (one multiplexed WebSocket per user, server-side receipt tracking, keyset pagination via ULID cursor) and **WhatsApp** (bidirectional contact model, per-recipient receipt rows, call log messages in thread).

---

## 2. Repository Structure

```
NexTalk/
├── docker-compose.yml          # Dev stack: Postgres + Backend + Frontend
├── docker-compose.prod.yml     # Production build
├── docs/                       # ← You are here
│   ├── README.md               # This file
│   ├── ERD.md                  # Entity Relationship Diagram (Mermaid)
│   ├── system-diagram.md       # Architecture + sequence diagrams
│   └── class-diagram.md        # Backend models, services, frontend classes
│
├── Backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── postman/                # Postman collection
│   └── src/
│       ├── main.py             # FastAPI app entry point
│       ├── api/
│       │   ├── deps.py         # Firebase auth dependency
│       │   └── routes/         # One file per resource
│       ├── core/
│       │   ├── config.py       # pydantic-settings
│       │   ├── firebase.py     # Firebase Admin SDK
│       │   └── rate_limit.py   # Sliding window limiter
│       ├── db/
│       │   ├── session.py      # Async engine + session
│       │   └── types.py        # UTCDateTime column type
│       ├── models/             # SQLAlchemy ORM (8 tables)
│       ├── schemas/            # Pydantic request/response + WS events
│       ├── services/           # Business logic layer
│       └── utils/
│
└── Frontend/
    ├── Dockerfile
    ├── package.json
    └── src/
        ├── routes/             # TanStack Router file-based routes
        ├── components/
        │   ├── nextalk/        # App UI components
        │   └── ui/             # shadcn/Radix primitives (~40 components)
        └── lib/                # All app logic: API, auth, WS, chat, calls
```

---

## 3. Tech Stack

### Backend

| Layer | Technology |
|---|---|
| Framework | FastAPI 0.111 |
| Language | Python 3.11+ |
| ASGI Server | Uvicorn (with standard extras) |
| ORM | SQLAlchemy 2 (async) |
| DB Driver | asyncpg 0.30 |
| Database | PostgreSQL (any managed or local) |
| Auth | Firebase Admin SDK 6.5 (`verify_id_token`) |
| Config | pydantic-settings 2.2 |
| IDs | UUID v4 (rows) · python-ulid 3 (message cursors) |
| Migrations | Alembic listed in deps — **not yet configured** (uses `create_all`) |

### Frontend

| Layer | Technology |
|---|---|
| Framework | React 19 |
| Router | TanStack Router (file-based) + TanStack Start (SSR shell) |
| Data fetching | TanStack Query 5 |
| Auth | Firebase Web SDK 12 |
| Styling | Tailwind CSS 4 |
| Component library | shadcn/ui (Radix primitives) |
| Build tool | Vite 7 |
| Language | TypeScript |
| Validation | Zod |
| Date | date-fns |
| Emoji | emoji-mart |

---

## 4. Environment Configuration

### Backend (`Backend/.env`)

```env
DATABASE_URL=postgresql+asyncpg://user:pass@host:5432/dbname
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CREDENTIALS_JSON={"type":"service_account",...}   # one line
FRONTEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173,https://your-domain.com
CORS_ALLOW_LOCALHOST=true
MESSAGE_RATE_LIMIT_PER_MINUTE=60
```

> `DATABASE_URL` is normalised in `core/config.py` to strip `postgresql://` and replace with `postgresql+asyncpg://`. SSL `connect_args` are applied automatically when the host is not `localhost`.

### Frontend (`Frontend/.env`)

```env
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_API_URL=http://localhost:8000
```

---

## 5. Architecture Overview

NexTalk follows a layered, event-driven architecture:

```
Browser (React PWA)
  ↓ REST (Authorization: Bearer <firebase_jwt>)
  ↓ WebSocket (?token=<firebase_jwt>)
FastAPI Backend :8000
  ↓ SQLAlchemy async
PostgreSQL
```

The backend uses a **single global `WebSocketManager` singleton** that holds all active connections in memory. Events (messages, typing, presence, receipts) flow through this manager to targeted users or conversation rooms.

**Firebase Auth** acts as the identity layer — the backend never stores passwords. It calls `firebase_admin.auth.verify_id_token()` on every protected request.

See `docs/system-diagram.md` for full sequence diagrams.

---

## 6. Authentication

### Sign-in Flow

1. **Firebase SDK** (frontend) authenticates the user via email/password or Google OAuth.
2. Firebase returns a signed **ID token** (JWT, 1-hour TTL).
3. Frontend calls `POST /api/v1/auth/sync` with the token as `Bearer` in the `Authorization` header.
4. Backend calls `firebase_admin.auth.verify_id_token(token)` and upserts a `users` row.
5. All subsequent REST and WebSocket requests carry the same token (auto-refreshed via `onIdTokenChanged`).

### Backend Auth Dependency (`api/deps.py`)

```python
async def get_current_user(
    token: HTTPAuthorizationCredentials = Depends(HTTPBearer()),
    db: AsyncSession = Depends(get_db),
) -> User:
    decoded = verify_firebase_token(token.credentials)
    user = await db.scalar(select(User).where(User.firebase_uid == decoded["uid"]))
    user.last_seen = utcnow()
    await db.commit()
    return user
```

### WebSocket Auth

Token is passed as a query parameter: `WS /api/v1/ws?token=<firebase_id_token>` because browsers do not support custom headers on WebSocket connections.

### Account Deletion

`DELETE /api/v1/auth/me` removes the `users` row from the database and calls `firebase_auth.delete_user(uid)` to remove the Firebase identity.

---

## 7. Database Design

> For the full ERD with Mermaid diagram, see `docs/ERD.md`.

### Tables

| Table | Rows | Purpose |
|---|---|---|
| `users` | One per account | Profile, privacy settings, last seen |
| `conversations` | One per chat thread | Direct or group chat metadata |
| `conversation_members` | N per conversation | Per-member state: role, read cursor, mute, soft-delete |
| `messages` | N per conversation | Text, image, or call log |
| `message_receipts` | N per message × recipients | Per-user delivery/read status |
| `contacts` | N per user | Social graph (directional: owner → contact) |
| `message_requests` | N per pair | Pending requests from non-contacts |
| `user_blocks` | N per pair | Block list (enforced app-wide) |
| `notifications` | N per user | Persistent in-app notification inbox |

### Schema Management

The database schema is created on startup via `Base.metadata.create_all()` in `main.py`. Alembic is listed in `requirements.txt` but **not yet configured**. There are inline SQL `ALTER TABLE` patches in `main.py` for additive changes (column additions, timestamptz normalization).

**Recommendation:** Replace `create_all` + patches with proper Alembic migrations before going to production.

---

## 8. REST API Reference

**Base URL:** `/api/v1`
**Auth:** `Authorization: Bearer <firebase_id_token>` on all endpoints except `/health`.

### Auth

| Method | Path | Body | Response | Notes |
|---|---|---|---|---|
| `POST` | `/auth/sync` | `{username?}` | `UserProfile` | Upsert user after Firebase sign-in |
| `DELETE` | `/auth/me` | — | `204` | Delete DB row + Firebase account |

### Users

| Method | Path | Notes |
|---|---|---|
| `GET` | `/users/me` | Current user profile |
| `PATCH` | `/users/me` | Update username, email, avatar_url, show_last_seen, read_receipts_enabled |
| `GET` | `/users/search?q=` | Search by username or email; blocked users excluded |
| `GET` | `/users/blocks` | List of users the current user has blocked |
| `POST` | `/users/blocks` | Block `{user_id}` |
| `DELETE` | `/users/blocks/{user_id}` | Unblock |

### Contacts

| Method | Path | Notes |
|---|---|---|
| `GET` | `/contacts` | Current user's contact list |
| `POST` | `/contacts` | Send contact/message request `{username}` |
| `GET` | `/contacts/search?q=` | Search within contacts |
| `DELETE` | `/contacts/{contact_user_id}` | Remove contact |

### Message Requests

| Method | Path | Notes |
|---|---|---|
| `GET` | `/message-requests` | Pending inbound requests |
| `POST` | `/message-requests/{id}/accept` | Accept → creates bidirectional contacts |
| `POST` | `/message-requests/{id}/decline` | Decline |

### Conversations

| Method | Path | Notes |
|---|---|---|
| `GET` | `/conversations` | Paginated list (excludes soft-deleted) |
| `POST` | `/conversations` | Create direct `{type:"direct", participant_id}` or group |
| `GET` | `/conversations/unread-counts` | Per-conversation unread + total |
| `GET` | `/conversations/search?q=` | Discover groups by name |
| `GET` | `/conversations/{id}/messages` | History (keyset cursor pagination) |
| `GET` | `/conversations/{id}/media` | Image gallery (cursor pagination) |
| `GET` | `/conversations/{id}/details` | Group info + members |
| `POST` | `/conversations/{id}/read` | Mark conversation read |
| `DELETE` | `/conversations/{id}` | Soft-delete for current user |
| `PATCH` | `/conversations/{id}` | Update group name/description (admin only) |
| `POST` | `/conversations/{id}/invite` | Invite users `{user_ids}` |
| `POST` | `/conversations/{id}/invite/accept` | Accept invitation |
| `POST` | `/conversations/{id}/invite/reject` | Reject invitation |
| `POST` | `/conversations/{id}/join-request` | Request to join open group |
| `POST` | `/conversations/{id}/leave` | Leave group |
| `GET` | `/conversations/{id}/pending-invitations` | Admin: list pending invites |
| `POST` | `/conversations/{id}/members` | Admin: directly add member |
| `DELETE` | `/conversations/{id}/members/{user_id}` | Admin: remove member |
| `PATCH` | `/conversations/{id}/preferences` | Toggle mute `{is_muted}` |

### Messages

| Method | Path | Notes |
|---|---|---|
| `POST` | `/messages` | Send message (REST fallback, rate-limited) |
| `PATCH` | `/messages/{message_id}` | Edit message body |
| `POST` | `/messages/{message_id}/read` | Mark up to this message as read |

### Notifications

| Method | Path | Notes |
|---|---|---|
| `GET` | `/notifications` | Last 50 notifications + unread count |
| `GET` | `/notifications/unread-count` | Badge count only |
| `POST` | `/notifications/{id}/read` | Mark one notification read |
| `POST` | `/notifications/read-all` | Mark all read |

### Uploads

| Method | Path | Notes |
|---|---|---|
| `POST` | `/uploads/image` | Multipart form, returns `{url}` pointing to `/static/uploads/` |

### Health

| Method | Path | Response |
|---|---|---|
| `GET` | `/health` | `{"status":"ok","version":"2.0.0"}` |

---

## 9. WebSocket Protocol

### Connection

```
WS ws://host:8000/api/v1/ws?token=<firebase_id_token>
```

The legacy per-conversation endpoint `WS /api/v1/ws/{conversation_id}?token=` still exists but the primary path is the multiplexed single connection.

### Connection Lifecycle

1. Server verifies token via Firebase Admin SDK.
2. Server calls `ws_manager.connect()` — accepts the socket.
3. Server sweeps pending `sent` receipts and upgrades them to `delivered`.
4. Server updates `last_seen` and broadcasts `presence_updated(online=true)` to contacts.
5. Server sends `{type: "connected", user_id}`.
6. Client enters the message loop.
7. On disconnect: active calls are ended, `last_seen` is updated, `presence_updated(online=false)` is broadcast.

### Client → Server Events

| type | Required fields | Description |
|---|---|---|
| `ping` | — | Keepalive, server replies with `pong` |
| `join_conversation` | `conversation_id` | Enter a room — marks messages read, enables typing visibility |
| `leave_conversation` | `conversation_id` | Exit a room |
| `send_message` | `conversation_id`, `body?`, `image_url?` | Send a message (rate-limited) |
| `typing` | `conversation_id`, `is_typing` | Typing indicator (auto-stops after 3s) |
| `mark_read` | `conversation_id` | Mark all messages in room as read |
| `edit_message` | `message_id`, `body` | Edit message body (sender only) |
| `call_invite` | `call_id`, `to_user_id`, `conversation_id`, `call_type` | Initiate audio/video call |
| `call_accept` | `call_id` | Accept incoming call |
| `call_reject` | `call_id` | Decline incoming call |
| `call_end` | `call_id` | End active call |
| `call_offer` | `call_id`, `sdp` | WebRTC offer (relayed to callee) |
| `call_answer` | `call_id`, `sdp` | WebRTC answer (relayed to caller) |
| `ice_candidate` | `call_id`, `candidate` | ICE candidate relay |

### Server → Client Events

| type | Triggered when |
|---|---|
| `connected` | Successful WS handshake |
| `pong` | Response to `ping` |
| `joined_conversation` | Ack for `join_conversation` |
| `left_conversation` | Ack for `leave_conversation` |
| `new_message` | A message arrives in a joined room |
| `message_sent` | Ack to sender after message is stored |
| `message_edited` | A message in a joined room is edited |
| `message_delivered` | Receipt upgraded to delivered |
| `message_read` | Receipt upgraded to read |
| `typing_started` | A peer started typing |
| `typing_stopped` | A peer stopped typing (or 3s elapsed) |
| `presence_updated` | A contact came online or went offline |
| `unread_count_updated` | Badge count changed |
| `contact_request` | Someone sent you a contact request |
| `contact_request_accepted` | Your request was accepted |
| `contact_request_declined` | Your request was declined |
| `group_invitation` | You were invited to a group |
| `join_request` | Admin: someone requested to join your group |
| `member_left` | A member left a group you are in |
| `conversation_deleted` | Soft-delete ack |
| `notification` | In-app notification push |
| `call_incoming` | Incoming call |
| `call_ringing` | Callee is being notified |
| `call_accepted` | Callee accepted |
| `call_rejected` | Callee rejected |
| `call_missed` | Ring timeout expired |
| `call_ended` | Call was ended |
| `call_offer` | Relay WebRTC offer |
| `call_answer` | Relay WebRTC answer |
| `ice_candidate` | Relay ICE candidate |
| `error` | Handler or validation error |

---

## 10. Real-Time Messaging

### Send Path

```
Client sends {type:"send_message"}
  → WS handler validates (rate limit, block check, membership)
  → MessagingService.create_message()
      → INSERT messages (ULID cursor_key)
      → INSERT message_receipts for each recipient
        → status = "read"      if recipient is in the conversation room
        → status = "delivered" if recipient is online (WS connected)
        → status = "sent"      otherwise
  → emit_message_sent()
      → send_to_user(sender)  {type:"message_sent"}
      → broadcast_to_conversation() {type:"new_message"} (excluding sender)
      → for each offline recipient: {type:"unread_count_updated"}
```

### Receipt Progression

```
"sent"      → initial state when recipient is offline
"delivered" → upgraded on recipient's next WS connect (sweep on connection)
"read"      → upgraded when recipient joins the conversation room
              or explicitly sends {type:"mark_read"}
```

Receipt events respect the `read_receipts_enabled` user preference — if disabled, the read event is written but not emitted to the sender.

### Pagination

Messages use **keyset pagination** via the `cursor_key` (ULID) field:

```
GET /api/v1/conversations/{id}/messages?before=<cursor_key>&limit=50
```

This is efficient at any depth — no `OFFSET` scan — and naturally ordered because ULIDs are lexicographically monotonic.

### Typing Indicators

- Client sends `{type:"typing", is_typing:true}` on keystroke.
- Server broadcasts `typing_started` to all other room members.
- Server schedules a **3-second auto-stop** task; if a new `typing` arrives, the task is cancelled and rescheduled.
- Client can also explicitly send `{is_typing:false}`.

---

## 11. Calls (WebRTC)

### Call Session Lifecycle

```
call_invite  → session created (status: ringing, 45s ring timeout)
call_accept  → status: active, WebRTC signaling relay begins
call_end     → session removed, call log Message inserted
```

### Signaling

The backend acts as a **pure signaling relay** — it never touches the media:

```
Caller  →[call_offer sdp]→  Backend  →[call_offer sdp]→  Callee
Callee  →[call_answer sdp]→ Backend  →[call_answer sdp]→ Caller
Either  →[ice_candidate]→   Backend  →[ice_candidate]→   Other
```

After ICE negotiation, media flows **peer-to-peer** via Google STUN servers (`stun:stun.l.google.com:19302`).

### Call Log

When a call ends (any reason), a `Message` row is inserted with `message_type = "call"` and a `call_log` JSONB column:

```json
{
  "call_type": "audio",
  "duration_seconds": 142,
  "status": "ended",
  "caller_id": "...",
  "callee_id": "..."
}
```

This appears in the chat thread exactly like WhatsApp/Telegram call entries.

### Limitations

- **Direct conversations only** — group calls are not yet supported.
- Callee must be online (WS connected) to receive the call.
- **No TURN server** — calls will fail behind symmetric NAT without one.
- `CallSessionManager` is in-memory — call state does not survive a server restart.

---

## 12. Notifications

Notifications are both **persisted** (DB row) and **pushed** (WS event) simultaneously.

### Notification Types

| type | Trigger |
|---|---|
| `contact_request` | Someone sends a contact/message request |
| `contact_request_accepted` | Your request was accepted |
| `contact_request_declined` | Your request was declined |
| `group_invitation` | You were invited to a group |
| `invitation_accepted` | A member accepted your group invite |
| `invitation_rejected` | A member rejected your group invite |
| `join_request` | Someone requested to join your group |
| `system` | Platform announcements |

### Inbox

`GET /api/v1/notifications` returns the last 50 notifications along with `unread_count`. Notifications are marked read individually or in bulk via REST. Real-time badge updates arrive via `{type:"unread_count_updated"}` WS events.

---

## 13. File Uploads

- **Endpoint:** `POST /api/v1/uploads/image`
- **Content-Type:** `multipart/form-data`
- **Accepted:** JPEG, PNG, GIF, WebP
- **Max size:** 10 MB
- **Storage:** Local disk at `Backend/static/uploads/{uuid}.{ext}`
- **Served at:** `GET /static/uploads/{filename}`

The returned URL is stored as `messages.image_url` or `users.avatar_url`. For horizontal scaling, this must be replaced with object storage (AWS S3, GCS, Cloudflare R2, etc.).

---

## 14. Frontend Architecture

### Routing

TanStack Router with file-based routes:

| Route | File | Purpose |
|---|---|---|
| `/` | `routes/index.tsx` | Main chat shell |
| `/auth` | `routes/auth.tsx` | Sign in / Sign up |
| `/profile` | `routes/profile.tsx` | Account settings |
| `/reset-password` | `routes/reset-password.tsx` | Firebase password reset handler |

### State Management

The application uses **React Context + TanStack Query** (no Redux/Zustand):

| Provider | Responsibility |
|---|---|
| `AuthProvider` | Firebase user, ID token, `syncUser`, sign-in/out methods |
| `ChatProvider` | Conversation list, messages, contacts, notifications, WS event handling, all mutations |
| `CallProvider` | Active call state, WebRTC peer connection, call actions |

### WebSocket Client (`lib/ws.ts`)

`NexTalkSocket` is a singleton that wraps the browser `WebSocket` API:

- Auto-reconnects after 2 seconds on disconnect.
- Sends a `ping` every 25 seconds to prevent proxy timeouts.
- Exposes an event-emitter-style `.on(type, handler)` API.
- Consumed by `ChatProvider` and `CallProvider`.

### Component Hierarchy

```
routes/index.tsx
├── Sidebar              — conversation list, contacts, search, nav
├── ChatView             — message thread, composer, typing indicator
│   └── CallOverlay      — in-call overlay (mute, video, hang up)
├── RightPanel           — details, requests, notifications, discover, settings
└── ComposeDialog        — new DM or group creation dialog
```

### API Client (`lib/api.ts`)

Fully typed REST client (~383 lines) that wraps `fetch` with the Firebase ID token injected from `AuthProvider`. Throws typed `ApiError` on non-2xx responses.

---

## 15. Business Rules & Constraints

| Rule | Enforcement Layer |
|---|---|
| Username must be unique (global) | DB unique constraint + REST validation |
| Email must be unique | DB unique constraint |
| Only one direct conversation per user pair | Route logic (find-or-create) |
| Group max 50 members | `conversations.max_members` check in route |
| Message body max 10 000 characters | Pydantic schema validation (WS + REST) |
| Rate limit: 60 messages / minute / user | `core/rate_limit.py` (sliding window, in-process) |
| Only the sender can edit a message | `routes/messages.py` ownership check |
| Only group admins can: rename group, add/remove members, see pending invites | Role check in routes |
| Blocked users: cannot message, call, send contact requests, or appear in search | `services/blocks.py` enforced in all relevant paths |
| A message request is required before two non-contacts can DM | Route logic |
| Accepting a message request creates bidirectional contact rows | `routes/message_requests.py` |
| Soft-delete: conversation hidden for the deleting user; history hidden via `messages_hidden_before` | `conversation_members` update |
| Read receipts respect `read_receipts_enabled` per user | `services/receipts.py` |

---

## 16. Security Considerations

### What Is Well Handled

- **Token verification** on every request — no session storage, stateless.
- **Firebase ID tokens** are short-lived (1 hour) and auto-refreshed.
- **Block enforcement** is centralized and applied before any message/call/contact operation.
- **Membership checks** before every conversation action.
- **Rate limiting** prevents message spam.
- **`CORS_ALLOW_LOCALHOST`** flag is a dev convenience; must be `false` in production.

### Honest Gaps

| Issue | Risk | Recommendation |
|---|---|---|
| `FIREBASE_CREDENTIALS_JSON` in `.env` | High — private key exposure | Use a secrets manager (Vault, AWS Secrets Manager, GCP Secret Manager) |
| No Alembic migrations | Medium — risky `create_all` + ad-hoc patches in production | Add Alembic, run migrations in CI/CD |
| Local disk uploads | Medium — data loss on restart/scale-out | Migrate to S3/GCS/R2 |
| In-memory rate limiter | Medium — resets on restart, not shared across replicas | Use Redis-backed limiter |
| No TURN server | Medium — calls fail behind symmetric NAT | Deploy coturn or use a managed TURN service |
| No input sanitization beyond length limits | Low–Medium | Add HTML/XSS stripping on `body` fields if rendered as HTML |
| WebSocket token in URL query param | Low — token visible in proxy logs | Acceptable tradeoff (browser limitation); use short-lived tokens if logs are a concern |

---

## 17. Known Limitations & Roadmap

### Current Limitations

| Area | Limitation |
|---|---|
| **Scaling** | Single-process WebSocket manager — no horizontal scale without Redis pub/sub |
| **Calls** | Direct conversations only, no group calls, no TURN server |
| **Uploads** | Local disk storage, not suitable for multi-replica deployment |
| **Schema** | `create_all` without migrations is fragile in production |
| **Call state** | In-memory `CallSessionManager` — lost on restart |
| **Search** | Simple `ILIKE` search, no full-text index |
| **Push notifications** | No mobile push (FCM/APNs) — only in-app via WebSocket |

### Suggested Next Steps

1. **Add Alembic** — generate initial migration from current models; all future changes go through `alembic revision --autogenerate`.
2. **Redis adapter** — replace in-memory `WebSocketManager` and `RateLimiter` with Redis pub/sub + sorted sets for horizontal scale.
3. **Object storage** — move uploads to S3/GCS with presigned URLs.
4. **TURN server** — deploy `coturn` or integrate with a managed STUN/TURN API.
5. **FCM push** — send Firebase Cloud Messaging payloads for mobile/background notifications.
6. **Full-text search** — add `tsvector` column on `messages.body` + GIN index for `/search`.
7. **Group calls** — extend `CallSessionManager` to multi-participant sessions.
8. **Message reactions** — `message_reactions` table (`message_id`, `user_id`, `emoji`).
9. **Message threads / replies** — add `reply_to_message_id` FK on `messages`.
10. **Admin dashboard** — monitor WS connections, active calls, rate-limit violations.

---

## Related Documents

| Document | Location |
|---|---|
| Entity Relationship Diagram | [`docs/ERD.md`](./ERD.md) |
| System & Sequence Diagrams | [`docs/system-diagram.md`](./system-diagram.md) |
| Class Diagrams | [`docs/class-diagram.md`](./class-diagram.md) |
| Postman Collection | [`Backend/postman/NexTalk-API.postman_collection.json`](../Backend/postman/NexTalk-API.postman_collection.json) |
