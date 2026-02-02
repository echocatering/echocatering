/**
 * usePosWebSocket.js
 * 
 * WebSocket hook for POS checkout sync across devices.
 * Connects to the backend WebSocket server and broadcasts/receives checkout events.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

export function usePosWebSocket(onCheckoutStart, onCheckoutComplete, onCheckoutCancel) {
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const [isConnected, setIsConnected] = useState(false);
  
  // Build WebSocket URL based on current location
  const getWsUrl = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    
    // In development, connect to backend port (5002)
    // In production, connect to same host (Render handles WebSocket upgrade)
    if (process.env.NODE_ENV === 'development') {
      return `ws://localhost:5002/ws/pos`;
    }
    
    return `${protocol}//${host}/ws/pos`;
  }, []);
  
  // Connect to WebSocket server
  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return; // Already connected
    }
    
    const wsUrl = getWsUrl();
    console.log('[POS WebSocket] Connecting to:', wsUrl);
    
    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;
      
      ws.onopen = () => {
        console.log('[POS WebSocket] Connected');
        setIsConnected(true);
      };
      
      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          console.log('[POS WebSocket] Received:', message.type);
          
          switch (message.type) {
            case 'checkout_start':
              if (onCheckoutStart) {
                onCheckoutStart(message.data);
              }
              break;
            case 'checkout_complete':
              if (onCheckoutComplete) {
                onCheckoutComplete(message.data);
              }
              break;
            case 'checkout_cancel':
              if (onCheckoutCancel) {
                onCheckoutCancel(message.data);
              }
              break;
            case 'connected':
              console.log('[POS WebSocket]', message.message);
              break;
            default:
              console.log('[POS WebSocket] Unknown message type:', message.type);
          }
        } catch (err) {
          console.error('[POS WebSocket] Error parsing message:', err);
        }
      };
      
      ws.onclose = () => {
        console.log('[POS WebSocket] Disconnected');
        setIsConnected(false);
        wsRef.current = null;
        
        // Reconnect after 3 seconds
        reconnectTimeoutRef.current = setTimeout(() => {
          console.log('[POS WebSocket] Attempting reconnect...');
          connect();
        }, 3000);
      };
      
      ws.onerror = (err) => {
        console.error('[POS WebSocket] Error:', err);
      };
    } catch (err) {
      console.error('[POS WebSocket] Connection error:', err);
      
      // Retry after 5 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        connect();
      }, 5000);
    }
  }, [getWsUrl, onCheckoutStart, onCheckoutComplete, onCheckoutCancel]);
  
  // Send checkout start event
  const sendCheckoutStart = useCallback((checkoutData) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'checkout_start',
        data: checkoutData
      }));
      console.log('[POS WebSocket] Sent checkout_start');
    } else {
      console.warn('[POS WebSocket] Not connected, cannot send checkout_start');
    }
  }, []);
  
  // Send checkout complete event
  const sendCheckoutComplete = useCallback((resultData) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'checkout_complete',
        data: resultData
      }));
      console.log('[POS WebSocket] Sent checkout_complete');
    }
  }, []);
  
  // Send checkout cancel event
  const sendCheckoutCancel = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'checkout_cancel',
        data: {}
      }));
      console.log('[POS WebSocket] Sent checkout_cancel');
    }
  }, []);
  
  // Connect on mount, cleanup on unmount
  useEffect(() => {
    connect();
    
    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);
  
  return {
    isConnected,
    sendCheckoutStart,
    sendCheckoutComplete,
    sendCheckoutCancel
  };
}
