# NexTalk — Class Diagram

> Covers: SQLAlchemy ORM models · Pydantic schemas · Core services · Frontend providers & socket client.
> Grouped by layer for readability. Relationships between layers are shown at the bottom.

---

## 1. Backend — SQLAlchemy ORM Models

```mermaid
classDiagram
    class User {
        +UUID id
        +str firebase_uid
        +str username
        +str email
        +str auth_provider
        +str avatar_url
        +datetime created_at
        +datetime last_seen
        +bool show_last_seen
        +bool read_receipts_enabled
    }

    class Conversation {
        +UUID id
        +str type
        +str name
        +str description
        +UUID created_by
        +int max_members
        +bool has_messages
        +datetime created_at
    }

    class ConversationMember {
        +UUID id
        +UUID conversation_id
        +UUID user_id
        +str role
        +str status
        +str color
        +datetime joined_at
        +datetime last_read_at
        +datetime deleted_at
        +datetime messages_hidden_before
        +bool is_muted
    }

    class Message {
        +UUID id
        +UUID conversation_id
        +UUID sender_id
        +str body
        +str image_url
        +str message_type
        +dict call_log
        +str cursor_key
        +datetime created_at
        +datetime edited_at
    }

    class MessageReceipt {
        +UUID id
        +UUID message_id
        +UUID recipient_id
        +str status
        +datetime updated_at
    }

    class Contact {
        +UUID id
        +UUID owner_id
        +UUID contact_user_id
        +datetime created_at
    }

    class MessageRequest {
        +UUID id
        +UUID from_user_id
        +UUID to_user_id
        +str status
        +datetime created_at
    }

    class UserBlock {
        +UUID id
        +UUID blocker_id
        +UUID blocked_id
        +datetime created_at
    }

    class Notification {
        +UUID id
        +UUID user_id
        +str type
        +str title
        +str body
        +dict data
        +datetime read_at
        +datetime created_at
    }

    User "1" --> "0..*" Conversation : creates
    User "1" --> "0..*" ConversationMember : participates via
    Conversation "1" --> "0..*" ConversationMember : has
    Conversation "1" --> "0..*" Message : contains
    User "1" --> "0..*" Message : sends
    Message "1" --> "0..*" MessageReceipt : tracked by
    User "1" --> "0..*" MessageReceipt : receives
    User "1" --> "0..*" Contact : owns
    User "1" --> "0..*" MessageRequest : initiates
    User "1" --> "0..*" UserBlock : blocks
    User "1" --> "0..*" Notification : receives
```

---

## 2. Backend — Core Services

```mermaid
classDiagram
    class WebSocketManager {
        -Dict~UUID, Set~WebSocket~~ user_sockets
        -Dict~WebSocket, UUID~ socket_user
        -Dict~UUID, Set~UUID~~ active_conversations
        -Dict~WebSocket, Set~UUID~~ socket_conversations
        -Dict~tuple, Task~ _typing_tasks

        +connect(websocket, user_id) None
        +disconnect(websocket) UUID
        +join_conversation(user_id, conv_id, websocket) None
        +leave_conversation(user_id, conv_id, websocket) None
        +is_user_online(user_id) bool
        +is_user_in_conversation(user_id, conv_id) bool
        +users_in_conversation(conv_id) Set~UUID~
        +send_to_user(user_id, payload) None
        +broadcast_to_conversation(conv_id, payload, exclude_user_id) None
        +broadcast_typing(conv_id, from_user_id, is_typing, username) None
        +schedule_typing_stop(conv_id, user_id, delay) None
        -_cancel_typing(conv_id, user_id) None
        -_any_socket_in_conversation(user_id, conv_id, exclude) bool
    }

    class CallSession {
        +UUID call_id
        +UUID caller_id
        +UUID callee_id
        +UUID conversation_id
        +str call_type
        +str status
        +datetime started_at
        +datetime answered_at
    }

    class CallSessionManager {
        -Dict~UUID, CallSession~ sessions
        -Dict~UUID, Task~ ring_timers

        +create_session(call_id, caller_id, callee_id, conv_id, call_type) CallSession
        +get_session(call_id) CallSession
        +accept_session(call_id) CallSession
        +end_session(call_id) CallSession
        +get_active_call_for_user(user_id) CallSession
        -_ring_timeout(call_id) None
    }

    class MessagingService {
        +create_message(db, sender, conv_id, body, image_url) Message
        +emit_message_sent(ws_manager, db, message, sender) None
        +edit_message(db, ws_manager, message_id, user_id, body) Message
        +process_mark_read(db, ws_manager, user_id, conv_id) None
        +create_call_log_message(db, call_session) Message
        -_build_receipt_status(ws_manager, recipient_id, conv_id) str
    }

    class PresenceService {
        +touch_last_seen(db, user_id) None
        +broadcast_presence(ws_manager, db, user_id, online) None
    }

    class ReceiptsService {
        +process_pending_deliveries(db, ws_manager, user_id) None
        +mark_delivered(db, ws_manager, message_id, recipient_id) None
        +mark_read(db, ws_manager, message_id, recipient_id) None
    }

    class UnreadService {
        +get_unread_counts(db, user_id) Dict~UUID, int~
        +get_total_unread(db, user_id) int
        +broadcast_unread_update(ws_manager, db, user_id) None
    }

    class BlocksService {
        +is_blocked(db, user_a, user_b) bool
        +block_user(db, blocker_id, blocked_id) UserBlock
        +unblock_user(db, blocker_id, blocked_id) None
        +get_blocked_list(db, user_id) List~User~
    }

    class NotificationsService {
        +create_notification(db, user_id, type, title, body, data) Notification
        +push_notification(ws_manager, notification) None
    }

    class RateLimiter {
        -Dict~str, deque~ _windows
        +check(user_id, limit, window_secs) bool
    }

    MessagingService --> WebSocketManager : emits events via
    MessagingService --> ReceiptsService : delegates receipt writes
    MessagingService --> UnreadService : triggers unread updates
    CallSessionManager --> MessagingService : write call log message
    PresenceService --> WebSocketManager : broadcast_presence
    ReceiptsService --> WebSocketManager : send receipt events
    NotificationsService --> WebSocketManager : push real-time push
```

