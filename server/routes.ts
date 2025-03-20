import type { Express } from "express";
import { createServer, type Server } from "http";
import { WebSocketServer, WebSocket } from "ws";
import multer from 'multer';
import { storage } from "./storage";
import { insertAgentSchema, insertDigitalTwinSchema } from "@shared/schema";
import { voiceService } from "./voice-service";
import { documentService } from "./document-service";
import { z } from "zod";
import { insertConversationSchema } from "@shared/schema";
import bodyParser from 'body-parser';


const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB limit
  }
});

function isFallbackResponse(result: any): result is { fallback: true; text: string; persona?: string } {
  return typeof result === 'object' && result !== null && 'fallback' in result && result.fallback === true;
}


export function registerRoutes(app: Express): Server {
  const jsonParser = bodyParser.json();
  const httpServer = createServer(app);
  const wss = new WebSocketServer({ server: httpServer, path: "/ws" });

  // Add initial digital twin agents only if they don't already exist
  (async () => {
    // First check if any agents already exist
    const existingAgents = await storage.getAgents();
    const existingNames = existingAgents.map(agent => agent.name);
    
    // Define our 7 core digital twins
    const digitalTwins = [
      {
        name: "Albert Einstein",
        type: "Theoretical Physics",
        capabilities: ["Innovation", "Research", "Problem Solving"],
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Einstein",
        status: "active"
      },
      {
        name: "Elon Musk",
        type: "Tech Entrepreneur",
        capabilities: ["Innovation", "Strategic Thinking", "Product Development"], 
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Musk",
        status: "active"
      },
      {
        name: "Emad Mostaque",
        type: "AI Innovator",
        capabilities: ["Artificial Intelligence", "Leadership", "Technical Vision"],
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Mostaque",
        status: "active"
      },
      {
        name: "Fei-Fei Li",
        type: "AI Research",
        capabilities: ["Artificial Intelligence", "Research", "Technical Vision"],
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Li",
        status: "active"
      },
      {
        name: "Leonardo da Vinci",
        type: "Renaissance Innovator",
        capabilities: ["Innovation", "Art", "Engineering"],
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=DaVinci",
        status: "active"
      },
      {
        name: "Steve Jobs",
        type: "Tech Visionary",
        capabilities: ["Innovation", "Product Development", "Design"],
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Jobs",
        status: "active"
      },
      {
        name: "Walt Disney",
        type: "Creative Visionary",
        capabilities: ["Creativity", "Innovation", "Storytelling"],
        avatar: "https://api.dicebear.com/7.x/avataaars/svg?seed=Disney",
        status: "active"
      }
    ];
    
    // Clean up duplicates first if they exist
    if (existingAgents.length > 0) {
      await storage.cleanupDuplicateAgents();
      console.log("Cleaned up any duplicate agents");
    }
    
    // Add only the twins that don't exist yet
    for (const twin of digitalTwins) {
      if (!existingNames.includes(twin.name)) {
        await storage.createAgent(twin);
        console.log(`Created agent: ${twin.name}`);
      } else {
        console.log(`Agent already exists: ${twin.name}`);
      }
    }
    
    console.log("Digital twin initialization complete");
  })();

  // WebSocket connection handling
  wss.on("connection", (ws) => {
    console.log("New WebSocket connection established");

    const broadcast = () => {
      if (ws.readyState === WebSocket.OPEN) {
        storage.getAgents().then((agents) => {
          ws.send(JSON.stringify({ type: "agents_update", data: agents }));
        });
      }
    };

    // Send initial data
    broadcast();

    ws.on("message", async (message) => {
      const data = JSON.parse(message.toString());

      if (data.type === "update_status") {
        await storage.updateAgentStatus(data.agentId, data.status);
        broadcast();
      } else if (data.type === "update_metrics") {
        await storage.updateAgentMetrics(data.agentId, data.metrics);
        broadcast();
      }
    });

    ws.on("error", console.error);
  });

  // Document upload endpoint
  app.post("/api/upload-twin-document", upload.single('document'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No document provided' });
      }

      const { name } = req.body;
      if (!name) {
        return res.status(400).json({ error: 'Twin name is required' });
      }

      const content = await documentService.processWordDocument(req.file);
      await documentService.createDigitalTwin(content, name);

      res.json({ message: 'Digital twin created successfully' });
    } catch (error) {
      console.error('Error processing document:', error);
      res.status(500).json({ error: 'Failed to process document' });
    }
  });

  //Synthesize Route with fallback
