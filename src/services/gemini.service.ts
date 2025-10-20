import { Injectable } from '@angular/core';
import { GoogleGenAI, GenerateContentResponse, Type } from '@google/genai';
import { SYSTEM_INSTRUCTION } from './system-prompt';

@Injectable({
  providedIn: 'root',
})
export class GeminiService {
  private keyFromEnv = process.env.API_KEY;

  isKeyFromEnv(): boolean {
    return !!this.keyFromEnv;
  }

  getEnvKey(): string | undefined {
    return this.keyFromEnv;
  }

  async optimizePrompt(originalPrompt: string, currentPrompt: string, changeRequest: string, outputPreference: 'TEXT' | 'JSON', targetModel: string, promptObjective: string, apiKey: string, model: string, onContentStart: () => void): Promise<string> {
    if (!apiKey) {
      throw new Error('Gemini API key is missing.');
    }

    try {
      const ai = new GoogleGenAI({ apiKey });
      const userRequest = `
      Here is the information for the prompt optimization task:

      - **Original Prompt (for context):**
        "${originalPrompt}"

      - **Current Prompt (to be improved and used for diff):**
        "${currentPrompt}"
      
      - **User's Change Request (optional, prioritize this):**
        "${changeRequest || 'No specific changes requested. Apply general best practices.'}"

      - **Desired Output Format for the final AI task (this is a constraint for your optimized prompt, NOT for your response format):**
        "${outputPreference}"

      - **Target Model (for prompt optimization):**
        "${targetModel}"

      - **Prompt Objective (guides the optimization style):**
        "${promptObjective}"
      `;

      const responseStream = await ai.models.generateContentStream({
        model,
        contents: userRequest,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 0.5,
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
                  }
                }
              }
            }
          }
        }
      });
      
      let fullResponse = '';
      let contentHasStarted = false;
      for await (const chunk of responseStream) {
        fullResponse += chunk.text;
        if (!contentHasStarted && fullResponse.includes('"optimizedPrompt"')) {
          contentHasStarted = true;
          onContentStart();
        }
      }
      return fullResponse.trim();
    } catch (error) {
      console.error('Error calling Gemini API:', error);
      throw new Error('Failed to generate content from Gemini API.');
    }
  }
}
