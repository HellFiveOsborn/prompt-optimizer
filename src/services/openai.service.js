// OpenAI Service - Converted to JavaScript for React
import { createOpenAI } from '@ai-sdk/openai';
import { streamText } from 'ai';

export class OpenaiService {

  isConnectionError(error) {
    if (error && typeof error.message === 'string') {
      const message = error.message.toLowerCase();
      // openai-node SDK connection error name (legacy check)
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

  async listModels(apiKey, baseUrl) {
    try {
      let url;
      const headers = {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      };

      // In development, use local proxy to bypass CORS
      if (process.env.NODE_ENV === 'development') {
        url = '/api/proxy/models';
        headers['x-target-url'] = baseUrl;
      } else {
        // In production, use direct URL (server must support CORS)
        url = baseUrl.endsWith('/') ? `${baseUrl}models` : `${baseUrl}/models`;
      }

      const response = await fetch(url, {
        method: 'GET',
        headers
      });

      // Check if we got HTML back (SPA fallback), which means proxy failed or 404
      const contentType = response.headers.get('content-type');
      if (contentType && contentType.includes('text/html')) {
        throw new Error('Endpoint returned HTML instead of JSON. Check your configuration.');
      }

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error?.message || `HTTP Error ${response.status}`);
      }

      const data = await response.json();
      // Verify data structure matches OpenAI format { data: [{id: ...}, ...] }
      if (!data.data || !Array.isArray(data.data)) {
        // Some proxy providers might return the array directly
        if (Array.isArray(data)) {
          return data.map(model => model.id).sort();
        }
        throw new Error('Invalid response format from models endpoint');
      }

      return data.data.map(model => model.id).sort();
    } catch (error) {
      console.error('Error fetching models from OpenAI-compatible API:', error);
      if (this.isConnectionError(error)) {
        throw new Error('Connection failed. This is likely a CORS issue. Please ensure your endpoint server is configured to allow requests from this origin.');
      }
      throw new Error('Failed to fetch models. Check endpoint and API key.');
    }
  }

  async optimizePrompt(
    originalPrompt,
    currentPrompt,
    changeRequest,
    outputPreference,
    targetModel,
    promptObjective,
    apiKey,
    baseUrl,
    executionModel,
    onContentStart,
    systemInstruction
  ) {
    // Configure OpenAI provider based on environment
    const openaiConfig = {
      apiKey,
      // Vercel AI SDK handles browser compatibility automatically
    };

    if (process.env.NODE_ENV === 'development') {
      // Use local proxy in development
      openaiConfig.baseURL = '/api/proxy';
      openaiConfig.headers = {
        'x-target-url': baseUrl
      };
    } else {
      // Use direct URL in production
      openaiConfig.baseURL = baseUrl;
    }

    const openai = createOpenAI(openaiConfig);

    try {
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

      const result = await streamText({
        model: openai(executionModel),
        messages: [
          { role: 'system', content: systemInstruction },
          { role: 'user', content: userRequest },
        ],
        temperature: 0.5,
        maxTokens: 4096,
      });

      let fullResponse = '';
      let contentHasStarted = false;

      for await (const chunk of result.textStream) {
        fullResponse += chunk;
        if (!contentHasStarted && fullResponse.includes('<PROMPT_OPTIMIZER_')) {
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
