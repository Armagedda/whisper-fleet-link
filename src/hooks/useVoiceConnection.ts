import { useState, useEffect, useRef, useCallback } from 'react';

export interface VoiceConnectionState {
  isConnected: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isSpeaking: boolean;
  currentChannel: string | null;
  connectionQuality: 'excellent' | 'good' | 'poor' | 'disconnected';
}

export interface VoiceUser {
  id: string;
  username: string;
  isSpeaking: boolean;
  isMuted: boolean;
  isDeafened: boolean;
  isOnline: boolean;
  channelId: string | null;
}

interface VoiceConnectionConfig {
  serverUrl: string;
  token: string;
  onUserJoined?: (user: VoiceUser) => void;
  onUserLeft?: (userId: string) => void;
  onUserStateChanged?: (user: VoiceUser) => void;
  onChannelChanged?: (channelId: string | null) => void;
}

export const useVoiceConnection = (config: VoiceConnectionConfig) => {
  const [state, setState] = useState<VoiceConnectionState>({
    isConnected: false,
    isMuted: false,
    isDeafened: false,
    isSpeaking: false,
    currentChannel: null,
    connectionQuality: 'disconnected'
  });

  const [users, setUsers] = useState<VoiceUser[]>([]);
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const speakingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize audio context and mic access
  const initializeAudio = useCallback(async () => {
    try {
      // Request microphone access
      const stream = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          sampleRate: 48000
        } 
      });
      
      mediaStreamRef.current = stream;

      // Create audio context for voice activity detection
      audioContextRef.current = new AudioContext({ sampleRate: 48000 });
      const source = audioContextRef.current.createMediaStreamSource(stream);
      
      analyserRef.current = audioContextRef.current.createAnalyser();
      analyserRef.current.fftSize = 256;
      analyserRef.current.smoothingTimeConstant = 0.8;
      
      source.connect(analyserRef.current);

      // Start voice activity detection
      startVoiceDetection();
      
      return true;
    } catch (err) {
      setError('Microphone access denied');
      return false;
    }
  }, []);

  // Voice activity detection
  const startVoiceDetection = useCallback(() => {
    if (!analyserRef.current) return;

    const bufferLength = analyserRef.current.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);

    const detectSpeaking = () => {
      if (!analyserRef.current || state.isMuted || state.isDeafened) {
        setState(prev => ({ ...prev, isSpeaking: false }));
        requestAnimationFrame(detectSpeaking);
        return;
      }

      analyserRef.current.getByteFrequencyData(dataArray);
      
      // Calculate volume level
      const volume = dataArray.reduce((sum, value) => sum + value, 0) / bufferLength;
      const isSpeaking = volume > 20; // Threshold for voice detection

      setState(prev => {
        if (prev.isSpeaking !== isSpeaking) {
          return { ...prev, isSpeaking };
        }
        return prev;
      });

      // Clear speaking timeout and set new one
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }

      if (isSpeaking) {
        speakingTimeoutRef.current = setTimeout(() => {
          setState(prev => ({ ...prev, isSpeaking: false }));
        }, 500);
      }

      requestAnimationFrame(detectSpeaking);
    };

    detectSpeaking();
  }, [state.isMuted, state.isDeafened]);

  // WebSocket connection management
  const connect = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    try {
      const audioReady = await initializeAudio();
      if (!audioReady) return;

      const wsUrl = `ws://${config.serverUrl}/ws?token=${config.token}`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setState(prev => ({ 
          ...prev, 
          isConnected: true, 
          connectionQuality: 'excellent' 
        }));
        setError(null);
      };

      wsRef.current.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleWebSocketMessage(message);
        } catch (err) {
          console.error('Failed to parse WebSocket message:', err);
        }
      };

      wsRef.current.onerror = () => {
        setError('Connection failed');
        setState(prev => ({ 
          ...prev, 
          isConnected: false, 
          connectionQuality: 'disconnected' 
        }));
      };

      wsRef.current.onclose = () => {
        setState(prev => ({ 
          ...prev, 
          isConnected: false, 
          connectionQuality: 'disconnected',
          currentChannel: null
        }));
        
        // Attempt to reconnect after 3 seconds
        setTimeout(() => {
          if (wsRef.current?.readyState !== WebSocket.OPEN) {
            connect();
          }
        }, 3000);
      };

    } catch (err) {
      setError('Failed to connect to server');
    }
  }, [config.serverUrl, config.token, initializeAudio]);

  // Handle incoming WebSocket messages
  const handleWebSocketMessage = useCallback((message: any) => {
    switch (message.type) {
      case 'user_joined':
        const newUser: VoiceUser = message.user;
        setUsers(prev => [...prev.filter(u => u.id !== newUser.id), newUser]);
        config.onUserJoined?.(newUser);
        break;

      case 'user_left':
        setUsers(prev => prev.filter(u => u.id !== message.userId));
        config.onUserLeft?.(message.userId);
        break;

      case 'user_state_changed':
        const updatedUser: VoiceUser = message.user;
        setUsers(prev => prev.map(u => u.id === updatedUser.id ? updatedUser : u));
        config.onUserStateChanged?.(updatedUser);
        break;

      case 'channel_users':
        setUsers(message.users);
        break;

      case 'voice_data':
        // Handle incoming voice data - this would connect to your Opus decoder
        handleIncomingVoiceData(message);
        break;

      default:
        console.log('Unknown message type:', message.type);
    }
  }, [config]);

  // Handle incoming voice data (placeholder for Opus decoding)
  const handleIncomingVoiceData = useCallback((message: any) => {
    // This is where you'd integrate with your Opus decoder WASM module
    // For now, we'll just log that we received voice data
    console.log('Received voice data from user:', message.userId);
  }, []);

  // Send voice data to server
  const sendVoiceData = useCallback((audioData: ArrayBuffer) => {
    if (wsRef.current?.readyState === WebSocket.OPEN && !state.isMuted) {
      // This is where you'd encode with Opus before sending
      wsRef.current.send(JSON.stringify({
        type: 'voice_data',
        data: Array.from(new Uint8Array(audioData)),
        channelId: state.currentChannel
      }));
    }
  }, [state.isMuted, state.currentChannel]);

  // Voice control methods
  const toggleMute = useCallback(() => {
    setState(prev => {
      const newMuted = !prev.isMuted;
      
      // Send state update to server
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'user_state_update',
          isMuted: newMuted
        }));
      }
      
      return { ...prev, isMuted: newMuted, isSpeaking: newMuted ? false : prev.isSpeaking };
    });
  }, []);

  const toggleDeafen = useCallback(() => {
    setState(prev => {
      const newDeafened = !prev.isDeafened;
      
      // Send state update to server
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({
          type: 'user_state_update',
          isDeafened: newDeafened,
          isMuted: newDeafened || prev.isMuted // Deafening also mutes
        }));
      }
      
      return { 
        ...prev, 
        isDeafened: newDeafened,
        isMuted: newDeafened || prev.isMuted,
        isSpeaking: false
      };
    });
  }, []);

  const joinChannel = useCallback((channelId: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'join_channel',
        channelId
      }));
      
      setState(prev => ({ ...prev, currentChannel: channelId }));
      config.onChannelChanged?.(channelId);
    }
  }, [config]);

  const leaveChannel = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && state.currentChannel) {
      wsRef.current.send(JSON.stringify({
        type: 'leave_channel',
        channelId: state.currentChannel
      }));
      
      setState(prev => ({ ...prev, currentChannel: null }));
      config.onChannelChanged?.(null);
    }
  }, [state.currentChannel, config]);

  const disconnect = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }
    
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    
    setState({
      isConnected: false,
      isMuted: false,
      isDeafened: false,
      isSpeaking: false,
      currentChannel: null,
      connectionQuality: 'disconnected'
    });
    
    setUsers([]);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
      if (speakingTimeoutRef.current) {
        clearTimeout(speakingTimeoutRef.current);
      }
    };
  }, [disconnect]);

  return {
    state,
    users,
    error,
    connect,
    disconnect,
    toggleMute,
    toggleDeafen,
    joinChannel,
    leaveChannel,
    sendVoiceData
  };
};