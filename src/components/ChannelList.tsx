import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Lock, Globe, KeyRound, Crown, Shield, User } from "lucide-react";

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
      {channels.map((channel) => {
        const isJoined = joinedChannelId === channel.id;
        const isLoading = loadingChannelId === channel.id;
        return (
          <Card
            key={channel.id}
            className={`transition-shadow focus-within:ring-2 focus-within:ring-primary/60 ${
              isJoined ? "border-primary ring-2 ring-primary/40" : ""
            }`}
            tabIndex={0}
            aria-current={isJoined}
            role="listitem"
          >
            <CardContent className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-4">
              <div className="flex items-center gap-3 min-w-0">
                {privacyInfo[channel.privacy].icon}
                <span className="font-semibold truncate" title={channel.name}>
                  {channel.name}
                </span>
                {privacyInfo[channel.privacy].badge}
                {channel.userRole && (
                  <span className="ml-2 flex items-center">
                    {roleInfo[channel.userRole].icon}
                    {roleInfo[channel.userRole].badge}
                  </span>
                )}
              </div>
              <div className="flex gap-2 mt-2 sm:mt-0">
                {isJoined ? (
                  <Button
                    variant="outline"
                    onClick={() => handleLeave(channel)}
                    disabled={isLoading}
                    aria-label={`Leave channel ${channel.name}`}
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
              <div className="px-4 pb-2 text-destructive text-sm" role="alert">{error}</div>
            )}
          </Card>
        );
      })}
    </div>
  );
};

export default ChannelList; 