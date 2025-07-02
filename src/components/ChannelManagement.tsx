import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Volume2, Lock, Users, Shield, Trash2, Settings, UserPlus, UserMinus } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChannelData {
  id: string;
  name: string;
  description: string;
  type: 'voice' | 'text';
  privacy: 'public' | 'private' | 'invite-only';
  hasPassword: boolean;
  password?: string;
  maxUsers: number;
  ownerId: string;
  ownerUsername: string;
  moderators: ChannelModerator[];
  bannedUsers: BannedUser[];
  userCount: number;
  createdAt: string;
}

interface ChannelModerator {
  id: string;
  username: string;
  permissions: {
    canKick: boolean;
    canBan: boolean;
    canInvite: boolean;
    canManageChannel: boolean;
  };
}

interface BannedUser {
  id: string;
  username: string;
  reason: string;
  bannedBy: string;
  bannedAt: string;
}

interface ChannelManagementProps {
  channels: ChannelData[];
  currentUser: {
    id: string;
    username: string;
    permissions: {
      canCreateChannels: boolean;
      canModerate: boolean;
      isAdmin: boolean;
      isOwner: boolean;
    };
  };
  onCreateChannel: (channelData: Partial<ChannelData>) => Promise<void>;
  onUpdateChannel: (channelId: string, updates: Partial<ChannelData>) => Promise<void>;
  onDeleteChannel: (channelId: string) => Promise<void>;
  onInviteUser: (channelId: string, username: string) => Promise<void>;
  onKickUser: (channelId: string, userId: string, reason?: string) => Promise<void>;
  onBanUser: (channelId: string, userId: string, reason: string) => Promise<void>;
  onUnbanUser: (channelId: string, userId: string) => Promise<void>;
  onAddModerator: (channelId: string, userId: string, permissions: ChannelModerator['permissions']) => Promise<void>;
  onRemoveModerator: (channelId: string, userId: string) => Promise<void>;
}

