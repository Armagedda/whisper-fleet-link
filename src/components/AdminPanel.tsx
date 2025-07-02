import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Shield, Users, UserX, Ban, Clock, Activity, Server, Wifi, Volume2 } from 'lucide-react';

interface AdminUser {
  id: string;
  username: string;
  email: string;
  roles: ('user' | 'moderator' | 'admin' | 'owner')[];
  status: 'online' | 'offline' | 'banned' | 'suspended';
  lastSeen: string;
  joinedAt: string;
  channelsOwned: number;
  moderatedChannels: number;
  violations: number;
}

interface ServerStats {
  totalUsers: number;
  activeUsers: number;
  totalChannels: number;
  voiceChannels: number;
  textChannels: number;
  bannedUsers: number;
  serverUptime: string;
  voiceConnections: number;
  dataTransferred: string;
  averageLatency: number;
}

interface RateLimitConfig {
  joinChannelPerMinute: number;
  createChannelPerHour: number;
  sendMessagePerSecond: number;
  voiceDataPerSecond: number;
  maxConnectionsPerIP: number;
  tokenRefreshPerHour: number;
}

interface AdminPanelProps {
  currentUser: {
    id: string;
    username: string;
    permissions: {
      isAdmin: boolean;
      isOwner: boolean;
      canManageUsers: boolean;
      canViewStats: boolean;
      canConfigureServer: boolean;
    };
  };
  users: AdminUser[];
  serverStats: ServerStats;
  rateLimits: RateLimitConfig;
  onUpdateUser: (userId: string, updates: Partial<AdminUser>) => Promise<void>;
  onBanUser: (userId: string, reason: string, duration?: string) => Promise<void>;
  onUnbanUser: (userId: string) => Promise<void>;
  onUpdateRateLimit: (config: RateLimitConfig) => Promise<void>;
  onKickAllUsers: () => Promise<void>;
  onRestartServer: () => Promise<void>;
}

