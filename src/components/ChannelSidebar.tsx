import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Volume2 } from 'lucide-react';
import { cn } from '@/lib/utils';

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

interface ChannelSidebarProps {
  channelGroups: ChannelGroup[];
  activeChannelId: string | null;
  onChannelSelect: (channelId: string) => void;
  onChannelGroupToggle: (groupId: string) => void;
  serverName: string;
  username: string;
  userStatus: 'online' | 'idle' | 'dnd' | 'offline';
}

export const ChannelSidebar = ({
  channelGroups,
  activeChannelId,
  onChannelSelect,
  onChannelGroupToggle,
  serverName,
  username,
  userStatus
}: ChannelSidebarProps) => {
  return (
    <div className="w-60 bg-card border-r border-border flex flex-col h-full">
      {/* Server Header */}
      <div className="p-4 border-b border-border">
        <h1 className="text-lg font-bold text-foreground truncate">{serverName}</h1>
        <div className="text-xs text-muted-foreground mt-1">Voice Communication Platform</div>
      </div>

      {/* Channel Groups */}
      <div className="flex-1 overflow-y-auto">
        {channelGroups.map(group => (
          <ChannelGroupItem
            key={group.id}
            group={group}
            activeChannelId={activeChannelId}
            onChannelSelect={onChannelSelect}
            onToggle={() => onChannelGroupToggle(group.id)}
          />
        ))}
      </div>

      {/* User Panel */}
      <div className="p-3 border-t border-border bg-muted/30">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className={cn(
              "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium",
              userStatus === 'online' && "bg-status-online",
              userStatus === 'idle' && "bg-status-idle", 
              userStatus === 'dnd' && "bg-status-dnd",
              userStatus === 'offline' && "bg-status-offline"
            )}>
              {username.charAt(0).toUpperCase()}
            </div>
            <div className={cn(
              "absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-card",
              userStatus === 'online' && "bg-status-online",
              userStatus === 'idle' && "bg-status-idle",
              userStatus === 'dnd' && "bg-status-dnd", 
              userStatus === 'offline' && "bg-status-offline"
            )}></div>
          </div>
          
          <div className="flex-1 min-w-0">
            <div className="font-medium text-sm text-foreground truncate">{username}</div>
            <div className="text-xs text-muted-foreground capitalize">{userStatus}</div>
          </div>
        </div>
      </div>
    </div>
  );
};

const ChannelGroupItem = ({ 
  group, 
  activeChannelId, 
  onChannelSelect, 
  onToggle 
}: {
  group: ChannelGroup;
  activeChannelId: string | null;
  onChannelSelect: (channelId: string) => void;
  onToggle: () => void;
}) => {
  return (
    <div className="p-2">
      {/* Group Header */}
      <Button
        variant="ghost"
        onClick={onToggle}
        className="w-full justify-start p-2 h-auto text-xs font-semibold text-muted-foreground hover:text-foreground uppercase tracking-wide"
      >
        <span className={cn(
          "mr-1 transition-transform",
          group.isExpanded ? "rotate-90" : "rotate-0"
        )}>
          ▶
        </span>
        {group.name}
      </Button>

      {/* Channels */}
      {group.isExpanded && (
        <div className="ml-4 space-y-1">
          {group.channels.map(channel => (
            <ChannelItem
              key={channel.id}
              channel={channel}
              isActive={channel.id === activeChannelId}
              onSelect={() => onChannelSelect(channel.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const ChannelItem = ({ 
  channel, 
  isActive, 
  onSelect 
}: {
  channel: Channel;
  isActive: boolean;
  onSelect: () => void;
}) => {
  return (
    <Button
      variant="ghost"
      onClick={onSelect}
      disabled={!channel.hasPermission}
      className={cn(
        "w-full justify-start p-2 h-auto text-sm",
        isActive 
          ? "bg-accent text-accent-foreground" 
          : "hover:bg-accent/50",
        !channel.hasPermission && "opacity-50 cursor-not-allowed"
      )}
    >
      <div className="flex items-center gap-2 flex-1">
        {/* Channel Icon */}
        {channel.type === 'voice' ? (
          <Volume2 size={16} className="text-channel-voice" />
        ) : (
          <span className="text-channel-text">#</span>
        )}
        
        {/* Channel Name */}
        <span className="truncate">{channel.name}</span>
        
        {/* User Count Badge */}
        {channel.type === 'voice' && channel.userCount > 0 && (
          <Badge variant="secondary" className="text-xs h-5">
            {channel.userCount}
          </Badge>
        )}
      </div>
    </Button>
  );
};