export const ChannelManagement = ({
  channels,
  currentUser,
  onCreateChannel,
  onUpdateChannel,
  onDeleteChannel,
  onInviteUser,
  onKickUser,
  onBanUser,
  onUnbanUser,
  onAddModerator,
  onRemoveModerator
}: ChannelManagementProps) => {
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState<ChannelData | null>(null);
  const [newChannelData, setNewChannelData] = useState<{
    name: string;
    description: string;
    type: 'voice' | 'text';
    privacy: 'public' | 'private' | 'invite-only';
    hasPassword: boolean;
    password: string;
    maxUsers: number;
  }>({
    name: '',
    description: '',
    type: 'voice',
    privacy: 'public',
    hasPassword: false,
    password: '',
    maxUsers: 50
  });

  const canManageChannel = (channel: ChannelData) => {
    return currentUser.permissions.isAdmin || 
           currentUser.permissions.isOwner ||
           channel.ownerId === currentUser.id ||
           channel.moderators.some(mod => mod.id === currentUser.id && mod.permissions.canManageChannel);
  };

  const canModerateChannel = (channel: ChannelData) => {
    return currentUser.permissions.isAdmin || 
           currentUser.permissions.isOwner ||
           channel.ownerId === currentUser.id ||
           channel.moderators.some(mod => mod.id === currentUser.id);
  };

  const handleCreateChannel = async () => {
    try {
      await onCreateChannel(newChannelData);
      setIsCreateDialogOpen(false);
      setNewChannelData({
        name: '',
        description: '',
        type: 'voice',
        privacy: 'public',
        hasPassword: false,
        password: '',
        maxUsers: 50
      });
    } catch (error) {
      console.error('Failed to create channel:', error);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Channel Management</h1>
          <p className="text-muted-foreground">Create and manage voice channels with advanced permissions</p>
        </div>
        
        {currentUser.permissions.canCreateChannels && (
          <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
            <DialogTrigger asChild>
              <Button className="bg-primary hover:bg-primary/80">
                <Volume2 className="w-4 h-4 mr-2" />
                Create Channel
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Create New Channel</DialogTitle>
                <DialogDescription>
                  Set up a new voice or text channel with custom permissions
                </DialogDescription>
              </DialogHeader>
              
              <div className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="channel-name">Channel Name</Label>
                  <Input
                    id="channel-name"
                    placeholder="Enter channel name"
                    value={newChannelData.name}
                    onChange={(e) => setNewChannelData(prev => ({ ...prev, name: e.target.value }))}
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="channel-description">Description</Label>
                  <Textarea
                    id="channel-description"
                    placeholder="Optional channel description"
                    value={newChannelData.description}
                    onChange={(e) => setNewChannelData(prev => ({ ...prev, description: e.target.value }))}
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label>Channel Type</Label>
                    <Select 
                      value={newChannelData.type} 
                      onValueChange={(value: 'voice' | 'text') => 
                        setNewChannelData(prev => ({ ...prev, type: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="voice">Voice Channel</SelectItem>
                        <SelectItem value="text">Text Channel</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-2">
                    <Label>Privacy Level</Label>
                    <Select 
                      value={newChannelData.privacy} 
                      onValueChange={(value: 'public' | 'private' | 'invite-only') => 
                        setNewChannelData(prev => ({ ...prev, privacy: value }))
                      }
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="public">Public</SelectItem>
                        <SelectItem value="private">Private</SelectItem>
                        <SelectItem value="invite-only">Invite Only</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="has-password"
                      checked={newChannelData.hasPassword}
                      onCheckedChange={(checked) => 
                        setNewChannelData(prev => ({ ...prev, hasPassword: checked }))
                      }
                    />
                    <Label htmlFor="has-password">Password Protection</Label>
                  </div>
                  
                  {newChannelData.hasPassword && (
                    <Input
                      type="password"
                      placeholder="Channel password"
                      value={newChannelData.password}
                      onChange={(e) => setNewChannelData(prev => ({ ...prev, password: e.target.value }))}
                    />
                  )}
                </div>

                <div className="space-y-2">
                  <Label htmlFor="max-users">Maximum Users</Label>
                  <Input
                    id="max-users"
                    type="number"
                    min="1"
                    max="200"
                    value={newChannelData.maxUsers}
                    onChange={(e) => setNewChannelData(prev => ({ 
                      ...prev, 
                      maxUsers: parseInt(e.target.value) || 50 
                    }))}
                  />
                </div>

                <div className="flex justify-end space-x-2">
                  <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                    Cancel
                  </Button>
                  <Button 
                    onClick={handleCreateChannel}
                    disabled={!newChannelData.name.trim()}
                  >
                    Create Channel
                  </Button>
                </div>
              </div>
            </DialogContent>
          </Dialog>
        )}
      </div>

      {/* Channel List */}
      <div className="grid gap-4">
        {channels.map((channel) => (
          <ChannelCard
            key={channel.id}
            channel={channel}
            currentUser={currentUser}
            canManage={canManageChannel(channel)}
            canModerate={canModerateChannel(channel)}
            onUpdate={(updates) => onUpdateChannel(channel.id, updates)}
            onDelete={() => onDeleteChannel(channel.id)}
            onInvite={(username) => onInviteUser(channel.id, username)}
            onKick={(userId, reason) => onKickUser(channel.id, userId, reason)}
            onBan={(userId, reason) => onBanUser(channel.id, userId, reason)}
            onUnban={(userId) => onUnbanUser(channel.id, userId)}
            onAddModerator={(userId, permissions) => onAddModerator(channel.id, userId, permissions)}
            onRemoveModerator={(userId) => onRemoveModerator(channel.id, userId)}
          />
        ))}
      </div>

      {channels.length === 0 && (
        <div className="text-center py-12">
          <div className="text-muted-foreground mb-4">No channels created yet</div>
          {currentUser.permissions.canCreateChannels && (
            <Button variant="outline" onClick={() => setIsCreateDialogOpen(true)}>
              Create Your First Channel
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

const ChannelCard = ({ 
  channel, 
  currentUser, 
  canManage, 
  canModerate,
  onUpdate,
  onDelete,
  onInvite,
  onKick,
  onBan,
  onUnban,
  onAddModerator,
  onRemoveModerator
}: {
  channel: ChannelData;
  currentUser: ChannelManagementProps['currentUser'];
  canManage: boolean;
  canModerate: boolean;
  onUpdate: (updates: Partial<ChannelData>) => void;
  onDelete: () => void;
  onInvite: (username: string) => void;
  onKick: (userId: string, reason?: string) => void;
  onBan: (userId: string, reason: string) => void;
  onUnban: (userId: string) => void;
  onAddModerator: (userId: string, permissions: ChannelModerator['permissions']) => void;
  onRemoveModerator: (userId: string) => void;
}) => {
  const [showSettings, setShowSettings] = useState(false);

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {channel.type === 'voice' ? (
              <Volume2 className="w-5 h-5 text-channel-voice" />
            ) : (
              <span className="text-channel-text text-lg">#</span>
            )}
            
            <div>
              <CardTitle className="flex items-center gap-2">
                {channel.name}
                {channel.privacy === 'private' && <Lock className="w-4 h-4" />}
                {channel.hasPassword && <Shield className="w-4 h-4" />}
              </CardTitle>
              <CardDescription>
                {channel.description || 'No description'}
              </CardDescription>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Badge variant="secondary">
              <Users className="w-3 h-3 mr-1" />
              {channel.userCount}/{channel.maxUsers}
            </Badge>
            
            <Badge variant={
              channel.privacy === 'public' ? 'default' : 
              channel.privacy === 'private' ? 'secondary' : 'destructive'
            }>
              {channel.privacy}
            </Badge>

            {(canManage || canModerate) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowSettings(!showSettings)}
              >
                <Settings className="w-4 h-4" />
              </Button>
            )}

            {canManage && (
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive">
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete Channel</AlertDialogTitle>
                    <AlertDialogDescription>
                      Are you sure you want to delete "{channel.name}"? This action cannot be undone.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onDelete} className="bg-destructive hover:bg-destructive/80">
                      Delete Channel
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            )}
          </div>
        </div>
      </CardHeader>

      {showSettings && (
        <CardContent className="border-t border-border pt-4">
          <div className="space-y-4">
            {/* Channel Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Owner:</span>
                <span className="ml-2 font-medium">{channel.ownerUsername}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Created:</span>
                <span className="ml-2">{new Date(channel.createdAt).toLocaleDateString()}</span>
              </div>
            </div>

            {/* Moderators */}
            {channel.moderators.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Moderators</h4>
                <div className="space-y-2">
                  {channel.moderators.map((mod) => (
                    <div key={mod.id} className="flex items-center justify-between p-2 bg-muted rounded">
                      <span className="font-medium">{mod.username}</span>
                      {canManage && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onRemoveModerator(mod.id)}
                        >
                          <UserMinus className="w-3 h-3" />
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Banned Users */}
            {channel.bannedUsers.length > 0 && (
              <div>
                <h4 className="font-medium mb-2">Banned Users</h4>
                <div className="space-y-2">
                  {channel.bannedUsers.map((banned) => (
                    <div key={banned.id} className="flex items-center justify-between p-2 bg-muted rounded">
                      <div>
                        <div className="font-medium">{banned.username}</div>
                        <div className="text-xs text-muted-foreground">
                          Banned by {banned.bannedBy}: {banned.reason}
                        </div>
                      </div>
                      {canModerate && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => onUnban(banned.id)}
                        >
                          Unban
                        </Button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </CardContent>
      )}
    </Card>
  );
};