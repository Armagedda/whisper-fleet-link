import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Slider } from './ui/slider';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { Alert, AlertDescription } from './ui/alert';
import { Checkbox } from './ui/checkbox';
import { Mic, MicOff, Volume2, VolumeX, Settings, Wifi, WifiOff, AlertCircle, Activity, Gauge } from 'lucide-react';
import { useUdpVoiceStream, UdpConnectionStatus } from '../hooks/useUdpVoiceStream';
import { AnimatePresence, motion } from 'framer-motion';

interface UdpVoiceControlsProps {
  jwtToken: string;
  userId: string;
  channelId: string;
  serverAddress?: string;
  serverPort?: number;
}

export const UdpVoiceControls = React.memo(function UdpVoiceControls({
  jwtToken,
  userId,
  channelId,
  serverAddress = '127.0.0.1',
  serverPort = 8080,
}: UdpVoiceControlsProps) {
  const [volume, setVolume] = useState(0.8);
  const [showSettings, setShowSettings] = useState(false);

  const { state, controls } = useUdpVoiceStream(jwtToken, userId, channelId, {
    serverAddress,
    serverPort,
    audioCodec: 'opus',
    sampleRate: 48000,
    channels: 1,
    frameSize: 960,
    bitrate: 64000,
    enableEchoCancellation: true,
    enableNoiseSuppression: true,
    enableAutomaticGainControl: true,
    reconnectInterval: 5000,
    heartbeatInterval: 30000,
    // VAD Configuration
    enableVAD: true,
    vadThreshold: 0.1,
    vadSilenceTimeout: 500,
    // Adaptive Bitrate Configuration
    enableAdaptiveBitrate: true,
    maxBitrate: 128000,
    minBitrate: 16000,
    bitrateAdjustmentInterval: 5000,
    packetLossThreshold: 5,
    jitterThreshold: 50,
    stabilityTimeout: 5000,
  });

  // Update volume when state changes
  useEffect(() => {
    controls.setVolume(volume);
  }, [volume, controls]);

  const getStatusColor = (status: UdpConnectionStatus) => {
    switch (status) {
      case UdpConnectionStatus.Connected:
        return 'bg-green-500';
      case UdpConnectionStatus.Connecting:
        return 'bg-yellow-500';
      case UdpConnectionStatus.Error:
        return 'bg-red-500';
      default:
        return 'bg-gray-500';
    }
  };

  const getStatusIcon = (status: UdpConnectionStatus) => {
    switch (status) {
      case UdpConnectionStatus.Connected:
        return <Wifi className="h-4 w-4" />;
      case UdpConnectionStatus.Connecting:
        return <Wifi className="h-4 w-4 animate-pulse" />;
      case UdpConnectionStatus.Error:
        return <WifiOff className="h-4 w-4" />;
      default:
        return <WifiOff className="h-4 w-4" />;
    }
  };

  const formatBitrate = (bitrate: number) => {
    if (bitrate >= 1000) {
      return `${(bitrate / 1000).toFixed(1)} kbps`;
    }
    return `${bitrate} bps`;
  };

  // 2. Memoize derived lists and handlers
  const remoteUserList = useMemo(() => Object.entries(state.remoteUsers), [state.remoteUsers]);
  const handleSetVolume = useCallback((v: number) => setVolume(v), []);

  // 3. Throttle/debounce slider events
  function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, delay: number) {
    const timeout = React.useRef<number | null>(null);
    return useCallback((...args: Parameters<T>) => {
      if (timeout.current) window.clearTimeout(timeout.current);
      timeout.current = window.setTimeout(() => fn(...args), delay);
    }, [fn, delay]);
  }
  const debouncedSetVolume = useDebouncedCallback(controls.setVolume, 30);

  return (
    <div className="space-y-4">
      {/* Connection Status */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2">
            {getStatusIcon(state.status)}
            Voice Connection
            <span className={`badge ${getStatusColor(state.status)} text-white`}>{state.status}</span>
          </CardTitle>
          <CardDescription>
            UDP audio streaming for real-time voice communication
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Error Display */}
          {state.error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{state.error}</AlertDescription>
            </Alert>
          )}

          {/* Connection Controls */}
          <div className="flex gap-2">
            <Button
              onClick={controls.connect}
              disabled={state.status === UdpConnectionStatus.Connecting || state.isConnected}
              className="flex-1"
            >
              Connect
            </Button>
            <Button
              onClick={controls.disconnect}
              disabled={!state.isConnected}
              variant="outline"
              className="flex-1"
            >
              Disconnect
            </Button>
            <Button
              onClick={() => setShowSettings(!showSettings)}
              variant="outline"
              size="icon"
            >
              <Settings className="h-4 w-4" />
            </Button>
          </div>

          {/* Audio Level Indicator */}
          {state.isConnected && (
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Audio Level</span>
                <span className="text-muted-foreground">
                  {Math.round(state.audioLevel * 100)}%
                </span>
              </div>
              <AudioLevelRing level={state.audioLevel} />
            </div>
          )}

          {/* Connection Stats */}
          {state.isConnected && (
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground">Latency:</span>
                <span className="ml-2">{state.latency}ms</span>
              </div>
              <div>
                <span className="text-muted-foreground">Packet Loss:</span>
                <span className="ml-2">{state.packetLoss}%</span>
              </div>
              <div>
                <span className="text-muted-foreground">Jitter:</span>
                <span className="ml-2">{state.networkConditions.jitter.toFixed(1)}ms</span>
              </div>
              <div>
                <span className="text-muted-foreground">Bitrate:</span>
                <span className="ml-2">{formatBitrate(state.bitrate)}</span>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Audio Controls */}
      <Card>
        <CardHeader>
          <CardTitle>Audio Controls</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Mute Controls */}
          <div className="flex gap-2">
            <Button
              onClick={() => controls.mute(true)}
              disabled={!state.isConnected || state.isMuted}
              variant={state.isMuted ? 'default' : 'outline'}
              className={`flex-1 transition-all ${state.isMuted ? 'animate-pulse bg-voice-muted/80' : ''}`}
              aria-label="Mute"
            >
              <MicOff className="h-4 w-4 mr-2" />
              Mute
            </Button>
            <Button
              onClick={() => controls.mute(false)}
              disabled={!state.isConnected || !state.isMuted}
              variant={!state.isMuted ? 'default' : 'outline'}
              className="flex-1"
            >
              <Mic className="h-4 w-4 mr-2" />
              Unmute
            </Button>
            <Button
              onClick={controls.sendTestTone}
              disabled={!state.isConnected}
              variant="outline"
              size="icon"
            >
              🔊
            </Button>
          </div>

          {/* Volume Control */}
          <div className="space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span>Volume</span>
              <span className="text-muted-foreground">
                {Math.round(volume * 100)}%
              </span>
            </div>
            <Slider
              value={[volume]}
              onValueChange={([value]) => handleSetVolume(value)}
              max={1}
              min={0}
              step={0.01}
              className="w-full"
            />
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <VolumeX className="h-3 w-3" />
              <span>0%</span>
              <div className="flex-1" />
              <Volume2 className="h-3 w-3" />
              <span>100%</span>
            </div>
          </div>

          {/* VAD Controls */}
          <div className="space-y-3">
            <div className="flex items-center space-x-2">
              <Checkbox
                id="vad-enabled"
                checked={state.vadEnabled}
                onCheckedChange={(checked) => controls.setVADEnabled(checked as boolean)}
                disabled={!state.isConnected}
              />
              <label htmlFor="vad-enabled" className="text-sm font-medium">
                Voice Activity Detection (VAD)
              </label>
            </div>
            
            {state.vadEnabled && (
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span>VAD Threshold</span>
                  <span className="text-muted-foreground">
                    {Math.round(state.vadThreshold * 100)}%
                  </span>
                </div>
                <Slider
                  value={[state.vadThreshold]}
                  onValueChange={([value]) => controls.setVADThreshold(value)}
                  max={1}
                  min={0}
                  step={0.01}
                  className="w-full"
                />
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <span>0%</span>
                  <div className="flex-1" />
                  <span>100%</span>
                </div>
              </div>
            )}
          </div>

          {/* Status Indicators */}
          <div className="flex gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${state.isSpeaking ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span>Speaking</span>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${state.isReceiving ? 'bg-blue-500' : 'bg-gray-300'}`} />
              <span>Receiving</span>
            </div>
            <div className="flex items-center gap-2">
              <Activity className={`h-3 w-3 ${state.vadEnabled ? 'text-green-500' : 'text-gray-400'}`} />
              <span>VAD</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Remote User Audio Controls */}
      {state.isConnected && Object.keys(state.remoteUsers).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Remote User Audio Controls</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {remoteUserList.map(([uid, u]) => (
              <div key={uid} className="flex items-center gap-4 py-2 border-b last:border-b-0">
                <div className="flex items-center gap-2 min-w-[120px]">
                  <div className={`w-2 h-2 rounded-full ${u.isSpeaking ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="font-mono text-xs">{uid}</span>
                </div>
                <Button
                  size="icon"
                  variant={u.isMuted ? 'default' : 'outline'}
                  onClick={() => controls.toggleRemoteMute(uid)}
                  className="mr-2"
                >
                  {u.isMuted ? <MicOff className="h-4 w-4" /> : <Mic className="h-4 w-4" />}
                </Button>
                <Slider
                  value={[u.volume]}
                  onValueChange={([value]) => controls.setRemoteVolume(uid, value)}
                  min={0}
                  max={1}
                  step={0.01}
                  className="flex-1"
                  disabled={u.isMuted}
                />
                <span className="text-xs w-10 text-right">{Math.round(u.volume * 100)}%</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Settings Panel */}
      {showSettings && (
        <Card>
          <CardHeader>
            <CardTitle>Audio Settings</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {/* Input Device Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Input Device</label>
              <Select
                value={state.selectedInputDevice || ''}
                onValueChange={controls.setInputDevice}
                disabled={!state.isConnected}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select input device" />
                </SelectTrigger>
                <SelectContent>
                  {state.inputDevices.map((device) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Output Device Selection */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Output Device</label>
              <Select
                value={state.selectedOutputDevice || ''}
                onValueChange={controls.setOutputDevice}
                disabled={!state.isConnected}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select output device" />
                </SelectTrigger>
                <SelectContent>
                  {state.outputDevices.map((device) => (
                    <SelectItem key={device.deviceId} value={device.deviceId}>
                      {device.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Manual Bitrate Control */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Manual Bitrate Control</label>
              <div className="flex items-center gap-2">
                <Slider
                  value={[state.bitrate]}
                  onValueChange={([value]) => controls.setBitrate(value)}
                  max={128000}
                  min={16000}
                  step={1000}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground min-w-[60px]">
                  {formatBitrate(state.bitrate)}
                </span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>16 kbps</span>
                <div className="flex-1" />
                <span>128 kbps</span>
              </div>
            </div>

            {/* Connection Info */}
            <div className="space-y-2">
              <label className="text-sm font-medium">Connection Info</label>
              <div className="text-sm text-muted-foreground space-y-1">
                <div>Server: {serverAddress}:{serverPort}</div>
                <div>Channel: {channelId}</div>
                <div>User: {userId}</div>
                <div>Codec: Opus</div>
                <div>Sample Rate: 48kHz</div>
                <div>VAD: {state.vadEnabled ? 'Enabled' : 'Disabled'}</div>
                <div>Adaptive Bitrate: Enabled</div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
});

// Usage Example Component
export function UdpVoiceExample() {
  const [jwtToken, setJwtToken] = useState('');
  const [userId, setUserId] = useState('');
  const [channelId, setChannelId] = useState('');

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-6">
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">UDP Voice Streaming Demo</h1>
        <p className="text-muted-foreground">
          This component demonstrates real-time voice communication using UDP audio streaming.
          Connect to a voice channel and start talking with other users.
        </p>
      </div>

      {/* Configuration Form */}
      <Card>
        <CardHeader>
          <CardTitle>Connection Settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">JWT Token</label>
            <input
              type="text"
              value={jwtToken}
              onChange={(e) => setJwtToken(e.target.value)}
              placeholder="Enter your JWT token"
              className="w-full p-2 border rounded"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">User ID</label>
            <input
              type="text"
              value={userId}
              onChange={(e) => setUserId(e.target.value)}
              placeholder="Enter your user ID"
              className="w-full p-2 border rounded"
            />
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Channel ID</label>
            <input
              type="text"
              value={channelId}
              onChange={(e) => setChannelId(e.target.value)}
              placeholder="Enter channel ID"
              className="w-full p-2 border rounded"
            />
          </div>
        </CardContent>
      </Card>

      {/* Voice Controls */}
      {jwtToken && userId && channelId && (
        <UdpVoiceControls
          jwtToken={jwtToken}
          userId={userId}
          channelId={channelId}
          serverAddress="127.0.0.1"
          serverPort={8080}
        />
      )}
    </div>
  );
}

// Replace audio level bar with animated circular audio level ring
function AudioLevelRing({ level }: { level: number }) {
  return (
    <svg width="48" height="48" viewBox="0 0 48 48" className="block mx-auto">
      <circle cx="24" cy="24" r="20" fill="none" stroke="#e5e7eb" strokeWidth="4" />
      <motion.circle
        cx="24"
        cy="24"
        r="20"
        fill="none"
        stroke="#6366f1"
        strokeWidth="4"
        strokeDasharray={2 * Math.PI * 20}
        strokeDashoffset={2 * Math.PI * 20 * (1 - level)}
        initial={false}
        animate={{ strokeDashoffset: 2 * Math.PI * 20 * (1 - level) }}
        transition={{ type: 'spring', stiffness: 120, damping: 14 }}
        style={{ filter: level > 0.1 ? 'drop-shadow(0 0 8px #6366f1cc)' : undefined }}
      />
    </svg>
  );
} 