import { agents, tasks, digitalTwins, type Agent, type InsertAgent, type Task, type InsertTask, type DigitalTwin, type InsertDigitalTwin } from "@shared/schema";
import { db } from "./db";
import { eq, sql } from "drizzle-orm";
import { conversations, type Conversation, type InsertConversation } from "@shared/schema";

export interface IStorage {
  // Agent operations
  getAgents(): Promise<Agent[]>;
  getAgent(id: number): Promise<Agent | undefined>;
  createAgent(agent: InsertAgent): Promise<Agent>;
  updateAgentStatus(id: number, status: string): Promise<Agent | undefined>;
  updateAgentMetrics(id: number, metrics: any): Promise<Agent | undefined>;

  // Task operations
  getTasks(): Promise<Task[]>;
  getTask(id: number): Promise<Task | undefined>;
  createTask(task: InsertTask): Promise<Task>;
  updateTaskStatus(id: number, status: string): Promise<Task | undefined>;
  getTasksByAgent(agentId: number): Promise<Task[]>;

  // Digital Twin operations
  getDigitalTwins(): Promise<DigitalTwin[]>;
  getDigitalTwin(id: number): Promise<DigitalTwin | undefined>;
  createDigitalTwin(twin: InsertDigitalTwin): Promise<DigitalTwin>;
  updateDigitalTwin(id: number, updates: Partial<InsertDigitalTwin>): Promise<DigitalTwin | undefined>;
  deleteDigitalTwin(id: number): Promise<boolean>;

  // Conversation operations
  getConversations(): Promise<Conversation[]>;
  getConversation(id: number): Promise<Conversation | undefined>;
  createConversation(conversation: InsertConversation): Promise<Conversation>;
  getConversationsByParticipant(participant: string): Promise<Conversation[]>;
}

export class DatabaseStorage implements IStorage {
  // Agent operations
  async getAgents(): Promise<Agent[]> {
    return await db.select().from(agents);
  }

  async getAgent(id: number): Promise<Agent | undefined> {
    const [agent] = await db.select().from(agents).where(eq(agents.id, id));
    return agent;
  }

  async createAgent(insertAgent: InsertAgent): Promise<Agent> {
    const [agent] = await db.insert(agents).values(insertAgent).returning();
    return agent;
  }

  async updateAgentStatus(id: number, status: string): Promise<Agent | undefined> {
    const [updated] = await db
      .update(agents)
      .set({ status })
      .where(eq(agents.id, id))
      .returning();
    return updated;
  }

  async updateAgentMetrics(id: number, metrics: any): Promise<Agent | undefined> {
    const [updated] = await db
      .update(agents)
      .set({ metrics })
      .where(eq(agents.id, id))
      .returning();
    return updated;
  }

  // Task operations
  async getTasks(): Promise<Task[]> {
    return await db.select().from(tasks);
  }

  async getTask(id: number): Promise<Task | undefined> {
    const [task] = await db.select().from(tasks).where(eq(tasks.id, id));
    return task;
  }

  async createTask(insertTask: InsertTask): Promise<Task> {
    const [task] = await db.insert(tasks).values(insertTask).returning();
    return task;
  }

  async updateTaskStatus(id: number, status: string): Promise<Task | undefined> {
    const [updated] = await db
      .update(tasks)
      .set({ status, updatedAt: new Date() })
      .where(eq(tasks.id, id))
      .returning();
    return updated;
  }

  async getTasksByAgent(agentId: number): Promise<Task[]> {
    return await db
      .select()
      .from(tasks)
      .where(eq(tasks.assignedAgentId, agentId));
  }

  // Digital Twin operations
  async getDigitalTwins(): Promise<DigitalTwin[]> {
    return await db.select().from(digitalTwins);
  }

  async getDigitalTwin(id: number): Promise<DigitalTwin | undefined> {
    const [twin] = await db.select().from(digitalTwins).where(eq(digitalTwins.id, id));
    return twin;
  }

  async createDigitalTwin(twin: InsertDigitalTwin): Promise<DigitalTwin> {
    const [newTwin] = await db.insert(digitalTwins).values(twin).returning();
    return newTwin;
  }

  async updateDigitalTwin(id: number, updates: Partial<InsertDigitalTwin>): Promise<DigitalTwin | undefined> {
    const [updated] = await db
      .update(digitalTwins)
      .set({ ...updates, updatedAt: new Date() })
      .where(eq(digitalTwins.id, id))
      .returning();
    return updated;
  }
  
  // Clean up duplicate agents (keeping the one with the lowest ID)
  async cleanupDuplicateAgents(): Promise<number> {
    try {
      // Get all agents
      const allAgents = await this.getAgents();
      
      // Group agents by name
      const agentsByName: Record<string, Agent[]> = {};
      for (const agent of allAgents) {
        if (!agentsByName[agent.name]) {
          agentsByName[agent.name] = [];
        }
        agentsByName[agent.name].push(agent);
      }
      
      // Count duplicates removed
      let duplicatesRemoved = 0;
      
      // For each name with multiple agents, keep only the agent with lowest ID (oldest)
      for (const [name, agentsWithName] of Object.entries(agentsByName)) {
        if (agentsWithName.length > 1) {
          // Sort by ID (ascending)
          agentsWithName.sort((a, b) => a.id - b.id);
          
          // Keep the first one (lowest ID), remove the rest
          const agentsToRemove = agentsWithName.slice(1);
          
          // Delete duplicate agents
          for (const agent of agentsToRemove) {
            await db.delete(agents).where(eq(agents.id, agent.id));
            duplicatesRemoved++;
            console.log(`Removed duplicate agent: ${name} (ID: ${agent.id})`);
          }
        }
      }
      
      return duplicatesRemoved;
    } catch (error) {
      console.error("Error cleaning up duplicate agents:", error);
      return 0;
    }
  }

  async deleteDigitalTwin(id: number): Promise<boolean> {
    const [deleted] = await db
      .delete(digitalTwins)
      .where(eq(digitalTwins.id, id))
      .returning();
    return !!deleted;
  }

  // Conversation operations
  async getConversations(): Promise<Conversation[]> {
    return await db.select().from(conversations);
  }

  async getConversation(id: number): Promise<Conversation | undefined> {
    const [conversation] = await db.select().from(conversations).where(eq(conversations.id, id));
    return conversation;
  }

  async createConversation(conversation: InsertConversation): Promise<Conversation> {
    const [newConversation] = await db.insert(conversations).values(conversation).returning();
    return newConversation;
  }

  async getConversationsByParticipant(participant: string): Promise<Conversation[]> {
    return await db
      .select()
      .from(conversations)
      .where(sql`${participant} = ANY(${conversations.participants})`);
  }
}

export const storage = new DatabaseStorage();