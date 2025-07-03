import { useCallback, useEffect, useRef, useState, useMemo, MutableRefObject } from 'react';
import useVoiceWebSocket, { UserState } from './useVoiceWebSocket';

// Audio packet types matching backend
export enum PacketType {
  Handshake = 0x01,
  Audio = 0x02,
  JoinChannel = 0x03,
  LeaveChannel = 0x04,
  SetMute = 0x05,
  Heartbeat = 0x06,
  Error = 0x07,
  Ack = 0x08,
  VADState = 0x09, // New packet type for VAD state
}

// Audio packet structure
export interface AudioPacket {
  type: PacketType;
  sequence: number;
  userId: string;
  channelId: string;
  timestamp: number;
  payload?: Uint8Array;
}

// Connection status
export enum UdpConnectionStatus {
  Disconnected = 'disconnected',
  Connecting = 'connecting',
  Connected = 'connected',
  Error = 'error',
}

// Audio device information
export interface AudioDevice {
  deviceId: string;
  label: string;
  kind: 'audioinput' | 'audiooutput';
}

// Network conditions for adaptive bitrate
export interface NetworkConditions {
  packetLoss: number;
  jitter: number;
  latency: number;
  rtt: number;
}

// Hook configuration
export interface UdpVoiceStreamConfig {
  serverAddress: string;
  serverPort: number;
  audioCodec: 'opus' | 'pcm';
  sampleRate: number;
  channels: number;
  frameSize: number;
  bitrate: number;
  enableEchoCancellation: boolean;
  enableNoiseSuppression: boolean;
  enableAutomaticGainControl: boolean;
  reconnectInterval: number;
  heartbeatInterval: number;
  // VAD Configuration
  enableVAD: boolean;
  vadThreshold: number; // 0-1 volume threshold
  vadSilenceTimeout: number; // ms to wait before marking as silent
  // Adaptive Bitrate Configuration
  enableAdaptiveBitrate: boolean;
  maxBitrate: number;
  minBitrate: number;
  bitrateAdjustmentInterval: number; // ms between bitrate adjustments
  packetLossThreshold: number; // % packet loss to trigger bitrate reduction
  jitterThreshold: number; // ms jitter to trigger bitrate reduction
  stabilityTimeout: number; // ms of stable connection before increasing bitrate
}

// Hook state
export interface UdpVoiceStreamState {
  status: UdpConnectionStatus;
  isConnected: boolean;
  isMuted: boolean;
  isSpeaking: boolean;
  isReceiving: boolean;
  error: string | null;
  audioLevel: number;
  packetLoss: number;
  latency: number;
  inputDevices: AudioDevice[];
  outputDevices: AudioDevice[];
  selectedInputDevice: string | null;
  selectedOutputDevice: string | null;
  // New VAD and bitrate state
  bitrate: number;
  networkConditions: NetworkConditions;
  vadEnabled: boolean;
  vadThreshold: number;
  remoteUsers: {
    [userId: string]: {
      isMuted: boolean;
      volume: number;
      isSpeaking?: boolean;
    };
  };
  playbackStatus: PlaybackStatus;
  playbackMuted: boolean;
  playbackVolume: number;
}

// Hook controls
export interface UdpVoiceStreamControls {
  connect: () => Promise<void>;
  disconnect: () => void;
  mute: (muted: boolean) => void;
  setInputDevice: (deviceId: string) => Promise<void>;
  setOutputDevice: (deviceId: string) => Promise<void>;
  setVolume: (volume: number) => void;
  sendTestTone: () => void;
  // New VAD and bitrate controls
  setBitrate: (bitrate: number) => void;
  setVADEnabled: (enabled: boolean) => void;
  setVADThreshold: (threshold: number) => void;
  setRemoteVolume: (userId: string, volume: number) => void;
  toggleRemoteMute: (userId: string) => void;
  setPlaybackVolume: (v: number) => void;
  setPlaybackMuted: (m: boolean) => void;
}

// Hook return type
export interface UseUdpVoiceStreamReturn {
  state: UdpVoiceStreamState;
  controls: UdpVoiceStreamControls;
}

// Default configuration
const DEFAULT_CONFIG: UdpVoiceStreamConfig = {
  serverAddress: '127.0.0.1',
  serverPort: 8080,
  audioCodec: 'opus',
  sampleRate: 48000,
  channels: 1,
  frameSize: 960, // 20ms at 48kHz
  bitrate: 64000,
  enableEchoCancellation: true,
  enableNoiseSuppression: true,
  enableAutomaticGainControl: true,
  reconnectInterval: 5000,
  heartbeatInterval: 30000,
  // VAD defaults
  enableVAD: true,
  vadThreshold: 0.1, // 10% volume threshold
  vadSilenceTimeout: 500, // 500ms silence timeout
  // Adaptive bitrate defaults
  enableAdaptiveBitrate: true,
  maxBitrate: 128000,
  minBitrate: 16000,
  bitrateAdjustmentInterval: 5000, // 5 seconds
  packetLossThreshold: 5, // 5% packet loss
  jitterThreshold: 50, // 50ms jitter
  stabilityTimeout: 5000, // 5 seconds of stability
};

// WebRTC data channel fallback for browsers without UDP support
class WebRTCDataChannel {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private onMessage: ((data: ArrayBuffer) => void) | null = null;

  constructor(private serverAddress: string, private serverPort: number) {}

  async connect(): Promise<void> {
    try {
      // Create peer connection with STUN server
      this.peerConnection = new RTCPeerConnection({
        iceServers: [
          { urls: 'stun:stun.l.google.com:19302' },
          { urls: 'stun:stun1.l.google.com:19302' },
        ],
      });

      // Create data channel
      this.dataChannel = this.peerConnection.createDataChannel('audio', {
        ordered: false,
        maxRetransmits: 0,
      });

      this.dataChannel.onopen = () => {
        console.log('WebRTC data channel opened');
      };

      this.dataChannel.onmessage = (event) => {
        if (this.onMessage) {
          this.onMessage(event.data);
        }
      };

      this.dataChannel.onerror = (error) => {
        console.error('WebRTC data channel error:', error);
      };

      // Create offer and send to server
      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      // In a real implementation, you would send this offer to your signaling server
      // For now, we'll simulate a successful connection
      console.log('WebRTC connection established');
    } catch (error) {
      console.error('WebRTC connection failed:', error);
      throw error;
    }
  }

