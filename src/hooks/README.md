# UDP Voice Streaming Hook

The `useUdpVoiceStream` hook provides real-time voice communication capabilities using UDP audio streaming. It integrates with the existing WebSocket system for signaling and authentication while handling audio capture, encoding, transmission, and playback.

## Features

- **Real-time Audio Streaming**: Capture microphone audio and stream it to other users in real-time
- **Voice Activity Detection (VAD)**: Automatically detect when users are speaking and only transmit audio during speech
- **Adaptive Bitrate Control**: Automatically adjust audio quality based on network conditions
- **WebRTC Fallback**: Uses WebRTC data channels when direct UDP is not available in browsers
- **Audio Device Management**: Switch between input/output devices dynamically
- **Mute Controls**: Mute/unmute microphone with visual feedback
- **Volume Control**: Adjust playback volume for incoming audio
- **Connection Management**: Automatic reconnection with exponential backoff
- **Audio Level Monitoring**: Real-time audio level visualization
- **Latency Monitoring**: Track connection latency and packet loss
- **Network Condition Tracking**: Monitor jitter, packet loss, and RTT for adaptive bitrate
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
      <div>Speaking: {state.isSpeaking ? 'Yes' : 'No'}</div>
      <div>Bitrate: {state.bitrate} bps</div>
      
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

## Advanced Usage with VAD and Adaptive Bitrate

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
      // VAD Configuration
      enableVAD: true,
      vadThreshold: 0.1, // 10% volume threshold
      vadSilenceTimeout: 500, // 500ms silence timeout
      // Adaptive Bitrate Configuration
      enableAdaptiveBitrate: true,
      maxBitrate: 128000,
      minBitrate: 16000,
      bitrateAdjustmentInterval: 5000, // 5 seconds
      packetLossThreshold: 5, // 5% packet loss
      jitterThreshold: 50, // 50ms jitter
      stabilityTimeout: 5000, // 5 seconds of stability
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
          <span>Jitter: {state.networkConditions.jitter.toFixed(1)}ms</span>
          <span>Bitrate: {state.bitrate} bps</span>
        </div>
      )}

      {/* VAD Controls */}
      <div className="vad-controls">
        <label>
          <input
            type="checkbox"
            checked={state.vadEnabled}
            onChange={(e) => controls.setVADEnabled(e.target.checked)}
            disabled={!state.isConnected}
          />
          Voice Activity Detection
        </label>
        
        {state.vadEnabled && (
          <div className="vad-threshold">
            <label>VAD Threshold: {Math.round(state.vadThreshold * 100)}%</label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.01"
              value={state.vadThreshold}
              onChange={(e) => controls.setVADThreshold(parseFloat(e.target.value))}
            />
          </div>
        )}
      </div>

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

      {/* Manual Bitrate Control */}
      <div className="bitrate-control">
        <label>Manual Bitrate: {state.bitrate} bps</label>
        <input
          type="range"
          min="16000"
          max="128000"
          step="1000"
          value={state.bitrate}
          onChange={(e) => controls.setBitrate(parseInt(e.target.value))}
        />
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
        <div className={`indicator vad ${state.vadEnabled ? 'active' : ''}`}>
          VAD
        </div>
      </div>
    </div>
  );
}
```

## Configuration Options

### Basic Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `serverAddress` | string | '127.0.0.1' | UDP server address |
| `serverPort` | number | 8080 | UDP server port |
| `audioCodec` | 'opus' \| 'pcm' | 'opus' | Audio codec to use |
| `sampleRate` | number | 48000 | Audio sample rate in Hz |
| `channels` | number | 1 | Number of audio channels |
| `frameSize` | number | 960 | Audio frame size (20ms at 48kHz) |
| `bitrate` | number | 64000 | Initial audio bitrate in bps |
| `enableEchoCancellation` | boolean | true | Enable echo cancellation |
| `enableNoiseSuppression` | boolean | true | Enable noise suppression |
| `enableAutomaticGainControl` | boolean | true | Enable automatic gain control |
| `reconnectInterval` | number | 5000 | Reconnection interval in ms |
| `heartbeatInterval` | number | 30000 | Heartbeat interval in ms |

### VAD Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableVAD` | boolean | true | Enable voice activity detection |
| `vadThreshold` | number | 0.1 | Volume threshold (0-1) for VAD activation |
| `vadSilenceTimeout` | number | 500 | Time in ms to wait before marking as silent |

