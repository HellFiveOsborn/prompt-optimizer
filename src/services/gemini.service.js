// Gemini Service - Converted to JavaScript for React
import { GoogleGenAI, Type } from '@google/genai';

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
      Here is the information for the prompt optimization task:

      - **Original Prompt (for context):**
        "${originalPrompt}"

      - **Current Prompt (to be improved and used for diff):**
        "${currentPrompt}"
      
      - **User's Change Request (optional, prioritize this):**
        "${changeRequest || 'No specific changes requested. Apply general best practices.'
      }"

      - **Desired Output Format for the final AI task (this is a constraint for your optimized prompt, NOT for your response format):**
        "${outputPreference}"

      - **Target Model (for prompt optimization):**
        "${targetModel}"

      - **Prompt Objective (guides the optimization style):**
        "${promptObjective}"
      `;

    try {
      // Use the ai.models.generateContentStream API
      const result = await ai.models.generateContentStream({
        model: model,
        contents: userRequest,
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              optimizedPrompt: { type: Type.STRING },
              fullPromptDiffHtml: { type: Type.STRING },
              changes: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    reasoning: { type: Type.STRING },
                  },
                  required: ['reasoning']
                }
              }
            },
            required: ['optimizedPrompt', 'fullPromptDiffHtml', 'changes']
          },
          temperature: 0.5,
          maxOutputTokens: 8192,
        }
      });

      let fullResponse = '';
      let contentHasStarted = false;

      // The result is the stream, and chunk.text is a property
      for await (const chunk of result) {
        const chunkText = chunk.text;
        if (!contentHasStarted && chunkText) {
          contentHasStarted = true;
          onContentStart();
        }
        fullResponse += chunkText;
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