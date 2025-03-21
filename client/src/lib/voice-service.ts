
// Voice settings interface
export interface VoiceSettings {
  stability: number;
  similarityBoost: number;
  style: number;
  speakerBoost: boolean;
}

// Voice option interface
export interface VoiceOption {
  voice_id: string;
  name: string;
}

export class VoiceService {
  private apiUrl = '/api';
  private selectedVoice: string = "21m00Tcm4TlvDq8ikWAM";
  private settings: VoiceSettings = {
    stability: 0.75,
    similarityBoost: 0.75,
    style: 0.5,
    speakerBoost: true
  };

  async initAudio(): Promise<void> {
    try {
      // Preload audio context to handle autoplay restrictions
      const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
      if (AudioContext) {
        const audioContext = new AudioContext();
        // Create and immediately suspend a short sound to initialize audio
        const oscillator = audioContext.createOscillator();
        oscillator.connect(audioContext.destination);
        oscillator.start();
        oscillator.stop(0.001);
        if (audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        console.log('Audio system initialized');
      }
    } catch (error) {
      console.warn('Could not initialize audio system:', error);
    }
  }

  async speak(text: string, persona?: string): Promise<void> {
    try {
      console.log(`Attempting to speak: "${text.substring(0, 30)}..." as ${persona || 'default'}`);
      
      // Try server-side synthesis first
      try {
        console.log('Attempting server-side speech synthesis');
        const response = await fetch(`${this.apiUrl}/synthesize`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ text, persona })
        });

        if (!response.ok) {
          console.warn(`Voice API returned ${response.status}, falling back to browser speech`);
          throw new Error(`Voice API returned ${response.status}`);
        }

        // Check if the response is JSON (fallback indicator)
        const contentType = response.headers.get('content-type');
        if (contentType && contentType.includes('application/json')) {
          const fallbackData = await response.json();
          console.log('Server returned JSON instead of audio, using fallback speech:', fallbackData);
          return this.useBrowserSpeech(fallbackData.text || text, persona);
        }

        // Process audio response
        const blob = await response.blob();
        if (blob.size === 0) {
          console.warn('Received empty audio blob, falling back to browser speech');
          throw new Error('Empty audio response');
        }

        const audioUrl = URL.createObjectURL(blob);
        const audio = new Audio(audioUrl);

        return new Promise((resolve, reject) => {
          audio.onended = () => {
            URL.revokeObjectURL(audioUrl);
            resolve();
          };

          audio.onerror = (err) => {
            console.error('Audio playback error:', err);
            URL.revokeObjectURL(audioUrl);
            // Try browser speech as fallback
            this.useBrowserSpeech(text, persona)
              .then(resolve)
              .catch(reject);
          };

          // Pre-load the audio
          audio.load();
          
          // Try to play the audio
          audio.play().catch(err => {
            console.error('Error playing audio:', err);
            URL.revokeObjectURL(audioUrl);
            // Try browser speech as fallback
            this.useBrowserSpeech(text, persona)
              .then(resolve)
              .catch(reject);
          });
        });
      } catch (error) {
        console.warn('Server-side synthesis failed, using browser speech:', error);
        return this.useBrowserSpeech(text, persona);
      }
    } catch (error) {
      console.error('All speech synthesis methods failed:', error);
      // Just resolve the promise to prevent blocking the conversation
      return Promise.resolve();
    }
  }

  async synthesizeSpeech({ text, persona }: { text: string; persona?: string }): Promise<void> {
    return this.speak(text, persona);
  }

  private async useBrowserSpeech(text: string, persona?: string): Promise<void> {
    return new Promise((resolve) => {
      const utterance = new SpeechSynthesisUtterance(text);

      // Try to match a voice that sounds most like the persona
      if (persona && window.speechSynthesis.getVoices().length > 0) {
        const voices = window.speechSynthesis.getVoices();
        // Simple matching algorithm - could be improved
        const personaLower = persona.toLowerCase();
        const matchVoice = voices.find(v => 
          v.name.toLowerCase().includes(personaLower) || 
          (v.lang.startsWith('en') && v.name.includes('Male')) // default for most personas
        );

        if (matchVoice) {
          utterance.voice = matchVoice;
        }
      }

      utterance.onend = () => resolve();

      window.speechSynthesis.speak(utterance);
    });
  }

  startListening(): Promise<void> {
    console.log('Starting voice listening');
    // Implementation for voice listening
    return Promise.resolve();
  }

  async getAvailableVoices(): Promise<VoiceOption[]> {
    try {
      const response = await fetch(`${this.apiUrl}/voices`);

      if (!response.ok) {
        throw new Error(`Voice API returned ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching voices:', error);
      return [];
    }
  }

  setVoice(voiceId: string): void {
    this.selectedVoice = voiceId;
  }

  updateSettings(settings: Partial<VoiceSettings>): void {
    this.settings = { ...this.settings, ...settings };
  }
}

// Export a singleton instance
export const voiceService = new VoiceService();
