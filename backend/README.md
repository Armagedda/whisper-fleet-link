# Whisper Fleet Backend

A Rust-based voice channel management backend built with Axum, featuring JWT authentication, role-based permissions, and WebSocket support for real-time voice communication.

## Features

- **JWT Authentication**: Secure token-based authentication
- **Channel Management**: Create, join, and manage voice channels
- **Role-Based Permissions**: Owner, Moderator, and Member roles with hierarchical permissions
- **User Moderation**: Kick, ban, and unban users with proper permission checks
- **Invite System**: Single-use, expiring invite tokens for private channels
- **WebSocket Support**: Real-time voice channel connections
- **Comprehensive Testing**: Full test suite for all endpoints

## Quick Start

### Prerequisites

- Rust 1.70+ and Cargo
- Tokio runtime

### Installation

```bash
cd backend
cargo build
cargo run
```

The server will start on `http://127.0.0.1:3000`

### Testing

```bash
cargo test
```

## API Documentation

### Authentication

All endpoints (except `/auth/login`) require a valid JWT token in the Authorization header:
```
Authorization: Bearer <your-jwt-token>
```

#### POST /auth/login

Authenticate and receive a JWT token.

**Request:**
```json
{
  "username": "admin",
  "password": "password123"
}
```

**Response:**
```json
{
  "token": "eyJ0eXAiOiJKV1QiLCJhbGciOiJIUzI1NiJ9...",
  "user_id": "admin",
  "roles": ["admin", "user"]
}
```

### Channel Management

#### POST /channels

Create a new voice channel.

**Request:**
```json
{
  "name": "General",
  "privacy": "Public"
}
```

**Privacy Options:**
- `"Public"`: Anyone can join
- `"Private"`: Only invited users can join
- `"InviteOnly"`: Requires invite token to join

**Response:**
```json
{
  "channel_id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "General",
  "privacy": "Public"
}
```

#### POST /channels/:id/join

Join a voice channel.

**Request:**
```json
{
  "join_token": "optional-token-for-invite-only-channels"
}
```

**Response:** `200 OK` on success

### User Management

#### GET /channels/:id/users

List all users in a channel with their roles.

**Response:**
```json
{
  "users": [
    {
      "user_id": "admin",
      "username": "admin",
      "role": "Owner"
    },
    {
      "user_id": "moderator1",
      "username": "moderator1",
      "role": "Moderator"
    },
    {
      "user_id": "member1",
      "username": "member1",
      "role": "Member"
    }
  ]
}
```

#### POST /channels/:id/users/:user_id/role

Change a user's role in the channel.

**Permissions:**
- Owners can change any role
- Moderators can change member roles and other moderator roles
- Cannot change own role (prevents self-demotion)

**Request:**
```json
{
  "role": "moderator"
}
```

**Valid Roles:**
- `"owner"`: Channel owner with full permissions
- `"moderator"`: Can manage members and moderate the channel
- `"member"`: Regular channel member

**Response:** `200 OK` on success

### User Moderation

#### POST /channels/:id/users/:user_id/kick

Kick a user from the channel.

**Permissions:**
- Owners and moderators can kick users
- Cannot kick users with higher or equal roles
- Cannot kick yourself

**Request:** Empty body

**Response:** `200 OK` on success

#### POST /channels/:id/users/:user_id/ban

Ban a user from the channel.

**Permissions:**
- Owners and moderators can ban users
- Cannot ban users with higher or equal roles
- Cannot ban yourself

**Request:**
```json
{
  "username": "user_to_ban",
  "reason": "Optional ban reason"
}
```

**Response:** `200 OK` on success

#### POST /channels/:id/users/:user_id/unban

Unban a user from the channel.

**Permissions:**
- Owners and moderators can unban users

**Request:** Empty body

**Response:** `200 OK` on success

### Invite Management

#### POST /channels/:id/invite

Create an invite token for a specific user.

**Permissions:**
- Owners and moderators can create invites

**Request:**
```json
{
  "username": "user_to_invite"
}
```

**Response:**
```json
{
  "invite_token": "550e8400-e29b-41d4-a716-446655440000",
  "expires_at": 1703980800
}
```

