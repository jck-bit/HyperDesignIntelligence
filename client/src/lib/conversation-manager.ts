
import { voiceService } from './voice-service';
import OpenAI from "openai";

interface Message {
  role: "system" | "user" | "assistant";
  content: string;
  persona?: string;
}

interface ConversationContext {
  lastQuery?: string;
  lastResponse?: string;
  topic?: string;
  turnCount: number;
  messages: Message[];
  activePersonas?: string[];
  currentSpeaker?: string;
}

export class ConversationManager {
  private context: ConversationContext = {
    turnCount: 0,
    messages: [],
    activePersonas: ["Leonardo da Vinci", "Steve Jobs"],
    currentSpeaker: undefined
  };

  private openai: OpenAI;
  private isInitialized: boolean = false;

  constructor() {
    const apiKey = import.meta.env.VITE_OPENAI_API_KEY;
    if (!apiKey) {
      console.error('OpenAI API key not found');
      throw new Error('OpenAI API key is required');
    }
    this.openai = new OpenAI({
      apiKey,
      dangerouslyAllowBrowser: true
    });
  }

  async startConversation(): Promise<void> {
    if (this.isInitialized) {
      console.log('Conversation already initialized');
      return;
    }

    try {
      const systemMessage: Message = {
        role: "system",
        content: `You are facilitating a natural conversation between Leonardo da Vinci and Steve Jobs about innovation, creativity, and design thinking. 
        Make their distinct personalities shine through their words without using speaker labels.
        This conversation should last approximately 10 minutes, with balanced speaking time between both personas.
        Each persona should have roughly equal speaking time and build upon each other's ideas naturally.

        Leonardo should:
        - Draw insights from nature and art
        - Speak thoughtfully about observation and universal principles
        - Reference his studies of birds, anatomy, and natural phenomena
        - Connect renaissance thinking to modern design principles

        Jobs should:
        - Focus on user experience and design simplicity
        - Reference Apple products and modern technology
        - Emphasize the importance of aesthetics and functionality
        - Be passionate about revolutionary ideas

        Important:
        - DO NOT use speaker labels (e.g. "Leonardo:" or "Jobs:")
        - Make it clear who's speaking through their unique perspectives and references
        - Let them build on each other's ideas naturally`
      };

      const initialPrompt = "Let's explore the intersection of innovation, creativity, and design thinking across different eras.";

      this.context.messages = [systemMessage];
      this.context.topic = "innovation, creativity, and design thinking";
      this.isInitialized = true;

      await this.handleUserInput(initialPrompt);
    } catch (error) {
      console.error('Failed to start conversation:', error);
      this.isInitialized = false;
      throw error;
    }
  }

  private inferCurrentSpeaker(response: string): string {
    const jobsKeywords = ['user experience', 'technology', 'design', 'apple', 'product', 'simple', 'revolutionary', 'iphone', 'macintosh'];
    const leonardoKeywords = ['nature', 'observation', 'art', 'science', 'anatomy', 'principles', 'study', 'renaissance', 'florence'];

    const lowerResponse = response.toLowerCase();
    let jobsScore = 0;
    let leonardoScore = 0;

    jobsKeywords.forEach(keyword => {
      if (lowerResponse.includes(keyword)) jobsScore++;
    });

    leonardoKeywords.forEach(keyword => {
      if (lowerResponse.includes(keyword)) leonardoScore++;
    });

    return leonardoScore > jobsScore ? "Leonardo da Vinci" : "Steve Jobs";
  }

  async handleUserInput(input: string): Promise<void> {
    if (!input.trim()) return;

    try {
      if (!this.isInitialized) {
        await this.startConversation();
      }

      this.context.turnCount++;
      this.context.lastQuery = input;

      this.context.messages.push({
        role: "user",
        content: input
      });

      const response = await this.openai.chat.completions.create({
        model: "gpt-4",
        messages: this.context.messages,
        temperature: 0.85,
        max_tokens: 120, // Slightly shorter responses for more back-and-forth
        presence_penalty: 0.7,
        frequency_penalty: 0.5
      });

      const aiResponse = response.choices[0]?.message?.content;
      if (!aiResponse) {
        throw new Error("No response received from AI");
      }

      const currentSpeaker = this.inferCurrentSpeaker(aiResponse);
      console.log('Speaking as:', currentSpeaker);

      this.context.messages.push({
        role: "assistant",
        content: aiResponse,
        persona: currentSpeaker
      });

      this.context.lastResponse = aiResponse;
      await this.speak(aiResponse, currentSpeaker);

    } catch (error: any) {
      console.error('Error in conversation:', error);
      const errorMessage = error.message.includes('quota_exceeded')
        ? "Voice synthesis quota exceeded. Please try again later."
        : "I apologize, but I'm having trouble processing that request. Could you try again?";

      await this.speak(errorMessage);
      throw error;
    }
  }

  private async speak(text: string, persona?: string): Promise<void> {
    if (!text.trim()) return;

    try {
      await voiceService.synthesizeSpeech({
        text,
        persona
      });
    } catch (error) {
      console.error('Error in speech synthesis:', error);
      throw error;
    }
  }

  async saveCurrentTranscript(): Promise<string> {
    return this.context.messages
      .filter(m => m.role === "assistant" || m.role === "user")
      .map(m => m.content)
      .join("\n\n");
  }

  async saveToKnowledgeBase(): Promise<void> {
    try {
      const transcript = await this.saveCurrentTranscript();
      if (!transcript || this.context.messages.length < 2) {
        throw new Error("No conversation to save");
      }

      const conversation = {
        title: `Dialogue on ${this.context.topic}`,
        participants: this.context.activePersonas || [],
        topic: this.context.topic || "Innovation and Creativity",
        transcript: transcript
      };

      const response = await fetch('/api/conversations', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(conversation)
      });

      if (!response.ok) {
        throw new Error('Failed to save conversation');
      }

      console.log("Conversation saved to knowledge base");
    } catch (error) {
      console.error('Error saving conversation:', error);
      throw error;
    }
  }
}

export const conversationManager = new ConversationManager();
