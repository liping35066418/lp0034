import { WebSocketServer, WebSocket } from 'ws';
import type { Server as HttpServer } from 'http';
import type { WSMessage, RenderProgressMessage } from '../../shared/types.js';

class WSService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, WebSocket> = new Map();

  init(server: HttpServer): void {
    this.wss = new WebSocketServer({ server, path: '/ws' });

    this.wss.on('connection', (ws, req) => {
      const clientId = this.generateClientId();
      this.clients.set(clientId, ws);

      console.log(`WebSocket client connected: ${clientId}`);

      ws.on('message', (data) => {
        try {
          const message = JSON.parse(data.toString());
          this.handleMessage(clientId, message);
        } catch (err) {
          console.error('WebSocket message parse error:', err);
        }
      });

      ws.on('close', () => {
        this.clients.delete(clientId);
        console.log(`WebSocket client disconnected: ${clientId}`);
      });

      ws.on('error', (err) => {
        console.error('WebSocket error:', err);
        this.clients.delete(clientId);
      });

      ws.send(JSON.stringify({
        type: 'connected',
        clientId,
      }));
    });

    console.log('WebSocket server initialized');
  }

  private generateClientId(): string {
    return Math.random().toString(36).substring(2, 10);
  }

  private handleMessage(clientId: string, message: any): void {
    if (message.type === 'ping') {
      const ws = this.clients.get(clientId);
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'pong' }));
      }
    }
  }

  broadcast(message: WSMessage): void {
    const data = JSON.stringify(message);

    this.clients.forEach((ws, clientId) => {
      if (ws.readyState === WebSocket.OPEN) {
        try {
          ws.send(data);
        } catch (err) {
          console.error(`Failed to send message to client ${clientId}:`, err);
        }
      }
    });
  }

  sendToClient(clientId: string, message: WSMessage): boolean {
    const ws = this.clients.get(clientId);
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      ws.send(JSON.stringify(message));
      return true;
    } catch (err) {
      console.error('Send error:', err);
      return false;
    }
  }

  sendProgress(taskId: string, progress: RenderProgressMessage): void {
    this.broadcast({
      type: 'progress',
      taskId,
      data: progress,
    });
  }

  sendTaskStatus(taskId: string, status: string, data?: any): void {
    this.broadcast({
      type: 'status',
      taskId,
      data: { status, ...data },
    });
  }

  sendLog(taskId: string, message: string): void {
    this.broadcast({
      type: 'log',
      taskId,
      data: { message, timestamp: Date.now() },
    });
  }

  sendError(taskId: string, error: string): void {
    this.broadcast({
      type: 'error',
      taskId,
      data: { error, timestamp: Date.now() },
    });
  }

  getClientCount(): number {
    return this.clients.size;
  }

  close(): void {
    if (this.wss) {
      this.wss.close();
      this.clients.clear();
    }
  }
}

export default new WSService();