### Adaptive Bitrate Configuration

| Option | Type | Default | Description |
|--------|------|---------|-------------|
| `enableAdaptiveBitrate` | boolean | true | Enable adaptive bitrate control |
| `maxBitrate` | number | 128000 | Maximum bitrate in bps |
| `minBitrate` | number | 16000 | Minimum bitrate in bps |
| `bitrateAdjustmentInterval` | number | 5000 | Interval between bitrate adjustments in ms |
| `packetLossThreshold` | number | 5 | Packet loss percentage to trigger bitrate reduction |
| `jitterThreshold` | number | 50 | Jitter threshold in ms to trigger bitrate reduction |
| `stabilityTimeout` | number | 5000 | Time of stable connection before increasing bitrate in ms |

## State Properties

### Basic State

| Property | Type | Description |
|----------|------|-------------|
| `status` | UdpConnectionStatus | Current connection status |
| `isConnected` | boolean | Whether connected to server |
| `isMuted` | boolean | Whether microphone is muted |
| `isSpeaking` | boolean | Whether user is currently speaking (VAD) |
| `isReceiving` | boolean | Whether receiving audio from others |
| `error` | string \| null | Current error message |
| `audioLevel` | number | Current audio input level (0-1) |
| `packetLoss` | number | Current packet loss percentage |
| `latency` | number | Current connection latency in ms |

### VAD and Bitrate State

| Property | Type | Description |
|----------|------|-------------|
| `bitrate` | number | Current audio bitrate in bps |
| `networkConditions` | NetworkConditions | Current network conditions |
| `vadEnabled` | boolean | Whether VAD is enabled |
| `vadThreshold` | number | Current VAD threshold (0-1) |

### NetworkConditions Object

| Property | Type | Description |
|----------|------|-------------|
| `packetLoss` | number | Packet loss percentage |
| `jitter` | number | Network jitter in ms |
| `latency` | number | Connection latency in ms |
| `rtt` | number | Round-trip time in ms |

## Control Functions

### Basic Controls

| Function | Parameters | Description |
|----------|------------|-------------|
| `connect()` | none | Connect to the UDP server |
| `disconnect()` | none | Disconnect from the server |
| `mute(muted)` | boolean | Mute/unmute microphone |
| `setInputDevice(deviceId)` | string | Change input audio device |
| `setOutputDevice(deviceId)` | string | Change output audio device |
| `setVolume(volume)` | number | Set playback volume (0-1) |
| `sendTestTone()` | none | Send a test tone |

### VAD and Bitrate Controls

| Function | Parameters | Description |
|----------|------------|-------------|
| `setBitrate(bitrate)` | number | Manually set audio bitrate |
| `setVADEnabled(enabled)` | boolean | Enable/disable VAD |
| `setVADThreshold(threshold)` | number | Set VAD threshold (0-1) |

## Voice Activity Detection (VAD)

The VAD system automatically detects when users are speaking by analyzing audio levels:

- **Activation**: When average audio level exceeds `vadThreshold` for recent samples
- **Deactivation**: When audio level drops below threshold for `vadSilenceTimeout` milliseconds
- **Benefits**: Reduces bandwidth usage and background noise transmission
- **Configuration**: Adjust threshold and timeout based on microphone sensitivity and environment

### VAD Tuning Tips

- **High sensitivity environments** (quiet rooms): Use lower threshold (0.05-0.1)
- **Noisy environments**: Use higher threshold (0.2-0.3)
- **Fast response needed**: Use shorter silence timeout (200-300ms)
- **Avoid false triggers**: Use longer silence timeout (500-1000ms)

## Adaptive Bitrate Control

The adaptive bitrate system automatically adjusts audio quality based on network conditions:

