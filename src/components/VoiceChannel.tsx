import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Volume2, VolumeOff, Mic, MicOff } from 'lucide-react';
import { cn } from '@/lib/utils';
import { AnimatePresence, motion } from 'framer-motion';

interface User {
  id: string;
  username: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isOnline: boolean;
}

interface VoiceChannelProps {
  channelName: string;
  users: User[];
  currentUserId: string;
  onJoinChannel: () => void;
  onLeaveChannel: () => void;
  onToggleMute: () => void;
  onToggleDeafen: () => void;
  isConnected: boolean;
  isMuted: boolean;
  isDeafened: boolean;
}

export const VoiceChannel = ({
  channelName,
  users,
  currentUserId,
  onJoinChannel,
  onLeaveChannel,
  onToggleMute,
  onToggleDeafen,
  isConnected,
  isMuted,
  isDeafened
}: VoiceChannelProps) => {
  const [isHovered, setIsHovered] = useState(false);

  const currentUser = users.find(user => user.id === currentUserId);
  const otherUsers = users.filter(user => user.id !== currentUserId);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 24 }}
      transition={{ duration: 0.4, type: 'spring' }}
      className="flex flex-col h-full bg-gradient-to-br from-zinc-900/80 via-zinc-800/80 to-zinc-900/90 backdrop-blur-xl rounded-xl shadow-2xl border border-border"
    >
      {/* Channel Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-channel-voice"></div>
          <h2 className="text-lg font-semibold text-foreground">{channelName}</h2>
          <Badge variant="secondary" className="text-xs">
            {users.length} connected
          </Badge>
        </div>
        
        {!isConnected ? (
          <Button onClick={onJoinChannel} size="sm" className="bg-voice-active hover:bg-voice-active/80">
            Join Channel
          </Button>
        ) : (
          <Button onClick={onLeaveChannel} variant="outline" size="sm">
            Leave
          </Button>
        )}
      </div>

      {/* User List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-2">
        {/* Current User */}
        {currentUser && (
          <div className="mb-4">
            <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">You</div>
            <UserItem user={currentUser} isCurrentUser={true} />
          </div>
        )}

        {/* Other Users */}
        {otherUsers.length > 0 && (
          <div>
            <div className="text-xs text-muted-foreground mb-2 uppercase tracking-wide">
              In Channel ({otherUsers.length})
            </div>
            {otherUsers.map(user => (
              <UserItem key={user.id} user={user} isCurrentUser={false} />
            ))}
          </div>
        )}

        {users.length === 0 && (
          <div className="text-center text-muted-foreground py-8">
            No users in this channel
          </div>
        )}
      </div>

      {/* Voice Controls */}
      {isConnected && (
        <div 
          className="p-4 border-t border-border bg-card"
          onMouseEnter={() => setIsHovered(true)}
          onMouseLeave={() => setIsHovered(false)}
        >
          <div className="flex items-center justify-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleMute}
              className={cn(
                "p-3 rounded-full",
                isMuted 
                  ? "bg-voice-muted hover:bg-voice-muted/80 text-white" 
                  : "bg-secondary hover:bg-secondary/80"
              )}
            >
              {isMuted ? <MicOff size={18} /> : <Mic size={18} />}
            </Button>
            
            <Button
              variant="ghost"
              size="sm"
              onClick={onToggleDeafen}
              className={cn(
                "p-3 rounded-full",
                isDeafened 
                  ? "bg-voice-deafened hover:bg-voice-deafened/80 text-white" 
                  : "bg-secondary hover:bg-secondary/80"
              )}
            >
              {isDeafened ? <VolumeOff size={18} /> : <Volume2 size={18} />}
            </Button>
          </div>
          
          {isHovered && (
            <div className="text-xs text-center text-muted-foreground mt-2">
              {isMuted ? 'Unmute' : 'Mute'} • {isDeafened ? 'Undeafen' : 'Deafen'}
            </div>
          )}
        </div>
      )}
    </motion.div>
  );
};

const UserItem = ({ user, isCurrentUser }: { user: User; isCurrentUser: boolean }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 16 }}
      transition={{ type: 'spring', duration: 0.3 }}
      className={cn(
        "flex items-center gap-3 p-2 rounded-lg",
        user.isSpeaking && "bg-voice-active/10 border border-voice-active/20 shadow-lg",
        user.isSpeaking && "ring-2 ring-primary/60 animate-pulse"
      )}
    >
      {/* Profile initials in colored circle */}
      <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white bg-gradient-to-br from-primary to-secondary shadow-inner">
        {user.username.charAt(0).toUpperCase()}
      </span>

      {/* Username */}
      <div className="flex-1">
        <div className={cn(
          "font-medium",
          user.isSpeaking ? "text-voice-speaking" : "text-foreground"
        )}>
          {user.username}
          {isCurrentUser && <span className="text-muted-foreground ml-1">(You)</span>}
        </div>
      </div>

      {/* Voice Status Icons */}
      <div className="flex gap-1">
        {user.isMuted && (
          <div className="w-4 h-4 rounded bg-voice-muted flex items-center justify-center">
            <MicOff size={10} className="text-white" />
          </div>
        )}
        {user.isDeafened && (
          <div className="w-4 h-4 rounded bg-voice-deafened flex items-center justify-center">
            <VolumeOff size={10} className="text-white" />
          </div>
        )}
      </div>
    </motion.div>
  );
};
