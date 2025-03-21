import { type Agent } from "@shared/schema";

export type WSMessage = {
  type: string;
  data: any;
};

class WebSocketClient {
  private ws: WebSocket | null = null;
  private listeners: ((agents: Agent[]) => void)[] = [];
  private connectionListeners: ((connected: boolean) => void)[] = [];
  private reconnectTimeout: number = 1000; // Start with 1 second
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;

  connect(useDirectConnection = false) {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    let wsUrl;
    
    if (useDirectConnection) {
      // Direct connection to EC2 instance
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${protocol}//ec2-13-60-196-19.eu-north-1.compute.amazonaws.com:3000/ws`;
      console.log("Using direct WebSocket connection to EC2:", wsUrl);
    } else {
      // Connection through Vite proxy
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      wsUrl = `${protocol}//${window.location.host}/ws`;
      console.log("Using proxied WebSocket connection:", wsUrl);
    }

    this.ws = new WebSocket(wsUrl);

    this.ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);
        if (message.type === "agents_update") {
          this.listeners.forEach(listener => listener(message.data));
        }
      } catch (error) {
        console.error("WebSocket message parsing error:", error);
      }
    };

    this.ws.onopen = () => {
      console.log("WebSocket connected");
      this.reconnectTimeout = 1000; // Reset timeout on successful connection
      this.reconnectAttempts = 0;
      this.notifyConnectionChange(true);
    };

    this.ws.onclose = () => {
      console.log("WebSocket disconnected, attempting reconnect...");
      this.notifyConnectionChange(false);

      if (this.reconnectAttempts < this.maxReconnectAttempts) {
        setTimeout(() => {
          this.reconnectTimeout = Math.min(this.reconnectTimeout * 1.5, 30000); // Exponential backoff
          this.reconnectAttempts++;
          this.connect();
        }, this.reconnectTimeout);
      } else {
        console.error("Max reconnection attempts reached");
      }
    };

    this.ws.onerror = (error) => {
      console.error("WebSocket error:", error);
    };
  }

  disconnect() {
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }

  subscribe(listener: (agents: Agent[]) => void) {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter(l => l !== listener);
    };
  }

  onConnectionChange(listener: (connected: boolean) => void) {
    this.connectionListeners.push(listener);
    return () => {
      this.connectionListeners = this.connectionListeners.filter(l => l !== listener);
    };
  }

  private notifyConnectionChange(connected: boolean) {
    this.connectionListeners.forEach(listener => listener(connected));
  }

  updateAgentStatus(agentId: number, status: string) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "update_status", agentId, status }));
    }
  }

  updateMetrics(agentId: number, metrics: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "update_metrics", agentId, metrics }));
    }
  }
}

export const wsClient = new WebSocketClient();
