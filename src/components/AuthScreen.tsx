import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';

interface AuthScreenProps {
  onLogin: (username: string, token: string) => void;
  isLoading: boolean;
  error: string | null;
}

export const AuthScreen = ({ onLogin, isLoading, error }: AuthScreenProps) => {
  const [username, setUsername] = useState('');
  const [serverUrl, setServerUrl] = useState('localhost:8080');
  const [isAdvanced, setIsAdvanced] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim()) return;
    
    // In a real implementation, this would make a request to your Rust backend
    // to get a proper JWT token. For now, we'll simulate this.
    const mockToken = btoa(JSON.stringify({
      username: username.trim(),
      server: serverUrl,
      exp: Date.now() + 24 * 60 * 60 * 1000 // 24 hours
    }));
    
    onLogin(username.trim(), mockToken);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo/Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-xl mx-auto mb-4 flex items-center justify-center">
            <div className="w-8 h-8 bg-primary-foreground rounded-full"></div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">VoiceLink</h1>
          <p className="text-muted-foreground">High-performance voice communication</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Connect to Server</CardTitle>
            <CardDescription>
              Enter your username to join voice channels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="username">Username</Label>
                <Input
                  id="username"
                  type="text"
                  placeholder="Enter your username"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  disabled={isLoading}
                  autoFocus
                />
              </div>

              {/* Advanced Options */}
              <div className="space-y-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsAdvanced(!isAdvanced)}
                  className="text-xs text-muted-foreground hover:text-foreground"
                >
                  {isAdvanced ? '▼' : '▶'} Advanced Options
                </Button>
                
                {isAdvanced && (
                  <div className="space-y-2 pl-4 border-l border-border">
                    <Label htmlFor="server">Server URL</Label>
                    <Input
                      id="server"
                      type="text"
                      placeholder="localhost:8080"
                      value={serverUrl}
                      onChange={(e) => setServerUrl(e.target.value)}
                      disabled={isLoading}
                    />
                    <p className="text-xs text-muted-foreground">
                      Custom server address (optional)
                    </p>
                  </div>
                )}
              </div>

              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <Button 
                type="submit" 
                className="w-full" 
                disabled={!username.trim() || isLoading}
              >
                {isLoading ? 'Connecting...' : 'Connect'}
              </Button>
            </form>

            {/* Status Info */}
            <div className="mt-6 p-3 bg-muted rounded-lg">
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Encryption:</span>
                  <span className="text-primary">Token-based</span>
                </div>
                <div className="flex justify-between">
                  <span>Audio Codec:</span>
                  <span className="text-primary">Opus</span>
                </div>
                <div className="flex justify-between">
                  <span>Protocol:</span>
                  <span className="text-primary">WebSocket + UDP</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-6 text-xs text-muted-foreground">
          <p>Professional voice communication platform</p>
          <p className="mt-1">Built for gaming communities and teams</p>
        </div>
      </div>
    </div>
  );
};