export const AdminPanel = ({
  currentUser,
  users,
  serverStats,
  rateLimits,
  onUpdateUser,
  onBanUser,
  onUnbanUser,
  onUpdateRateLimit,
  onKickAllUsers,
  onRestartServer
}: AdminPanelProps) => {
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [rateLimitConfig, setRateLimitConfig] = useState(rateLimits);
  const [banReason, setBanReason] = useState('');
  const [banDuration, setBanDuration] = useState('permanent');

  if (!currentUser.permissions.isAdmin && !currentUser.permissions.isOwner) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <Shield className="h-4 w-4" />
          <AlertDescription>
            You do not have permission to access the admin panel.
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const handleUpdateRateLimit = async () => {
    try {
      await onUpdateRateLimit(rateLimitConfig);
    } catch (error) {
      console.error('Failed to update rate limits:', error);
    }
  };

  const handleBanUser = async (userId: string) => {
    try {
      await onBanUser(userId, banReason, banDuration === 'permanent' ? undefined : banDuration);
      setSelectedUser(null);
      setBanReason('');
    } catch (error) {
      console.error('Failed to ban user:', error);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Server Administration</h1>
          <p className="text-muted-foreground">Manage users, monitor performance, and configure server settings</p>
        </div>
        
        <div className="flex gap-2">
          {currentUser.permissions.isOwner && (
            <>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="text-orange-500 hover:text-orange-600">
                    <UserX className="w-4 h-4 mr-2" />
                    Kick All Users
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Kick All Users</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will disconnect all users from voice channels. Are you sure?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onKickAllUsers}>
                      Kick All Users
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive">
                    <Server className="w-4 h-4 mr-2" />
                    Restart Server
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Restart Server</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will restart the entire voice server. All users will be disconnected. Continue?
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={onRestartServer} className="bg-destructive hover:bg-destructive/80">
                      Restart Server
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </div>
      </div>

      <Tabs defaultValue="stats" className="w-full">
        <TabsList>
          <TabsTrigger value="stats">Server Stats</TabsTrigger>
          <TabsTrigger value="users">User Management</TabsTrigger>
          <TabsTrigger value="security">Security & Rate Limits</TabsTrigger>
        </TabsList>

        {/* Server Statistics */}
        <TabsContent value="stats" className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <StatCard
              title="Total Users"
              value={serverStats.totalUsers.toString()}
              subtitle={`${serverStats.activeUsers} active`}
              icon={<Users className="w-4 h-4" />}
            />
            <StatCard
              title="Voice Channels"
              value={serverStats.voiceChannels.toString()}
              subtitle={`${serverStats.totalChannels} total channels`}
              icon={<Volume2 className="w-4 h-4" />}
            />
            <StatCard
              title="Active Connections"
              value={serverStats.voiceConnections.toString()}
              subtitle={`${serverStats.averageLatency}ms avg latency`}
              icon={<Wifi className="w-4 h-4" />}
            />
            <StatCard
              title="Server Uptime"
              value={serverStats.serverUptime}
              subtitle={`${serverStats.dataTransferred} transferred`}
              icon={<Activity className="w-4 h-4" />}
            />
          </div>

          {/* Performance Metrics */}
          <Card>
            <CardHeader>
              <CardTitle>Performance Metrics</CardTitle>
              <CardDescription>Real-time server performance data</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-center">
                <div>
                  <div className="text-2xl font-bold text-primary">{serverStats.averageLatency}ms</div>
                  <div className="text-sm text-muted-foreground">Average Latency</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-primary">{serverStats.voiceConnections}</div>
                  <div className="text-sm text-muted-foreground">Voice Connections</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-primary">{serverStats.dataTransferred}</div>
                  <div className="text-sm text-muted-foreground">Data Transferred</div>
                </div>
                <div>
                  <div className="text-2xl font-bold text-destructive">{serverStats.bannedUsers}</div>
                  <div className="text-sm text-muted-foreground">Banned Users</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* User Management */}
        <TabsContent value="users" className="space-y-4">
          <div className="grid gap-4">
            {users.map((user) => (
              <Card key={user.id}>
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${
                        user.status === 'online' ? 'bg-green-500' :
                        user.status === 'offline' ? 'bg-gray-500' :
                        user.status === 'banned' ? 'bg-red-500' :
                        'bg-yellow-500'
                      }`} />
                      <div>
                        <CardTitle>{user.username}</CardTitle>
                        <CardDescription>{user.email}</CardDescription>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {user.roles.map((role) => (
                        <Badge key={role} variant={
                          role === 'owner' ? 'default' :
                          role === 'admin' ? 'secondary' :
                          role === 'moderator' ? 'outline' : 'secondary'
                        }>
                          {role}
                        </Badge>
                      ))}
                      
                      <Badge variant={
                        user.status === 'online' ? 'default' :
                        user.status === 'banned' ? 'destructive' : 'secondary'
                      }>
                        {user.status}
                      </Badge>
                    </div>
                  </div>
                </CardHeader>
                
                <CardContent>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm mb-4">
                    <div>
                      <span className="text-muted-foreground">Joined:</span>
                      <div className="font-medium">{new Date(user.joinedAt).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Last Seen:</span>
                      <div className="font-medium">{new Date(user.lastSeen).toLocaleDateString()}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Channels Owned:</span>
                      <div className="font-medium">{user.channelsOwned}</div>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Violations:</span>
                      <div className="font-medium text-destructive">{user.violations}</div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {user.status === 'banned' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onUnbanUser(user.id)}
                      >
                        Unban User
                      </Button>
                    ) : (
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="destructive" size="sm">
                            <Ban className="w-3 h-3 mr-1" />
                            Ban User
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Ban User: {user.username}</AlertDialogTitle>
                            <AlertDialogDescription>
                              This will prevent the user from accessing the server.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          
                          <div className="space-y-4">
                            <div>
                              <Label htmlFor="ban-reason">Reason for Ban</Label>
                              <Input
                                id="ban-reason"
                                value={banReason}
                                onChange={(e) => setBanReason(e.target.value)}
                                placeholder="Enter ban reason"
                              />
                            </div>
                            
                            <div>
                              <Label htmlFor="ban-duration">Duration</Label>
                              <select
                                id="ban-duration"
                                value={banDuration}
                                onChange={(e) => setBanDuration(e.target.value)}
                                className="w-full p-2 border border-border rounded bg-background"
                              >
                                <option value="1h">1 Hour</option>
                                <option value="24h">24 Hours</option>
                                <option value="7d">7 Days</option>
                                <option value="30d">30 Days</option>
                                <option value="permanent">Permanent</option>
                              </select>
                            </div>
                          </div>
                          
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancel</AlertDialogCancel>
                            <AlertDialogAction 
                              onClick={() => handleBanUser(user.id)}
                              className="bg-destructive hover:bg-destructive/80"
                            >
                              Ban User
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </TabsContent>

        {/* Security & Rate Limits */}
        <TabsContent value="security" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Rate Limiting Configuration</CardTitle>
              <CardDescription>
                Configure rate limits to prevent abuse and ensure server stability
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="join-rate">Channel Joins per Minute</Label>
                  <Input
                    id="join-rate"
                    type="number"
                    value={rateLimitConfig.joinChannelPerMinute}
                    onChange={(e) => setRateLimitConfig(prev => ({
                      ...prev,
                      joinChannelPerMinute: parseInt(e.target.value) || 0
                    }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="create-rate">Channel Creates per Hour</Label>
                  <Input
                    id="create-rate"
                    type="number"
                    value={rateLimitConfig.createChannelPerHour}
                    onChange={(e) => setRateLimitConfig(prev => ({
                      ...prev,
                      createChannelPerHour: parseInt(e.target.value) || 0
                    }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="message-rate">Messages per Second</Label>
                  <Input
                    id="message-rate"
                    type="number"
                    value={rateLimitConfig.sendMessagePerSecond}
                    onChange={(e) => setRateLimitConfig(prev => ({
                      ...prev,
                      sendMessagePerSecond: parseInt(e.target.value) || 0
                    }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="voice-rate">Voice Data per Second (KB)</Label>
                  <Input
                    id="voice-rate"
                    type="number"
                    value={rateLimitConfig.voiceDataPerSecond}
                    onChange={(e) => setRateLimitConfig(prev => ({
                      ...prev,
                      voiceDataPerSecond: parseInt(e.target.value) || 0
                    }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="ip-connections">Max Connections per IP</Label>
                  <Input
                    id="ip-connections"
                    type="number"
                    value={rateLimitConfig.maxConnectionsPerIP}
                    onChange={(e) => setRateLimitConfig(prev => ({
                      ...prev,
                      maxConnectionsPerIP: parseInt(e.target.value) || 0
                    }))}
                  />
                </div>
                
                <div className="space-y-2">
                  <Label htmlFor="token-refresh">Token Refreshes per Hour</Label>
                  <Input
                    id="token-refresh"
                    type="number"
                    value={rateLimitConfig.tokenRefreshPerHour}
                    onChange={(e) => setRateLimitConfig(prev => ({
                      ...prev,
                      tokenRefreshPerHour: parseInt(e.target.value) || 0
                    }))}
                  />
                </div>
              </div>
              
              <Button onClick={handleUpdateRateLimit}>
                Update Rate Limits
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const StatCard = ({ title, value, subtitle, icon }: {
  title: string;
  value: string;
  subtitle: string;
  icon: React.ReactNode;
}) => (
  <Card>
    <CardContent className="p-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold">{value}</p>
          <p className="text-xs text-muted-foreground">{subtitle}</p>
        </div>
        <div className="text-primary">{icon}</div>
      </div>
    </CardContent>
  </Card>
);