app.post("/api/synthesize", jsonParser, async (req, res) => {
  try {
    const { text, persona } = req.body;
    const result = await voiceService.synthesizeSpeech({ text, persona });

    // Use the type guard to check if it's a fallback response
    if (isFallbackResponse(result)) {
      res.json(result);
    } else {
      res.set('Content-Type', 'audio/mpeg');
      res.send(result);
    }
  } catch (error: any) {
    res.status(500).json({ error: error.message, fallback: true, text: req.body.text, persona: req.body.persona });
  }
});


  // Get available voices endpoint
  app.get("/api/voices", async (_req, res) => {
    try {
      const voices = await voiceService.getVoices();
      res.json(voices);
    } catch (error) {
      console.error('Error fetching voices:', error);
      // Return default voices instead of error
      res.json([
        { voice_id: "ThT5KcBeYPX3keUQqHPh", name: "Leonardo da Vinci" },
        { voice_id: "AZnzlk1XvdvUeBnXmlld", name: "Steve Jobs" }
      ]);
    }
  });

  // Digital Twins endpoints
  app.get("/api/digital-twins", async (_req, res) => {
    const twins = await storage.getDigitalTwins();
    res.json(twins);
  });

  app.post("/api/digital-twins", async (req, res) => {
    const result = insertDigitalTwinSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const twin = await storage.createDigitalTwin(result.data);
    res.json(twin);
  });

  // REST endpoints
  app.get("/api/agents", async (_req, res) => {
    const agents = await storage.getAgents();
    res.json(agents);
  });

  app.post("/api/agents", async (req, res) => {
    const result = insertAgentSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const agent = await storage.createAgent(result.data);
    res.json(agent);
  });

  // Conversation endpoints
  app.get("/api/conversations", async (_req, res) => {
    const conversations = await storage.getConversations();
    res.json(conversations);
  });

  app.post("/api/conversations", async (req, res) => {
    const result = insertConversationSchema.safeParse(req.body);
    if (!result.success) {
      return res.status(400).json({ error: result.error });
    }

    const conversation = await storage.createConversation(result.data);
    res.json(conversation);
  });

  app.get("/api/conversations/:id", async (req, res) => {
    const id = parseInt(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: "Invalid conversation ID" });
    }

    const conversation = await storage.getConversation(id);
    if (!conversation) {
      return res.status(404).json({ error: "Conversation not found" });
    }

    res.json(conversation);
  });

  app.get("/api/conversations/participant/:name", async (req, res) => {
    const conversations = await storage.getConversationsByParticipant(req.params.name);
    res.json(conversations);
  });
  
  // Maintenance endpoint to clean up duplicate agents
  app.post("/api/maintenance/cleanup-duplicates", async (_req, res) => {
    try {
      const removed = await storage.cleanupDuplicateAgents();
      res.json({ 
        success: true, 
        message: `Successfully cleaned up ${removed} duplicate agents`,
        removed
      });
    } catch (error) {
      console.error('Error cleaning up duplicates:', error);
      res.status(500).json({ 
        success: false, 
        error: 'Failed to clean up duplicates'
      });
    }
  });

  app.post('/api/voice/synthesize', async (req, res) => {
    try {
      const schema = z.object({
        text: z.string().min(1).max(500),
        persona: z.string().optional(),
      });

      const result = schema.safeParse(req.body);
      if (!result.success) {
        return res.status(400).json({ error: 'Invalid request data', details: result.error });
      }

      const { text, persona } = result.data;
      console.log(`Voice synthesis request: "${text.substring(0, 30)}..." with persona: ${persona || 'default'}`);

      // Get synthesized speech from voice service
      const audioData = await voiceService.synthesizeSpeech({ text, persona });

      // If we get a fallback indicator object, send it as JSON
      if (typeof audioData === 'object' && 'fallback' in audioData) {
        console.log('Sending fallback response to client');
        return res.json(audioData);
      }

      // Otherwise send the audio buffer with appropriate headers
      console.log('Sending audio response to client:', (audioData as Buffer).length, 'bytes');
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'no-cache');
      res.send(audioData);
    } catch (error) {
      console.error('Speech synthesis error:', error);
      res.status(500).json({ error: 'Failed to synthesize speech' });
    }
  });

  return httpServer;
}