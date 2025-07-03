use axum::{
    extract::{Json, Path, State, TypedHeader},
    headers::{Authorization, Bearer},
    http::StatusCode,
    response::Json as JsonResponse,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use uuid::Uuid;

// Data structures
#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum ChannelPrivacy {
    Public,
    Private,
    InviteOnly,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Channel {
    pub id: String,
    pub name: String,
    pub privacy: ChannelPrivacy,
    pub owner: String,
    pub moderators: Vec<String>,
    pub members: Vec<String>,
    pub banned_users: Vec<BannedUser>,
    pub invite_tokens: HashMap<String, InviteToken>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct BannedUser {
    pub user_id: String,
    pub username: String,
    pub banned_by: String,
    pub banned_at: u64,
    pub reason: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InviteToken {
    pub token: String,
    pub created_by: String,
    pub created_for: Option<String>, // username the token was created for
    pub expires_at: u64,
    pub used: bool,
    pub used_by: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserRole {
    pub user_id: String,
    pub username: String,
    pub role: Role,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub enum Role {
    Owner,
    Moderator,
    Member,
}

impl Role {
    pub fn as_str(&self) -> &'static str {
        match self {
            Role::Owner => "owner",
            Role::Moderator => "moderator",
            Role::Member => "member",
        }
    }

    pub fn from_str(s: &str) -> Option<Self> {
        match s {
            "owner" => Some(Role::Owner),
            "moderator" => Some(Role::Moderator),
            "member" => Some(Role::Member),
            _ => None,
        }
    }

    pub fn can_manage(&self, target_role: &Role) -> bool {
        match (self, target_role) {
            (Role::Owner, _) => true,
            (Role::Moderator, Role::Member) => true,
            (Role::Moderator, Role::Moderator) => true,
            _ => false,
        }
    }
}

// Request/Response structures
#[derive(Debug, Deserialize)]
pub struct CreateChannelRequest {
    pub name: String,
    pub privacy: ChannelPrivacy,
}

#[derive(Debug, Serialize)]
pub struct CreateChannelResponse {
    pub channel_id: String,
    pub name: String,
    pub privacy: ChannelPrivacy,
}

#[derive(Debug, Deserialize)]
pub struct JoinChannelRequest {
    pub join_token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct InviteUserRequest {
    pub username: String,
}

#[derive(Debug, Serialize)]
pub struct InviteUserResponse {
    pub invite_token: String,
    pub expires_at: u64,
}

#[derive(Debug, Serialize)]
pub struct ListInvitesResponse {
    pub invites: Vec<InviteTokenInfo>,
}

#[derive(Debug, Serialize)]
pub struct InviteTokenInfo {
    pub token: String,
    pub created_for: Option<String>,
    pub expires_at: u64,
    pub used: bool,
    pub used_by: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ChangeRoleRequest {
    pub role: String,
}

#[derive(Debug, Deserialize)]
pub struct KickUserRequest {
    pub username: String,
}

#[derive(Debug, Deserialize)]
pub struct BanUserRequest {
    pub username: String,
    pub reason: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UnbanUserRequest {
    pub username: String,
}

#[derive(Debug, Serialize)]
pub struct ListUsersResponse {
    pub users: Vec<UserRole>,
}

#[derive(Debug, Serialize)]
pub struct ErrorResponse {
    pub error: String,
}

// JWT Claims structure (reused from auth)
#[derive(Debug, Serialize, Deserialize)]
struct Claims {
    sub: String,
    roles: Vec<String>,
    exp: usize,
    iat: usize,
}

// App state
#[derive(Clone)]
pub struct AppState {
    pub channels: Arc<Mutex<HashMap<String, Channel>>>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            channels: Arc::new(Mutex::new(HashMap::new())),
        }
    }
}

// Helper functions
fn extract_user_from_token(auth_header: &str) -> Result<String, (StatusCode, JsonResponse<ErrorResponse>)> {
    let token = auth_header
        .strip_prefix("Bearer ")
        .ok_or((
            StatusCode::UNAUTHORIZED,
            JsonResponse(ErrorResponse {
                error: "Invalid authorization header".to_string(),
            }),
        ))?;

    let secret = "your-secret-key"; // Should match auth.rs
    let token_data = decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_ref()),
        &Validation::default(),
    )
    .map_err(|_| {
        (
            StatusCode::UNAUTHORIZED,
            JsonResponse(ErrorResponse {
                error: "Invalid token".to_string(),
            }),
        )
    })?;

    Ok(token_data.claims.sub)
}

fn get_user_role_in_channel(channel: &Channel, user_id: &str) -> Option<Role> {
    if channel.owner == user_id {
        Some(Role::Owner)
    } else if channel.moderators.contains(&user_id.to_string()) {
        Some(Role::Moderator)
    } else if channel.members.contains(&user_id.to_string()) {
        Some(Role::Member)
    } else {
        None
    }
}

fn can_moderate_channel(channel: &Channel, user_id: &str) -> bool {
    matches!(
        get_user_role_in_channel(channel, user_id),
        Some(Role::Owner) | Some(Role::Moderator)
    )
}

fn is_user_banned(channel: &Channel, user_id: &str) -> bool {
    channel.banned_users.iter().any(|banned| banned.user_id == user_id)
}

fn get_username_by_id(user_id: &str) -> String {
    // In a real app, this would query a user database
    // For now, we'll use the user_id as username
    user_id.to_string()
}

// Endpoint handlers
pub async fn create_channel(
    State(state): State<AppState>,
    TypedHeader(auth): TypedHeader<Authorization<Bearer>>,
    Json(payload): Json<CreateChannelRequest>,
) -> Result<JsonResponse<CreateChannelResponse>, (StatusCode, JsonResponse<ErrorResponse>)> {
    let user_id = extract_user_from_token(&format!("Bearer {}", auth.token()))?;
    let channel_id = Uuid::new_v4().to_string();

    let channel = Channel {
        id: channel_id.clone(),
        name: payload.name.clone(),
        privacy: payload.privacy.clone(),
        owner: user_id.clone(),
        moderators: vec![user_id.clone()],
        members: vec![user_id],
        banned_users: Vec::new(),
        invite_tokens: HashMap::new(),
    };

    let mut channels = state.channels.lock().unwrap();
    channels.insert(channel_id.clone(), channel);

    Ok(JsonResponse(CreateChannelResponse {
        channel_id,
        name: payload.name,
        privacy: payload.privacy,
    }))
}

pub async fn join_channel(
    State(state): State<AppState>,
    TypedHeader(auth): TypedHeader<Authorization<Bearer>>,
    Path(channel_id): Path<String>,
    Json(payload): Json<JoinChannelRequest>,
) -> Result<JsonResponse<()>, (StatusCode, JsonResponse<ErrorResponse>)> {
    let user_id = extract_user_from_token(&format!("Bearer {}", auth.token()))?;
    let mut channels = state.channels.lock().unwrap();

    let channel = channels
        .get_mut(&channel_id)
        .ok_or((
            StatusCode::NOT_FOUND,
            JsonResponse(ErrorResponse {
                error: "Channel not found".to_string(),
            }),
        ))?;

    // Check if user is already a member
    if channel.members.contains(&user_id) || channel.moderators.contains(&user_id) || channel.owner == user_id {
        return Ok(JsonResponse(()));
    }

    // Check if user is banned
    if is_user_banned(channel, &user_id) {
        return Err((
            StatusCode::FORBIDDEN,
            JsonResponse(ErrorResponse {
                error: "You are banned from this channel".to_string(),
            }),
        ));
    }

    // Check privacy settings
    match channel.privacy {
        ChannelPrivacy::Public => {
            // Anyone can join
        }
        ChannelPrivacy::Private => {
            return Err((
                StatusCode::FORBIDDEN,
                JsonResponse(ErrorResponse {
                    error: "This channel is private".to_string(),
                }),
            ));
        }
        ChannelPrivacy::InviteOnly => {
            // Check for valid invite token
            if let Some(ref join_token) = payload.join_token {
                let token = channel
                    .invite_tokens
                    .get(join_token)
                    .ok_or((
                        StatusCode::FORBIDDEN,
                        JsonResponse(ErrorResponse {
                            error: "Invalid invite token".to_string(),
                        }),
                    ))?;

                if token.used {
                    return Err((
                        StatusCode::FORBIDDEN,
                        JsonResponse(ErrorResponse {
                            error: "Invite token already used".to_string(),
                        }),
                    ));
                }

                if token.expires_at < chrono::Utc::now().timestamp() as u64 {
                    return Err((
                        StatusCode::FORBIDDEN,
                        JsonResponse(ErrorResponse {
                            error: "Invite token expired".to_string(),
                        }),
                    ));
                }

                // Mark token as used
                if let Some(token) = channel.invite_tokens.get_mut(join_token) {
                    token.used = true;
                    token.used_by = Some(user_id.clone());
                }
            } else {
                return Err((
                    StatusCode::FORBIDDEN,
                    JsonResponse(ErrorResponse {
                        error: "Invite token required for this channel".to_string(),
                    }),
                ));
            }
        }
    }

    // Add user to channel
    channel.members.push(user_id);

    Ok(JsonResponse(()))
}

pub async fn invite_user(
    State(state): State<AppState>,
    TypedHeader(auth): TypedHeader<Authorization<Bearer>>,
    Path(channel_id): Path<String>,
    Json(payload): Json<InviteUserRequest>,
) -> Result<JsonResponse<InviteUserResponse>, (StatusCode, JsonResponse<ErrorResponse>)> {
    let user_id = extract_user_from_token(&format!("Bearer {}", auth.token()))?;
    let mut channels = state.channels.lock().unwrap();

    let channel = channels
        .get_mut(&channel_id)
        .ok_or((
            StatusCode::NOT_FOUND,
            JsonResponse(ErrorResponse {
                error: "Channel not found".to_string(),
            }),
        ))?;

    // Check if user has permission to invite
    if !can_moderate_channel(channel, &user_id) {
        return Err((
            StatusCode::FORBIDDEN,
            JsonResponse(ErrorResponse {
                error: "You don't have permission to invite users".to_string(),
            }),
        ));
    }

    // Generate invite token
    let token = Uuid::new_v4().to_string();
    let expires_at = (chrono::Utc::now() + chrono::Duration::hours(24)).timestamp() as u64;

    let invite_token = InviteToken {
        token: token.clone(),
        created_by: user_id,
        created_for: Some(payload.username),
        expires_at,
        used: false,
        used_by: None,
    };

    channel.invite_tokens.insert(token.clone(), invite_token);

    Ok(JsonResponse(InviteUserResponse {
        invite_token: token,
        expires_at,
    }))
}

pub async fn list_invites(
    State(state): State<AppState>,
    TypedHeader(auth): TypedHeader<Authorization<Bearer>>,
    Path(channel_id): Path<String>,
) -> Result<JsonResponse<ListInvitesResponse>, (StatusCode, JsonResponse<ErrorResponse>)> {
    let user_id = extract_user_from_token(&format!("Bearer {}", auth.token()))?;
    let channels = state.channels.lock().unwrap();

    let channel = channels
        .get(&channel_id)
        .ok_or((
            StatusCode::NOT_FOUND,
            JsonResponse(ErrorResponse {
                error: "Channel not found".to_string(),
            }),
        ))?;

    // Check if user has permission to view invites
    if !can_moderate_channel(channel, &user_id) {
        return Err((
            StatusCode::FORBIDDEN,
            JsonResponse(ErrorResponse {
                error: "You don't have permission to view invites".to_string(),
            }),
        ));
    }

    let invites: Vec<InviteTokenInfo> = channel
        .invite_tokens
        .values()
        .map(|token| InviteTokenInfo {
            token: token.token.clone(),
            created_for: token.created_for.clone(),
            expires_at: token.expires_at,
            used: token.used,
            used_by: token.used_by.clone(),
        })
        .collect();

    Ok(JsonResponse(ListInvitesResponse { invites }))
}

pub async fn revoke_invite(
    State(state): State<AppState>,
    TypedHeader(auth): TypedHeader<Authorization<Bearer>>,
    Path((channel_id, token)): Path<(String, String)>,
) -> Result<JsonResponse<()>, (StatusCode, JsonResponse<ErrorResponse>)> {
    let user_id = extract_user_from_token(&format!("Bearer {}", auth.token()))?;
    let mut channels = state.channels.lock().unwrap();

    let channel = channels
        .get_mut(&channel_id)
        .ok_or((
            StatusCode::NOT_FOUND,
            JsonResponse(ErrorResponse {
                error: "Channel not found".to_string(),
            }),
        ))?;

    // Check if user has permission to revoke invites
    if !can_moderate_channel(channel, &user_id) {
        return Err((
            StatusCode::FORBIDDEN,
            JsonResponse(ErrorResponse {
                error: "You don't have permission to revoke invites".to_string(),
            }),
        ));
    }

    // Check if token exists
    if !channel.invite_tokens.contains_key(&token) {
        return Err((
            StatusCode::NOT_FOUND,
            JsonResponse(ErrorResponse {
                error: "Invite token not found".to_string(),
            }),
        ));
    }

    // Remove the token
    channel.invite_tokens.remove(&token);

    Ok(JsonResponse(()))
}

pub async fn change_user_role(
    State(state): State<AppState>,
    TypedHeader(auth): TypedHeader<Authorization<Bearer>>,
    Path((channel_id, target_user_id)): Path<(String, String)>,
    Json(payload): Json<ChangeRoleRequest>,
) -> Result<JsonResponse<()>, (StatusCode, JsonResponse<ErrorResponse>)> {
    let requester_id = extract_user_from_token(&format!("Bearer {}", auth.token()))?;
    let mut channels = state.channels.lock().unwrap();

    let channel = channels
        .get_mut(&channel_id)
        .ok_or((
            StatusCode::NOT_FOUND,
            JsonResponse(ErrorResponse {
                error: "Channel not found".to_string(),
            }),
        ))?;

    // Parse the new role
    let new_role = Role::from_str(&payload.role).ok_or((
        StatusCode::BAD_REQUEST,
        JsonResponse(ErrorResponse {
            error: "Invalid role. Must be 'owner', 'moderator', or 'member'".to_string(),
        }),
    ))?;

    // Get requester's role
    let requester_role = get_user_role_in_channel(channel, &requester_id)
        .ok_or((
            StatusCode::FORBIDDEN,
            JsonResponse(ErrorResponse {
                error: "You are not a member of this channel".to_string(),
            }),
        ))?;

    // Get target user's current role
    let target_role = get_user_role_in_channel(channel, &target_user_id)
        .ok_or((
            StatusCode::NOT_FOUND,
            JsonResponse(ErrorResponse {
                error: "Target user is not a member of this channel".to_string(),
            }),
        ))?;

    // Check permissions
    if !requester_role.can_manage(&target_role) {
        return Err((
            StatusCode::FORBIDDEN,
            JsonResponse(ErrorResponse {
                error: "You don't have permission to change this user's role".to_string(),
            }),
        ));
    }

    // Prevent self-demotion of owners
    if requester_id == target_user_id && requester_role == Role::Owner && new_role != Role::Owner {
        return Err((
            StatusCode::FORBIDDEN,
            JsonResponse(ErrorResponse {
                error: "Owners cannot demote themselves".to_string(),
            }),
        ));
    }

    // Update the user's role
    match new_role {
        Role::Owner => {
            // Transfer ownership
            let old_owner = channel.owner.clone();
            channel.owner = target_user_id.clone();
            
            // Move old owner to moderators if they're not the target
            if old_owner != target_user_id {
                if !channel.moderators.contains(&old_owner) {
                    channel.moderators.push(old_owner);
                }
            }
            
            // Remove target from other lists
            channel.moderators.retain(|id| id != &target_user_id);
            channel.members.retain(|id| id != &target_user_id);
        }
        Role::Moderator => {
            // Remove from members, add to moderators
            channel.members.retain(|id| id != &target_user_id);
            if !channel.moderators.contains(&target_user_id) {
                channel.moderators.push(target_user_id);
            }
        }
        Role::Member => {
            // Remove from moderators, add to members
            channel.moderators.retain(|id| id != &target_user_id);
            if !channel.members.contains(&target_user_id) {
                channel.members.push(target_user_id);
            }
        }
    }

    Ok(JsonResponse(()))
}

pub async fn list_users(
    State(state): State<AppState>,
    TypedHeader(auth): TypedHeader<Authorization<Bearer>>,
    Path(channel_id): Path<String>,
) -> Result<JsonResponse<ListUsersResponse>, (StatusCode, JsonResponse<ErrorResponse>)> {
    let user_id = extract_user_from_token(&format!("Bearer {}", auth.token()))?;
    let channels = state.channels.lock().unwrap();

    let channel = channels
        .get(&channel_id)
        .ok_or((
            StatusCode::NOT_FOUND,
            JsonResponse(ErrorResponse {
                error: "Channel not found".to_string(),
            }),
        ))?;

    // Check if user is a member of the channel
    if get_user_role_in_channel(channel, &user_id).is_none() {
        return Err((
            StatusCode::FORBIDDEN,
            JsonResponse(ErrorResponse {
                error: "You are not a member of this channel".to_string(),
            }),
        ));
    }

    let mut users = Vec::new();

    // Add owner
    users.push(UserRole {
        user_id: channel.owner.clone(),
        username: get_username_by_id(&channel.owner),
        role: Role::Owner,
    });

    // Add moderators
    for moderator_id in &channel.moderators {
        users.push(UserRole {
            user_id: moderator_id.clone(),
            username: get_username_by_id(moderator_id),
            role: Role::Moderator,
        });
    }

    // Add members
    for member_id in &channel.members {
        users.push(UserRole {
            user_id: member_id.clone(),
            username: get_username_by_id(member_id),
            role: Role::Member,
        });
    }

    Ok(JsonResponse(ListUsersResponse { users }))
}

pub async fn kick_user(
    State(state): State<AppState>,
    TypedHeader(auth): TypedHeader<Authorization<Bearer>>,
    Path((channel_id, target_user_id)): Path<(String, String)>,
) -> Result<JsonResponse<()>, (StatusCode, JsonResponse<ErrorResponse>)> {
    let requester_id = extract_user_from_token(&format!("Bearer {}", auth.token()))?;
    let mut channels = state.channels.lock().unwrap();

    let channel = channels
        .get_mut(&channel_id)
        .ok_or((
            StatusCode::NOT_FOUND,
            JsonResponse(ErrorResponse {
                error: "Channel not found".to_string(),
            }),
        ))?;

    // Get requester's role
    let requester_role = get_user_role_in_channel(channel, &requester_id)
        .ok_or((
            StatusCode::FORBIDDEN,
            JsonResponse(ErrorResponse {
                error: "You are not a member of this channel".to_string(),
            }),
        ))?;

    // Get target user's role
    let target_role = get_user_role_in_channel(channel, &target_user_id)
        .ok_or((
            StatusCode::NOT_FOUND,
            JsonResponse(ErrorResponse {
                error: "Target user is not a member of this channel".to_string(),
            }),
        ))?;

    // Check permissions
    if !requester_role.can_manage(&target_role) {
        return Err((
            StatusCode::FORBIDDEN,
            JsonResponse(ErrorResponse {
                error: "You don't have permission to kick this user".to_string(),
            }),
        ));
    }

    // Prevent self-kicking
    if requester_id == target_user_id {
        return Err((
            StatusCode::FORBIDDEN,
            JsonResponse(ErrorResponse {
                error: "You cannot kick yourself".to_string(),
            }),
        ));
    }

    // Remove user from channel
    channel.members.retain(|id| id != &target_user_id);
    channel.moderators.retain(|id| id != &target_user_id);

    Ok(JsonResponse(()))
}

pub async fn ban_user(
    State(state): State<AppState>,
    TypedHeader(auth): TypedHeader<Authorization<Bearer>>,
    Path((channel_id, target_user_id)): Path<(String, String)>,
    Json(payload): Json<BanUserRequest>,
) -> Result<JsonResponse<()>, (StatusCode, JsonResponse<ErrorResponse>)> {
    let requester_id = extract_user_from_token(&format!("Bearer {}", auth.token()))?;
    let mut channels = state.channels.lock().unwrap();

    let channel = channels
        .get_mut(&channel_id)
        .ok_or((
            StatusCode::NOT_FOUND,
            JsonResponse(ErrorResponse {
                error: "Channel not found".to_string(),
            }),
        ))?;

    // Get requester's role
    let requester_role = get_user_role_in_channel(channel, &requester_id)
        .ok_or((
            StatusCode::FORBIDDEN,
            JsonResponse(ErrorResponse {
                error: "You are not a member of this channel".to_string(),
            }),
        ))?;

    // Get target user's role
    let target_role = get_user_role_in_channel(channel, &target_user_id)
        .ok_or((
            StatusCode::NOT_FOUND,
            JsonResponse(ErrorResponse {
                error: "Target user is not a member of this channel".to_string(),
            }),
        ))?;

    // Check permissions
    if !requester_role.can_manage(&target_role) {
        return Err((
            StatusCode::FORBIDDEN,
            JsonResponse(ErrorResponse {
                error: "You don't have permission to ban this user".to_string(),
            }),
        ));
    }

    // Prevent self-banning
    if requester_id == target_user_id {
        return Err((
            StatusCode::FORBIDDEN,
            JsonResponse(ErrorResponse {
                error: "You cannot ban yourself".to_string(),
            }),
        ));
    }

    // Check if user is already banned
    if is_user_banned(channel, &target_user_id) {
        return Err((
            StatusCode::CONFLICT,
            JsonResponse(ErrorResponse {
                error: "User is already banned".to_string(),
            }),
        ));
    }

    // Add user to banned list and remove from members/moderators
    let banned_user = BannedUser {
        user_id: target_user_id.clone(),
        username: get_username_by_id(&target_user_id),
        banned_by: requester_id,
        banned_at: chrono::Utc::now().timestamp() as u64,
        reason: payload.reason,
    };

    channel.banned_users.push(banned_user);
    channel.members.retain(|id| id != &target_user_id);
    channel.moderators.retain(|id| id != &target_user_id);

    Ok(JsonResponse(()))
}

pub async fn unban_user(
    State(state): State<AppState>,
    TypedHeader(auth): TypedHeader<Authorization<Bearer>>,
    Path((channel_id, target_user_id)): Path<(String, String)>,
) -> Result<JsonResponse<()>, (StatusCode, JsonResponse<ErrorResponse>)> {
    let requester_id = extract_user_from_token(&format!("Bearer {}", auth.token()))?;
    let mut channels = state.channels.lock().unwrap();

    let channel = channels
        .get_mut(&channel_id)
        .ok_or((
            StatusCode::NOT_FOUND,
            JsonResponse(ErrorResponse {
                error: "Channel not found".to_string(),
            }),
        ))?;

    // Check if user has permission to unban
    if !can_moderate_channel(channel, &requester_id) {
        return Err((
            StatusCode::FORBIDDEN,
            JsonResponse(ErrorResponse {
                error: "You don't have permission to unban users".to_string(),
            }),
        ));
    }

    // Check if user is actually banned
    let banned_index = channel
        .banned_users
        .iter()
        .position(|banned| banned.user_id == target_user_id);

    if banned_index.is_none() {
        return Err((
            StatusCode::NOT_FOUND,
            JsonResponse(ErrorResponse {
                error: "User is not banned from this channel".to_string(),
            }),
        ));
    }

    // Remove user from banned list
    channel.banned_users.remove(banned_index.unwrap());

    Ok(JsonResponse(()))
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
        response::Response,
    };
    use serde_json::json;
    use tower::ServiceExt;

    // Helper function to create a test JWT token
    fn create_test_token(user_id: &str) -> String {
        use jsonwebtoken::{encode, EncodingKey, Header};
        use chrono::Utc;

        let now = Utc::now();
        let exp = (now + chrono::Duration::hours(24)).timestamp() as usize;
        let iat = now.timestamp() as usize;

        let claims = Claims {
            sub: user_id.to_string(),
            roles: vec!["user".to_string()],
            exp,
            iat,
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret("your-secret-key".as_ref()),
        )
        .unwrap()
    }

    // Helper function to create a test app
    fn create_test_app() -> Router {
        let state = AppState::new();
        Router::new()
            .route("/channels", post(routes::channels::create_channel))
            .route("/channels/:id/join", post(routes::channels::join_channel))
            .route("/channels/:id/users", get(routes::channels::list_users))
            .route("/channels/:id/invite", post(routes::channels::invite_user))
            .route("/channels/:id/invites", get(routes::channels::list_invites))
            .route("/channels/:id/invites/:token", post(routes::channels::revoke_invite))
            .route("/channels/:id/users/:user_id/role", post(routes::channels::change_user_role))
            .route("/channels/:id/users/:user_id/kick", post(routes::channels::kick_user))
            .route("/channels/:id/users/:user_id/ban", post(routes::channels::ban_user))
            .route("/channels/:id/users/:user_id/unban", post(routes::channels::unban_user))
            .with_state(state)
    }

    #[tokio::test]
    async fn test_create_channel() {
        let app = create_test_app();
        let token = create_test_token("test_user");

        let response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/channels")
                    .header("Authorization", format!("Bearer {}", token))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Test Channel",
                            "privacy": "Public"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_join_channel() {
        let app = create_test_app();
        let token = create_test_token("test_user");

        // First create a channel
        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/channels")
                    .header("Authorization", format!("Bearer {}", token.clone()))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Test Channel",
                            "privacy": "Public"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        let create_body = hyper::body::to_bytes(create_response.into_body()).await.unwrap();
        let create_data: CreateChannelResponse = serde_json::from_slice(&create_body).unwrap();

        // Then join the channel
        let join_response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/channels/{}/join", create_data.channel_id))
                    .header("Authorization", format!("Bearer {}", token))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(join_response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_change_user_role() {
        let app = create_test_app();
        let owner_token = create_test_token("owner");
        let member_token = create_test_token("member");

        // Create a channel
        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/channels")
                    .header("Authorization", format!("Bearer {}", owner_token.clone()))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Test Channel",
                            "privacy": "Public"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        let create_body = hyper::body::to_bytes(create_response.into_body()).await.unwrap();
        let create_data: CreateChannelResponse = serde_json::from_slice(&create_body).unwrap();

        // Join as member
        app.clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/channels/{}/join", create_data.channel_id))
                    .header("Authorization", format!("Bearer {}", member_token.clone()))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        // Change member to moderator
        let role_response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/channels/{}/users/{}/role", create_data.channel_id, "member"))
                    .header("Authorization", format!("Bearer {}", owner_token))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "role": "moderator" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(role_response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_kick_user() {
        let app = create_test_app();
        let owner_token = create_test_token("owner");
        let member_token = create_test_token("member");

        // Create a channel
        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/channels")
                    .header("Authorization", format!("Bearer {}", owner_token.clone()))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Test Channel",
                            "privacy": "Public"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        let create_body = hyper::body::to_bytes(create_response.into_body()).await.unwrap();
        let create_data: CreateChannelResponse = serde_json::from_slice(&create_body).unwrap();

        // Join as member
        app.clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/channels/{}/join", create_data.channel_id))
                    .header("Authorization", format!("Bearer {}", member_token))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        // Kick the member
        let kick_response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/channels/{}/users/{}/kick", create_data.channel_id, "member"))
                    .header("Authorization", format!("Bearer {}", owner_token))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(kick_response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_ban_user() {
        let app = create_test_app();
        let owner_token = create_test_token("owner");
        let member_token = create_test_token("member");

        // Create a channel
        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/channels")
                    .header("Authorization", format!("Bearer {}", owner_token.clone()))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Test Channel",
                            "privacy": "Public"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        let create_body = hyper::body::to_bytes(create_response.into_body()).await.unwrap();
        let create_data: CreateChannelResponse = serde_json::from_slice(&create_body).unwrap();

        // Join as member
        app.clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/channels/{}/join", create_data.channel_id))
                    .header("Authorization", format!("Bearer {}", member_token))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        // Ban the member
        let ban_response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/channels/{}/users/{}/ban", create_data.channel_id, "member"))
                    .header("Authorization", format!("Bearer {}", owner_token.clone()))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "reason": "Test ban" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(ban_response.status(), StatusCode::OK);

        // Try to unban the member
        let unban_response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/channels/{}/users/{}/unban", create_data.channel_id, "member"))
                    .header("Authorization", format!("Bearer {}", owner_token))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(unban_response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_invite_management() {
        let app = create_test_app();
        let owner_token = create_test_token("owner");

        // Create a channel
        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/channels")
                    .header("Authorization", format!("Bearer {}", owner_token.clone()))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Test Channel",
                            "privacy": "InviteOnly"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        let create_body = hyper::body::to_bytes(create_response.into_body()).await.unwrap();
        let create_data: CreateChannelResponse = serde_json::from_slice(&create_body).unwrap();

        // Create an invite
        let invite_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/channels/{}/invite", create_data.channel_id))
                    .header("Authorization", format!("Bearer {}", owner_token.clone()))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "username": "invited_user" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(invite_response.status(), StatusCode::OK);

        let invite_body = hyper::body::to_bytes(invite_response.into_body()).await.unwrap();
        let invite_data: InviteUserResponse = serde_json::from_slice(&invite_body).unwrap();

        // List invites
        let list_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("GET")
                    .uri(format!("/channels/{}/invites", create_data.channel_id))
                    .header("Authorization", format!("Bearer {}", owner_token.clone()))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(list_response.status(), StatusCode::OK);

        // Revoke invite
        let revoke_response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/channels/{}/invites/{}", create_data.channel_id, invite_data.invite_token))
                    .header("Authorization", format!("Bearer {}", owner_token))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(revoke_response.status(), StatusCode::OK);
    }

    #[tokio::test]
    async fn test_permission_checks() {
        let app = create_test_app();
        let owner_token = create_test_token("owner");
        let member_token = create_test_token("member");

        // Create a channel
        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/channels")
                    .header("Authorization", format!("Bearer {}", owner_token))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Test Channel",
                            "privacy": "Public"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        let create_body = hyper::body::to_bytes(create_response.into_body()).await.unwrap();
        let create_data: CreateChannelResponse = serde_json::from_slice(&create_body).unwrap();

        // Try to change role as member (should fail)
        let role_response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/channels/{}/users/{}/role", create_data.channel_id, "owner"))
                    .header("Authorization", format!("Bearer {}", member_token))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "role": "member" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(role_response.status(), StatusCode::FORBIDDEN);
    }

    #[tokio::test]
    async fn test_self_management_prevention() {
        let app = create_test_app();
        let owner_token = create_test_token("owner");

        // Create a channel
        let create_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/channels")
                    .header("Authorization", format!("Bearer {}", owner_token.clone()))
                    .header("Content-Type", "application/json")
                    .body(Body::from(
                        json!({
                            "name": "Test Channel",
                            "privacy": "Public"
                        })
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        let create_body = hyper::body::to_bytes(create_response.into_body()).await.unwrap();
        let create_data: CreateChannelResponse = serde_json::from_slice(&create_body).unwrap();

        // Try to kick self (should fail)
        let kick_response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/channels/{}/users/{}/kick", create_data.channel_id, "owner"))
                    .header("Authorization", format!("Bearer {}", owner_token.clone()))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(kick_response.status(), StatusCode::FORBIDDEN);

        // Try to ban self (should fail)
        let ban_response = app
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/channels/{}/users/{}/ban", create_data.channel_id, "owner"))
                    .header("Authorization", format!("Bearer {}", owner_token))
                    .header("Content-Type", "application/json")
                    .body(Body::from(json!({ "reason": "Test" }).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(ban_response.status(), StatusCode::FORBIDDEN);
    }
} 