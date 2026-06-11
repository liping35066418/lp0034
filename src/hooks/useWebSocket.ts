import { useEffect, useRef, useCallback, useState } from 'react';
import useEditorStore from '@/stores/useEditorStore';

interface WebSocketHook {
  isConnected: boolean;
  sendMessage: (message: any) => void;
}

export function useWebSocket(): WebSocketHook {
  const wsRef = useRef<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const updateRenderTask = useEditorStore((state) => state.updateRenderTask);
  const addRenderTask = useEditorStore((state) => state.addRenderTask);

  const connect = useCallback(() => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws`;

    try {
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        console.log('WebSocket connected');
        setIsConnected(true);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data);
          handleMessage(message);
        } catch (err) {
          console.error('WebSocket message parse error:', err);
        }
      };

      ws.onclose = () => {
        console.log('WebSocket disconnected');
        setIsConnected(false);
        setTimeout(() => {
          if (wsRef.current?.readyState !== WebSocket.OPEN) {
            connect();
          }
        }, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        setIsConnected(false);
      };
    } catch (err) {
      console.error('Failed to create WebSocket:', err);
    }
  }, [updateRenderTask]);

  const handleMessage = useCallback(
    (message: any) => {
      if (message.type === 'progress') {
        const { taskId, data } = message;
        updateRenderTask(taskId, {
          progress: data.progress,
          stage: data.stage,
          currentFrame: data.currentFrame,
          totalFrames: data.totalFrames,
          speed: data.speed,
        });
      } else if (message.type === 'status') {
        const { taskId, data } = message;
        updateRenderTask(taskId, {
          status: data.status,
          ...(data.error && { errorMessage: data.error }),
        });
      } else if (message.type === 'error') {
        const { taskId, data } = message;
        updateRenderTask(taskId, {
          status: 'failed',
          errorMessage: data.error,
        });
      }
    },
    [updateRenderTask]
  );

  const sendMessage = useCallback((message: any) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    }
  }, []);

  useEffect(() => {
    connect();

    return () => {
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [connect]);

  return { isConnected, sendMessage };
}

export default useWebSocket;