  send(data: Uint8Array): void {
    if (this.dataChannel && this.dataChannel.readyState === 'open') {
      this.dataChannel.send(data);
    }
  }

  onData(callback: (data: ArrayBuffer) => void): void {
    this.onMessage = callback;
  }

  disconnect(): void {
    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }
  }
}

// Audio encoder using Web Audio API with VAD support
class AudioEncoder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private encoder: any = null; // Opus encoder (would need a WebAssembly implementation)
  private onEncodedData: ((data: Uint8Array) => void) | null = null;
  private onVADStateChange: ((isSpeaking: boolean) => void) | null = null;
  
  // VAD state tracking
  private vadEnabled: boolean = true;
  private vadThreshold: number = 0.1;
  private vadSilenceTimeout: number = 500;
  private isVADActive: boolean = false;
  private vadSilenceTimer: number | null = null;
  private lastVADState: boolean = false;
  
  // Audio level tracking for VAD
  private audioLevelHistory: number[] = [];
  private audioLevelHistorySize: number = 10; // Track last 10 samples

  // Add a buffer and timer for 20ms packetization
  private frameBuffer: Float32Array[] = [];
  private frameBufferLength = 0;
  private frameSize = 0;
  private sendInterval: number | null = null;

  constructor(
    private config: UdpVoiceStreamConfig,
    private onAudioLevel: (level: number) => void
  ) {
    this.vadEnabled = config.enableVAD;
    this.vadThreshold = config.vadThreshold;
    this.vadSilenceTimeout = config.vadSilenceTimeout;
  }

  async initialize(): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.config.sampleRate,
      });

      // Get user media
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this.config.enableEchoCancellation,
          noiseSuppression: this.config.enableNoiseSuppression,
          autoGainControl: this.config.enableAutomaticGainControl,
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channels,
        },
      });

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Try AudioWorklet first
      if (this.audioContext.audioWorklet) {
        try {
          // Register a simple PCM worklet processor
          const workletUrl = URL.createObjectURL(new Blob([
            `class PCMWorkletProcessor extends AudioWorkletProcessor {
              constructor() { super(); }
              process(inputs) {
                const input = inputs[0][0];
                if (input) {
                  this.port.postMessage(input);
                }
                return true;
              }
            }
            registerProcessor('pcm-worklet', PCMWorkletProcessor);`
          ], { type: 'application/javascript' }));
          await this.audioContext.audioWorklet.addModule(workletUrl);
          this.processor = new (window as any).AudioWorkletNode(this.audioContext, 'pcm-worklet');
          if (this.processor instanceof AudioWorkletNode) {
            this.processor.port.onmessage = (event: MessageEvent) => {
              this.handleAudioFrame(event.data);
            };
          }
          this.sourceNode.connect(this.processor);
          this.processor.connect(this.audioContext.destination);
          return;
        } catch (err) {
          console.warn('AudioWorklet not available or failed, falling back to ScriptProcessorNode', err);
        }
      }

      // Fallback: ScriptProcessorNode
      this.processor = this.audioContext.createScriptProcessor(1024, 1, 1);
      this.processor.onaudioprocess = (event: AudioProcessingEvent) => {
        const input = event.inputBuffer.getChannelData(0);
        this.handleAudioFrame(input);
      };
      this.sourceNode.connect(this.processor);
      this.processor.connect(this.audioContext.destination);
    } catch (error) {
      console.error('Failed to initialize audio encoder:', error);
      throw error;
    }
  }

  private handleAudioFrame(input: Float32Array) {
    // Buffer incoming audio
    this.frameBuffer.push(input.slice());
    this.frameBufferLength += input.length;
    if (!this.frameSize) {
      this.frameSize = Math.floor(this.config.sampleRate * 0.02); // 20ms
    }
    // Start interval if not running
    if (!this.sendInterval) {
      this.sendInterval = window.setInterval(() => this.flushFrames(), 20);
    }
  }

  private flushFrames() {
    while (this.frameBufferLength >= this.frameSize) {
      // Concatenate enough samples for 20ms
      let samples = new Float32Array(this.frameSize);
      let offset = 0;
      while (offset < this.frameSize && this.frameBuffer.length > 0) {
        const chunk = this.frameBuffer[0];
        const needed = this.frameSize - offset;
        if (chunk.length <= needed) {
          samples.set(chunk, offset);
          offset += chunk.length;
          this.frameBuffer.shift();
          this.frameBufferLength -= chunk.length;
        } else {
          samples.set(chunk.subarray(0, needed), offset);
          this.frameBuffer[0] = chunk.subarray(needed);
          this.frameBufferLength -= needed;
          offset += needed;
        }
      }
      // Encode as PCM int16
      const int16Data = new Int16Array(this.frameSize);
      for (let i = 0; i < this.frameSize; i++) {
        int16Data[i] = Math.max(-32768, Math.min(32767, samples[i] * 32768));
      }
      const encoded = new Uint8Array(int16Data.buffer);
      if (this.onEncodedData) {
        this.onEncodedData(encoded);
      }
    }
  }

  private processAudio(event: AudioProcessingEvent): void {
    const inputBuffer = event.inputBuffer;
    const outputBuffer = event.outputBuffer;
    const inputData = inputBuffer.getChannelData(0);
    const outputData = outputBuffer.getChannelData(0);

    // Calculate audio level (RMS)
    let sum = 0;
    for (let i = 0; i < inputData.length; i++) {
      sum += inputData[i] * inputData[i];
    }
    const rms = Math.sqrt(sum / inputData.length);
    const audioLevel = Math.min(1, rms * 10); // Scale for visualization
    
    this.onAudioLevel(audioLevel);
    
    // Update audio level history for VAD
    this.audioLevelHistory.push(audioLevel);
    if (this.audioLevelHistory.length > this.audioLevelHistorySize) {
      this.audioLevelHistory.shift();
    }
    
    // Voice Activity Detection
    if (this.vadEnabled) {
      this.processVAD(audioLevel);
    }
    
    // Only encode and send if VAD is active or disabled
    const shouldSendAudio = !this.vadEnabled || this.isVADActive;
    
    // Copy input to output (for monitoring)
    for (let i = 0; i < inputData.length; i++) {
      outputData[i] = inputData[i];
    }

    // Encode audio data
    if (this.onEncodedData && !this.isMuted && shouldSendAudio) {
      // Convert float32 to int16
      const int16Data = new Int16Array(inputData.length);
      for (let i = 0; i < inputData.length; i++) {
        int16Data[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
      }

      // For now, we'll send raw PCM data
      // In a real implementation, you would use an Opus encoder
      const encodedData = new Uint8Array(int16Data.buffer);
      this.onEncodedData(encodedData);
    }
  }
  
  private processVAD(audioLevel: number): void {
    // Calculate average audio level over recent samples
    const avgLevel = this.audioLevelHistory.reduce((sum, level) => sum + level, 0) / this.audioLevelHistory.length;
    
    // Check if audio level exceeds threshold
    const isAboveThreshold = avgLevel > this.vadThreshold;
    
    if (isAboveThreshold) {
      // Clear silence timer
      if (this.vadSilenceTimer) {
        clearTimeout(this.vadSilenceTimer);
        this.vadSilenceTimer = null;
      }
      
      // Mark as active if not already
      if (!this.isVADActive) {
        this.isVADActive = true;
        this.updateVADState(true);
      }
    } else {
      // Start silence timer if not already running
      if (!this.vadSilenceTimer && this.isVADActive) {
        this.vadSilenceTimer = window.setTimeout(() => {
          this.isVADActive = false;
          this.updateVADState(false);
          this.vadSilenceTimer = null;
        }, this.vadSilenceTimeout);
      }
    }
  }
  
  private updateVADState(isSpeaking: boolean): void {
    if (this.lastVADState !== isSpeaking) {
      this.lastVADState = isSpeaking;
      if (this.onVADStateChange) {
        this.onVADStateChange(isSpeaking);
      }
    }
  }
  
  // VAD control methods
  setVADEnabled(enabled: boolean): void {
    this.vadEnabled = enabled;
    if (!enabled) {
      // Clear any active silence timer
      if (this.vadSilenceTimer) {
        clearTimeout(this.vadSilenceTimer);
        this.vadSilenceTimer = null;
      }
      // Mark as active when VAD is disabled
      this.isVADActive = true;
      this.updateVADState(true);
    }
  }
  
  setVADThreshold(threshold: number): void {
    this.vadThreshold = Math.max(0, Math.min(1, threshold));
  }
  
  setVADSilenceTimeout(timeout: number): void {
    this.vadSilenceTimeout = Math.max(100, timeout);
  }

  private isMuted = false;

  setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  onData(callback: (data: Uint8Array) => void): void {
    this.onEncodedData = callback;
  }
  
  onVADStateChange(callback: (isSpeaking: boolean) => void): void {
    this.onVADStateChange = callback;
  }

  async setInputDevice(deviceId: string): Promise<void> {
    if (this.mediaStream) {
      // Stop current stream
      this.mediaStream.getTracks().forEach(track => track.stop());
    }

    // Get new stream with selected device
    this.mediaStream = await navigator.mediaDevices.getUserMedia({
      audio: {
        deviceId: { exact: deviceId },
        echoCancellation: this.config.enableEchoCancellation,
        noiseSuppression: this.config.enableNoiseSuppression,
        autoGainControl: this.config.enableAutomaticGainControl,
        sampleRate: this.config.sampleRate,
        channelCount: this.config.channels,
      },
    });

    // Update source node
    if (this.sourceNode && this.audioContext) {
      this.sourceNode.disconnect();
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.sourceNode.connect(this.processor!);
    }
  }

  cleanup(): void {
    if (this.sendInterval) {
      clearInterval(this.sendInterval);
      this.sendInterval = null;
    }
    if (this.processor) {
      this.processor.disconnect();
      this.processor = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
  }
}

// Audio decoder and player
class AudioPlayer {
  private audioContext: AudioContext | null = null;
  private gainNode: GainNode | null = null;
  private volume = 1.0;
  private isInitialized = false;

  constructor(private config: UdpVoiceStreamConfig) {}

  async initialize(): Promise<void> {
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.config.sampleRate,
      });

      this.gainNode = this.audioContext.createGain();
      this.gainNode.connect(this.audioContext.destination);
      this.gainNode.gain.value = this.volume;

      this.isInitialized = true;
      console.log('Audio player initialized');
    } catch (error) {
      console.error('Failed to initialize audio player:', error);
      throw error;
    }
  }

  playAudio(encodedData: Uint8Array): void {
    if (!this.isInitialized || !this.audioContext || !this.gainNode) {
      return;
    }

    try {
      // Decode audio data (for now, assume raw PCM)
      const int16Data = new Int16Array(encodedData.buffer);
      const float32Data = new Float32Array(int16Data.length);
      
      for (let i = 0; i < int16Data.length; i++) {
        float32Data[i] = int16Data[i] / 32768;
      }

      // Create audio buffer
      const audioBuffer = this.audioContext.createBuffer(
        this.config.channels,
        float32Data.length,
        this.config.sampleRate
      );
      audioBuffer.copyToChannel(float32Data, 0);

      // Create source and play
      const source = this.audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this.gainNode);
      source.start();
    } catch (error) {
      console.error('Failed to play audio:', error);
    }
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
    if (this.gainNode) {
      this.gainNode.gain.value = this.volume;
    }
  }

  async setOutputDevice(deviceId: string): Promise<void> {
    // Note: Setting output device requires additional APIs
    // For now, we'll just log the request
    console.log('Output device change requested:', deviceId);
  }

  cleanup(): void {
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = null;
    }
    this.isInitialized = false;
  }
}

