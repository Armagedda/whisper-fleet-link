# UDP Voice Streaming Hook

The `useUdpVoiceStream` hook provides real-time voice communication capabilities using UDP audio streaming. It integrates with the existing WebSocket system for signaling and authentication while handling audio capture, encoding, transmission, and playback.

## Features

- **Real-time Audio Streaming**: Capture microphone audio and stream it to other users in real-time
- **WebRTC Fallback**: Uses WebRTC data channels when direct UDP is not available in browsers
- **Audio Device Management**: Switch between input/output devices dynamically
- **Mute Controls**: Mute/unmute microphone with visual feedback
- **Volume Control**: Adjust playback volume for incoming audio
- **Connection Management**: Automatic reconnection with exponential backoff
- **Audio Level Monitoring**: Real-time audio level visualization
- **Latency Monitoring**: Track connection latency and packet loss
- **Error Handling**: Comprehensive error states and recovery
- **Heartbeat System**: Keep connections alive with periodic heartbeats

## Installation

The hook is built into the project and requires no additional dependencies. It uses the Web Audio API and WebRTC APIs that are available in modern browsers.

## Basic Usage

```tsx
import { useUdpVoiceStream } from '../hooks/useUdpVoiceStream';

function VoiceComponent() {
  const { state, controls } = useUdpVoiceStream(
    'your-jwt-token',
    'user-123',
    'channel-456',
    {
      serverAddress: '127.0.0.1',
      serverPort: 8080,
      audioCodec: 'opus',
      sampleRate: 48000,
    }
  );

  return (
    <div>
      <div>Status: {state.status}</div>
      <div>Connected: {state.isConnected ? 'Yes' : 'No'}</div>
      <div>Muted: {state.isMuted ? 'Yes' : 'No'}</div>
      
      <button 
        onClick={() => controls.mute(!state.isMuted)}
        disabled={!state.isConnected}
      >
        {state.isMuted ? 'Unmute' : 'Mute'}
      </button>
      
      <button onClick={controls.connect} disabled={state.isConnected}>
        Connect
      </button>
      
      <button onClick={controls.disconnect} disabled={!state.isConnected}>
        Disconnect
      </button>
    </div>
  );
}
```

## Advanced Usage

```tsx
import { useUdpVoiceStream, UdpConnectionStatus } from '../hooks/useUdpVoiceStream';

function AdvancedVoiceComponent() {
  const [volume, setVolume] = useState(0.8);
  
  const { state, controls } = useUdpVoiceStream(
    jwtToken,
    userId,
    channelId,
    {
      serverAddress: 'your-server.com',
      serverPort: 8080,
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
    }
  );

  // Update volume when it changes
  useEffect(() => {
    controls.setVolume(volume);
  }, [volume, controls]);

  // Auto-connect when component mounts
  useEffect(() => {
    if (state.status === UdpConnectionStatus.Disconnected) {
      controls.connect();
    }
  }, []);

  return (
    <div className="voice-controls">
      {/* Connection Status */}
      <div className={`status ${state.status}`}>
        <span>Status: {state.status}</span>
        {state.error && <span className="error">Error: {state.error}</span>}
      </div>

      {/* Audio Level Visualization */}
      {state.isConnected && (
        <div className="audio-level">
          <div 
            className="level-bar" 
            style={{ width: `${state.audioLevel * 100}%` }}
          />
          <span>{Math.round(state.audioLevel * 100)}%</span>
        </div>
      )}

      {/* Connection Stats */}
      {state.isConnected && (
        <div className="stats">
          <span>Latency: {state.latency}ms</span>
          <span>Packet Loss: {state.packetLoss}%</span>
        </div>
      )}

      {/* Audio Controls */}
      <div className="controls">
        <button 
          onClick={() => controls.mute(true)}
          disabled={!state.isConnected || state.isMuted}
          className={state.isMuted ? 'active' : ''}
        >
          Mute
        </button>
        
        <button 
          onClick={() => controls.mute(false)}
          disabled={!state.isConnected || !state.isMuted}
          className={!state.isMuted ? 'active' : ''}
        >
          Unmute
        </button>

        <button onClick={controls.sendTestTone} disabled={!state.isConnected}>
          Test Tone
        </button>
      </div>

      {/* Volume Control */}
      <div className="volume-control">
        <input
          type="range"
          min="0"
          max="1"
          step="0.01"
          value={volume}
          onChange={(e) => setVolume(parseFloat(e.target.value))}
        />
        <span>{Math.round(volume * 100)}%</span>
      </div>

      {/* Device Selection */}
      <div className="device-selection">
        <select 
          value={state.selectedInputDevice || ''}
          onChange={(e) => controls.setInputDevice(e.target.value)}
          disabled={!state.isConnected}
        >
          {state.inputDevices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>

        <select 
          value={state.selectedOutputDevice || ''}
          onChange={(e) => controls.setOutputDevice(e.target.value)}
          disabled={!state.isConnected}
        >
          {state.outputDevices.map(device => (
            <option key={device.deviceId} value={device.deviceId}>
              {device.label}
            </option>
          ))}
        </select>
      </div>

      {/* Status Indicators */}
      <div className="indicators">
        <div className={`indicator speaking ${state.isSpeaking ? 'active' : ''}`}>
          Speaking
        </div>
        <div className={`indicator receiving ${state.isReceiving ? 'active' : ''}`}>
          Receiving
        </div>
      </div>
    </div>
  );
}
```

