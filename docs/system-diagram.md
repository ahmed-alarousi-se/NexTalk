# NexTalk — System Architecture Diagram

> Designed as an experience-first real-time messaging platform.
> Structurally similar to Telegram (multiplexed WebSocket, server-side receipt tracking)
> with Firebase Auth replacing Telegram's phone-number OTP.

---

## High-Level Architecture

```mermaid
flowchart TB
    subgraph client ["Client Layer (Browser / PWA)"]
        direction TB
        UI["React 19 UI\nTanStack Router + TanStack Query"]
        ChatCtx["ChatProvider\n(app state, WS events, mutations)"]
        CallCtx["CallProvider\n(WebRTC call state)"]
        WSClient["NexTalkSocket\n(auto-reconnect, 25s ping)"]
        FirebaseSDK["Firebase Auth SDK\n(token refresh, onIdTokenChanged)"]

        UI --> ChatCtx
        UI --> CallCtx
        ChatCtx --> WSClient
        CallCtx --> WSClient
        UI --> FirebaseSDK
    end

    subgraph backend ["Backend Layer (FastAPI :8000)"]
        direction TB
        REST["REST API\n/api/v1/*\n(HTTPBearer auth)"]
        WSAPI["WebSocket\n/api/v1/ws\n(?token= auth)"]
        WSMgr["WebSocketManager\n(in-memory, multi-socket/user)"]
        MsgSvc["MessagingService\n(create, emit, receipt logic)"]
        CallSvc["CallSessionManager\n(in-memory, 45s ring timeout)"]
        PresenceSvc["PresenceService\n(last_seen, online broadcast)"]
        RateLimit["RateLimiter\n(60 msg/min/user, sliding window)"]

        REST --> MsgSvc
        WSAPI --> WSMgr
        WSMgr --> MsgSvc
        WSMgr --> CallSvc
        WSMgr --> PresenceSvc
        REST --> RateLimit
        WSAPI --> RateLimit
    end

    subgraph data ["Data Layer"]
        PG[("PostgreSQL\n(asyncpg)\n8 tables")]
        Static["Local Disk\n/static/uploads\n(JPEG/PNG/GIF/WebP, ≤10 MB)"]
    end

    subgraph firebase ["Firebase Platform"]
        FBAuth[("Firebase Auth\n(Email + Google OAuth)")]
        FBAdmin["Firebase Admin SDK\n(verify_id_token)"]
    end

    FirebaseSDK -->|"ID token (JWT)"| FBAuth
    UI -->|"REST Bearer token"| REST
    WSClient -->|"WS ?token="| WSAPI
    REST --> FBAdmin
    WSAPI --> FBAdmin
    FBAdmin -->|"verify"| FBAuth
    REST --> PG
    WSAPI --> PG
    MsgSvc --> PG
    REST -->|"serve"| Static
    REST -->|"write"| Static
```

---

## WebSocket Event Flow

```mermaid
sequenceDiagram
    participant C as Client
    participant WS as WebSocket Handler
    participant Mgr as WebSocketManager
    participant DB as PostgreSQL
    participant Peer as Other Client(s)

    C->>WS: connect ?token=<firebase_jwt>
    WS->>DB: verify token → load User
    WS->>Mgr: connect(websocket, user_id)
    WS->>DB: process pending deliveries (sent→delivered)
    WS->>Mgr: broadcast presence online
    WS-->>C: {type: "connected", user_id}

    C->>WS: {type: "join_conversation", conversation_id}
    WS->>DB: check membership
    WS->>Mgr: join_conversation(user_id, conv_id)
    WS->>DB: mark messages read
    WS-->>C: {type: "joined_conversation"}
    WS-->>Peer: {type: "message_read", ...}

    C->>WS: {type: "send_message", body: "Hey!"}
    WS->>DB: insert Message + MessageReceipts
    WS-->>C: {type: "message_sent", message}
    WS-->>Peer: {type: "new_message", message}
    WS-->>Peer: {type: "unread_count_updated"}

    C->>WS: {type: "typing", is_typing: true}
    WS->>Mgr: broadcast_typing + schedule_stop(3s)
    WS-->>Peer: {type: "typing_started", from, username}

    C->>WS: disconnect
    WS->>Mgr: disconnect → cleanup
    WS->>DB: update last_seen
    WS->>Mgr: broadcast presence offline
    WS-->>Peer: {type: "presence_updated", online: false}
```

---

## Authentication Flow