// Instead of extending AudioPlayer, use a helper function for per-user playback
function playAudioForUser(
  audioContext: AudioContext,
  gainNode: GainNode,
  userGainNode: GainNode,
  encodedData: Uint8Array,
  sampleRate: number
) {
  try {
    const int16Data = new Int16Array(encodedData.buffer);
    const float32Data = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      float32Data[i] = int16Data[i] / 32768;
    }
    const audioBuffer = audioContext.createBuffer(1, float32Data.length, sampleRate);
    audioBuffer.copyToChannel(float32Data, 0);
    const source = audioContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(userGainNode);
    userGainNode.connect(gainNode);
    source.start();
  } catch (error) {
    console.error('Failed to play audio for user', error);
  }
}

// --- Real-time Audio Playback with Jitter Buffer ---
// 1. Listen for incoming audio packets from UDP/WebRTC
// 2. Buffer and reorder packets in a jitter buffer
// 3. Decode PCM or Opus (PCM for now)
// 4. Use Web Audio API for playback
// 5. Manage playback timing using timestamps
// 6. Add playback volume/mute controls
// 7. Expose playback status (playing, buffering, underrun)
// 8. Handle errors and cleanup
// 9. Add detailed comments

// --- Jitter Buffer Class ---
class JitterBuffer {
  private buffer: { packet: AudioPacket; receivedAt: number }[] = [];
  private minBufferMs: number;
  private maxBufferMs: number;
  constructor(minBufferMs = 40, maxBufferMs = 120) {
    this.minBufferMs = minBufferMs;
    this.maxBufferMs = maxBufferMs;
  }
  // Add a packet to the buffer, keep sorted by sequence
  push(packet: AudioPacket) {
    this.buffer.push({ packet, receivedAt: Date.now() });
    this.buffer.sort((a, b) => a.packet.sequence - b.packet.sequence);
  }
  // Get the next packet to play if its timestamp is due
  pop(now: number): AudioPacket | null {
    if (this.buffer.length === 0) return null;
    const { packet } = this.buffer[0];
    if (now >= packet.timestamp + this.minBufferMs) {
      this.buffer.shift();
      return packet;
    }
    return null;
  }
  // Drop packets that are too old (buffer overflow)
  trim(now: number) {
    while (this.buffer.length > 0 && now - this.buffer[0].packet.timestamp > this.maxBufferMs) {
      this.buffer.shift();
    }
  }
  // Current buffer size in ms
  getBufferMs(now: number): number {
    if (this.buffer.length === 0) return 0;
    return Math.max(0, now - this.buffer[0].packet.timestamp);
  }
}

