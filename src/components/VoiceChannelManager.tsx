import ChannelList from "./ChannelList";
import JoinTokenModal from "./JoinTokenModal";
import { InviteUserPanel } from "./InviteUserPanel";
import RoleManagementPanel from "./RoleManagementPanel";
import useVoiceWebSocket, { UserState, ConnectionStatus } from "@/hooks/useVoiceWebSocket";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Mic, MicOff, Loader2, UserPlus, Shield, Settings } from "lucide-react";
import { useUdpVoiceStream, UdpConnectionStatus } from '../hooks/useUdpVoiceStream';
import React, { useMemo, useCallback, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { UdpVoiceControls } from './UdpVoiceControls';

// Dummy function to get JWT (replace with real auth)
const getJwtToken = () => localStorage.getItem("jwt") || "";

// Dummy function to get current user ID (replace with real auth)
const getCurrentUserId = () => localStorage.getItem("userId") || "current-user";

// Dummy function to fetch channels (replace with real API)
const fetchChannels = async (): Promise<Array<{ id: string; name: string; privacy: "public" | "private" | "invite_only"; userRole: "owner" | "moderator" | "member" | null }>> => [
  { id: "1", name: "General", privacy: "public", userRole: "member" },
  { id: "2", name: "Officers", privacy: "private", userRole: null },
  { id: "3", name: "Fleet Command", privacy: "invite_only", userRole: null },
];

// Dummy backend API for invites (replace with real API calls)
const fetchInvites = async (channelId: string) => {
  // Simulate API call
  await new Promise((res) => setTimeout(res, 300));
  return [
    // Example:
    // { id: "abc123", username: "alice", expiresAt: new Date(Date.now() + 3600_000).toISOString() },
  ];
};
const createInvite = async (channelId: string, username: string) => {
  await new Promise((res) => setTimeout(res, 400));
  // Return a fake token string
  return Math.random().toString(36).slice(2);
};
const revokeInvite = async (channelId: string, tokenId: string) => {
  await new Promise((res) => setTimeout(res, 400));
};

// Dummy backend API for role management (replace with real API calls)
const changeUserRole = async (channelId: string, userId: string, newRole: "owner" | "moderator" | "member") => {
  await new Promise((res) => setTimeout(res, 500));
  // Simulate API call
};
const kickUser = async (channelId: string, userId: string) => {
  await new Promise((res) => setTimeout(res, 500));
  // Simulate API call
};
const banUser = async (channelId: string, userId: string, reason?: string) => {
  await new Promise((res) => setTimeout(res, 500));
  // Simulate API call
};

// 1. React.memo for pure components
const VoiceChannelManager = React.memo(function VoiceChannelManager() {
  // State
  const [channels, setChannels] = useState<Array<{ id: string; name: string; privacy: "public" | "private" | "invite_only"; userRole: "owner" | "moderator" | "member" | null }>>([]);
  const [joinedChannelId, setJoinedChannelId] = React.useState<string | null>(null);
  const [showJoinTokenModal, setShowJoinTokenModal] = React.useState(false);
  const [pendingJoinChannelId, setPendingJoinChannelId] = React.useState<string | null>(null);
  const [joinToken, setJoinToken] = React.useState("");
  const [joinError, setJoinError] = React.useState<string | null>(null);
  const [joinLoading, setJoinLoading] = React.useState(false);
  const [leaveLoading, setLeaveLoading] = React.useState<string | null>(null);
  const [userList, setUserList] = React.useState<UserState[]>([]);
  const [connectionStatus, setConnectionStatus] = React.useState<ConnectionStatus>("closed");
  const [muteLoading, setMuteLoading] = React.useState<string | null>(null);

  // Invite panel state
  const [showInvitePanel, setShowInvitePanel] = React.useState(false);
  const [invites, setInvites] = React.useState<{ id: string; username: string; expiresAt: string }[]>([]);
  const [invitesLoading, setInvitesLoading] = React.useState(false);
  const [inviteError, setInviteError] = React.useState<string | null>(null);
  const [inviteActionLoading, setInviteActionLoading] = React.useState(false);

  // Role management state
  const [showRolePanel, setShowRolePanel] = React.useState(false);
  const [roleError, setRoleError] = React.useState<string | null>(null);

  // Add settingsOpen and loading state
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [loading, setLoading] = useState(false); // Use this for shimmer

  const jwtToken = getJwtToken();
  const currentUserId = getCurrentUserId();

  // Fetch channels on mount
  React.useEffect(() => {
    fetchChannels().then(setChannels);
  }, []);

  // WebSocket hook
  const {
    sendMessage,
    isConnected,
    error: wsError,
  } = useVoiceWebSocket({
    jwtToken,
    channelId: joinedChannelId,
    onUserUpdate: (user) => {
      setUserList((prev) => {
        const idx = prev.findIndex((u) => u.user_id === user.user_id);
        if (idx !== -1) {
          const updated = [...prev];
          updated[idx] = { ...updated[idx], ...user };
          return updated;
        } else {
          return [...prev, user];
        }
      });
    },
    onConnectionStatus: setConnectionStatus,
  });

  // Fetch invites when joinedChannelId or showInvitePanel changes
  React.useEffect(() => {
    if (showInvitePanel && joinedChannelId) {
      setInvitesLoading(true);
      setInviteError(null);
      fetchInvites(joinedChannelId)
        .then(setInvites)
        .catch((err) => setInviteError("Failed to fetch invites"))
        .finally(() => setInvitesLoading(false));
    }
  }, [showInvitePanel, joinedChannelId]);

  // Handle join (public/private)
  const handleJoin = async (channelId: string) => {
    setJoinError(null);
    setJoinLoading(true);
    try {
      // Simulate join API call
      await new Promise((res) => setTimeout(res, 500));
      setJoinedChannelId(channelId);
      setUserList([]); // Clear user list on join
    } catch (err) {
      setJoinError("Failed to join channel");
    } finally {
      setJoinLoading(false);
    }
  };

  // Handle leave
  const handleLeave = async (channelId: string) => {
    setJoinError(null);
    setLeaveLoading(channelId);
    try {
      // Simulate leave API call
      await new Promise((res) => setTimeout(res, 500));
      setJoinedChannelId(null);
      setUserList([]);
      setShowInvitePanel(false);
    } catch (err) {
      setJoinError("Failed to leave channel");
    } finally {
      setLeaveLoading(null);
    }
  };

  // Handle request join token (invite_only)
  const handleRequestJoinToken = (channelId: string) => {
    setPendingJoinChannelId(channelId);
    setShowJoinTokenModal(true);
    setJoinToken("");
    setJoinError(null);
  };

  // Handle submit join token
  const handleSubmitJoinToken = async (token: string) => {
    setJoinError(null);
    setJoinLoading(true);
    try {
      // Simulate join with token (replace with real API call)
      await new Promise((res) => setTimeout(res, 500));
      setJoinedChannelId(pendingJoinChannelId);
      setUserList([]);
      setShowJoinTokenModal(false);
      setJoinToken("");
      setPendingJoinChannelId(null);
    } catch (err) {
      setJoinError("Invalid or expired join token");
    } finally {
      setJoinLoading(false);
    }
  };

  // Handle cancel join token modal
  const handleCancelJoinToken = () => {
    setShowJoinTokenModal(false);
    setJoinToken("");
    setPendingJoinChannelId(null);
  };

  // Handle mute/unmute
  const handleToggleMute = (user: UserState) => {
    setMuteLoading(user.user_id);
    sendMessage({ type: user.is_muted ? "unmute" : "mute", user_id: user.user_id });
    setTimeout(() => setMuteLoading(null), 400); // Simulate quick feedback
  };

  // Invite panel logic
  const handleOpenInvitePanel = () => {
    setShowInvitePanel(true);
    setInviteError(null);
  };
  const handleCloseInvitePanel = () => {
    setShowInvitePanel(false);
    setInviteError(null);
  };
  const handleInvite = async (username: string) => {
    if (!joinedChannelId) return "";
    setInviteActionLoading(true);
    setInviteError(null);
    try {
      const token = await createInvite(joinedChannelId, username);
      await refreshInvites();
      return token;
    } catch (err) {
      setInviteError("Failed to create invite");
      throw err;
    } finally {
      setInviteActionLoading(false);
    }
  };
  const handleRevoke = async (tokenId: string) => {
    if (!joinedChannelId) return;
    setInviteActionLoading(true);
    setInviteError(null);
    try {
      await revokeInvite(joinedChannelId, tokenId);
      await refreshInvites();
    } catch (err) {
      setInviteError("Failed to revoke invite");
      throw err;
    } finally {
      setInviteActionLoading(false);
    }
  };
  const refreshInvites = async () => {
    if (!joinedChannelId) return;
    setInvitesLoading(true);
    setInviteError(null);
    try {
      const data = await fetchInvites(joinedChannelId);
      setInvites(data);
    } catch (err) {
      setInviteError("Failed to refresh invites");
    } finally {
      setInvitesLoading(false);
    }
  };

  // Role management logic
  const handleOpenRolePanel = () => {
    setShowRolePanel(true);
    setRoleError(null);
  };
  const handleCloseRolePanel = () => {
    setShowRolePanel(false);
    setRoleError(null);
  };
  const handleChangeRole = async (userId: string, newRole: "owner" | "moderator" | "member") => {
    if (!joinedChannelId) return;
    setRoleError(null);
    try {
      await changeUserRole(joinedChannelId, userId, newRole);
      // Update local user list with new role
      setUserList(prev => prev.map(user => 
        user.user_id === userId 
          ? { ...user, role: newRole }
          : user
      ));
    } catch (err) {
      setRoleError("Failed to change user role");
      throw err;
    }
  };
  const handleKickUser = async (userId: string) => {
    if (!joinedChannelId) return;
    setRoleError(null);
    try {
      await kickUser(joinedChannelId, userId);
      // Remove user from local list
      setUserList(prev => prev.filter(user => user.user_id !== userId));
    } catch (err) {
      setRoleError("Failed to kick user");
      throw err;
    }
  };
  const handleBanUser = async (userId: string, reason?: string) => {
    if (!joinedChannelId) return;
    setRoleError(null);
    try {
      await banUser(joinedChannelId, userId, reason);
      // Remove user from local list
      setUserList(prev => prev.filter(user => user.user_id !== userId));
    } catch (err) {
      setRoleError("Failed to ban user");
      throw err;
    }
  };

  // Determine if current user can invite/manage roles
  const currentChannel = channels.find((c) => c.id === joinedChannelId);
  const canInvite = currentChannel && ["owner", "moderator"].includes(currentChannel.userRole || "");
  const canManageRoles = currentChannel && ["owner", "moderator"].includes(currentChannel.userRole || "");

  // Convert WebSocket user list to role management format
  const roleManagementUsers = userList.map(user => ({
    id: user.user_id,
    username: user.username,
    role: (user as any).role || "member" // Default to member if role not set
  }));

  // UDP voice streaming
  const { state: audioState, controls: audioControls } = useUdpVoiceStream(
    jwtToken,
    currentUserId,
    joinedChannelId || '',
    {
      serverAddress: '127.0.0.1',
      serverPort: 8080,
      audioCodec: 'opus',
      sampleRate: 48000,
      channels: 1,
      frameSize: 960,
      bitrate: 64000,
      enableEchoCancellation: true,
      enableNoiseSuppression: true,
      enableAutomaticGainControl: true,
      reconnectInterval: 5000,
      heartbeatInterval: 30000,
    }
  );

  // Auto-connect UDP when WebSocket is connected and channel is selected
  React.useEffect(() => {
    if (isConnected && joinedChannelId && audioState.status === UdpConnectionStatus.Disconnected) {
      audioControls.connect();
    }
  }, [isConnected, joinedChannelId, audioState.status, audioControls]);

  // Disconnect UDP when leaving channel or component unmounts
  React.useEffect(() => {
    return () => {
      if (audioState.isConnected) {
        audioControls.disconnect();
      }
    };
  }, [audioControls]);

  // Disconnect UDP when leaving channel
  React.useEffect(() => {
    if (!joinedChannelId && audioState.isConnected) {
      audioControls.disconnect();
    }
  }, [joinedChannelId, audioState.isConnected, audioControls]);

  // Handle UDP mute/unmute for current user
  const handleUdpToggleMute = () => {
    if (audioState.isConnected) {
      audioControls.mute(!audioState.isMuted);
    }
  };

  // 2. Memoize derived lists and handlers
  const memoizedUserList = useMemo(() => userList, [userList]);
  const handleMemoizedMute = useCallback(handleToggleMute, [handleToggleMute]);

  // 3. Throttle/debounce UI events
  function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, delay: number) {
    const timeout = React.useRef<number | null>(null);
    return useCallback((...args: Parameters<T>) => {
      if (timeout.current) window.clearTimeout(timeout.current);
      timeout.current = window.setTimeout(() => fn(...args), delay);
    }, [fn, delay]);
  }
  const debouncedHandleMute = useDebouncedCallback(handleToggleMute, 30);

  // Render user list for joined channel
  const renderUserList = () => (
    <Card className="mt-6">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>Users in Channel</CardTitle>
        <div className="flex gap-2">
          {canManageRoles && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleOpenRolePanel}
              className="gap-2"
              aria-label="Manage Roles"
            >
              <Shield className="h-4 w-4" /> Manage Roles
            </Button>
          )}
          {canInvite && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleOpenInvitePanel}
              className="gap-2"
              aria-label="Invite Users"
            >
              <UserPlus className="h-4 w-4" /> Invite Users
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {/* Voice Controls Section */}
        <div className="mb-6 p-4 bg-muted/50 rounded-lg">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-medium text-sm">Voice Controls</h3>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${
                audioState.status === UdpConnectionStatus.Connected ? 'bg-green-500' :
                audioState.status === UdpConnectionStatus.Connecting ? 'bg-yellow-500' :
                audioState.status === UdpConnectionStatus.Error ? 'bg-red-500' :
                'bg-gray-300'
              }`} />
              <span className="text-xs text-muted-foreground">
                {audioState.status === UdpConnectionStatus.Connecting ? 'Connecting...' :
                 audioState.status === UdpConnectionStatus.Connected ? 'Connected' :
                 audioState.status === UdpConnectionStatus.Error ? 'Error' :
                 'Disconnected'}
              </span>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Button
              size="sm"
              variant={audioState.isMuted ? "destructive" : "default"}
              onClick={handleUdpToggleMute}
              disabled={!audioState.isConnected || audioState.status === UdpConnectionStatus.Connecting}
              className="gap-2"
            >
              {audioState.status === UdpConnectionStatus.Connecting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : audioState.isMuted ? (
                <MicOff className="h-4 w-4" />
              ) : (
                <Mic className="h-4 w-4" />
              )}
              {audioState.isMuted ? 'Unmute' : 'Mute'}
            </Button>

            {audioState.isConnected && (
              <div className="flex items-center gap-2 text-xs">
                <span className="text-muted-foreground">Audio Level:</span>
                <div className="w-16 bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-green-500 h-1.5 rounded-full transition-all duration-100"
                    style={{ width: `${audioState.audioLevel * 100}%` }}
                  />
                </div>
                <span className="text-muted-foreground w-8">
                  {Math.round(audioState.audioLevel * 100)}%
                </span>
              </div>
            )}

            {audioState.error && (
              <span className="text-xs text-destructive">
                Error: {audioState.error}
              </span>
            )}
          </div>
                </div>

        {userList.length === 0 ? (
          <div className="text-muted-foreground text-center">No users in this channel.</div>
        ) : (
          <ul className="divide-y">
            {userList.map((user) => (
              <li key={user.user_id} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-2">
                  <span className="font-medium">{user.username}</span>
                  {user.is_muted ? (
                    <span className="badge bg-destructive">Muted</span>
                  ) : (
                    <span className="badge bg-default">Unmuted</span>
                  )}
                </span>
                <Button
                  size="sm"
                  variant={user.is_muted ? "secondary" : "outline"}
                  onClick={() => handleToggleMute(user)}
                  disabled={muteLoading === user.user_id}
                  aria-label={user.is_muted ? `Unmute ${user.username}` : `Mute ${user.username}`}
                >
                  {muteLoading === user.user_id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : user.is_muted ? (
                    <MicOff className="h-4 w-4" />
                  ) : (
                    <Mic className="h-4 w-4" />
                  )}
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      {/* InviteUserPanel Drawer/Modal */}
      {showInvitePanel && joinedChannelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-lg p-4 relative">
            <Button
              size="sm"
              variant="ghost"
              className="absolute top-2 right-2"
              onClick={handleCloseInvitePanel}
              aria-label="Close Invite Panel"
            >
              ×
            </Button>
            <InviteUserPanel
              channelId={joinedChannelId}
              invites={invites}
              onInvite={handleInvite}
              onRevoke={handleRevoke}
            />
            {invitesLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/80">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            )}
            {inviteError && (
              <div className="mt-2 text-destructive text-sm text-center">{inviteError}</div>
            )}
          </div>
        </div>
      )}
      {/* RoleManagementPanel Drawer/Modal */}
      {showRolePanel && joinedChannelId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
          <div className="bg-background rounded-lg shadow-lg w-full max-w-4xl p-4 relative max-h-[90vh] overflow-y-auto">
            <Button
              size="sm"
              variant="ghost"
              className="absolute top-2 right-2"
              onClick={handleCloseRolePanel}
              aria-label="Close Role Panel"
            >
              ×
            </Button>
            <RoleManagementPanel
              channelId={joinedChannelId}
              users={roleManagementUsers}
              currentUserId={currentUserId}
              onChangeRole={handleChangeRole}
              onKickUser={handleKickUser}
              onBanUser={handleBanUser}
            />
            {roleError && (
              <div className="mt-2 text-destructive text-sm text-center">{roleError}</div>
            )}
          </div>
        </div>
      )}
    </Card>
  );

  return (
    <div className="relative min-h-screen w-full bg-gradient-to-br from-zinc-900/80 via-zinc-800/80 to-zinc-900/90 backdrop-blur-xl">
      <div className="flex flex-col md:flex-row gap-6 p-4 md:p-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 24 }}
          transition={{ duration: 0.4, type: 'spring' }}
          className="flex-1 max-w-2xl mx-auto bg-white/70 dark:bg-zinc-900/80 rounded-xl shadow-2xl p-6 backdrop-blur-lg border border-border"
        >
          <div className="mb-4 flex items-center gap-4">
            <span className="font-semibold">Connections:</span>
            <div className="flex gap-2">
              <Badge className={
                connectionStatus === "open"
                  ? "bg-default"
                  : connectionStatus === "connecting"
                  ? "bg-secondary"
                  : connectionStatus === "error"
                  ? "bg-destructive"
                  : "bg-outline"
              }>
                WebSocket: {connectionStatus.charAt(0).toUpperCase() + connectionStatus.slice(1)}
              </Badge>
              {joinedChannelId && (
                <Badge className={
                  audioState.status === UdpConnectionStatus.Connected
                    ? "bg-default"
                    : audioState.status === UdpConnectionStatus.Connecting
                    ? "bg-secondary"
                    : audioState.status === UdpConnectionStatus.Error
                    ? "bg-destructive"
                    : "bg-outline"
                }>
                  UDP: {audioState.status.charAt(0).toUpperCase() + audioState.status.slice(1)}
                </Badge>
              )}
            </div>
            {(wsError || audioState.error) && (
              <span className="text-destructive text-sm ml-2">
                {wsError || audioState.error}
              </span>
            )}
          </div>
          <ChannelList
            channels={channels}
            onJoin={handleJoin}
            onLeave={handleLeave}
            onRequestJoinToken={handleRequestJoinToken}
            joinedChannelId={joinedChannelId}
            setJoinedChannelId={setJoinedChannelId}
          />
          {joinError && (
            <div className="mt-4 text-destructive text-sm" role="alert">{joinError}</div>
          )}
          {joinLoading && (
            <div className="mt-4 flex items-center gap-2 text-muted-foreground text-sm">
              <Loader2 className="h-4 w-4 animate-spin" /> Joining channel...
            </div>
          )}
          {joinedChannelId && renderUserList()}
          <JoinTokenModal
            visible={showJoinTokenModal}
            onSubmit={handleSubmitJoinToken}
            onCancel={handleCancelJoinToken}
          />
        </motion.div>
        <motion.div
          initial={{ opacity: 0, x: 24 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: 24 }}
          transition={{ duration: 0.4, type: 'spring' }}
          className="w-full md:w-[400px] max-w-full mx-auto md:mx-0 bg-white/70 dark:bg-zinc-900/80 rounded-xl shadow-2xl p-6 backdrop-blur-lg border border-border"
        >
          <div className="relative">
            <UdpVoiceControls
              jwtToken={jwtToken}
              userId={currentUserId}
              channelId={joinedChannelId || ''}
              serverAddress={'127.0.0.1'}
              serverPort={8080}
            />
            <button
              className="fixed md:absolute bottom-6 right-6 z-50 bg-primary text-white rounded-full p-3 shadow-lg hover:scale-105 focus:ring-2 focus:ring-primary/50 transition-all"
              aria-label="Open settings"
              onClick={() => setSettingsOpen(true)}
            >
              <Settings className="h-6 w-6" />
            </button>
          </div>
        </motion.div>
      </div>
      <AnimatePresence>
        {loading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-gradient-to-br from-primary/10 to-secondary/10 animate-pulse z-40"
          />
        )}
      </AnimatePresence>
    </div>
  );
});

export default VoiceChannelManager; 