```mermaid
sequenceDiagram
    participant U as User
    participant FE as Frontend
    participant FB as Firebase Auth
    participant BE as FastAPI Backend
    participant DB as PostgreSQL

    U->>FE: Sign in (email/password or Google)
    FE->>FB: signInWithEmailAndPassword / signInWithPopup
    FB-->>FE: UserCredential + ID Token (JWT, 1h TTL)
    FE->>BE: POST /api/v1/auth/sync  Bearer <id_token>
    BE->>FB: verify_id_token(id_token)
    FB-->>BE: decoded token {uid, email, ...}
    BE->>DB: SELECT user WHERE firebase_uid = uid
    alt user does not exist
        BE->>DB: INSERT users (firebase_uid, username, email)
    end
    BE-->>FE: UserProfile {id, username, email, avatar_url, ...}
    FE->>FE: AuthProvider stores user + token
    Note over FE,FB: onIdTokenChanged auto-refreshes token before expiry
    FE->>BE: All subsequent requests: Authorization: Bearer <id_token>
```

---

## WebRTC Call Flow

```mermaid
sequenceDiagram
    participant Caller as Caller (Client A)
    participant WS as WebSocket Handler
    participant Mgr as CallSessionManager
    participant Callee as Callee (Client B)

    Caller->>WS: {type: "call_invite", call_id, to_user_id, call_type}
    WS->>Mgr: create_call_session (45s ring timeout)
    WS->>Callee: {type: "call_incoming", call_id, from_user_id, call_type}
    WS-->>Caller: {type: "call_ringing"}

    alt Callee accepts
        Callee->>WS: {type: "call_accept", call_id}
        WS->>Mgr: mark accepted
        WS-->>Caller: {type: "call_accepted"}
        WS-->>Callee: {type: "call_accepted"}

        Caller->>WS: {type: "call_offer", sdp}
        WS-->>Callee: {type: "call_offer", sdp}   [relay]

        Callee->>WS: {type: "call_answer", sdp}
        WS-->>Caller: {type: "call_answer", sdp}  [relay]

        Caller->>WS: {type: "ice_candidate", candidate}
        WS-->>Callee: {type: "ice_candidate", candidate}  [relay]

        Note over Caller,Callee: P2P media stream established (STUN: Google)

        Caller->>WS: {type: "call_end", call_id}
        WS->>Mgr: end session → write call log message
        WS-->>Callee: {type: "call_ended"}

    else Callee rejects
        Callee->>WS: {type: "call_reject", call_id}
        WS->>Mgr: mark rejected → write declined call log
        WS-->>Caller: {type: "call_rejected"}

    else Ring timeout (45s)
        Mgr->>WS: timeout fires
        WS-->>Caller: {type: "call_missed"}
        WS-->>Callee: {type: "call_missed"}
        WS->>DB: write missed call log message
    end
```

---

## Deployment Topology

```mermaid
flowchart LR
    subgraph dev ["Development (docker compose)"]
        FE_DEV["Frontend\nVite dev server :5173\nHMR"]
        BE_DEV["Backend\nUvicorn --reload :8000"]
        PG_DEV[("PostgreSQL :5432")]
        FE_DEV -->|HTTP / WS| BE_DEV
        BE_DEV --> PG_DEV
    end

    subgraph prod ["Production (docker-compose.prod.yml)"]
        FE_PROD["Frontend\nsrvx :3000\nStatic build"]
        BE_PROD["Backend\nUvicorn :8000"]
        PG_PROD[("PostgreSQL\nManaged / remote")]
        UPLOADS["Volume:\nbackend_uploads"]
        FE_PROD -->|HTTPS / WSS| BE_PROD
        BE_PROD --> PG_PROD
        BE_PROD --> UPLOADS
    end
```

---

## Notable Design Decisions

| Decision | Rationale |
|---|---|
| **Single multiplexed WebSocket per user** | Same pattern as Telegram Web — one persistent connection handles all conversations; avoids N sockets per browser tab |
| **Firebase Auth (not custom JWT)** | Outsources token rotation, OAuth providers, and revocation; backend only calls `verify_id_token` |
| **ULID cursor keys** for messages | Lexicographically sortable, URL-safe, monotonic within the same ms — enables efficient keyset pagination without `OFFSET` |
| **In-memory `WebSocketManager`** | Simple and fast for a single-server deployment; the stated limitation is no horizontal scale without a Redis pub/sub layer |
| **In-memory `CallSessionManager`** | WebRTC signaling is ephemeral; call metadata (duration, type) is persisted as a `message_type=call` row after the session ends |
| **Soft-delete for conversations** | `deleted_at` + `messages_hidden_before` — mirrors Telegram's "delete for me" where the thread is hidden but not destroyed |
| **Per-recipient `message_receipts`** | Mirrors WhatsApp's tick model: `sent` (✓) → `delivered` (✓✓) → `read` (✓✓ blue), tracked individually |
| **Local disk uploads** | Pragmatic for MVP; the path is `/static/uploads/{uuid}.ext` and should be replaced with object storage (S3/GCS) before horizontal scaling |