---

## 3. Backend — Pydantic WebSocket Event Schemas

```mermaid
classDiagram
    class WsPing {
        +str type = "ping"
    }
    class WsSendMessage {
        +str type = "send_message"
        +UUID conversation_id
        +str body
        +str image_url
        +strip_body() str
    }
    class WsTyping {
        +str type = "typing"
        +UUID conversation_id
        +bool is_typing
    }
    class WsJoinConversation {
        +str type = "join_conversation"
        +UUID conversation_id
    }
    class WsLeaveConversation {
        +str type = "leave_conversation"
        +UUID conversation_id
    }
    class WsMarkRead {
        +str type = "mark_read"
        +UUID conversation_id
    }
    class WsEditMessage {
        +str type = "edit_message"
        +UUID message_id
        +str body
    }
    class WsCallInvite {
        +str type = "call_invite"
        +UUID call_id
        +UUID to_user_id
        +UUID conversation_id
        +str call_type
    }
    class WsCallAccept {
        +str type = "call_accept"
        +UUID call_id
    }
    class WsCallReject {
        +str type = "call_reject"
        +UUID call_id
    }
    class WsCallEnd {
        +str type = "call_end"
        +UUID call_id
    }
    class WsCallOffer {
        +str type = "call_offer"
        +UUID call_id
        +dict sdp
    }
    class WsCallAnswer {
        +str type = "call_answer"
        +UUID call_id
        +dict sdp
    }
    class WsIceCandidate {
        +str type = "ice_candidate"
        +UUID call_id
        +dict candidate
    }
```

---

## 4. Frontend — Core Providers & Hooks