- **Reduction triggers**: High packet loss (>5%) or high jitter (>50ms)
- **Reduction amount**: 25% decrease (minimum 16kbps)
- **Increase triggers**: Stable connection for 5+ seconds
- **Increase amount**: 10% increase (maximum 128kbps)
- **Adjustment interval**: 5 seconds between changes

### Bitrate Control Logic

1. **Monitor network conditions** continuously
2. **Detect poor conditions**: Packet loss or jitter above thresholds
3. **Reduce bitrate**: Lower by 25% to improve reliability
4. **Monitor stability**: Track connection quality over time
5. **Increase bitrate**: Gradually restore quality when conditions improve

### Manual Override

Users can manually set bitrate using `controls.setBitrate()`:
- Range: 16kbps to 128kbps
- Takes precedence over adaptive control
- Useful for specific network conditions or quality preferences

## Network Condition Monitoring

The hook tracks several network metrics:

- **Packet Loss**: Percentage of packets not received
- **Jitter**: Variation in packet arrival times
- **Latency**: Round-trip time for audio packets
- **RTT**: End-to-end connection time

These metrics are used for adaptive bitrate decisions and can be displayed in the UI for debugging.

## Error Handling

The hook provides comprehensive error handling:

- **Connection errors**: Automatic reconnection with exponential backoff
- **Audio device errors**: Graceful fallback to default devices
- **Network errors**: Adaptive bitrate adjustment and retry logic
- **VAD errors**: Fallback to continuous transmission mode

## Performance Considerations

- **Audio processing**: Uses Web Audio API for efficient audio handling
- **Network optimization**: VAD reduces bandwidth by 60-80% during silence
- **Adaptive quality**: Maintains call quality across varying network conditions
- **Memory usage**: Minimal memory footprint with efficient audio buffers

## Browser Compatibility

- **Chrome/Edge**: Full support for all features
- **Firefox**: Full support for all features
- **Safari**: Full support for all features
- **Mobile browsers**: Limited UDP support, uses WebRTC fallback

## Troubleshooting

### Common Issues

1. **VAD not working**: Check microphone permissions and adjust threshold
2. **Poor audio quality**: Check network conditions and bitrate settings
3. **High latency**: Verify server location and network connection
4. **Connection drops**: Check firewall settings and server availability

### Debug Information

Enable console logging to debug issues:
```javascript
// The hook logs detailed information about:
// - Connection status changes
// - VAD state changes
// - Bitrate adjustments
// - Network condition updates
// - Error conditions
```

## Examples

See the `UdpVoiceControls` component for a complete implementation example with all features enabled.

## Per-User Audio Controls

The hook supports real-time per-user audio playback with individual volume and mute controls for each remote user.

### State

- `state.remoteUsers`: An object mapping userId to their audio state:
  ```ts
  remoteUsers: {
    [userId: string]: {
      isMuted: boolean;
      volume: number;
      isSpeaking?: boolean; // if VAD is available
    }
  }
  ```

### Controls

- `controls.setRemoteVolume(userId: string, volume: number)`: Set the playback volume for a remote user (0-1)
- `controls.toggleRemoteMute(userId: string)`: Toggle mute for a remote user

### Example: User Volume Panel

```tsx
function RemoteUserVolumePanel({ state, controls }) {
  return (
    <div>
      {Object.entries(state.remoteUsers).map(([uid, u]) => (
        <div key={uid} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span>{uid}</span>
          <button onClick={() => controls.toggleRemoteMute(uid)}>
            {u.isMuted ? 'Unmute' : 'Mute'}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.01}
            value={u.volume}
            onChange={e => controls.setRemoteVolume(uid, parseFloat(e.target.value))}
            disabled={u.isMuted}
          />
          <span>{Math.round(u.volume * 100)}%</span>
          {u.isSpeaking && <span style={{ color: 'green' }}>Speaking</span>}
        </div>
      ))}
    </div>
  );
}
```

- You can use this panel in your UI to allow users to control the volume and mute state of each remote participant in real time. 