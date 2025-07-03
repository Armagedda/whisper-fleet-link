import * as React from "react"
import { useState } from "react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Badge } from "@/components/ui/badge"
import { UserPlus, X, Clock, AlertCircle } from "lucide-react"

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
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Invite Users to Channel
        </CardTitle>
      </CardHeader>
      
      <CardContent className="space-y-6">
        {/* Invite Form */}
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="username">Username to Invite</Label>
            <div className="flex gap-2">
              <Input
                id="username"
                type="text"
                placeholder="Enter username..."
                value={username}
                onChange={(e) => {
                  setUsername(e.target.value)
                  if (error) setError(null)
                }}
                onKeyPress={handleKeyPress}
                disabled={isInviting}
                className="flex-1"
              />
              <Button
                onClick={handleInvite}
                disabled={isInviteDisabled}
                className="min-w-[100px]"
              >
                {isInviting ? (
                  <>
                    <div className="mr-2 h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
                    Inviting...
                  </>
                ) : (
                  "Invite"
                )}
              </Button>
            </div>
          </div>

          {/* Error Display */}
          {error && (
            <div className="flex items-center gap-2 rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              <AlertCircle className="h-4 w-4" />
              {error}
            </div>
          )}
        </div>

        {/* Invites List */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-lg font-medium">Active Invites</h3>
            <Badge variant={"outline" as const}>{invites.length} invite{invites.length !== 1 ? 's' : ''}</Badge>
          </div>

          {invites.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>No active invites</p>
              <p className="text-sm">Invite users to join this channel</p>
            </div>
          ) : (
            <div className="border rounded-md">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Username</TableHead>
                    <TableHead>Expires</TableHead>
                    <TableHead className="w-[100px]">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell className="font-medium">
                        {invite.username}
                      </TableCell>
                      <TableCell>
                        {formatExpirationDate(invite.expiresAt)}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleRevoke(invite.id)}
                          disabled={isRevoking === invite.id}
                          className="h-8 w-8 p-0"
                        >
                          {isRevoking === invite.id ? (
                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
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