```mermaid
classDiagram
    class NexTalkSocket {
        -WebSocket socket
        -bool reconnecting
        -number pingInterval
        -Map~string, Function~ handlers

        +connect(token) void
        +disconnect() void
        +send(payload) void
        +on(eventType, handler) void
        +off(eventType, handler) void
        -_reconnect() void
        -_ping() void
        -_onMessage(event) void
    }

    class AuthProvider {
        -FirebaseUser firebaseUser
        -AppUser appUser
        -string idToken

        +signIn(email, password) void
        +signUp(email, password, username) void
        +signInWithGoogle() void
        +signOut() void
        +deleteAccount() void
        +getIdToken() Promise~string~
        +useAuth() AuthContext
    }

    class ChatProvider {
        -Conversation[] conversations
        -Message[] messages
        -Contact[] contacts
        -Notification[] notifications
        -string activeConversationId
        -Map~string, boolean~ typingUsers
        -Map~string, PresenceInfo~ presenceMap
        -Map~string, number~ unreadCounts

        +selectConversation(id) void
        +sendMessage(convId, body, imageUrl) void
        +editMessage(msgId, body) void
        +markRead(convId) void
        +loadMoreMessages(convId) void
        +createDirectConversation(participantId) void
        +createGroupConversation(name, memberIds) void
        +deleteConversation(convId) void
        +inviteToGroup(convId, userIds) void
        +acceptGroupInvitation(convId) void
        +leaveGroup(convId) void
        +sendContactRequest(username) void
        +acceptMessageRequest(requestId) void
        +blockUser(userId) void
        +muteConversation(convId, muted) void
        +useChat() ChatContext
    }

    class CallProvider {
        -CallState callState
        -string activeCallId
        -string callType
        -MediaStream localStream
        -MediaStream remoteStream
        -WebRtcCall webRtcCall

        +startCall(userId, convId, callType) void
        +acceptCall(callId) void
        +rejectCall(callId) void
        +endCall(callId) void
        +toggleMute() void
        +toggleVideo() void
        +useCalls() CallContext
    }

    class WebRtcCall {
        -RTCPeerConnection peerConnection
        -MediaStream localStream
        -MediaStream remoteStream
        -string[] stunServers

        +initLocalStream(video) Promise~MediaStream~
        +createOffer() Promise~RTCSessionDescription~
        +handleOffer(sdp) Promise~RTCSessionDescription~
        +handleAnswer(sdp) void
        +addIceCandidate(candidate) void
        +close() void
    }

    class ApiClient {
        +AUTH_sync(token, username) AppUser
        +AUTH_deleteMe() void
        +USERS_getMe() AppUser
        +USERS_updateMe(patch) AppUser
        +USERS_search(q) User[]
        +USERS_block(userId) void
        +USERS_unblock(userId) void
        +CONTACTS_list() Contact[]
        +CONTACTS_add(username) Contact
        +CONTACTS_remove(userId) void
        +CONVERSATIONS_list() Conversation[]
        +CONVERSATIONS_create(payload) Conversation
        +CONVERSATIONS_getMessages(id, cursor) MessagePage
        +CONVERSATIONS_getMedia(id, cursor) MediaPage
        +CONVERSATIONS_markRead(id) void
        +CONVERSATIONS_delete(id) void
        +MESSAGES_send(payload) Message
        +MESSAGES_edit(msgId, body) Message
        +NOTIFICATIONS_list() Notification[]
        +NOTIFICATIONS_readAll() void
        +UPLOADS_image(file) string
    }

    AuthProvider --> NexTalkSocket : provides token for
    ChatProvider --> NexTalkSocket : consumes events from
    ChatProvider --> ApiClient : REST calls via
    CallProvider --> NexTalkSocket : call signaling via
    CallProvider --> WebRtcCall : delegates P2P to
```

---

## 5. Cross-Layer Relationship Summary

```mermaid
classDiagram
    class FastAPI_App {
        +lifespan() startup/shutdown
        +include_router(api_router)
        +mount("/static")
    }
    class APIRouter {
        +prefix "/api/v1"
        --routes--
        +auth
        +users
        +contacts
        +message_requests
        +conversations
        +messages
        +notifications
        +uploads
        +ws
    }
    class WebSocketHandler {
        +handle_connection(websocket, token)
        +dispatch_event(event_type, payload)
    }
    class FirebaseAdminSDK {
        +verify_id_token(token) dict
        +delete_user(uid) void
    }
    class PostgresDB {
        +AsyncEngine engine
        +AsyncSession session
    }

    FastAPI_App --> APIRouter : includes
    APIRouter --> WebSocketHandler : ws route
    APIRouter --> WebSocketManager : injected singleton
    WebSocketHandler --> WebSocketManager : delegates
    WebSocketHandler --> MessagingService : send/edit/read
    WebSocketHandler --> CallSessionManager : call events
    WebSocketHandler --> FirebaseAdminSDK : verify token
    APIRouter --> FirebaseAdminSDK : deps.get_current_user
    APIRouter --> PostgresDB : get_db dependency
    WebSocketHandler --> PostgresDB : get_db dependency
```

---

## Enum Reference

| Class | Field | Values |
|---|---|---|
| `Conversation` | `type` | `direct` · `group` |
| `ConversationMember` | `role` | `admin` · `member` |
| `ConversationMember` | `status` | `pending` · `accepted` · `rejected` |
| `Message` | `message_type` | `text` · `call` |
| `MessageReceipt` | `status` | `sent` · `delivered` · `read` |
| `MessageRequest` | `status` | `pending` · `accepted` · `declined` |
| `User` | `auth_provider` | `password` · `google.com` |
| `WsCallInvite` | `call_type` | `audio` · `video` |
| `Notification` | `type` | `group_invitation` · `contact_request` · `invitation_accepted` · `invitation_rejected` · `system` |