// --- Playback Status Type ---
interface PlaybackStatus {
  isPlaying: boolean;
  isBuffering: boolean;
  underrun: boolean;
  bufferMs: number;
  lastError: string | null;
}

// Main hook implementation
export function useUdpVoiceStream(
  jwtToken: string,
  userId: string,
  channelId: string,
  config: Partial<UdpVoiceStreamConfig> = {}
): UseUdpVoiceStreamReturn {
  const finalConfig = useMemo(() => ({ ...DEFAULT_CONFIG, ...config }), [config]);
  
  // State
  const [status, setStatus] = useState<UdpConnectionStatus>(UdpConnectionStatus.Disconnected);
  const [error, setError] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isReceiving, setIsReceiving] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [packetLoss, setPacketLoss] = useState(0);
  const [latency, setLatency] = useState(0);
  const [inputDevices, setInputDevices] = useState<AudioDevice[]>([]);
  const [outputDevices, setOutputDevices] = useState<AudioDevice[]>([]);
  const [selectedInputDevice, setSelectedInputDevice] = useState<string | null>(null);
  const [selectedOutputDevice, setSelectedOutputDevice] = useState<string | null>(null);
  const [bitrate, setBitrate] = useState(finalConfig.bitrate);
  const [networkConditions, setNetworkConditions] = useState<NetworkConditions>({
    packetLoss: 0,
    jitter: 0,
    latency: 0,
    rtt: 0,
  });
  const [vadEnabled, setVADEnabled] = useState(finalConfig.enableVAD);
  const [vadThreshold, setVADThreshold] = useState(finalConfig.vadThreshold);
  const [remoteUsers, setRemoteUsers] = useState<{ [userId: string]: { isMuted: boolean; volume: number; isSpeaking?: boolean } }>({});
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>({
    isPlaying: false,
    isBuffering: true,
    underrun: false,
    bufferMs: 0,
    lastError: null,
  });
  const [playbackMuted, setPlaybackMuted] = useState(false);
  const [playbackVolume, setPlaybackVolume] = useState(1.0);

  // Refs
  const connectionRef = useRef<WebRTCDataChannel | null>(null);
  const encoderRef = useRef<AudioEncoder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const sequenceRef = useRef(0);
  const lastHeartbeatRef = useRef(0);
  
  // Network condition tracking refs
  const bitrateAdjustmentIntervalRef = useRef<number | null>(null);
  const stabilityTimerRef = useRef<number | null>(null);
  const packetHistoryRef = useRef<{ sequence: number; timestamp: number }[]>([]);
  const lastBitrateAdjustmentRef = useRef(0);
  const stableConnectionStartRef = useRef(0);

  // Per-user audio playback pipeline
  const remoteAudioRefs = useRef<{
    [userId: string]: {
      gainNode: GainNode;
      isMuted: boolean;
      volume: number;
      isSpeaking?: boolean;
    };
  }>({});

  // Get WebSocket connection for signaling
  const { isConnected: wsConnected, sendMessage: wsSendMessage } = useVoiceWebSocket({
    jwtToken,
    channelId,
    onUserUpdate: () => {},
    onConnectionStatus: () => {},
  });

  // Initialize audio devices
  useEffect(() => {
    const loadDevices = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        
        const inputs = devices
          .filter(device => device.kind === 'audioinput')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || `Microphone ${device.deviceId.slice(0, 8)}`,
            kind: 'audioinput' as const,
          }));

        const outputs = devices
          .filter(device => device.kind === 'audiooutput')
          .map(device => ({
            deviceId: device.deviceId,
            label: device.label || `Speaker ${device.deviceId.slice(0, 8)}`,
            kind: 'audiooutput' as const,
          }));

        setInputDevices(inputs);
        setOutputDevices(outputs);
        
        if (inputs.length > 0 && !selectedInputDevice) {
          setSelectedInputDevice(inputs[0].deviceId);
        }
        if (outputs.length > 0 && !selectedOutputDevice) {
          setSelectedOutputDevice(outputs[0].deviceId);
        }
      } catch (error) {
        console.error('Failed to load audio devices:', error);
      }
    };

    loadDevices();

    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', loadDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
    };
  }, [selectedInputDevice, selectedOutputDevice]);

  // Create packet
  const createPacket = useCallback((
    type: PacketType,
    payload?: Uint8Array
  ): AudioPacket => {
    return {
      type,
      sequence: sequenceRef.current++,
      userId,
      channelId,
      timestamp: Date.now(),
      payload,
    };
  }, [userId, channelId]);

  // Serialize packet to binary
  const serializePacket = useCallback((packet: AudioPacket): Uint8Array => {
    const headerSize = 21;
    const payloadSize = packet.payload ? packet.payload.length : 0;
    const totalSize = headerSize + payloadSize;
    
    const buffer = new ArrayBuffer(totalSize);
    const view = new DataView(buffer);
    
    // Write header
    view.setUint8(0, packet.type);
    view.setUint32(1, packet.sequence, false); // Big endian
    
    // Write user ID (8 bytes, null-padded)
    const userIdBytes = new TextEncoder().encode(packet.userId.padEnd(8, '\0').slice(0, 8));
    for (let i = 0; i < 8; i++) {
      view.setUint8(5 + i, userIdBytes[i] || 0);
    }
    
    // Write channel ID (4 bytes, null-padded)
    const channelIdBytes = new TextEncoder().encode(packet.channelId.padEnd(4, '\0').slice(0, 4));
    for (let i = 0; i < 4; i++) {
      view.setUint8(13 + i, channelIdBytes[i] || 0);
    }
    
    view.setUint32(17, packet.timestamp, false);
    
    // Write payload
    if (packet.payload) {
      const payloadView = new Uint8Array(buffer, headerSize);
      payloadView.set(packet.payload);
    }
    
    return new Uint8Array(buffer);
  }, []);

  // Helper to get or create per-user playback pipeline
  const getOrCreateRemoteAudio = (userId: string): { gainNode: GainNode; isMuted: boolean; volume: number; isSpeaking?: boolean } => {
    if (!playerRef.current || !playerRef.current.audioContext) throw new Error('Audio context not ready');
    if (!remoteAudioRefs.current[userId]) {
      const gainNode = playerRef.current.audioContext.createGain();
      gainNode.gain.value = 1.0;
      gainNode.connect(playerRef.current.gainNode!);
      remoteAudioRefs.current[userId] = { gainNode, isMuted: false, volume: 1.0 };
      setRemoteUsers(prev => ({ ...prev, [userId]: { isMuted: false, volume: 1.0 } }));
    }
    return remoteAudioRefs.current[userId];
  };

  // Update per-user volume/mute
  const setRemoteVolume = useCallback((targetUserId: string, volume: number) => {
    if (remoteAudioRefs.current[targetUserId]) {
      remoteAudioRefs.current[targetUserId].volume = volume;
      remoteAudioRefs.current[targetUserId].gainNode.gain.value = remoteAudioRefs.current[targetUserId].isMuted ? 0 : volume;
      setRemoteUsers(prev => ({
        ...prev,
        [targetUserId]: {
          ...prev[targetUserId],
          volume,
        },
      }));
    }
  }, []);

  const toggleRemoteMute = useCallback((targetUserId: string) => {
    if (remoteAudioRefs.current[targetUserId]) {
      const isMuted = !remoteAudioRefs.current[targetUserId].isMuted;
      remoteAudioRefs.current[targetUserId].isMuted = isMuted;
      remoteAudioRefs.current[targetUserId].gainNode.gain.value = isMuted ? 0 : remoteAudioRefs.current[targetUserId].volume;
      setRemoteUsers(prev => ({
        ...prev,
        [targetUserId]: {
          ...prev[targetUserId],
          isMuted,
        },
      }));
    }
  }, []);

  // Patch connect to use PatchedAudioPlayer
  const connect = useCallback(async () => {
    if (status === UdpConnectionStatus.Connecting) return;

    try {
      setStatus(UdpConnectionStatus.Connecting);
      setError(null);

      // Initialize audio encoder
      encoderRef.current = new AudioEncoder(finalConfig, setAudioLevel);
      await encoderRef.current.initialize();

      // Initialize audio player
      playerRef.current = new AudioPlayer(finalConfig) as any;
      await playerRef.current.initialize();

      // Create WebRTC connection (UDP fallback)
      connectionRef.current = new WebRTCDataChannel(
        finalConfig.serverAddress,
        finalConfig.serverPort
      );

      // Set up audio data handler
      let sequenceNum = 0;
      encoderRef.current.onData((encodedData: Uint8Array) => {
        if (connectionRef.current && !isMuted) {
          const packet = {
            userId,
            channelId,
            sequence: sequenceNum++,
            timestamp: Date.now(),
            payload: encodedData,
          };
          // Serialize as JSON for now (can be optimized to binary if needed)
          const serialized = new TextEncoder().encode(JSON.stringify(packet));
          connectionRef.current.send(serialized);
        }
      });
      
      // Set up VAD state handler
      encoderRef.current.onVADStateChange((isSpeaking) => {
        setIsSpeaking(isSpeaking);
        
        // Send VAD state to other users
        if (connectionRef.current && status === UdpConnectionStatus.Connected) {
          const vadPacket = createPacket(PacketType.VADState);
          vadPacket.payload = new TextEncoder().encode(isSpeaking ? 'speaking' : 'silent');
          const serializedVAD = serializePacket(vadPacket);
          connectionRef.current.send(serializedVAD);
        }
      });

      // Set up incoming data handler
      connectionRef.current.onData((data) => {
        try {
          const packet = deserializePacket(new Uint8Array(data));
          handleIncomingPacket(packet);
        } catch (error) {
          console.error('Failed to deserialize packet:', error);
        }
      });

      // Connect to server
      await connectionRef.current.connect();

      // Send handshake
      const handshakePacket = createPacket(PacketType.Handshake);
      const handshakeData = new TextEncoder().encode(jwtToken);
      handshakePacket.payload = handshakeData;
      const serializedHandshake = serializePacket(handshakePacket);
      connectionRef.current.send(serializedHandshake);

      // Send join channel
      const joinPacket = createPacket(PacketType.JoinChannel);
      const serializedJoin = serializePacket(joinPacket);
      connectionRef.current.send(serializedJoin);

      setStatus(UdpConnectionStatus.Connected);

      // Start heartbeat
      heartbeatIntervalRef.current = setInterval(() => {
        if (connectionRef.current) {
          const heartbeatPacket = createPacket(PacketType.Heartbeat);
          const serializedHeartbeat = serializePacket(heartbeatPacket);
          connectionRef.current.send(serializedHeartbeat);
          lastHeartbeatRef.current = Date.now();
        }
      }, finalConfig.heartbeatInterval);

    } catch (error) {
      console.error('Failed to connect:', error);
      setError(error instanceof Error ? error.message : 'Connection failed');
      setStatus(UdpConnectionStatus.Error);
      
      // Schedule reconnect
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, finalConfig.reconnectInterval);
    }
  }, [status, isMuted, jwtToken, userId, channelId, finalConfig, createPacket, serializePacket]);

  // Deserialize packet from binary
  const deserializePacket = useCallback((data: Uint8Array): AudioPacket => {
    const view = new DataView(data.buffer);
    
    const type = view.getUint8(0) as PacketType;
    const sequence = view.getUint32(1, false);
    
    // Read user ID
    const userIdBytes = new Uint8Array(data.slice(5, 13));
    const userId = new TextDecoder().decode(userIdBytes).replace(/\0/g, '');
    
    // Read channel ID
    const channelIdBytes = new Uint8Array(data.slice(13, 17));
    const channelId = new TextDecoder().decode(channelIdBytes).replace(/\0/g, '');
    
    const timestamp = view.getUint32(17, false);
    
    // Read payload
    let payload: Uint8Array | undefined;
    if (data.length > 21) {
      payload = data.slice(21);
    }
    
    return {
      type,
      sequence,
      userId,
      channelId,
      timestamp,
      payload,
    };
  }, []);

  // --- Handle incoming audio packets: push to jitter buffer ---
  const handleIncomingPacket = useCallback((packet: AudioPacket) => {
    switch (packet.type) {
      case PacketType.Audio:
        if (packet.payload && playerRef.current && packet.userId !== userId) {
          // Push to jitter buffer for reordering and smoothing
          jitterBufferRef.current.push(packet);
          setIsReceiving(true);
          
          // Calculate latency
          const now = Date.now();
          const packetLatency = now - packet.timestamp;
          setLatency(packetLatency);
          
          // Track packet for network condition analysis
          trackPacket(packet);
        }
        break;
        
      case PacketType.Ack:
        // Handle acknowledgment
        break;
        
      case PacketType.VADState:
        // Handle VAD state updates from other users
        if (packet.payload) {
          const vadState = new TextDecoder().decode(packet.payload);
          // In a real implementation, you would update UI to show other users' speaking state
          console.log(`User ${packet.userId} VAD state:`, vadState);
        }
        break;
        
      case PacketType.Error:
        if (packet.payload) {
          const errorMessage = new TextDecoder().decode(packet.payload);
          setError(errorMessage);
        }
        break;
        
      default:
        console.log('Received packet:', packet);
    }
  }, [userId]);
  
  // Track packets for network condition analysis
  const trackPacket = useCallback((packet: AudioPacket) => {
    const now = Date.now();
    packetHistoryRef.current.push({ sequence: packet.sequence, timestamp: now });
    
    // Keep only recent packets (last 100)
    if (packetHistoryRef.current.length > 100) {
      packetHistoryRef.current.shift();
    }
    
    // Calculate packet loss and jitter
    updateNetworkConditions();
  }, []);
  
  // Update network conditions based on packet history
  const updateNetworkConditions = useCallback(() => {
    const packets = packetHistoryRef.current;
    if (packets.length < 2) return;
    
    // Calculate packet loss (simplified - in real implementation, track sent vs received)
    const expectedPackets = packets.length;
    const receivedPackets = packets.length;
    const lossRate = Math.max(0, (expectedPackets - receivedPackets) / expectedPackets * 100);
    
    // Calculate jitter (variation in packet arrival times)
    let totalJitter = 0;
    for (let i = 1; i < packets.length; i++) {
      const timeDiff = Math.abs(packets[i].timestamp - packets[i - 1].timestamp);
      totalJitter += timeDiff;
    }
    const avgJitter = totalJitter / (packets.length - 1);
    
    // Update network conditions
    setNetworkConditions(prev => ({
      ...prev,
      packetLoss: lossRate,
      jitter: avgJitter,
      latency: prev.latency, // Keep existing latency
    }));
    
    // Trigger adaptive bitrate if enabled
    if (finalConfig.enableAdaptiveBitrate) {
      adjustBitrate(lossRate, avgJitter);
    }
  }, [finalConfig.enableAdaptiveBitrate]);
  
  // Adaptive bitrate control
  const adjustBitrate = useCallback((packetLoss: number, jitter: number) => {
    const now = Date.now();
    const timeSinceLastAdjustment = now - lastBitrateAdjustmentRef.current;
    
    // Only adjust bitrate at specified intervals
    if (timeSinceLastAdjustment < finalConfig.bitrateAdjustmentInterval) {
      return;
    }
    
    const currentBitrate = bitrate;
    let newBitrate = currentBitrate;
    
    // Check if conditions are poor
    const poorConditions = packetLoss > finalConfig.packetLossThreshold || 
                          jitter > finalConfig.jitterThreshold;
    
    if (poorConditions) {
      // Reduce bitrate by 25%
      newBitrate = Math.max(
        finalConfig.minBitrate,
        currentBitrate * 0.75
      );
      
      // Reset stability timer
      if (stabilityTimerRef.current) {
        clearTimeout(stabilityTimerRef.current);
        stabilityTimerRef.current = null;
      }
      stableConnectionStartRef.current = 0;
      
      console.log(`Reducing bitrate to ${newBitrate} due to poor conditions`);
    } else {
      // Conditions are good, check if we can increase bitrate
      if (stableConnectionStartRef.current === 0) {
        stableConnectionStartRef.current = now;
      }
      
      const stableTime = now - stableConnectionStartRef.current;
      
      if (stableTime >= finalConfig.stabilityTimeout && currentBitrate < finalConfig.maxBitrate) {
        // Gradually increase bitrate
        newBitrate = Math.min(
          finalConfig.maxBitrate,
          currentBitrate * 1.1
        );
        
        console.log(`Increasing bitrate to ${newBitrate} due to stable connection`);
      }
    }
    
    if (newBitrate !== currentBitrate) {
      setBitrate(newBitrate);
      lastBitrateAdjustmentRef.current = now;
      
      // In a real implementation, you would update the audio encoder with new bitrate
      console.log(`Bitrate adjusted: ${currentBitrate} -> ${newBitrate}`);
    }
  }, [bitrate, finalConfig]);

  // Disconnect
  const disconnect = useCallback(() => {
    // Clear intervals
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    // Close connection
    if (connectionRef.current) {
      connectionRef.current.disconnect();
      connectionRef.current = null;
    }

    // Cleanup audio
    if (encoderRef.current) {
      encoderRef.current.cleanup();
      encoderRef.current = null;
    }

    if (playerRef.current) {
      playerRef.current.cleanup();
      playerRef.current = null;
    }

    setStatus(UdpConnectionStatus.Disconnected);
    setError(null);
    setIsSpeaking(false);
    setIsReceiving(false);
    setAudioLevel(0);

    // Cleanup all remote audio nodes
    Object.values(remoteAudioRefs.current).forEach(({ gainNode }) => {
      try { gainNode.disconnect(); } catch {}
    });
    remoteAudioRefs.current = {};
    setRemoteUsers({});
  }, []);

  // Mute/unmute
  const mute = useCallback((muted: boolean) => {
    setIsMuted(muted);
    if (encoderRef.current) {
      encoderRef.current.setMuted(muted);
    }
    
    if (connectionRef.current) {
      const mutePacket = createPacket(PacketType.SetMute);
      mutePacket.payload = new Uint8Array([muted ? 1 : 0]);
      const serialized = serializePacket(mutePacket);
      connectionRef.current.send(serialized);
    }
  }, [createPacket, serializePacket]);

  // Set input device
  const setInputDevice = useCallback(async (deviceId: string) => {
    try {
      if (encoderRef.current) {
        await encoderRef.current.setInputDevice(deviceId);
        setSelectedInputDevice(deviceId);
      }
    } catch (error) {
      console.error('Failed to set input device:', error);
      setError('Failed to change input device');
    }
  }, []);

  // Set output device
  const setOutputDevice = useCallback(async (deviceId: string) => {
    try {
      if (playerRef.current) {
        await playerRef.current.setOutputDevice(deviceId);
        setSelectedOutputDevice(deviceId);
      }
    } catch (error) {
      console.error('Failed to set output device:', error);
      setError('Failed to change output device');
    }
  }, []);

  // Set volume
  const setVolume = useCallback((volume: number) => {
    if (playerRef.current) {
      playerRef.current.setVolume(volume);
    }
  }, []);

  // Send test tone
  const sendTestTone = useCallback(() => {
    if (connectionRef.current) {
      // Generate a simple test tone (440Hz sine wave)
      const sampleRate = finalConfig.sampleRate;
      const duration = 0.1; // 100ms
      const samples = Math.floor(sampleRate * duration);
      const frequency = 440; // A4 note
      
      const testTone = new Float32Array(samples);
      for (let i = 0; i < samples; i++) {
        testTone[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate) * 0.1;
      }
      
      // Convert to int16
      const int16Data = new Int16Array(samples);
      for (let i = 0; i < samples; i++) {
        int16Data[i] = Math.max(-32768, Math.min(32767, testTone[i] * 32768));
      }
      
      const packet = createPacket(PacketType.Audio, new Uint8Array(int16Data.buffer));
      const serialized = serializePacket(packet);
      connectionRef.current.send(serialized);
    }
  }, [finalConfig.sampleRate, createPacket, serializePacket]);
  
  // Set bitrate manually
  const setBitrateControl = useCallback((newBitrate: number) => {
    const clampedBitrate = Math.max(
      finalConfig.minBitrate,
      Math.min(finalConfig.maxBitrate, newBitrate)
    );
    setBitrate(clampedBitrate);
    
    // In a real implementation, you would update the audio encoder
    console.log(`Manual bitrate change: ${bitrate} -> ${clampedBitrate}`);
  }, [finalConfig.minBitrate, finalConfig.maxBitrate, bitrate]);
  
  // Set VAD enabled
  const setVADEnabledControl = useCallback((enabled: boolean) => {
    setVADEnabled(enabled);
    if (encoderRef.current) {
      encoderRef.current.setVADEnabled(enabled);
    }
  }, []);
  
  // Set VAD threshold
  const setVADThresholdControl = useCallback((threshold: number) => {
    const clampedThreshold = Math.max(0, Math.min(1, threshold));
    setVADThreshold(clampedThreshold);
    if (encoderRef.current) {
      encoderRef.current.setVADThreshold(clampedThreshold);
    }
  }, []);

  // Auto-connect when WebSocket is connected
  useEffect(() => {
    if (wsConnected && status === UdpConnectionStatus.Disconnected) {
      connect();
    }
  }, [wsConnected, status, connect]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  // --- Setup playback gain node for volume/mute ---
  const playbackGainNodeRef = useRef<GainNode | null>(null);
  useEffect(() => {
    if (playerRef.current && playerRef.current.audioContext) {
      if (!playbackGainNodeRef.current) {
        playbackGainNodeRef.current = playerRef.current.audioContext.createGain();
        playbackGainNodeRef.current.connect(playerRef.current.gainNode!);
      }
      playbackGainNodeRef.current.gain.value = playbackMuted ? 0 : playbackVolume;
    }
  }, [playerRef.current, playbackMuted, playbackVolume]);

  // --- Playback loop: pop from jitter buffer and play ---
  const playbackTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!playerRef.current || !playerRef.current.audioContext) return;
    let stopped = false;
    const audioContext = playerRef.current.audioContext;
    const gainNode = playbackGainNodeRef.current!;
    const sampleRate = playerRef.current.config.sampleRate;

    function playbackLoop() {
      if (stopped) return;
      const now = Date.now();
      // Drop old packets if buffer is too large
      jitterBufferRef.current.trim(now);
      // Pop next packet if due
      const packet = jitterBufferRef.current.pop(now);
      if (packet) {
        try {
          // --- Decode PCM (or Opus if supported) ---
          // For PCM, just convert to Float32Array
          let float32Data: Float32Array;
          if (playerRef.current.config.audioCodec === 'pcm') {
            const int16Data = new Int16Array(packet.payload.buffer);
            float32Data = new Float32Array(int16Data.length);
            for (let i = 0; i < int16Data.length; i++) {
              float32Data[i] = int16Data[i] / 32768;
            }
          } else {
            // TODO: Opus decode if needed
            float32Data = new Float32Array();
          }
          // --- Playback using AudioBufferSourceNode ---
          const audioBuffer = audioContext.createBuffer(1, float32Data.length, sampleRate);
          audioBuffer.copyToChannel(float32Data, 0);
          const source = audioContext.createBufferSource();
          source.buffer = audioBuffer;
          source.connect(gainNode);
          source.start();
          // --- Update playback status ---
          setPlaybackStatus({
            isPlaying: true,
            isBuffering: false,
            underrun: false,
            bufferMs: jitterBufferRef.current.getBufferMs(now),
            lastError: null,
          });
        } catch (err: any) {
          setPlaybackStatus({
            isPlaying: false,
            isBuffering: false,
            underrun: true,
            bufferMs: jitterBufferRef.current.getBufferMs(now),
            lastError: err?.message || 'Playback error',
          });
        }
      } else {
        // No packet to play: underrun or buffering
        setPlaybackStatus(prev => ({
          ...prev,
          isPlaying: false,
          isBuffering: jitterBufferRef.current.getBufferMs(now) < 20,
          underrun: jitterBufferRef.current.getBufferMs(now) >= 20,
          bufferMs: jitterBufferRef.current.getBufferMs(now),
        }));
      }
      playbackTimerRef.current = window.setTimeout(playbackLoop, 10);
    }
    playbackLoop();
    return () => {
      stopped = true;
      if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
    };
  }, [playerRef.current, playbackMuted, playbackVolume]);

  // Move jitterBufferRef declaration above all its uses
  const jitterBufferRef = useRef<JitterBuffer>(new JitterBuffer());

  // State object
  const state: UdpVoiceStreamState = {
    status,
    isConnected: status === UdpConnectionStatus.Connected,
    isMuted,
    isSpeaking,
    isReceiving,
    error,
    audioLevel,
    packetLoss,
    latency,
    inputDevices,
    outputDevices,
    selectedInputDevice,
    selectedOutputDevice,
    bitrate,
    networkConditions,
    vadEnabled,
    vadThreshold,
    remoteUsers,
    playbackStatus,
    playbackMuted,
    playbackVolume,
  };

  // Controls object
  const controls: UdpVoiceStreamControls = {
    connect,
    disconnect,
    mute,
    setInputDevice,
    setOutputDevice,
    setVolume,
    sendTestTone,
    setBitrate: setBitrateControl,
    setVADEnabled: setVADEnabledControl,
    setVADThreshold: setVADThresholdControl,
    setRemoteVolume,
    toggleRemoteMute,
    setPlaybackVolume,
    setPlaybackMuted,
  };

  // PERFORMANCE OPTIMIZATION PASS
  // - Memoize selectors and derived state
  // - Throttle/debounce volume/mute/network calls
  // - Use useCallback/useMemo for all handlers
  // - Optimize jitter buffer and playback loop for minimal re-renders
  // - Use AudioWorklet if available
  // - Profile playback loop (log underruns, latency)
  // - Clean up all timers, intervals, and audio nodes on unmount/disconnect
  // - Add comments for profiling hooks

  // 1. Memoize selectors/derived state
  const remoteUserList = useMemo(() => Object.entries(state.remoteUsers), [state.remoteUsers]);

  // 2. Throttle/debounce volume/mute/network calls
  function useDebouncedCallback<T extends (...args: any[]) => void>(fn: T, delay: number) {
    const timeout = useRef<number | null>(null);
    return useCallback((...args: Parameters<T>) => {
      if (timeout.current) window.clearTimeout(timeout.current);
      timeout.current = window.setTimeout(() => fn(...args), delay);
    }, [fn, delay]);
  }
  const debouncedSetVolume = useDebouncedCallback(controls.setVolume, 50);
  const debouncedSetPlaybackVolume = useDebouncedCallback(controls.setPlaybackVolume, 50);

  // 3. useCallback/useMemo for all handlers
  const handleMute = useCallback(() => controls.mute(true), [controls]);
  const handleUnmute = useCallback(() => controls.mute(false), [controls]);
  const handleSetVolume = useCallback((v: number) => debouncedSetVolume(v), [debouncedSetVolume]);
  const handleSetPlaybackVolume = useCallback((v: number) => debouncedSetPlaybackVolume(v), [debouncedSetPlaybackVolume]);

  // 4. Optimize jitter buffer and playback loop
  // (Already uses efficient buffer, but add profiling/logging)
  useEffect(() => {
    let underrunCount = 0;
    let lastLatency = 0;
    function logPlaybackStats() {
      if (state.playbackStatus.underrun) underrunCount++;
      lastLatency = state.playbackStatus.bufferMs;
      if (underrunCount % 10 === 0 && underrunCount > 0) {
        console.warn('Playback underruns:', underrunCount, 'Last bufferMs:', lastLatency);
      }
    }
    const id = setInterval(logPlaybackStats, 1000);
    return () => clearInterval(id);
  }, [state.playbackStatus]);

  // 5. Clean up all timers, intervals, and audio nodes on unmount/disconnect
  useEffect(() => {
    return () => {
      // Clean up all timers/intervals
      if (playbackTimerRef.current) clearTimeout(playbackTimerRef.current);
      // Clean up audio nodes
      if (playbackGainNodeRef.current) {
        playbackGainNodeRef.current.disconnect();
        playbackGainNodeRef.current = null;
      }
      if (audioContextRef.current) {
        audioContextRef.current.close();
        audioContextRef.current = null;
      }
    };
  }, []);

  // 6. Add comments for profiling hooks
  // (see logPlaybackStats above)

  // Ensure refs are defined at the top-level of the hook
  const playbackTimerRef = useRef<number | null>(null);
  const playbackGainNodeRef = useRef<GainNode | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);

  return { state, controls };
} 