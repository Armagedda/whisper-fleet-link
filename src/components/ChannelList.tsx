import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Globe, KeyRound, Crown, Shield, User } from "lucide-react";
import { AnimatePresence, motion } from 'framer-motion';

interface Channel {
  id: string;
  name: string;
  privacy: "public" | "private" | "invite_only";
  userRole: "owner" | "moderator" | "member" | null;
}

interface ChannelListProps {
  channels: Channel[];
  onJoin: (channelId: string) => Promise<void>;
  onLeave: (channelId: string) => Promise<void>;
  onRequestJoinToken: (channelId: string) => void;
  joinedChannelId: string | null;
  setJoinedChannelId: (channelId: string | null) => void;
}

const privacyInfo = {
  public: {
    label: "Public",
    icon: <Globe className="h-4 w-4 mr-1" aria-hidden="true" />,
    badge: <Badge variant="outline">Public</Badge>,
  },
  private: {
    label: "Private",
    icon: <Lock className="h-4 w-4 mr-1" aria-hidden="true" />,
    badge: <Badge variant="secondary">Private</Badge>,
  },
  invite_only: {
    label: "Invite Only",
    icon: <KeyRound className="h-4 w-4 mr-1" aria-hidden="true" />,
    badge: <Badge variant="destructive">Invite Only</Badge>,
  },
};

const roleInfo = {
  owner: {
    label: "Owner",
    icon: <Crown className="h-4 w-4 mr-1 text-yellow-500" aria-hidden="true" />,
    badge: <Badge variant="outline">Owner</Badge>,
  },
  moderator: {
    label: "Moderator",
    icon: <Shield className="h-4 w-4 mr-1 text-blue-500" aria-hidden="true" />,
    badge: <Badge variant="secondary">Moderator</Badge>,
  },
  member: {
    label: "Member",
    icon: <User className="h-4 w-4 mr-1 text-green-500" aria-hidden="true" />,
    badge: <Badge variant="default">Member</Badge>,
  },
};

const ChannelList: React.FC<ChannelListProps> = ({
  channels,
  onJoin,
  onLeave,
  onRequestJoinToken,
  joinedChannelId,
  setJoinedChannelId,
}) => {
  const [loadingChannelId, setLoadingChannelId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(false);

  const handleJoin = async (channel: Channel) => {
    setError(null);
    if (channel.privacy === "invite_only") {
      onRequestJoinToken(channel.id);
      return;
    }
    setLoadingChannelId(channel.id);
    try {
      await onJoin(channel.id);
      setJoinedChannelId(channel.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to join channel");
    } finally {
      setLoadingChannelId(null);
    }
  };

  const handleLeave = async (channel: Channel) => {
    setError(null);
    setLoadingChannelId(channel.id);
    try {
      await onLeave(channel.id);
      setJoinedChannelId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to leave channel");
    } finally {
      setLoadingChannelId(null);
    }
  };

  return (
    <div className="grid gap-4" role="list" aria-label="Channel list">
      <AnimatePresence>
        {loading ? (
          <motion.div
            key="shimmer"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="rounded-xl shadow-md bg-gradient-to-br from-zinc-800/60 to-zinc-900/80 backdrop-blur-lg border border-border h-20 w-full animate-pulse"
          />
        ) : (
          channels.map((channel) => {
            const isJoined = joinedChannelId === channel.id;
            const isLoading = loadingChannelId === channel.id;
            return (
              <motion.div
                key={channel.id}
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 16 }}
                whileHover={{ scale: 1.02, boxShadow: '0 0 0 2px #a5b4fc, 0 4px 24px 0 #0002' }}
                whileFocus={{ scale: 1.01, boxShadow: '0 0 0 2px #818cf8, 0 4px 24px 0 #0002' }}
                transition={{ type: 'spring', duration: 0.3 }}
                className={`transition-shadow focus-within:ring-2 focus-within:ring-primary/60 rounded-xl shadow-md bg-gradient-to-br from-zinc-800/60 to-zinc-900/80 backdrop-blur-lg border border-border ${isJoined ? "border-primary ring-2 ring-primary/40" : ""}`}
                tabIndex={0}
                aria-current={isJoined}
                role="listitem"
              >
                <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-4 px-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white bg-gradient-to-br from-primary to-secondary shadow-inner mr-2">
                      {channel.name.charAt(0).toUpperCase()}
                    </span>
                    {privacyInfo[channel.privacy].icon}
                    <span className="font-semibold truncate text-base" title={channel.name}>
                      {channel.name}
                    </span>
                    <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 ml-2">
                      {privacyInfo[channel.privacy].icon}
                      {privacyInfo[channel.privacy].label}
                    </span>
                    {channel.userRole && (
                      <span className="ml-2 flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-secondary/10 text-secondary border border-secondary/20">
                        {roleInfo[channel.userRole].icon}
                        {roleInfo[channel.userRole].label}
                      </span>
                    )}
                    <span className="ml-2 flex items-center gap-1">
                      {[...Array(Math.min(8, Math.floor(Math.random() * 8) + 1))].map((_, i) => (
                        <span key={i} className="w-1.5 h-1.5 rounded-full bg-primary/60 inline-block" />
                      ))}
                    </span>
                  </div>
                  <div className="flex gap-2 mt-2 sm:mt-0">
                    {isJoined ? (
                      <Button
                        variant="outline"
                        onClick={() => handleLeave(channel)}
                        disabled={isLoading}
                        aria-label={`Leave channel ${channel.name}`}
                        className="rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary/50"
                      >
                        {isLoading ? (
                          <span className="flex items-center"><span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Leaving...</span>
                        ) : (
                          "Leave"
                        )}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => handleJoin(channel)}
                        disabled={isLoading}
                        aria-label={`Join channel ${channel.name}`}
                        className="rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary/50"
                      >
                        {isLoading ? (
                          <span className="flex items-center"><span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Joining...</span>
                        ) : (
                          channel.privacy === "invite_only" ? "Request Invite" : "Join"
                        )}
                      </Button>
                    )}
                  </div>
                </CardContent>
                {isJoined && error && (
                  <div className="px-4 pb-2 text-destructive text-sm font-medium bg-destructive/10 rounded-b-lg" role="alert">{error}</div>
                )}
              </motion.div>
            );
          })
        )}
      </AnimatePresence>
    </div>
  );
};

export default ChannelList; 