## API Reference

### Hook Parameters

```tsx
useUdpVoiceStream(
  jwtToken: string,
  userId: string,
  channelId: string,
  config?: Partial<UdpVoiceStreamConfig>
): UseUdpVoiceStreamReturn
```

#### Parameters

- `jwtToken` (string): JWT authentication token for the backend
- `userId` (string): Unique identifier for the current user
- `channelId` (string): Voice channel to join
- `config` (optional): Configuration object for audio settings

#### Configuration Options

```tsx
interface UdpVoiceStreamConfig {
  serverAddress: string;        // UDP server address (default: '127.0.0.1')
  serverPort: number;           // UDP server port (default: 8080)
  audioCodec: 'opus' | 'pcm';   // Audio codec (default: 'opus')
  sampleRate: number;           // Audio sample rate (default: 48000)
  channels: number;             // Audio channels (default: 1)
  frameSize: number;            // Audio frame size (default: 960)
  bitrate: number;              // Audio bitrate (default: 64000)
  enableEchoCancellation: boolean;      // Enable echo cancellation (default: true)
  enableNoiseSuppression: boolean;      // Enable noise suppression (default: true)
  enableAutomaticGainControl: boolean;  // Enable AGC (default: true)
  reconnectInterval: number;    // Reconnection delay (default: 5000ms)
  heartbeatInterval: number;    // Heartbeat interval (default: 30000ms)
}
```

### Return Value

```tsx
interface UseUdpVoiceStreamReturn {
  state: UdpVoiceStreamState;
  controls: UdpVoiceStreamControls;
}
```

#### State Object

```tsx
interface UdpVoiceStreamState {
  status: UdpConnectionStatus;           // Current connection status
  isConnected: boolean;                  // Whether connected to server
  isMuted: boolean;                      // Whether microphone is muted
  isSpeaking: boolean;                   // Whether currently speaking
  isReceiving: boolean;                  // Whether receiving audio
  error: string | null;                  // Current error message
  audioLevel: number;                    // Current audio level (0-1)
  packetLoss: number;                    // Packet loss percentage
  latency: number;                       // Connection latency in ms
  inputDevices: AudioDevice[];           // Available input devices
  outputDevices: AudioDevice[];          // Available output devices
  selectedInputDevice: string | null;    // Currently selected input device
  selectedOutputDevice: string | null;   // Currently selected output device
}
```

#### Controls Object

```tsx
interface UdpVoiceStreamControls {
  connect: () => Promise<void>;                    // Connect to server
  disconnect: () => void;                          // Disconnect from server
  mute: (muted: boolean) => void;                  // Mute/unmute microphone
  setInputDevice: (deviceId: string) => Promise<void>;  // Change input device
  setOutputDevice: (deviceId: string) => Promise<void>; // Change output device
  setVolume: (volume: number) => void;             // Set playback volume
  sendTestTone: () => void;                        // Send test audio tone
}
```

