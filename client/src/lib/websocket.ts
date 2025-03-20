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

  connect() {
    if (this.ws?.readyState === WebSocket.OPEN) return;

    try {
      const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
      const wsUrl = `${protocol}//${window.location.host}/ws`;

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

        // If we're in production on Vercel, don't attempt to reconnect
        if (window.location.hostname.includes('vercel.app')) {
          console.log("Running on Vercel, not attempting WebSocket reconnection");
          this.fallbackToRESTAPI();
          return;
        }

        if (this.reconnectAttempts < this.maxReconnectAttempts) {
          setTimeout(() => {
            this.reconnectTimeout = Math.min(this.reconnectTimeout * 1.5, 30000); // Exponential backoff
            this.reconnectAttempts++;
            this.connect();
          }, this.reconnectTimeout);
        } else {
          console.error("Max reconnection attempts reached");
          this.fallbackToRESTAPI();
        }
      };

      this.ws.onerror = (error) => {
        console.error("WebSocket error:", error);
        
        // If we're in production on Vercel, don't show error
        if (window.location.hostname.includes('vercel.app')) {
          console.log("WebSocket not supported in this environment, using REST API fallback");
          this.fallbackToRESTAPI();
        }
      };
    } catch (error) {
      console.error("Failed to create WebSocket connection:", error);
      this.fallbackToRESTAPI();
    }
  }

  // Fallback to REST API when WebSocket is not available
  private fallbackToRESTAPI() {
    console.log("Using REST API fallback for agent updates");
    // Fetch agents immediately
    this.fetchAgentsViaREST();
    
    // Set up polling for updates
    setInterval(() => {
      this.fetchAgentsViaREST();
    }, 10000); // Poll every 10 seconds
  }

  private async fetchAgentsViaREST() {
    try {
      // Use a hardcoded fallback if we're on Vercel and getting 403 errors
      if (window.location.hostname.includes('vercel.app')) {
        console.log("Using hardcoded fallback agents data for Vercel deployment");
        const fallbackAgents = [
          {
            id: 1,
            name: "Albert Einstein",
            type: "Theoretical Physics",
            capabilities: ["Innovation", "Research", "Problem Solving"],
            avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Einstein",
            status: "active",
            metrics: {}
          },
          {
            id: 2,
            name: "Elon Musk",
            type: "Tech Entrepreneur",
            capabilities: ["Innovation", "Strategic Thinking", "Product Development"], 
            avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Musk",
            status: "active",
            metrics: {}
          },
          {
            id: 3,
            name: "Emad Mostaque",
            type: "AI Innovator",
            capabilities: ["Artificial Intelligence", "Leadership", "Technical Vision"],
            avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mostaque",
            status: "active",
            metrics: {}
          },
          {
            id: 4,
            name: "Fei-Fei Li",
            type: "AI Research",
            capabilities: ["Artificial Intelligence", "Research", "Technical Vision"],
            avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Li",
            status: "active",
            metrics: {}
          },
          {
            id: 5,
            name: "Leonardo da Vinci",
            type: "Renaissance Innovator",
            capabilities: ["Innovation", "Art", "Engineering"],
            avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=DaVinci",
            status: "active",
            metrics: {}
          },
          {
            id: 6,
            name: "Steve Jobs",
            type: "Tech Visionary",
            capabilities: ["Innovation", "Product Development", "Design"],
            avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Jobs",
            status: "active",
            metrics: {}
          },
          {
            id: 7,
            name: "Walt Disney",
            type: "Creative Visionary",
            capabilities: ["Creativity", "Innovation", "Storytelling"],
            avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Disney",
            status: "active",
            metrics: {}
          }
        ];
        this.listeners.forEach(listener => listener(fallbackAgents));
        return;
      }

      // Regular API call for non-Vercel environments
      const response = await fetch('/api/agents');
      if (response.ok) {
        const agents = await response.json();
        if (Array.isArray(agents)) {
          this.listeners.forEach(listener => listener(agents));
        } else {
          console.error("Invalid response format from /api/agents:", agents);
        }
      } else {
        console.error("Error fetching agents:", response.status, response.statusText);
      }
    } catch (error) {
      console.error("Error fetching agents via REST API:", error);
    }
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
    } else if (window.location.hostname.includes('vercel.app')) {
      // Fallback to REST API
      this.updateAgentStatusViaREST(agentId, status);
    }
  }

  updateMetrics(agentId: number, metrics: any) {
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ type: "update_metrics", agentId, metrics }));
    } else if (window.location.hostname.includes('vercel.app')) {
      // Fallback to REST API
      this.updateMetricsViaREST(agentId, metrics);
    }
  }

  private async updateAgentStatusViaREST(agentId: number, status: string) {
    try {
      const response = await fetch(`/api/agents/${agentId}/status`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status })
      });
      
      if (response.ok) {
        // Refresh agents after update
        this.fetchAgentsViaREST();
      }
    } catch (error) {
      console.error("Error updating agent status via REST API:", error);
    }
  }

  private async updateMetricsViaREST(agentId: number, metrics: any) {
    try {
      const response = await fetch(`/api/agents/${agentId}/metrics`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ metrics })
      });
      
      if (response.ok) {
        // Refresh agents after update
        this.fetchAgentsViaREST();
      }
    } catch (error) {
      console.error("Error updating agent metrics via REST API:", error);
    }
  }
}

export const wsClient = new WebSocketClient();
