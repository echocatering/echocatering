/**
 * usePosWebSocket.js
 * 
 * WebSocket hook for POS checkout sync across devices.
 * Connects to the backend WebSocket server and broadcasts/receives checkout events.
 */

import { useEffect, useRef, useCallback, useState } from 'react';

export function usePosWebSocket(onCheckoutStart, onCheckoutComplete, onCheckoutCancel, onPaymentStatus, onCheckoutStage, onProcessPayment, onSimulateTap, onReaderStatus) {
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
            case 'payment_status':
              // Handle Square payment status updates from webhook
              if (onPaymentStatus) {
                onPaymentStatus(message);
              }
              break;
            case 'checkout_stage':
              // Handle checkout stage updates from other devices
              if (onCheckoutStage) {
                onCheckoutStage(message.data);
              }
              break;
            case 'process_payment':
              // Handle payment trigger from horizontal device (customer-facing)
              // This is received by the vertical device (with reader) to process payment
              if (onProcessPayment) {
                onProcessPayment(message.data);
              }
              break;
            case 'simulate_tap':
              // Handle simulated card tap from horizontal device
              // This is received by the vertical device (with reader) to simulate card presentation
              if (onSimulateTap) {
                onSimulateTap(message.data);
              }
              break;
            case 'reader_status':
              // Handle reader status updates from device with reader
              // This tells other devices if a reader is connected and if it's simulated
              if (onReaderStatus) {
                onReaderStatus(message.data);
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
  }, [getWsUrl, onCheckoutStart, onCheckoutComplete, onCheckoutCancel, onPaymentStatus, onCheckoutStage, onProcessPayment, onSimulateTap, onReaderStatus]);
  
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
  
  // Send checkout stage update
  const sendCheckoutStage = useCallback((stage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'checkout_stage',
        data: { stage }
      }));
      console.log('[POS WebSocket] Sent checkout_stage:', stage);
    }
  }, []);
  
  // Send process payment request to device with reader
  const sendProcessPayment = useCallback((paymentData) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'process_payment',
        data: paymentData
      }));
      console.log('[POS WebSocket] Sent process_payment:', paymentData);
    }
  }, []);
  
  // Send simulate tap request to device with reader (includes payment amount)
  const sendSimulateTap = useCallback((paymentData) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'simulate_tap',
        data: paymentData || {}
      }));
      console.log('[POS WebSocket] Sent simulate_tap:', paymentData);
    }
  }, []);
  
  // Send reader status to other devices
  const sendReaderStatus = useCallback((readerData) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({
        type: 'reader_status',
        data: readerData
      }));
      console.log('[POS WebSocket] Sent reader_status:', readerData);
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
    sendCheckoutCancel,
    sendCheckoutStage,
    sendProcessPayment,
    sendSimulateTap,
    sendReaderStatus
  };
}
