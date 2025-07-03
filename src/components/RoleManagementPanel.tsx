import * as React from "react";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Crown, Shield, User, Loader2, AlertTriangle } from "lucide-react";
import { AnimatePresence, motion } from 'framer-motion';

interface User {
  id: string;
  username: string;
  role: "owner" | "moderator" | "member";
}

interface RoleManagementPanelProps {
  channelId: string;
  users: User[];
  currentUserId: string;
  onChangeRole: (userId: string, newRole: "owner" | "moderator" | "member") => Promise<void>;
  onKickUser: (userId: string) => Promise<void>;
  onBanUser: (userId: string, reason?: string) => Promise<void>;
}

const RoleManagementPanel: React.FC<RoleManagementPanelProps> = ({
  channelId,
  users,
  currentUserId,
  onChangeRole,
  onKickUser,
  onBanUser,
}) => {
  const [loadingUserId, setLoadingUserId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [showKickDialog, setShowKickDialog] = React.useState<{ userId: string; username: string } | null>(null);
  const [showBanDialog, setShowBanDialog] = React.useState<{ userId: string; username: string } | null>(null);
  const [banReason, setBanReason] = React.useState("");
  const [loading, setLoading] = React.useState(false);

  const currentUser = users.find(u => u.id === currentUserId);
  const canManageRoles = currentUser && ["owner", "moderator"].includes(currentUser.role);
  const canKickBan = currentUser && ["owner", "moderator"].includes(currentUser.role);

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

  const handleRoleChange = async (userId: string, newRole: "owner" | "moderator" | "member") => {
    setError(null);
    setLoadingUserId(userId);
    try {
      await onChangeRole(userId, newRole);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to change role");
    } finally {
      setLoadingUserId(null);
    }
  };

  const handleKick = async () => {
    if (!showKickDialog) return;
    setError(null);
    setLoadingUserId(showKickDialog.userId);
    try {
      await onKickUser(showKickDialog.userId);
      setShowKickDialog(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to kick user");
    } finally {
      setLoadingUserId(null);
    }
  };

  const handleBan = async () => {
    if (!showBanDialog) return;
    setError(null);
    setLoadingUserId(showBanDialog.userId);
    try {
      await onBanUser(showBanDialog.userId, banReason.trim() || undefined);
      setShowBanDialog(null);
      setBanReason("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to ban user");
    } finally {
      setLoadingUserId(null);
    }
  };

  const canChangeRole = (user: User) => {
    if (!canManageRoles) return false;
    if (user.id === currentUserId) return false; // Can't change own role
    if (currentUser?.role === "moderator" && user.role === "owner") return false; // Mods can't change owners
    return true;
  };

  const canKickUser = (user: User) => {
    if (!canKickBan) return false;
    if (user.id === currentUserId) return false; // Can't kick self
    if (currentUser?.role === "moderator" && user.role === "owner") return false; // Mods can't kick owners
    return true;
  };

  const canBanUser = (user: User) => {
    if (!canKickBan) return false;
    if (user.id === currentUserId) return false; // Can't ban self
    if (currentUser?.role === "moderator" && user.role === "owner") return false; // Mods can't ban owners
    return true;
  };

  return (
    <Card className="rounded-xl shadow-lg bg-gradient-to-br from-zinc-800/60 to-zinc-900/80 backdrop-blur-lg border border-border p-4 sm:p-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-bold text-foreground"> <Shield className="h-5 w-5" /> Role Management </CardTitle>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">
            <AlertTriangle className="h-4 w-4" />
            {error}
          </div>
        )}
        <div className="border rounded-md overflow-x-auto">
          <Table className="min-w-full text-sm">
            <TableHeader>
              <TableRow>
                <TableHead className="font-semibold">User</TableHead>
                <TableHead className="font-semibold">Role</TableHead>
                <TableHead className="w-[200px] font-semibold">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              <AnimatePresence>
                {loading ? (
                  <motion.tr
                    key="shimmer"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="h-12 bg-gradient-to-br from-zinc-800/60 to-zinc-900/80 animate-pulse"
                  >
                    <td colSpan={3}></td>
                  </motion.tr>
                ) : (
                  users.map((user) => {
                    const isLoading = loadingUserId === user.id;
                    const isCurrentUser = user.id === currentUserId;
                    return (
                      <motion.tr
                        key={user.id}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: 16, backgroundColor: '#f87171' }}
                        whileHover={{ scale: 1.01, boxShadow: '0 0 0 2px #818cf8, 0 4px 24px 0 #0002' }}
                        transition={{ type: 'spring', duration: 0.3 }}
                        className={isCurrentUser ? "bg-muted/50" : "hover:bg-muted/30 focus-within:bg-muted/40"}
                      >
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white bg-gradient-to-br from-primary to-secondary shadow-inner">
                              {user.username.charAt(0).toUpperCase()}
                            </span>
                            <span className="font-medium">{user.username}</span>
                            {isCurrentUser && <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 ml-2">You</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {roleInfo[user.role].icon}
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-secondary/10 text-secondary border border-secondary/20">
                              {roleInfo[user.role].label}
                            </span>
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            {canChangeRole(user) && (
                              <Select
                                value={user.role}
                                onValueChange={(value: "owner" | "moderator" | "member") => handleRoleChange(user.id, value)}
                                disabled={isLoading}
                                aria-label={`Change role for ${user.username}`}
                                tabIndex={0}
                              >
                                <SelectTrigger className="w-32" aria-label={`Role select for ${user.username}`}> <SelectValue /> </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="member">Member</SelectItem>
                                  <SelectItem value="moderator">Moderator</SelectItem>
                                  <SelectItem value="owner">Owner</SelectItem>
                                </SelectContent>
                              </Select>
                            )}
                            {canKickUser(user) && (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setShowKickDialog({ userId: user.id, username: user.username })}
                                disabled={isLoading}
                                aria-label={`Kick ${user.username}`}
                                className="rounded-lg focus:ring-2 focus:ring-primary/50"
                                tabIndex={0}
                              >
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Kick'}
                              </Button>
                            )}
                            {canBanUser(user) && (
                              <Button
                                size="sm"
                                variant="destructive"
                                onClick={() => setShowBanDialog({ userId: user.id, username: user.username })}
                                disabled={isLoading}
                                aria-label={`Ban ${user.username}`}
                                className="rounded-lg focus:ring-2 focus:ring-primary/50"
                                tabIndex={0}
                              >
                                {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Ban'}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      </motion.tr>
                    );
                  })
                )}
              </AnimatePresence>
            </TableBody>
          </Table>
        </div>

        {/* Kick Confirmation Dialog */}
        <Dialog open={!!showKickDialog} onOpenChange={() => setShowKickDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Kick User</DialogTitle>
              <DialogDescription>
                Are you sure you want to kick <strong>{showKickDialog?.username}</strong> from this channel?
                They will be able to rejoin if they have permission.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowKickDialog(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleKick}>
                Kick User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Ban Confirmation Dialog */}
        <Dialog open={!!showBanDialog} onOpenChange={() => setShowBanDialog(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Ban User</DialogTitle>
              <DialogDescription>
                Are you sure you want to ban <strong>{showBanDialog?.username}</strong> from this channel?
                They will not be able to rejoin unless unbanned.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <Label htmlFor="ban-reason">Reason (optional)</Label>
              <Input
                id="ban-reason"
                placeholder="Enter ban reason..."
                value={banReason}
                onChange={(e) => setBanReason(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setShowBanDialog(null)}>
                Cancel
              </Button>
              <Button variant="destructive" onClick={handleBan}>
                Ban User
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
};

export default RoleManagementPanel; 