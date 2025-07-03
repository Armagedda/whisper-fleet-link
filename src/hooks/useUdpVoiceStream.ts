import { useCallback, useEffect, useRef, useState, useMemo } from 'react';
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

// Audio encoder using Web Audio API
class AudioEncoder {
  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processor: ScriptProcessorNode | null = null;
  private encoder: any = null; // Opus encoder (would need a WebAssembly implementation)
  private onEncodedData: ((data: Uint8Array) => void) | null = null;

  constructor(
    private config: UdpVoiceStreamConfig,
    private onAudioLevel: (level: number) => void
  ) {}

  async initialize(): Promise<void> {
    try {
      // Create audio context
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)({
        sampleRate: this.config.sampleRate,
      });

      // Get microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: this.config.enableEchoCancellation,
          noiseSuppression: this.config.enableNoiseSuppression,
          autoGainControl: this.config.enableAutomaticGainControl,
          sampleRate: this.config.sampleRate,
          channelCount: this.config.channels,
        },
      });

      // Create audio source
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // Create audio processor for encoding
      this.processor = this.audioContext.createScriptProcessor(
        this.config.frameSize,
        this.config.channels,
        this.config.channels
      );

      this.processor.onaudioprocess = (event) => {
        this.processAudio(event);
      };

      // Connect audio nodes
      this.sourceNode.connect(this.processor);
      this.processor.connect(this.audioContext.destination);

      console.log('Audio encoder initialized');
    } catch (error) {
      console.error('Failed to initialize audio encoder:', error);
      throw error;
    }
  }

  private processAudio(event: AudioProcessingEvent): void {
    const inputBuffer = event.inputBuffer;
    const outputBuffer = event.outputBuffer;
    const inputData = inputBuffer.getChannelData(0);
    const outputData = outputBuffer.getChannelData(0);

    // Calculate audio level
    let sum = 0;
    for (let i = 0; i < inputData.length; i++) {
      sum += inputData[i] * inputData[i];
    }
    const rms = Math.sqrt(sum / inputData.length);
    const level = Math.min(1, rms * 10); // Scale for visualization
    this.onAudioLevel(level);

    // Copy input to output (for monitoring)
    for (let i = 0; i < inputData.length; i++) {
      outputData[i] = inputData[i];
    }

    // Encode audio data
    if (this.onEncodedData && !this.isMuted) {
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

  private isMuted = false;

  setMuted(muted: boolean): void {
    this.isMuted = muted;
  }

  onData(callback: (data: Uint8Array) => void): void {
    this.onEncodedData = callback;
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

  // Refs
  const connectionRef = useRef<WebRTCDataChannel | null>(null);
  const encoderRef = useRef<AudioEncoder | null>(null);
  const playerRef = useRef<AudioPlayer | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const heartbeatIntervalRef = useRef<number | null>(null);
  const sequenceRef = useRef(0);
  const lastHeartbeatRef = useRef(0);

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

  // Connect to UDP server
  const connect = useCallback(async () => {
    if (status === UdpConnectionStatus.Connecting) return;

    try {
      setStatus(UdpConnectionStatus.Connecting);
      setError(null);

      // Initialize audio encoder
      encoderRef.current = new AudioEncoder(finalConfig, setAudioLevel);
      await encoderRef.current.initialize();

      // Initialize audio player
      playerRef.current = new AudioPlayer(finalConfig);
      await playerRef.current.initialize();

      // Create WebRTC connection (UDP fallback)
      connectionRef.current = new WebRTCDataChannel(
        finalConfig.serverAddress,
        finalConfig.serverPort
      );

      // Set up audio data handler
      encoderRef.current.onData((encodedData) => {
        if (connectionRef.current && !isMuted) {
          const packet = createPacket(PacketType.Audio, encodedData);
          const serialized = serializePacket(packet);
          connectionRef.current.send(serialized);
          setIsSpeaking(true);
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

  // Handle incoming packet
  const handleIncomingPacket = useCallback((packet: AudioPacket) => {
    switch (packet.type) {
      case PacketType.Audio:
        if (packet.payload && playerRef.current && packet.userId !== userId) {
          playerRef.current.playAudio(packet.payload);
          setIsReceiving(true);
          
          // Calculate latency
          const now = Date.now();
          const packetLatency = now - packet.timestamp;
          setLatency(packetLatency);
        }
        break;
        
      case PacketType.Ack:
        // Handle acknowledgment
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
  };

  return { state, controls };
} 