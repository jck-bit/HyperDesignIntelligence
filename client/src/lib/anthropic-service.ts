import Anthropic from '@anthropic-ai/sdk';

// the newest Anthropic model is "claude-3-5-sonnet-20241022" which was released October 22, 2024
const anthropic = new Anthropic({
  apiKey: import.meta.env.VITE_ANTHROPIC_API_KEY,
});

class AnthropicService {
  async getResponse(userInput: string): Promise<string> {
    try {
      const message = await anthropic.messages.create({
        max_tokens: 1024,
        messages: [{ role: 'user', content: userInput }],
        model: 'claude-3-5-sonnet-20241022',
      });

      return message.content[0].text;
    } catch (error) {
      console.error('Anthropic API error:', error);
      throw error;
    }
  }
}

export const anthropicService = new AnthropicService();
