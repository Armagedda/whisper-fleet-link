import { useState, useEffect, useRef, useCallback } from 'react';

/*
Usage Example:
```tsx
import useVoiceWebSocket, { UserState, ConnectionStatus } from '@/hooks/useVoiceWebSocket';

function VoiceComponent() {
  const [users, setUsers] = useState<UserState[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('closed');
  
  const handleUserUpdate = (userState: UserState) => {
    setUsers(prev => {
      const existing = prev.find(u => u.user_id === userState.user_id);
      if (existing) {
        return prev.map(u => u.user_id === userState.user_id ? userState : u);
      } else {
        return [...prev, userState];
      }
    });
  };
  
  const handleConnectionStatus = (status: ConnectionStatus) => {
    setConnectionStatus(status);
  };
  
  const { sendMessage, isConnected, error } = useVoiceWebSocket({
    jwtToken: 'your-jwt-token',
    channelId: 'channel-123',
    onUserUpdate: handleUserUpdate,
    onConnectionStatus: handleConnectionStatus,
  });
  
  const handleMute = () => {
    sendMessage({ type: 'mute' });
  };
  
  const handleUnmute = () => {
    sendMessage({ type: 'unmute' });
  };
  
  return (
    <div>
      <div>Status: {connectionStatus}</div>
      {error && <div>Error: {error}</div>}
      <button onClick={handleMute} disabled={!isConnected}>Mute</button>
      <button onClick={handleUnmute} disabled={!isConnected}>Unmute</button>
      <div>
        Users in channel: {users.map(user => (
          <div key={user.user_id}>
            {user.username} - {user.is_muted ? 'Muted' : 'Unmuted'}
          </div>
        ))}
      </div>
    </div>
  );
}
```
*/

// WebSocket message types matching the backend
export interface WsMessage {
  type: string;
  [key: string]: any;
}

export interface UserState {
  user_id: string;
  username: string;
  is_muted: boolean;
  is_speaking: boolean;
}

export interface ChannelInfo {
  channel_id: string;
  users: UserState[];
}

export interface UserJoinedMessage extends WsMessage {
  type: 'user_joined';
  user_id: string;
  username: string;
  is_muted: boolean;
}

export interface UserLeftMessage extends WsMessage {
  type: 'user_left';
  user_id: string;
}

export interface UserStateUpdateMessage extends WsMessage {
  type: 'user_state_update';
  user_id: string;
  is_muted: boolean;
}

export interface ChannelInfoMessage extends WsMessage {
  type: 'channel_info';
  channel_id: string;
  users: UserState[];
}

export interface ErrorMessage extends WsMessage {
  type: 'error';
  message: string;
}

export type ConnectionStatus = 'connecting' | 'open' | 'closed' | 'error';

export interface UseVoiceWebSocketConfig {
  jwtToken: string;
  channelId: string | null;
  onUserUpdate: (userState: UserState) => void;
  onConnectionStatus: (status: ConnectionStatus) => void;
}

export interface UseVoiceWebSocketReturn {
  connectionStatus: ConnectionStatus;
  sendMessage: (message: WsMessage) => void;
  isConnected: boolean;
  error: string | null;
}