#### GET /channels/:id/invites

List all invite tokens for the channel.

**Permissions:**
- Owners and moderators can view invites

**Response:**
```json
{
  "invites": [
    {
      "token": "550e8400-e29b-41d4-a716-446655440000",
      "created_for": "user_to_invite",
      "expires_at": 1703980800,
      "used": false,
      "used_by": null
    }
  ]
}
```

#### POST /channels/:id/invites/:token

Revoke an invite token.

**Permissions:**
- Owners and moderators can revoke invites

**Request:** Empty body

**Response:** `200 OK` on success

### WebSocket

#### WebSocket /ws

Connect to the WebSocket endpoint for real-time voice communication.

**Query Parameters:**
- `token`: JWT token for authentication
- `channel_id`: Channel ID to join

**Example:**
```
ws://127.0.0.1:3000/ws?token=<jwt-token>&channel_id=<channel-id>
```

## Error Responses

All endpoints return consistent error responses:

```json
{
  "error": "Error message description"
}
```

### Common HTTP Status Codes

- `200 OK`: Success
- `400 Bad Request`: Invalid request data
- `401 Unauthorized`: Missing or invalid JWT token
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource not found
- `409 Conflict`: Resource already exists or operation not allowed

## Permission Hierarchy

### Role Permissions

1. **Owner**
   - Full channel control
   - Can change any user's role
   - Can kick/ban any user
   - Can manage invites
   - Cannot be kicked or banned by others
   - Cannot demote themselves

2. **Moderator**
   - Can manage members and other moderators
   - Can kick/ban members and moderators
   - Can create and revoke invites
   - Cannot manage owners
   - Cannot kick/ban themselves

3. **Member**
   - Can participate in voice channels
   - No moderation permissions
   - Cannot kick/ban themselves

### Permission Matrix

| Action | Owner | Moderator | Member |
|--------|-------|-----------|--------|
| Change Owner Role | ✅ | ❌ | ❌ |
| Change Moderator Role | ✅ | ✅ | ❌ |
| Change Member Role | ✅ | ✅ | ❌ |
| Kick Owner | ❌ | ❌ | ❌ |
| Kick Moderator | ✅ | ✅ | ❌ |
| Kick Member | ✅ | ✅ | ❌ |
| Ban Owner | ❌ | ❌ | ❌ |
| Ban Moderator | ✅ | ✅ | ❌ |
| Ban Member | ✅ | ✅ | ❌ |
| Create Invites | ✅ | ✅ | ❌ |
| Revoke Invites | ✅ | ✅ | ❌ |

## Security Features

- **JWT Authentication**: All endpoints require valid JWT tokens
- **Role-Based Access Control**: Hierarchical permission system
- **Self-Protection**: Users cannot kick/ban themselves
- **Invite Token Security**: Single-use, expiring tokens
- **Input Validation**: Strict validation of all request data
- **Error Handling**: Comprehensive error responses without information leakage

## Development

### Project Structure

```
src/
├── main.rs          # Application entry point and router setup
├── routes/
│   ├── mod.rs       # Route module declarations
│   ├── auth.rs      # Authentication endpoints
│   └── channels.rs  # Channel management endpoints
└── ws/
    └── mod.rs       # WebSocket handling
```

### Adding New Endpoints

1. Add the handler function to the appropriate module
2. Add the route to `main.rs`
3. Add tests to the test module
4. Update this documentation

### Testing

The project includes comprehensive tests for all endpoints:

- Authentication and authorization
- Role management and permissions
- User moderation (kick/ban/unban)
- Invite token management
- Error handling and edge cases

Run tests with:
```bash
cargo test
```

## Configuration

### Environment Variables

- `RUST_LOG`: Logging level (default: "info")
- JWT secret should be set via environment variable in production

### Production Considerations

- Use environment variables for sensitive data
- Implement proper database persistence
- Add rate limiting
- Use HTTPS in production
- Implement proper user management system
- Add monitoring and logging
- Consider using Redis for session management

## License

This project is licensed under the MIT License. 