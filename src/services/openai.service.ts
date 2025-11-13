import { Injectable } from '@angular/core';
import OpenAI from 'openai';

@Injectable({
  providedIn: 'root',
})
export class OpenaiService {

  private isConnectionError(error: any): boolean {
    if (error && typeof error.message === 'string') {
        const message = error.message.toLowerCase();
        // openai-node SDK connection error name
        if (error.name === 'APIConnectionError') {
            return true;
        }
        // Browser fetch errors due to CORS, network issues, or from the user's provided error log
        if (message.includes('failed to fetch') || message.includes('connection error')) {
            return true;
        }
    }
    return false;
  }

  async listModels(apiKey: string, baseUrl: string): Promise<string[]> {
    try {
      const openai = new OpenAI({ apiKey, baseURL: baseUrl, dangerouslyAllowBrowser: true });
      const response = await openai.models.list();
      return response.data.map(model => model.id).sort();
    } catch (error) {
      console.error('Error fetching models from OpenAI-compatible API:', error);
      if (this.isConnectionError(error)) {
        throw new Error('Connection failed. This is likely a CORS issue. Please ensure your endpoint server is configured to allow requests from this origin.');
      }
      throw new Error('Failed to fetch models. Check endpoint and API key.');
    }
  }

  async optimizePrompt(
    originalPrompt: string, 
    currentPrompt: string, 
    changeRequest: string, 
    outputPreference: 'TEXT' | 'JSON', 
    targetModel: string, 
    promptObjective: string,
    apiKey: string, 
    baseUrl: string,
    executionModel: string,
    onContentStart: () => void,
    systemInstruction: string
  ): Promise<string> {
    const openai = new OpenAI({ apiKey, baseURL: baseUrl, dangerouslyAllowBrowser: true });

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
    
    try {
      const stream = await openai.chat.completions.create({
        model: executionModel,
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userRequest },
        ],
        temperature: 0.5,
        response_format: { type: 'json_object' },
        stream: true,
        max_tokens: 4096
      });

      let fullResponse = '';
      let contentHasStarted = false;
      for await (const chunk of stream) {
        fullResponse += chunk.choices[0]?.delta?.content || '';
        if (!contentHasStarted && fullResponse.includes('"optimizedPrompt"')) {
          contentHasStarted = true;
          onContentStart();
        }
      }
      return fullResponse.trim();
    } catch (error) {
      console.error('Error calling OpenAI-compatible API:', error);
      if (this.isConnectionError(error)) {
        throw new Error('Connection failed. This is likely a CORS issue. Please ensure your endpoint server is configured to allow requests from this origin.');
      }
      throw new Error('Failed to generate content from OpenAI-compatible API.');
    }
  }
}
