import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';

interface AuthenticationProps {
  onAuthenticated: (user: AuthenticatedUser) => void;
  isLoading: boolean;
  error: string | null;
}

interface AuthenticatedUser {
  id: string;
  username: string;
  email: string;
  roles: string[];
  token: string;
  refreshToken: string;
  channels: string[];
  permissions: {
    canCreateChannels: boolean;
    canModerate: boolean;
    isAdmin: boolean;
    isOwner: boolean;
  };
}

interface LoginData {
  username: string;
  password: string;
  rememberMe: boolean;
}

interface RegisterData {
  username: string;
  email: string;
  password: string;
  confirmPassword: string;
  acceptTerms: boolean;
}

export const Authentication = ({ onAuthenticated, isLoading, error }: AuthenticationProps) => {
  const [loginData, setLoginData] = useState<LoginData>({
    username: '',
    password: '',
    rememberMe: false
  });

  const [registerData, setRegisterData] = useState<RegisterData>({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    acceptTerms: false
  });

  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});

  const validateLogin = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!loginData.username.trim()) {
      errors.username = 'Username is required';
    }
    
    if (!loginData.password) {
      errors.password = 'Password is required';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const validateRegister = (): boolean => {
    const errors: Record<string, string> = {};
    
    if (!registerData.username.trim()) {
      errors.username = 'Username is required';
    } else if (registerData.username.length < 3) {
      errors.username = 'Username must be at least 3 characters';
    } else if (!/^[a-zA-Z0-9_-]+$/.test(registerData.username)) {
      errors.username = 'Username can only contain letters, numbers, hyphens, and underscores';
    }
    
    if (!registerData.email.trim()) {
      errors.email = 'Email is required';
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(registerData.email)) {
      errors.email = 'Please enter a valid email address';
    }
    
    if (!registerData.password) {
      errors.password = 'Password is required';
    } else if (registerData.password.length < 8) {
      errors.password = 'Password must be at least 8 characters';
    }
    
    if (registerData.password !== registerData.confirmPassword) {
      errors.confirmPassword = 'Passwords do not match';
    }
    
    if (!registerData.acceptTerms) {
      errors.acceptTerms = 'You must accept the terms of service';
    }
    
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateLogin()) return;

    // API call to POST /login
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginData.username,
          password: loginData.password,
          rememberMe: loginData.rememberMe
        })
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const data = await response.json();
      
      // Store tokens
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('refresh_token', data.refreshToken);
      
      onAuthenticated({
        id: data.user.id,
        username: data.user.username,
        email: data.user.email,
        roles: data.user.roles,
        token: data.token,
        refreshToken: data.refreshToken,
        channels: data.user.channels,
        permissions: data.user.permissions
      });

    } catch (err) {
      console.error('Login error:', err);
    }
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateRegister()) return;

    // API call to POST /register
    try {
      const response = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: registerData.username,
          email: registerData.email,
          password: registerData.password
        })
      });

      if (!response.ok) {
        throw new Error('Registration failed');
      }

      const data = await response.json();
      
      // Auto-login after registration
      localStorage.setItem('auth_token', data.token);
      localStorage.setItem('refresh_token', data.refreshToken);
      
      onAuthenticated({
        id: data.user.id,
        username: data.user.username,
        email: data.user.email,
        roles: data.user.roles,
        token: data.token,
        refreshToken: data.refreshToken,
        channels: data.user.channels,
        permissions: data.user.permissions
      });

    } catch (err) {
      console.error('Registration error:', err);
    }
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-primary rounded-xl mx-auto mb-4 flex items-center justify-center">
            <div className="w-8 h-8 bg-primary-foreground rounded-full"></div>
          </div>
          <h1 className="text-2xl font-bold text-foreground">VoiceLink</h1>
          <p className="text-muted-foreground">Secure voice communication platform</p>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Access Your Account</CardTitle>
            <CardDescription>
              Login or create a new account to join voice channels
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="login" className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Login</TabsTrigger>
                <TabsTrigger value="register">Register</TabsTrigger>
              </TabsList>
              
              <TabsContent value="login">
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="login-username">Username</Label>
                    <Input
                      id="login-username"
                      type="text"
                      placeholder="Enter your username"
                      value={loginData.username}
                      onChange={(e) => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                      disabled={isLoading}
                    />
                    {validationErrors.username && (
                      <p className="text-xs text-destructive">{validationErrors.username}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="login-password">Password</Label>
                    <Input
                      id="login-password"
                      type="password"
                      placeholder="Enter your password"
                      value={loginData.password}
                      onChange={(e) => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                      disabled={isLoading}
                    />
                    {validationErrors.password && (
                      <p className="text-xs text-destructive">{validationErrors.password}</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="remember-me"
                      checked={loginData.rememberMe}
                      onCheckedChange={(checked) => 
                        setLoginData(prev => ({ ...prev, rememberMe: !!checked }))
                      }
                    />
                    <Label htmlFor="remember-me" className="text-sm">
                      Remember me for 30 days
                    </Label>
                  </div>

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Authenticating...' : 'Login'}
                  </Button>
                </form>
              </TabsContent>
              
              <TabsContent value="register">
                <form onSubmit={handleRegister} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="register-username">Username</Label>
                    <Input
                      id="register-username"
                      type="text"
                      placeholder="Choose a username"
                      value={registerData.username}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, username: e.target.value }))}
                      disabled={isLoading}
                    />
                    {validationErrors.username && (
                      <p className="text-xs text-destructive">{validationErrors.username}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-email">Email</Label>
                    <Input
                      id="register-email"
                      type="email"
                      placeholder="Enter your email"
                      value={registerData.email}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, email: e.target.value }))}
                      disabled={isLoading}
                    />
                    {validationErrors.email && (
                      <p className="text-xs text-destructive">{validationErrors.email}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="register-password">Password</Label>
                    <Input
                      id="register-password"
                      type="password"
                      placeholder="Create a secure password"
                      value={registerData.password}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                      disabled={isLoading}
                    />
                    {validationErrors.password && (
                      <p className="text-xs text-destructive">{validationErrors.password}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">Confirm Password</Label>
                    <Input
                      id="confirm-password"
                      type="password"
                      placeholder="Confirm your password"
                      value={registerData.confirmPassword}
                      onChange={(e) => setRegisterData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                      disabled={isLoading}
                    />
                    {validationErrors.confirmPassword && (
                      <p className="text-xs text-destructive">{validationErrors.confirmPassword}</p>
                    )}
                  </div>

                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="accept-terms"
                      checked={registerData.acceptTerms}
                      onCheckedChange={(checked) => 
                        setRegisterData(prev => ({ ...prev, acceptTerms: !!checked }))
                      }
                    />
                    <Label htmlFor="accept-terms" className="text-sm">
                      I accept the Terms of Service and Privacy Policy
                    </Label>
                  </div>
                  {validationErrors.acceptTerms && (
                    <p className="text-xs text-destructive">{validationErrors.acceptTerms}</p>
                  )}

                  <Button type="submit" className="w-full" disabled={isLoading}>
                    {isLoading ? 'Creating Account...' : 'Create Account'}
                  </Button>
                </form>
              </TabsContent>
            </Tabs>

            {error && (
              <Alert variant="destructive" className="mt-4">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Security Info */}
            <div className="mt-6 p-3 bg-muted rounded-lg">
              <div className="text-xs text-muted-foreground space-y-1">
                <div className="flex justify-between">
                  <span>Security:</span>
                  <span className="text-primary">JWT + Refresh Tokens</span>
                </div>
                <div className="flex justify-between">
                  <span>Encryption:</span>
                  <span className="text-primary">End-to-End</span>
                </div>
                <div className="flex justify-between">
                  <span>Authentication:</span>
                  <span className="text-primary">Role-Based Access</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};