### Connection Status

```tsx
enum UdpConnectionStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}
```

### Audio Device

```tsx
interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}
```

## Integration with Existing WebSocket System

The hook integrates seamlessly with the existing `useVoiceWebSocket` hook:

```tsx
import useVoiceWebSocket from './useVoiceWebSocket';
import { useUdpVoiceStream } from './useUdpVoiceStream';

function VoiceChannelComponent() {
  const [users, setUsers] = useState<UserState[]>([]);
  
  // WebSocket for signaling and user management
  const { isConnected: wsConnected, sendMessage } = useVoiceWebSocket({
    jwtToken: 'your-token',
    channelId: 'channel-123',
    onUserUpdate: (user) => {
      setUsers(prev => {
        const existing = prev.find(u => u.user_id === user.user_id);
        if (existing) {
          return prev.map(u => u.user_id === user.user_id ? user : u);
        } else {
          return [...prev, user];
        }
      });
    },
    onConnectionStatus: (status) => {
      console.log('WebSocket status:', status);
    },
  });

  // UDP for audio streaming
  const { state: audioState, controls: audioControls } = useUdpVoiceStream(
    'your-token',
    'user-123',
    'channel-123'
  );

  // Auto-connect UDP when WebSocket is ready
  useEffect(() => {
    if (wsConnected && audioState.status === UdpConnectionStatus.Disconnected) {
      audioControls.connect();
    }
  }, [wsConnected, audioState.status]);

  return (
    <div>
      {/* WebSocket-based user list */}
      <div className="users">
        {users.map(user => (
          <div key={user.user_id} className="user">
            <span>{user.username}</span>
            <span className={user.is_muted ? 'muted' : 'speaking'}>
              {user.is_muted ? 'Muted' : 'Speaking'}
            </span>
          </div>
        ))}
      </div>

      {/* UDP-based audio controls */}
      <div className="audio-controls">
        <button 
          onClick={() => audioControls.mute(!audioState.isMuted)}
          disabled={!audioState.isConnected}
        >
          {audioState.isMuted ? 'Unmute' : 'Mute'}
        </button>
        
        <div className="audio-level">
          Level: {Math.round(audioState.audioLevel * 100)}%
        </div>
      </div>
    </div>
  );
}
```

## Error Handling

The hook provides comprehensive error handling:

```tsx
function VoiceComponentWithErrorHandling() {
  const { state, controls } = useUdpVoiceStream(jwtToken, userId, channelId);

  // Handle connection errors
  useEffect(() => {
    if (state.error) {
      console.error('Voice connection error:', state.error);
      
      // Auto-retry on certain errors
      if (state.error.includes('network') || state.error.includes('timeout')) {
        setTimeout(() => {
          controls.connect();
        }, 5000);
      }
    }
  }, [state.error, controls]);

  // Handle device permission errors
  const handleDeviceError = (error: string) => {
    if (error.includes('permission')) {
      alert('Please allow microphone access to use voice chat');
    } else if (error.includes('not found')) {
      alert('Audio device not found. Please check your microphone settings.');
    }
  };

  return (
    <div>
      {state.error && (
        <div className="error-message">
          <span>Error: {state.error}</span>
          <button onClick={() => controls.connect()}>Retry</button>
        </div>
      )}
      
      {/* Rest of component */}
    </div>
  );
}
```

## Performance Considerations

### Audio Quality vs Bandwidth

```tsx
// High quality, high bandwidth
const highQualityConfig = {
  audioCodec: 'opus',
  sampleRate: 48000,
  bitrate: 128000,
  frameSize: 480, // 10ms frames
};

// Balanced quality and bandwidth
const balancedConfig = {
  audioCodec: 'opus',
  sampleRate: 48000,
  bitrate: 64000,
  frameSize: 960, // 20ms frames
};

// Low bandwidth, lower quality
const lowBandwidthConfig = {
  audioCodec: 'opus',
  sampleRate: 24000,
  bitrate: 32000,
  frameSize: 960, // 20ms frames
};
```