const useVoiceWebSocket = ({
  jwtToken,
  channelId,
  onUserUpdate,
  onConnectionStatus,
}: UseVoiceWebSocketConfig): UseVoiceWebSocketReturn => {
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('closed');
  const [error, setError] = useState<string | null>(null);
  
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;
  const baseReconnectDelay = 1000; // 1 second

  // Calculate exponential backoff delay
  const getReconnectDelay = useCallback(() => {
    return Math.min(baseReconnectDelay * Math.pow(2, reconnectAttemptsRef.current), 30000); // Max 30 seconds
  }, []);

  // Clean up WebSocket connection
  const cleanup = useCallback(() => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Send message to WebSocket
  const sendMessage = useCallback((message: WsMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      try {
        wsRef.current.send(JSON.stringify(message));
      } catch (err) {
        console.error('Failed to send WebSocket message:', err);
        setError('Failed to send message');
      }
    } else {
      console.warn('WebSocket is not connected, cannot send message:', message);
    }
  }, []);

  // Handle WebSocket messages
  const handleMessage = useCallback((event: MessageEvent) => {
    try {
      const message: WsMessage = JSON.parse(event.data);
      
      switch (message.type) {
        case 'user_joined':
          const joinedMessage = message as UserJoinedMessage;
          onUserUpdate({
            user_id: joinedMessage.user_id,
            username: joinedMessage.username,
            is_muted: joinedMessage.is_muted,
            is_speaking: false,
          });
          break;

        case 'user_left':
          const leftMessage = message as UserLeftMessage;
          // You might want to handle user leaving differently
          // For now, we'll call onUserUpdate with is_speaking: false to indicate they're gone
          onUserUpdate({
            user_id: leftMessage.user_id,
            username: '', // Username not provided in leave message
            is_muted: false,
            is_speaking: false,
          });
          break;

        case 'user_state_update':
          const stateMessage = message as UserStateUpdateMessage;
          onUserUpdate({
            user_id: stateMessage.user_id,
            username: '', // Username not provided in state update
            is_muted: stateMessage.is_muted,
            is_speaking: false, // Speaking state not provided in this message
          });
          break;

        case 'channel_info':
          const channelMessage = message as ChannelInfoMessage;
          // Update all users in the channel
          channelMessage.users.forEach(user => {
            onUserUpdate(user);
          });
          break;

        case 'error':
          const errorMessage = message as ErrorMessage;
          setError(errorMessage.message);
          break;

        default:
          console.log('Unknown WebSocket message type:', message.type);
      }
    } catch (err) {
      console.error('Failed to parse WebSocket message:', err);
      setError('Failed to parse server message');
    }
  }, [onUserUpdate]);

  // Connect to WebSocket
  const connect = useCallback(() => {
    if (!jwtToken) {
      setConnectionStatus('error');
      setError('No JWT token provided');
      return;
    }

    cleanup();

    try {
      setConnectionStatus('connecting');
      setError(null);

      const wsUrl = `ws://127.0.0.1:3000/ws?token=${encodeURIComponent(jwtToken)}`;
      wsRef.current = new WebSocket(wsUrl);

      wsRef.current.onopen = () => {
        setConnectionStatus('open');
        setError(null);
        reconnectAttemptsRef.current = 0;
        onConnectionStatus('open');

        // Join the specified channel if provided
        if (channelId) {
          sendMessage({
            type: 'join_channel',
            channel_id: channelId,
          });
        }
      };

      wsRef.current.onmessage = handleMessage;

      wsRef.current.onerror = (event) => {
        console.error('WebSocket error:', event);
        setConnectionStatus('error');
        setError('WebSocket connection error');
        onConnectionStatus('error');
      };

      wsRef.current.onclose = (event) => {
        console.log('WebSocket closed:', event.code, event.reason);
        setConnectionStatus('closed');
        onConnectionStatus('closed');

        // Attempt to reconnect if not a normal closure
        if (event.code !== 1000 && reconnectAttemptsRef.current < maxReconnectAttempts) {
          const delay = getReconnectDelay();
          console.log(`Attempting to reconnect in ${delay}ms (attempt ${reconnectAttemptsRef.current + 1}/${maxReconnectAttempts})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            reconnectAttemptsRef.current++;
            connect();
          }, delay);
        } else if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          setError('Max reconnection attempts reached');
        }
      };

    } catch (err) {
      console.error('Failed to create WebSocket connection:', err);
      setConnectionStatus('error');
      setError('Failed to create WebSocket connection');
      onConnectionStatus('error');
    }
  }, [jwtToken, channelId, cleanup, handleMessage, sendMessage, onConnectionStatus, getReconnectDelay]);

  // Effect to handle connection changes
  useEffect(() => {
    if (jwtToken) {
      connect();
    } else {
      cleanup();
      setConnectionStatus('closed');
      onConnectionStatus('closed');
    }

    return () => {
      cleanup();
    };
  }, [jwtToken, channelId, connect, cleanup, onConnectionStatus]);

  // Effect to handle channel changes when already connected
  useEffect(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN && channelId) {
      sendMessage({
        type: 'join_channel',
        channel_id: channelId,
      });
    }
  }, [channelId, sendMessage]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  return {
    connectionStatus,
    sendMessage,
    isConnected: connectionStatus === 'open',
    error,
  };
};

export default useVoiceWebSocket; 