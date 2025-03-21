
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
      console.log('Initializing conversation');
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

      // Initialize audio system before starting conversation
      try {
        await voiceService.initAudio();
      } catch (error) {
        console.warn('Failed to initialize audio, continuing without audio initialization:', error);
      }

      await this.handleUserInput(initialPrompt);
    } catch (error) {
      console.error('Failed to start conversation:', error);
      this.isInitialized = false;
      
      // Don't rethrow the error, just log it and continue
      // This prevents the application from crashing if conversation fails to start
      console.log('Conversation initialization failed, but application will continue');
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
        try {
          await this.startConversation();
        } catch (error) {
          console.error('Failed to initialize conversation during handleUserInput:', error);
          // Continue anyway - we'll try to handle the input even if initialization failed
        }
      }

      this.context.turnCount++;
      this.context.lastQuery = input;

      this.context.messages.push({
        role: "user",
        content: input
      });

      console.log('Sending request to OpenAI...');
      try {
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
        
        // Try to speak the response, but don't block the conversation if it fails
        try {
          await this.speak(aiResponse, currentSpeaker);
        } catch (speakError) {
          console.error('Error in speech synthesis, continuing without speech:', speakError);
        }
      } catch (aiError: any) {
        console.error('Error getting AI response:', aiError);
        
        // Create a fallback response
        const fallbackResponse = "I'm having trouble connecting to the AI service. Let's continue our exploration of innovation and design thinking. What aspects interest you most?";
        const fallbackSpeaker = "Leonardo da Vinci";
        
        this.context.messages.push({
          role: "assistant",
          content: fallbackResponse,
          persona: fallbackSpeaker
        });
        
        this.context.lastResponse = fallbackResponse;
        
        // Try to speak the fallback response
        try {
          await this.speak(fallbackResponse, fallbackSpeaker);
        } catch (speakError) {
          console.error('Error in fallback speech synthesis:', speakError);
        }
      }
    } catch (error: any) {
      console.error('Unhandled error in conversation:', error);
      const errorMessage = error.message.includes('quota_exceeded')
        ? "Voice synthesis quota exceeded. Please try again later."
        : "I apologize, but I'm having trouble processing that request. Could you try again?";

      try {
        await this.speak(errorMessage);
      } catch (speakError) {
        console.error('Error speaking error message:', speakError);
      }
      
      // Don't rethrow the error, just log it and continue
      console.log('Conversation error handled, application will continue');
    }
  }

  private async speak(text: string, persona?: string): Promise<void> {
    if (!text.trim()) return;

    try {
      console.log(`Attempting to speak as ${persona || 'default'}: "${text.substring(0, 30)}..."`);
      
      // Set a timeout to prevent the speech synthesis from blocking the conversation for too long
      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => {
          reject(new Error('Speech synthesis timed out'));
        }, 10000); // 10 second timeout
      });
      
      // Try to synthesize speech with a timeout
      await Promise.race([
        voiceService.synthesizeSpeech({
          text,
          persona
        }),
        timeoutPromise
      ]);
    } catch (error) {
      console.error('Error in speech synthesis:', error);
      // Don't rethrow the error, just log it and continue
      console.log('Speech synthesis failed, continuing without speech');
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
