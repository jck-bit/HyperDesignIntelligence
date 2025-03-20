dotenv.config();

import * as dotenv from 'dotenv';
import { z } from "zod";

export class VoiceService {
  private apiKey: string;
  private useElevenLabs: boolean = true;
  private lastCallTimestamp: number = 0;
  private rateLimitDelay: number = 1000; // 1 second between calls

  constructor() {
    // Get API key from environment variables
    this.apiKey = process.env.VITE_ELEVENLABS_API_KEY || '';
    console.log("API Key in voice-service:", this.apiKey ? this.apiKey.substring(0, 4) + "..." : "Not found");

    // Check if API key is available and valid
    if (this.apiKey && this.apiKey.length > 10) {
      console.log("ElevenLabs service initialized with API key:", 
        this.apiKey.substring(0, 4) + "..." + this.apiKey.substring(this.apiKey.length - 4));
      this.useElevenLabs = true;
    } else {
      console.log("ElevenLabs API key not found - falling back to default voices");
      this.useElevenLabs = false;
    }
  }

  async synthesizeSpeech({ text, persona }: { 
    text: string; 
    persona?: string;
  }): Promise<Buffer | { fallback: true, text: string, persona?: string }> {
    if (!this.useElevenLabs) {
      console.warn('Using fallback voice mode since ElevenLabs is not available');
      return { fallback: true, text, persona };
    }

    if (!this.apiKey) {
      console.error('API key is missing but useElevenLabs is true - this should not happen');
      return { fallback: true, text, persona };
    }

    // Limit text length to stay within quota
    const maxChars = 150;
    const truncatedText = text.length > maxChars ? 
      text.substring(0, maxChars) + "..." : 
      text;

    // Add delay if needed
    const timeSinceLastCall = Date.now() - this.lastCallTimestamp;
    if (timeSinceLastCall < this.rateLimitDelay) {
      await new Promise(r => setTimeout(r, this.rateLimitDelay - timeSinceLastCall));
    }

    try {
      // Customize voice settings based on persona
      const isLeonardo = persona?.toLowerCase().includes('leonardo');
      const personalizedVoiceId = isLeonardo
        ? "ThT5KcBeYPX3keUQqHPh"  // Leonardo's voice
        : "AZnzlk1XvdvUeBnXmlld"; // Jobs' voice

      // Voice settings optimized for each persona
      const voiceSettings = {
        stability: isLeonardo ? 0.8 : 0.67,
        similarity_boost: isLeonardo ? 0.80 : 0.85,
        style: isLeonardo ? 0.35 : 0.65,
        use_speaker_boost: true
      };

      const requestPayload = {
        text: truncatedText,
        model_id: "eleven_monolingual_v1",
        voice_settings: voiceSettings
      };

      console.log('Making voice synthesis request:', {
        persona,
        voiceId: personalizedVoiceId,
        textLength: truncatedText.length
      });

      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${personalizedVoiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': this.apiKey
        },
        body: JSON.stringify(requestPayload)
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('ElevenLabs API error:', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText
        });
        return { fallback: true, text, persona };
      }

      this.lastCallTimestamp = Date.now();
      const arrayBuffer = await response.arrayBuffer();
      console.log('Voice synthesis successful:', {
        persona,
        audioSize: arrayBuffer.byteLength
      });
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error('Speech synthesis failed:', error);
      return { fallback: true, text, persona };
    }
  }

  async getVoices() {
    if (!this.useElevenLabs) {
      console.log('Using fallback voices');
      return [
        { voice_id: "ThT5KcBeYPX3keUQqHPh", name: "Leonardo da Vinci (Fallback)" },
        { voice_id: "AZnzlk1XvdvUeBnXmlld", name: "Steve Jobs (Fallback)" }
      ];
    }

    try {
      console.log('Fetching voices from ElevenLabs API...');

      const response = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: {
          'Accept': 'application/json',
          'xi-api-key': this.apiKey
        }
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('Error fetching voices:', {
          status: response.status,
          statusText: response.statusText,
          errorBody: errorText
        });
        return [
          { voice_id: "ThT5KcBeYPX3keUQqHPh", name: "Leonardo da Vinci (Fallback)" },
          { voice_id: "AZnzlk1XvdvUeBnXmlld", name: "Steve Jobs (Fallback)" }
        ];
      }

      const data = await response.json();
      return data.voices.map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name
      }));
    } catch (error) {
      console.error('Error fetching voices:', error);
      return [
        { voice_id: "ThT5KcBeYPX3keUQqHPh", name: "Leonardo da Vinci (Fallback)" },
        { voice_id: "AZnzlk1XvdvUeBnXmlld", name: "Steve Jobs (Fallback)" }
      ];
    }
  }
  private async generateConversation() {
    const speakers = ["Leonardo da Vinci", "Steve Jobs"];
    let currentSpeakerIndex = 0;

    const conversationScript = [
      "Design thinking is about understanding human needs and solving problems creatively.",
      "Innovation comes from saying no to 1,000 things to make sure we don't get on the wrong track.",
      "The beauty of design lies in its harmony with nature's principles.",
      "Design is not just what it looks like. Design is how it works.",
      "Every great design begins with an even better story.",
      "Simplicity is the ultimate sophistication in design."
    ];

    for (const line of conversationScript) {
      if (!this.isConversationActive) break;

      await this.synthesizeSpeech({
        text: line,
        persona: speakers[currentSpeakerIndex]
      });

      // Switch speakers
      currentSpeakerIndex = (currentSpeakerIndex + 1) % speakers.length;

      // Add pause between speakers
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
  // Add other necessary methods and properties here...
  private isConversationActive = false;
  private startTime: number = 0;
  private CONVERSATION_DURATION = 60000; // 60 seconds
  async startConversation() {
    this.isConversationActive = true;
    this.startTime = Date.now();
    await this.generateConversation();
    this.isConversationActive = false;
  }

  async stopConversation() {
    this.isConversationActive = false;
  }

}

export const voiceService = new VoiceService();
