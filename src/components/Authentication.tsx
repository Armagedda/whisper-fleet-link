import { useState, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Checkbox } from '@/components/ui/checkbox';
import { motion, AnimatePresence } from 'framer-motion';
import { Info } from 'lucide-react';

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

const OAUTH_PROVIDERS = [
  { name: 'Google', url: '/api/auth/google', icon: (
    <svg className="w-5 h-5 mr-2" viewBox="0 0 48 48"><g><path fill="#4285F4" d="M24 9.5c3.54 0 6.7 1.22 9.19 3.23l6.85-6.85C36.68 2.7 30.77 0 24 0 14.82 0 6.73 5.8 2.69 14.09l7.98 6.2C12.13 13.13 17.57 9.5 24 9.5z"/><path fill="#34A853" d="M46.1 24.55c0-1.64-.15-3.22-.43-4.74H24v9.01h12.42c-.54 2.9-2.18 5.36-4.66 7.01l7.18 5.59C43.98 37.13 46.1 31.36 46.1 24.55z"/><path fill="#FBBC05" d="M10.67 28.29a14.5 14.5 0 0 1 0-8.58l-7.98-6.2A23.94 23.94 0 0 0 0 24c0 3.77.9 7.34 2.69 10.49l7.98-6.2z"/><path fill="#EA4335" d="M24 48c6.48 0 11.92-2.15 15.89-5.85l-7.18-5.59c-2 1.34-4.56 2.13-8.71 2.13-6.43 0-11.87-3.63-14.33-8.89l-7.98 6.2C6.73 42.2 14.82 48 24 48z"/></g></svg>
  ) },
  { name: 'GitHub', url: '/api/auth/github', icon: (
    <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24"><path fill="currentColor" d="M12 0C5.37 0 0 5.37 0 12c0 5.3 3.438 9.8 8.205 11.387.6.113.82-.262.82-.582 0-.288-.012-1.243-.018-2.252-3.338.726-4.042-1.61-4.042-1.61-.546-1.387-1.333-1.756-1.333-1.756-1.09-.745.083-.729.083-.729 1.205.085 1.84 1.237 1.84 1.237 1.07 1.834 2.807 1.304 3.492.997.108-.775.418-1.305.762-1.606-2.665-.304-5.466-1.332-5.466-5.93 0-1.31.468-2.38 1.236-3.22-.124-.303-.535-1.523.117-3.176 0 0 1.008-.322 3.3 1.23a11.5 11.5 0 0 1 3.003-.404c1.02.005 2.047.138 3.003.404 2.29-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.873.12 3.176.77.84 1.235 1.91 1.235 3.22 0 4.61-2.803 5.624-5.475 5.921.43.37.823 1.102.823 2.222 0 1.606-.015 2.898-.015 3.293 0 .322.216.699.825.58C20.565 21.796 24 17.297 24 12c0-6.63-5.373-12-12-12z"/></svg>
  ) }
];

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
  const [showLoginPassword, setShowLoginPassword] = useState(false);
  const [showRegisterPassword, setShowRegisterPassword] = useState(false);
  const [showRegisterConfirm, setShowRegisterConfirm] = useState(false);
  const [loginAttempts, setLoginAttempts] = useState(0);
  const [lockoutUntil, setLockoutUntil] = useState<number | null>(null);
  const [registerTab, setRegisterTab] = useState<'login' | 'register'>('login');
  const [register2FA, setRegister2FA] = useState('');
  const [login2FA, setLogin2FA] = useState('');
  const lockoutTimer = useRef<NodeJS.Timeout | null>(null);
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetStatus, setResetStatus] = useState<'idle'|'success'|'error'>('idle');
  const [resetError, setResetError] = useState('');
  const [show2FAModal, setShow2FAModal] = useState(false);
  const [pending2FA, setPending2FA] = useState<{ type: 'login'|'register', data: any }|null>(null);
  const [twoFACode, setTwoFACode] = useState('');

  const getPasswordStrength = (pw: string) => {
    let score = 0;
    if (pw.length >= 8) score++;
    if (/[A-Z]/.test(pw)) score++;
    if (/[a-z]/.test(pw)) score++;
    if (/[0-9]/.test(pw)) score++;
    if (/[^A-Za-z0-9]/.test(pw)) score++;
    return score;
  };
  const passwordStrength = getPasswordStrength(registerData.password);

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
    if (lockoutUntil && Date.now() < lockoutUntil) return;
    if (!validateLogin()) return;
    try {
      const response = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginData.username,
          password: loginData.password,
          rememberMe: loginData.rememberMe,
          twoFactorCode: login2FA
        })
      });
      if (!response.ok) {
        setLoginAttempts(a => a + 1);
        if (loginAttempts + 1 >= 5) {
          const until = Date.now() + 60_000;
          setLockoutUntil(until);
          lockoutTimer.current = setTimeout(() => setLockoutUntil(null), 60_000);
        }
        throw new Error('Login failed');
      }
      const data = await response.json();
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
      setLoginAttempts(0);
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
          password: registerData.password,
          twoFactorCode: register2FA
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

  const handleOAuth = async (provider) => {
    const popup = window.open(provider.url, 'oauth', 'width=500,height=600');
    // In production, use postMessage or polling to get result
    // For now, stub: after 2s, call onAuthenticated with mock user
    setTimeout(() => {
      if (popup) popup.close();
      onAuthenticated({
        id: 'oauth', username: 'OAuthUser', email: 'oauth@example.com', roles: ['user'], token: 'oauth-token', refreshToken: 'oauth-refresh', channels: [], permissions: { canCreateChannels: false, canModerate: false, isAdmin: false, isOwner: false }
      });
    }, 2000);
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setResetStatus('idle');
    setResetError('');
    // Simulate API call
    setTimeout(() => {
      if (resetEmail.includes('@')) {
        setResetStatus('success');
      } else {
        setResetStatus('error');
        setResetError('Invalid email address');
      }
    }, 1200);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <motion.div
          initial={{ opacity: 0, y: 32 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -32 }}
          transition={{ duration: 0.5, type: 'spring' }}
          className="rounded-2xl shadow-2xl bg-gradient-to-br from-zinc-900/80 to-zinc-800/90 backdrop-blur-xl border border-border p-8"
        >
          {/* OAuth Buttons */}
          <div className="flex flex-col gap-3 mb-6">
            {OAUTH_PROVIDERS.map(p => (
              <Button key={p.name} variant="outline" className="w-full flex items-center justify-center gap-2" onClick={() => handleOAuth(p)}>
                {p.icon} Continue with {p.name}
              </Button>
            ))}
          </div>
          <div className="flex items-center gap-2 mb-6">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted-foreground">or</span>
            <div className="flex-1 h-px bg-border" />
          </div>
          {/* Logo and Title */}
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary rounded-xl mx-auto mb-4 flex items-center justify-center">
              <div className="w-8 h-8 bg-primary-foreground rounded-full"></div>
            </div>
            <h1 className="text-2xl font-bold text-foreground">VoiceLink</h1>
            <p className="text-muted-foreground">Secure voice communication platform</p>
          </div>
          <Card className="bg-transparent shadow-none">
            <CardHeader>
              <CardTitle>Access Your Account</CardTitle>
              <CardDescription>
                Login or create a new account to join voice channels
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Tabs value={registerTab} onValueChange={v => setRegisterTab(v as any)} className="w-full">
                <TabsList className="grid w-full grid-cols-2">
                  <TabsTrigger value="login">Login</TabsTrigger>
                  <TabsTrigger value="register">Register</TabsTrigger>
                </TabsList>
                <AnimatePresence mode="wait">
                  {registerTab === 'login' && (
                    <TabsContent value="login" forceMount>
                      <motion.form
                        key="login"
                        onSubmit={handleLogin}
                        className="space-y-4"
                        initial={{ opacity: 0, x: 32 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -32 }}
                        transition={{ duration: 0.4 }}
                        aria-describedby={error ? 'login-error-summary' : undefined}
                        autoComplete="on"
                      >
                        <div className="space-y-2">
                          <Label htmlFor="login-username">Username</Label>
                          <Input
                            id="login-username"
                            type="text"
                            autoComplete="username"
                            placeholder="Enter your username"
                            value={loginData.username}
                            onChange={e => setLoginData(prev => ({ ...prev, username: e.target.value }))}
                            disabled={isLoading || !!lockoutUntil}
                            aria-invalid={!!validationErrors.username}
                            aria-describedby={validationErrors.username ? 'login-username-error' : undefined}
                          />
                          {validationErrors.username && (
                            <p id="login-username-error" className="text-xs text-destructive">{validationErrors.username}</p>
                          )}
                        </div>
                        <div className="space-y-2 relative">
                          <Label htmlFor="login-password">Password</Label>
                          <Input
                            id="login-password"
                            type={showLoginPassword ? 'text' : 'password'}
                            autoComplete="current-password"
                            placeholder="Enter your password"
                            value={loginData.password}
                            onChange={e => setLoginData(prev => ({ ...prev, password: e.target.value }))}
                            disabled={isLoading || !!lockoutUntil}
                            aria-invalid={!!validationErrors.password}
                            aria-describedby={validationErrors.password ? 'login-password-error' : undefined}
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-7 text-xs text-muted-foreground hover:text-primary"
                            tabIndex={0}
                            aria-label={showLoginPassword ? 'Hide password' : 'Show password'}
                            onClick={() => setShowLoginPassword(v => !v)}
                          >
                            {showLoginPassword ? 'Hide' : 'Show'}
                          </button>
                          {validationErrors.password && (
                            <p id="login-password-error" className="text-xs text-destructive">{validationErrors.password}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="login-2fa">2FA Code (if enabled)</Label>
                          <Input
                            id="login-2fa"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="one-time-code"
                            placeholder="123456"
                            value={login2FA}
                            onChange={e => setLogin2FA(e.target.value)}
                            disabled={isLoading || !!lockoutUntil}
                          />
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="remember-me"
                            checked={loginData.rememberMe}
                            onCheckedChange={checked => setLoginData(prev => ({ ...prev, rememberMe: !!checked }))}
                          />
                          <Label htmlFor="remember-me" className="text-sm">
                            Remember me for 30 days
                          </Label>
                        </div>
                        <div className="flex justify-between items-center">
                          <Button type="submit" className="w-1/2" disabled={isLoading || !!lockoutUntil}>
                            {isLoading ? 'Authenticating...' : 'Login'}
                          </Button>
                          <button
                            type="button"
                            className="text-xs text-primary underline hover:text-secondary ml-2"
                            tabIndex={0}
                            onClick={() => setShowResetModal(true)}
                          >
                            Forgot password?
                          </button>
                        </div>
                        {lockoutUntil && (
                          <div className="text-xs text-destructive mt-2">
                            Too many failed attempts. Try again in {Math.ceil((lockoutUntil - Date.now()) / 1000)}s.
                          </div>
                        )}
                        {error && (
                          <Alert variant="destructive" className="mt-4" id="login-error-summary">
                            <AlertDescription>{error}</AlertDescription>
                          </Alert>
                        )}
                      </motion.form>
                    </TabsContent>
                  )}
                  {registerTab === 'register' && (
                    <TabsContent value="register" forceMount>
                      <motion.form
                        key="register"
                        onSubmit={handleRegister}
                        className="space-y-4"
                        initial={{ opacity: 0, x: -32 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: 32 }}
                        transition={{ duration: 0.4 }}
                        aria-describedby={error ? 'register-error-summary' : undefined}
                        autoComplete="on"
                      >
                        <div className="space-y-2 relative">
                          <Label htmlFor="register-username">Username</Label>
                          <Input
                            id="register-username"
                            type="text"
                            autoComplete="username"
                            placeholder="Choose a username"
                            value={registerData.username}
                            onChange={e => setRegisterData(prev => ({ ...prev, username: e.target.value }))}
                            disabled={isLoading}
                            aria-invalid={!!validationErrors.username}
                            aria-describedby={validationErrors.username ? 'register-username-error' : undefined}
                          />
                          <span className="absolute right-2 top-7" title="3+ chars, letters, numbers, - or _">
                            <Info className="w-4 h-4 text-muted-foreground" />
                          </span>
                          {validationErrors.username && (
                            <p id="register-username-error" className="text-xs text-destructive">{validationErrors.username}</p>
                          )}
                        </div>
                        <div className="space-y-2 relative">
                          <Label htmlFor="register-email">Email</Label>
                          <Input
                            id="register-email"
                            type="email"
                            autoComplete="email"
                            placeholder="Enter your email"
                            value={registerData.email}
                            onChange={e => setRegisterData(prev => ({ ...prev, email: e.target.value }))}
                            disabled={isLoading}
                            aria-invalid={!!validationErrors.email}
                            aria-describedby={validationErrors.email ? 'register-email-error' : undefined}
                          />
                          <span className="absolute right-2 top-7" title="Must be a valid email address">
                            <Info className="w-4 h-4 text-muted-foreground" />
                          </span>
                          {validationErrors.email && (
                            <p id="register-email-error" className="text-xs text-destructive">{validationErrors.email}</p>
                          )}
                        </div>
                        <div className="space-y-2 relative">
                          <Label htmlFor="register-password">Password</Label>
                          <Input
                            id="register-password"
                            type={showRegisterPassword ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="Create a secure password"
                            value={registerData.password}
                            onChange={e => setRegisterData(prev => ({ ...prev, password: e.target.value }))}
                            disabled={isLoading}
                            aria-invalid={!!validationErrors.password}
                            aria-describedby={validationErrors.password ? 'register-password-error' : undefined}
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-7 text-xs text-muted-foreground hover:text-primary"
                            tabIndex={0}
                            aria-label={showRegisterPassword ? 'Hide password' : 'Show password'}
                            onClick={() => setShowRegisterPassword(v => !v)}
                          >
                            {showRegisterPassword ? 'Hide' : 'Show'}
                          </button>
                          <span className="absolute left-2 -bottom-5 w-11/12">
                            <div className="h-2 rounded bg-border mt-1">
                              <motion.div
                                className="h-2 rounded bg-primary"
                                initial={{ width: 0 }}
                                animate={{ width: `${(passwordStrength / 5) * 100}%` }}
                                transition={{ duration: 0.4 }}
                              />
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {registerData.password && (
                                passwordStrength < 3 ? 'Weak' : passwordStrength < 5 ? 'Medium' : 'Strong'
                              )}
                            </span>
                          </span>
                          {validationErrors.password && (
                            <p id="register-password-error" className="text-xs text-destructive">{validationErrors.password}</p>
                          )}
                        </div>
                        <div className="space-y-2 relative">
                          <Label htmlFor="confirm-password">Confirm Password</Label>
                          <Input
                            id="confirm-password"
                            type={showRegisterConfirm ? 'text' : 'password'}
                            autoComplete="new-password"
                            placeholder="Confirm your password"
                            value={registerData.confirmPassword}
                            onChange={e => setRegisterData(prev => ({ ...prev, confirmPassword: e.target.value }))}
                            disabled={isLoading}
                            aria-invalid={!!validationErrors.confirmPassword}
                            aria-describedby={validationErrors.confirmPassword ? 'register-confirm-error' : undefined}
                          />
                          <button
                            type="button"
                            className="absolute right-2 top-7 text-xs text-muted-foreground hover:text-primary"
                            tabIndex={0}
                            aria-label={showRegisterConfirm ? 'Hide password' : 'Show password'}
                            onClick={() => setShowRegisterConfirm(v => !v)}
                          >
                            {showRegisterConfirm ? 'Hide' : 'Show'}
                          </button>
                          {validationErrors.confirmPassword && (
                            <p id="register-confirm-error" className="text-xs text-destructive">{validationErrors.confirmPassword}</p>
                          )}
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="register-2fa">2FA Code (if enabled)</Label>
                          <Input
                            id="register-2fa"
                            type="text"
                            inputMode="numeric"
                            pattern="[0-9]*"
                            autoComplete="one-time-code"
                            placeholder="123456"
                            value={register2FA}
                            onChange={e => setRegister2FA(e.target.value)}
                            disabled={isLoading}
                          />
                        </div>
                        <div className="flex items-center space-x-2">
                          <Checkbox
                            id="accept-terms"
                            checked={registerData.acceptTerms}
                            onCheckedChange={checked => setRegisterData(prev => ({ ...prev, acceptTerms: !!checked }))}
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
                        {error && (
                          <Alert variant="destructive" className="mt-4" id="register-error-summary">
                            <AlertDescription>{error}</AlertDescription>
                          </Alert>
                        )}
                      </motion.form>
                    </TabsContent>
                  )}
                </AnimatePresence>
              </Tabs>
              {/* Security Badges */}
              <div className="mt-6 p-3 bg-muted rounded-lg">
                <div className="text-xs text-muted-foreground space-y-1 flex flex-wrap gap-2 justify-between">
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500 inline-block" />JWT</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500 inline-block" />E2E</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500 inline-block" />RBAC</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-pink-500 inline-block" />Rate Limiting</span>
                  <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-purple-500 inline-block" />2FA</span>
                </div>
              </div>
            </CardContent>
          </Card>
          {/* Forgot password modal */}
          <AnimatePresence>
            {showResetModal && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.3 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="rounded-2xl shadow-2xl bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 backdrop-blur-xl border border-border p-8 w-full max-w-sm mx-auto">
                  <h2 className="text-xl font-bold mb-2 text-foreground">Reset Password</h2>
                  <form onSubmit={handleReset} className="space-y-4">
                    <div>
                      <Label htmlFor="reset-email">Email</Label>
                      <Input id="reset-email" type="email" value={resetEmail} onChange={e => setResetEmail(e.target.value)} autoFocus required autoComplete="email" />
                    </div>
                    {resetStatus === 'success' && <div className="text-green-500 text-sm">Check your email for a reset link.</div>}
                    {resetStatus === 'error' && <div className="text-destructive text-sm">{resetError}</div>}
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" onClick={() => setShowResetModal(false)}>Cancel</Button>
                      <Button type="submit">Send Reset Link</Button>
                    </div>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          {/* 2FA modal */}
          <AnimatePresence>
            {show2FAModal && (
              <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.95 }} transition={{ duration: 0.3 }} className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
                <div className="rounded-2xl shadow-2xl bg-gradient-to-br from-zinc-900/90 to-zinc-800/90 backdrop-blur-xl border border-border p-8 w-full max-w-sm mx-auto">
                  <h2 className="text-xl font-bold mb-2 text-foreground">Two-Factor Authentication</h2>
                  <form onSubmit={e => { e.preventDefault(); /* retry login/register with twoFACode */ }} className="space-y-4">
                    <div>
                      <Label htmlFor="2fa-code">2FA Code</Label>
                      <Input id="2fa-code" type="text" inputMode="numeric" pattern="[0-9]*" value={twoFACode} onChange={e => setTwoFACode(e.target.value)} autoFocus required autoComplete="one-time-code" />
                    </div>
                    <div className="flex gap-2 justify-end">
                      <Button type="button" variant="outline" onClick={() => setShow2FAModal(false)}>Cancel</Button>
                      <Button type="submit">Verify</Button>
                    </div>
                  </form>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      </div>
    </div>
  );
};