### Memory Management

The hook automatically manages audio resources, but you can optimize memory usage:

```tsx
function OptimizedVoiceComponent() {
  const { state, controls } = useUdpVoiceStream(jwtToken, userId, channelId);

  // Clean up on unmount
  useEffect(() => {
    return () => {
      controls.disconnect();
    };
  }, [controls]);

  // Pause audio processing when tab is not active
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.hidden) {
        controls.mute(true);
      } else {
        controls.mute(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [controls]);

  return <div>{/* Component content */}</div>;
}
```

## Browser Compatibility

The hook requires the following browser APIs:

- **Web Audio API**: For audio capture and playback
- **MediaDevices API**: For microphone access and device enumeration
- **WebRTC API**: For data channel fallback when UDP is not available
- **WebSocket API**: For signaling (handled by existing hook)

### Feature Detection

```tsx
function checkBrowserSupport() {
  const support = {
    webAudio: typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined',
    mediaDevices: typeof navigator.mediaDevices !== 'undefined',
    webRTC: typeof RTCPeerConnection !== 'undefined',
    webSocket: typeof WebSocket !== 'undefined',
  };

  const isSupported = Object.values(support).every(Boolean);
  
  if (!isSupported) {
    console.warn('Browser support issues:', support);
  }

  return isSupported;
}
```

## Troubleshooting

### Common Issues

1. **Microphone Permission Denied**
   ```tsx
   // Handle permission errors
   if (state.error?.includes('permission')) {
     // Guide user to enable microphone
     alert('Please enable microphone access in your browser settings');
   }
   ```

2. **No Audio Output**
   ```tsx
   // Check if audio is being received
   if (state.isConnected && !state.isReceiving) {
     // Check volume settings
     controls.setVolume(1.0);
     // Send test tone to verify connection
     controls.sendTestTone();
   }
   ```

3. **High Latency**
   ```tsx
   // Monitor latency and adjust settings
   if (state.latency > 200) {
     console.warn('High latency detected:', state.latency);
     // Consider reducing audio quality
   }
   ```

4. **Connection Drops**
   ```tsx
   // Auto-reconnect on connection loss
   useEffect(() => {
     if (state.status === UdpConnectionStatus.Error) {
       const timer = setTimeout(() => {
         controls.connect();
       }, 5000);
       return () => clearTimeout(timer);
     }
   }, [state.status, controls]);
   ```

### Debug Mode

Enable debug logging for troubleshooting:

```tsx
// Add to your component
useEffect(() => {
  if (process.env.NODE_ENV === 'development') {
    console.log('Voice state:', state);
  }
}, [state]);
```

## Security Considerations

1. **JWT Authentication**: Always use valid JWT tokens for authentication
2. **Audio Privacy**: Be aware that audio is transmitted in real-time
3. **Device Access**: Only request microphone access when needed
4. **Network Security**: Use HTTPS/WSS for signaling in production

## Testing

Test the hook with different scenarios:

```tsx
// Test basic functionality
function TestVoiceHook() {
  const { state, controls } = useUdpVoiceStream('test-token', 'test-user', 'test-channel');

  const runTests = async () => {
    // Test connection
    await controls.connect();
    
    // Test mute/unmute
    controls.mute(true);
    controls.mute(false);
    
    // Test device switching
    if (state.inputDevices.length > 1) {
      await controls.setInputDevice(state.inputDevices[1].deviceId);
    }
    
    // Test volume control
    controls.setVolume(0.5);
    
    // Test test tone
    controls.sendTestTone();
    
    // Test disconnect
    controls.disconnect();
  };

  return (
    <div>
      <button onClick={runTests}>Run Tests</button>
      <pre>{JSON.stringify(state, null, 2)}</pre>
    </div>
  );
}
```

This comprehensive hook provides all the functionality needed for real-time voice communication in your application, with proper error handling, performance optimization, and seamless integration with your existing WebSocket-based signaling system. 