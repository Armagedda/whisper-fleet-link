import * as React from "react"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { UserPlus, X, Clock, AlertCircle } from "lucide-react"
import { AnimatePresence, motion } from 'framer-motion'

interface Invite {
  id: string
  username: string
  expiresAt: string
}

interface InviteUserPanelProps {
  channelId: string
  onInvite: (username: string) => Promise<string>
  onRevoke: (tokenId: string) => Promise<void>
  invites: Invite[]
}

const InviteUserPanel: React.FC<InviteUserPanelProps> = ({
  channelId,
  onInvite,
  onRevoke,
  invites,
}) => {
  const [username, setUsername] = useState("")
  const [isInviting, setIsInviting] = useState(false)
  const [isRevoking, setIsRevoking] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = React.useState(false)

  const handleInvite = async () => {
    const trimmedUsername = username.trim()
    if (!trimmedUsername) return

    setIsInviting(true)
    setError(null)

    try {
      await onInvite(trimmedUsername)
      setUsername("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to invite user")
    } finally {
      setIsInviting(false)
    }
  }

  const handleRevoke = async (tokenId: string) => {
    setIsRevoking(tokenId)
    setError(null)

    try {
      await onRevoke(tokenId)
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to revoke invite")
    } finally {
      setIsRevoking(null)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && username.trim() && !isInviting) {
      handleInvite()
    }
  }

  const formatExpirationDate = (expiresAt: string) => {
    const date = new Date(expiresAt)
    const now = new Date()
    const diffMs = date.getTime() - now.getTime()
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60))
    const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

    if (diffMs < 0) {
      return <Badge variant={"destructive" as const}>Expired</Badge>
    } else if (diffHours > 24) {
      const diffDays = Math.floor(diffHours / 24)
      return <Badge variant={"secondary" as const}>{diffDays} day{diffDays !== 1 ? 's' : ''} left</Badge>
    } else if (diffHours > 0) {
      return <Badge variant={"secondary" as const}>{diffHours}h {diffMinutes}m left</Badge>
    } else {
      return <Badge variant={"outline" as const}>{diffMinutes}m left</Badge>
    }
  }

  const isInviteDisabled = !username.trim() || isInviting

  return (
    <Card className="w-full max-w-2xl rounded-xl shadow-lg bg-gradient-to-br from-zinc-800/60 to-zinc-900/80 backdrop-blur-lg border border-border p-4 sm:p-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg font-bold text-foreground"> <UserPlus className="h-5 w-5" /> Invite Users to Channel </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Invite Form */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username" className="text-base font-medium">Username to Invite</Label>
            <div className="flex gap-2">
              <Input
                id="username"
                type="text"
                aria-label="Username to invite"
                placeholder="Enter username..."
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (error) setError(null)
                }}
                onKeyPress={handleKeyPress}
                disabled={isInviting}
                className="flex-1 px-3 py-2 rounded-lg border border-input focus:ring-2 focus:ring-primary/50 focus:outline-none bg-background dark:bg-zinc-800 text-foreground transition-all"
                autoFocus
              />
              <Button
                onClick={handleInvite}
                disabled={isInviteDisabled}
                aria-label="Send invite"
                className="min-w-[100px] rounded-lg px-4 py-2 focus:ring-2 focus:ring-primary/50"
              >
                {isInviting ? (
                  <span className="flex items-center"><span className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />Inviting...</span>
                ) : (
                  "Invite"
                )}
              </Button>
            </div>
          </div>
          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive" role="alert">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>
        {/* Invites List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-semibold">Active Invites</h3>
            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20 ml-2">
              <Clock className="h-4 w-4" />
              {invites.length} invite{invites.length !== 1 ? 's' : ''}
            </span>
          </div>
          <AnimatePresence>
            {loading ? (
              <motion.div
                key="shimmer"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="rounded-xl shadow-md bg-gradient-to-br from-zinc-800/60 to-zinc-900/80 backdrop-blur-lg border border-border h-12 w-full animate-pulse"
              />
            ) : (
              invites.map((invite) => (
                <motion.div
                  key={invite.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 16, backgroundColor: '#f87171' }}
                  whileHover={{ scale: 1.01, boxShadow: '0 0 0 2px #818cf8, 0 4px 24px 0 #0002' }}
                  transition={{ type: 'spring', duration: 0.3 }}
                  className="flex items-center gap-4 py-2 border-b last:border-b-0 px-2 bg-gradient-to-br from-zinc-900/60 to-zinc-800/80 rounded-lg"
                >
                  {/* Profile initials in colored circle */}
                  <span className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-white bg-gradient-to-br from-primary to-secondary shadow-inner">
                    {invite.username.charAt(0).toUpperCase()}
                  </span>
                  <span className="font-medium flex-1">{invite.username}</span>
                  <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-secondary/10 text-secondary border border-secondary/20">
                    <Clock className="h-4 w-4" />
                    {formatExpirationDate(invite.expiresAt)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRevoke(invite.id)}
                    disabled={isRevoking === invite.id}
                    aria-label={`Revoke invite for ${invite.username}`}
          {invites.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No active invites</p>
              <p className="text-sm">Invite users to join this channel</p>
            </div>
          ) : (
            <div className="border rounded-md overflow-x-auto">
              <Table className="min-w-full text-sm">
                <TableHeader>
                  <TableRow>
                    <TableHead className="font-semibold">Username</TableHead>
                    <TableHead className="font-semibold">Expires</TableHead>
                    <TableHead className="w-[100px] font-semibold">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => (
                    <TableRow key={invite.id} className="hover:bg-muted/30 focus-within:bg-muted/40">
                      <TableCell className="font-medium">{invite.username}</TableCell>
                      <TableCell>{formatExpirationDate(invite.expiresAt)}</TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevoke(invite.id)}
                          disabled={isRevoking === invite.id}
                          aria-label={`Revoke invite for ${invite.username}`}
                          className="h-8 w-8 p-0 rounded-lg focus:ring-2 focus:ring-primary/50"
                          tabIndex={0}
                        >
                          {isRevoking === invite.id ? (
                            <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export default InviteUserPanel 