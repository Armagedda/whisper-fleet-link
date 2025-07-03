import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { ChannelSidebar } from './ChannelSidebar';
import { VoiceChannel } from './VoiceChannel';
import { Authentication } from './Authentication';
import { ChannelManagement } from './ChannelManagement';
import { AdminPanel } from './AdminPanel';
import { useVoiceConnection } from '@/hooks/useVoiceConnection';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Settings, Shield, LogOut } from 'lucide-react';
import { useTheme } from './ui/ThemeProvider';
import { SettingsModal } from './ui/SettingsModal';
import { WelcomePage } from './WelcomePage';
import { motion } from 'framer-motion';

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

export function VoiceApp() {
  const { userSettings } = useTheme();
  const [authData, setAuthData] = useState<AuthData | null>(null);
  const [currentView, setCurrentView] = useState<'voice' | 'channels' | 'admin'>('voice');
  const [activeChannelId, setActiveChannelId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [showConfetti, setShowConfetti] = useState(false);
  
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

  useEffect(() => {
    if (localStorage.getItem('onboardingComplete') !== 'true') {
      setShowOnboarding(true);
    }
  }, []);

  if (showOnboarding) {
    return <WelcomePage onComplete={() => {
      setShowOnboarding(false);
      setShowConfetti(true);
      setTimeout(() => setShowConfetti(false), 1200);
    }} />;
  }

  if (showConfetti) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.5 }}
        className="fixed inset-0 z-50 flex items-center justify-center bg-transparent pointer-events-none"
        aria-label="Onboarding complete"
      >
        {/* Simple confetti animation (SVG or emoji burst) */}
        <div className="text-7xl animate-bounce">🎉🎊✨</div>
      </motion.div>
    );
  }

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

  const memoizedChannelGroups = useMemo(() => channelGroups, [channelGroups]);
  const handleMemoizedChannelSelect = useCallback(handleChannelSelect, [handleChannelSelect]);

  function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, delay: number) {
    const timeout = React.useRef<number | null>(null);
    return useCallback((...args: Parameters<T>) => {
      if (timeout.current) window.clearTimeout(timeout.current);
      timeout.current = window.setTimeout(() => fn(...args), delay);
    }, [fn, delay]);
  }
  const debouncedHandleChannelSelect = useDebouncedCallback(handleChannelSelect, 30);

  return (
    <div className="rounded-2xl shadow-2xl bg-gradient-to-br from-zinc-900/80 to-zinc-800/80 backdrop-blur-xl border border-border p-6 max-w-4xl mx-auto my-8 flex flex-col gap-6">
      <button
        className="absolute top-4 right-4 rounded-full p-2 bg-background/60 hover:bg-primary/20 transition shadow border border-border"
        aria-label="Open settings"
        onClick={() => setSettingsOpen(true)}
      >
        ⚙️
      </button>
      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <div className="flex h-screen bg-transparent pt-16">
        <ChannelSidebar
          channelGroups={memoizedChannelGroups}
          activeChannelId={activeChannelId}
          onChannelSelect={handleMemoizedChannelSelect}
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
    </div>
  );
}