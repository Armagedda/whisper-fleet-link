import { useState, useEffect } from 'react';
import { ChannelSidebar } from './ChannelSidebar';
import { VoiceChannel } from './VoiceChannel';
import { Authentication } from './Authentication';
import { ChannelManagement } from './ChannelManagement';
import { AdminPanel } from './AdminPanel';
import { useVoiceConnection } from '@/hooks/useVoiceConnection';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Settings, Shield, LogOut } from 'lucide-react';

interface Channel {
  id: string;
  name: string;
  type: 'voice' | 'text';
  userCount: number;
  isActive: boolean;
  hasPermission: boolean;
}

interface ChannelGroup {
  id: string;
  name: string;
  channels: Channel[];
  isExpanded: boolean;
}

interface AuthData {
  id: string;
  username: string;
  email: string;
  roles: string[];
  token: string;
  refreshToken: string;
  channels: string[];
  permissions: {
    canCreateChannels: boolean;
    canModerate: boolean;
    isAdmin: boolean;
    isOwner: boolean;
  };
}

export const VoiceApp = () => {
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [currentView, setCurrentView] = useState<'voice' | 'channels' | 'admin'>('voice');
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  
  const { toast } = useToast();

  // Mock channel data - in real app this would come from your backend
  const [channelGroups, setChannelGroups] = useState<ChannelGroup[]>([
    {
      id: 'voice-channels',
      name: 'Voice Channels',
      isExpanded: true,
      channels: [
        { id: 'general', name: 'General', type: 'voice', userCount: 0, isActive: false, hasPermission: true },
        { id: 'gaming', name: 'Gaming', type: 'voice', userCount: 0, isActive: false, hasPermission: true },
        { id: 'fleet-command', name: 'Fleet Command', type: 'voice', userCount: 0, isActive: false, hasPermission: true },
        { id: 'logistics', name: 'Logistics', type: 'voice', userCount: 0, isActive: false, hasPermission: true }
      ]
    },
    {
      id: 'private-channels',
      name: 'Private Channels',
      isExpanded: false,
      channels: [
        { id: 'officers', name: 'Officers Only', type: 'voice', userCount: 0, isActive: false, hasPermission: false },
        { id: 'admin', name: 'Admin', type: 'voice', userCount: 0, isActive: false, hasPermission: false }
      ]
    }
  ]);

  const voiceConnection = useVoiceConnection({
    serverUrl: 'localhost:8080',
    token: authData?.token || '',
    onUserJoined: (user) => {
      toast({
        title: 'User Joined',
        description: `${user.username} joined the channel`,
      });
    },
    onUserLeft: (userId) => {
      const user = voiceConnection.users.find(u => u.id === userId);
      if (user) {
        toast({
          title: 'User Left',
          description: `${user.username} left the channel`,
        });
      }
    },
    onChannelChanged: (channelId) => {
      setActiveChannelId(channelId);
      updateChannelUserCounts();
    }
  });

  const updateChannelUserCounts = () => {
    setChannelGroups(prev => prev.map(group => ({
      ...group,
      channels: group.channels.map(channel => ({
        ...channel,
        userCount: voiceConnection.users.filter(user => user.channelId === channel.id).length
      }))
    })));
  };

  useEffect(() => {
    updateChannelUserCounts();
  }, [voiceConnection.users]);

  const handleAuthenticated = (user: AuthData) => {
    setAuthData(user);
    setIsLoading(false);
    toast({
      title: 'Connected',
      description: 'Successfully authenticated to voice server',
    });
  };

  const handleChannelSelect = (channelId: string) => {
    const channel = channelGroups
      .flatMap(group => group.channels)
      .find(ch => ch.id === channelId);
      
    if (!channel?.hasPermission) {
      toast({
        title: 'Access Denied',
        description: 'You do not have permission to join this channel',
        variant: 'destructive'
      });
      return;
    }

    if (voiceConnection.state.currentChannel === channelId) {
      // Already in this channel, do nothing
      return;
    }

    if (voiceConnection.state.currentChannel) {
      // Leave current channel first
      voiceConnection.leaveChannel();
    }

    // Join new channel
    voiceConnection.joinChannel(channelId);
    setActiveChannelId(channelId);
  };

  const handleChannelGroupToggle = (groupId: string) => {
    setChannelGroups(prev => prev.map(group => 
      group.id === groupId 
        ? { ...group, isExpanded: !group.isExpanded }
        : group
    ));
  };

  const handleJoinChannel = () => {
    if (activeChannelId && !voiceConnection.state.isConnected) {
      voiceConnection.connect();
    }
  };

  const handleLeaveChannel = () => {
    voiceConnection.leaveChannel();
  };

  // Auto-connect when auth data is available
  useEffect(() => {
    if (authData && !voiceConnection.state.isConnected) {
      voiceConnection.connect();
    }
  }, [authData, voiceConnection.connect, voiceConnection.state.isConnected]);

  if (!authData) {
    return (
      <Authentication
        onAuthenticated={handleAuthenticated}
        isLoading={isLoading}
        error={authError}
      />
    );
  }

  const activeChannel = channelGroups
    .flatMap(group => group.channels)
    .find(ch => ch.id === activeChannelId);

  const currentUser = {
    id: 'current-user',
    username: authData.username,
    isSpeaking: voiceConnection.state.isSpeaking,
    isMuted: voiceConnection.state.isMuted,
    isDeafened: voiceConnection.state.isDeafened,
    isOnline: true
  };

  const channelUsers = voiceConnection.state.currentChannel 
    ? [currentUser, ...voiceConnection.users.filter(user => user.channelId === voiceConnection.state.currentChannel)]
    : [];

  return (
    <div className="flex h-screen bg-background">
      <ChannelSidebar
        channelGroups={channelGroups}
        activeChannelId={activeChannelId}
        onChannelSelect={handleChannelSelect}
        onChannelGroupToggle={handleChannelGroupToggle}
        serverName="VoiceLink Server"
        username={authData.username}
        userStatus="online"
      />
      
      <div className="flex-1 flex flex-col">
        {activeChannel ? (
          <VoiceChannel
            channelName={activeChannel.name}
            users={channelUsers}
            currentUserId="current-user"
            onJoinChannel={handleJoinChannel}
            onLeaveChannel={handleLeaveChannel}
            onToggleMute={voiceConnection.toggleMute}
            onToggleDeafen={voiceConnection.toggleDeafen}
            isConnected={voiceConnection.state.isConnected && voiceConnection.state.currentChannel === activeChannelId}
            isMuted={voiceConnection.state.isMuted}
            isDeafened={voiceConnection.state.isDeafened}
          />
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-foreground mb-2">Welcome to VoiceLink</h2>
              <p className="text-muted-foreground">Select a voice channel to get started</p>
            </div>
          </div>
        )}
      </div>

      {/* Connection Status */}
      {voiceConnection.error && (
        <div className="absolute top-4 right-4 bg-destructive text-destructive-foreground px-4 py-2 rounded-lg">
          {voiceConnection.error}
        </div>
      )}
    </div>
  );
};