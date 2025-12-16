// Gemini Service - Converted to JavaScript for React
import { GoogleGenAI } from '@google/genai';

export class GeminiService {
  constructor() {
    this.keyFromEnv = undefined;
  }

  isKeyFromEnv() {
    return !!this.keyFromEnv;
  }

  getEnvKey() {
    return this.keyFromEnv;
  }

  async optimizePrompt(
    originalPrompt,
    currentPrompt,
    changeRequest,
    outputPreference,
    targetModel,
    promptObjective,
    apiKey,
    model,
    onContentStart,
    systemInstruction
  ) {
    if (!apiKey) {
      throw new Error('Gemini API key is missing.');
    }

    // Instantiate GoogleGenAI with a named apiKey parameter
    const ai = new GoogleGenAI({ apiKey });

    const userRequest = `
      <PROMPT_OPTIMIZER_INPUT>
      ${currentPrompt}
      </PROMPT_OPTIMIZER_INPUT>

      <PROMPT_OPTIMIZER_CONTEXT_ORIGINAL>
      ${originalPrompt}
      </PROMPT_OPTIMIZER_CONTEXT_ORIGINAL>

      <PROMPT_OPTIMIZER_REQ_CHANGES>
      ${changeRequest || 'No specific changes requested. Apply general best practices.'}
      </PROMPT_OPTIMIZER_REQ_CHANGES>

      <PROMPT_OPTIMIZER_TARGET_MODEL>
      ${targetModel}
      </PROMPT_OPTIMIZER_TARGET_MODEL>

      <PROMPT_OPTIMIZER_OBJECTIVE>
      ${promptObjective}
      </PROMPT_OPTIMIZER_OBJECTIVE>

      <PROMPT_OPTIMIZER_OUTPUT_FORMAT>
      ${outputPreference}
      </PROMPT_OPTIMIZER_OUTPUT_FORMAT>
      `;

    try {
      // Use the ai.models.generateContentStream API
      const result = await ai.models.generateContentStream({
        model: model,
        contents: userRequest,
        config: {
          systemInstruction: systemInstruction,
          temperature: 0.5,
          maxOutputTokens: 8192,
        }
      });

      let fullResponse = '';
      let contentHasStarted = false;

      // The result is the stream, and chunk.text is a property
      for await (const chunk of result) {
        const chunkText = chunk.text;
        if (!contentHasStarted && (fullResponse + (chunkText || '')).includes('<PROMPT_OPTIMIZER_')) {
          contentHasStarted = true;
          onContentStart();
        }
        if (chunkText) {
          fullResponse += chunkText;
        }
      }
      return fullResponse.trim();
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      if (error instanceof Error) {
        throw new Error(`Failed to generate content from Gemini API: ${error.message}`);
      }
      throw new Error('An unknown error occurred while calling the Gemini API.');
    }
  }
}