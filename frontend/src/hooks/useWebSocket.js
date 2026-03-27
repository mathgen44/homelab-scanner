import { useEffect, useRef, useCallback, useState } from 'react';

const WS_URL = process.env.REACT_APP_WS_URL || `ws://${window.location.hostname}:8000/ws`;

export function useWebSocket(onEvent) {
  const ws = useRef(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef(null);
  const onEventRef = useRef(onEvent);
  onEventRef.current = onEvent;

  const connect = useCallback(() => {
    if (ws.current?.readyState === WebSocket.OPEN) return;
    try {
      ws.current = new WebSocket(WS_URL);
      ws.current.onopen = () => {
        setConnected(true);
        if (reconnectTimer.current) clearInterval(reconnectTimer.current);
      };
      ws.current.onclose = () => {
        setConnected(false);
        reconnectTimer.current = setTimeout(connect, 3000);
      };
      ws.current.onerror = () => {
        ws.current?.close();
      };
      ws.current.onmessage = (e) => {
        try {
          const event = JSON.parse(e.data);
          onEventRef.current?.(event);
        } catch {}
      };
    } catch {}
  }, []);

  useEffect(() => {
    connect();
    return () => {
      ws.current?.close();
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
    };
  }, [connect]);

  const send = useCallback((data) => {
    if (ws.current?.readyState === WebSocket.OPEN) {
      ws.current.send(JSON.stringify(data));
    }
  }, []);

  return { connected, send };
}
