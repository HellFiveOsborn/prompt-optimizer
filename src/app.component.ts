import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { GeminiService } from './services/gemini.service';
import { OpenaiService } from './services/openai.service';
import { SYSTEM_INSTRUCTION } from './services/system-prompt';
import { SYSTEM_INSTRUCTION_VISUAL } from './services/system-prompt-visual';

interface Change {
  reasoning: string;
}

interface OptimizedPromptResponse {
  optimizedPrompt: string;
  fullPromptDiffHtml: string;
  changes: Change[];
}

interface HistoryItem extends OptimizedPromptResponse {
  originalPrompt: string;
  targetModel: string;
  promptObjective: string;
  timestamp: Date;
  additions: number;
  deletions: number;
  changeRequest: string;
}

interface GroupedHistoryItem {
  originalPrompt: string;
  items: HistoryItem[];
}

interface GeminiSettings {
  apiKey: string;
  model: string;
}

interface OpenAISettings {
  endpoint: string;
  apiKey: string;
  models: string[];
  executionModel: string;
}

interface OptimizerSettings {
  provider: 'gemini' | 'openai';
  gemini: GeminiSettings;
  openai: OpenAISettings;
}

type TempSettings = {
  gemini: GeminiSettings;
  openai: OpenAISettings;
};

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class AppComponent {
  private geminiService = inject(GeminiService);
  private openaiService = inject(OpenaiService);

  // State Signals
  userPrompt = signal('');
  originalPrompt = signal('');
  changeRequest = signal('');
  optimizedPrompt = signal('');
  isLoading = signal(false);
  loadingMessage = signal('Analyzing and optimizing...');
  error = signal<string | null>(null);
  copied = signal(false);
  outputPreference = signal<'TEXT' | 'JSON'>('TEXT');
  showChanges = signal(false);
  targetModel = signal<string>('universal');
  promptObjective = signal<string>('general');
  isThinking = signal(false);
  thinkingTime = signal(0);
  
  // UI State Signals
  isSidebarCollapsed = signal(false);
  searchTerm = signal('');

  // History Signals
  history = signal<HistoryItem[]>([]);
  activeHistoryIndex = signal<number | null>(null);

  // Settings Signals
  showSettingsModal = signal(false);
  activeSettingsTab = signal<'gemini' | 'openai'>('gemini');
  private defaultSettings: OptimizerSettings = {
    provider: 'gemini',
    gemini: {
      apiKey: '',
      model: 'gemini-2.5-flash'
    },
    openai: {
      endpoint: '',
      apiKey: '',
      models: [],
      executionModel: ''
    }
  };
  settings = signal<OptimizerSettings>(this.defaultSettings);
  tempSettings = signal<TempSettings>({ 
    gemini: { apiKey: '', model: 'gemini-2.5-flash' },
    openai: { endpoint: '', apiKey: '', models: [], executionModel: '' }
  });
  isFetchingModels = signal(false);
  fetchModelsError = signal<string | null>(null);
  isGeminiKeyFromEnv = signal(false);
  availableGeminiModels = ['gemini-2.5-flash'];

  private loadingInterval: any;
  private thinkingInterval: any;
  private readonly LOADING_MESSAGES = [
    'Analyzing prompt structure...',
    'Identifying key intent...',
    'Comparing against best practices...',
    'Adapting for target model...',
    'Generating optimized version...',
    'Calculating differences...',
    'Finalizing improvements...'
  ];

  private allModels = [
    { value: 'universal', name: 'Any' },
    { value: 'gpt', name: 'GPT (Family)' },
    { value: 'claude', name: 'Claude (Family)' },
    { value: 'gemini', name: 'Gemini (Family)' },
    { value: 'deepseek', name: 'DeepSeek (Family)' },
    { value: 'qwen', name: 'Qwen (Family)' },
    { value: 'gpt-image-1', name: 'GPT-Image-1 (4o)' },
    { value: 'gemini-flash', name: 'Gemini Flash (Nano Banana)' },
    { value: 'midjourney', name: 'Midjourney' },
    { value: 'stable-diffusion', name: 'Stable Diffusion' },
    { value: 'flux', name: 'FLUX' },
    { value: 'veo', name: 'Veo (Family)' },
    { value: 'sora', name: 'Sora (Family)' },
    { value: 'kling', name: 'Kling (Family)' },
    { value: 'wan', name: 'Wan (Family)' },
  ];

  constructor() {
    this.isGeminiKeyFromEnv.set(this.geminiService.isKeyFromEnv());
    const savedSettings = localStorage.getItem('optimizer_settings');
    if (savedSettings) {
      const parsed = JSON.parse(savedSettings);
      // Migration from old flat structure
      if ('endpoint' in parsed || !('gemini' in parsed)) {
        const newSettings: OptimizerSettings = {
            provider: parsed.provider || 'gemini',
            gemini: {
                apiKey: '',
                model: 'gemini-2.5-flash'
            },
            openai: {
                endpoint: parsed.endpoint || '',
                apiKey: parsed.apiKey || '',
                models: parsed.models || [],
                executionModel: parsed.executionModel || ''
            }
        };
        this.settings.set(newSettings);
        localStorage.setItem('optimizer_settings', JSON.stringify(newSettings));
      } else {
        // Deep merge with defaults to handle new properties added later
        const loadedSettings = {
            ...this.defaultSettings,
            ...parsed,
            gemini: {...this.defaultSettings.gemini, ...(parsed.gemini || {})},
            openai: {...this.defaultSettings.openai, ...(parsed.openai || {})}
        };
        this.settings.set(loadedSettings);
      }
    }

    const savedHistory = localStorage.getItem('optimizer_history');
    if (savedHistory) {
      const parsedHistory = JSON.parse(savedHistory, (key, value) => {
        if (key === 'timestamp' && typeof value === 'string') {
          return new Date(value);
        }
        return value;
      });
      this.history.set(parsedHistory);
    }

    if (this.isGeminiKeyFromEnv()) {
      this.settings.update(s => ({
        ...s,
        gemini: { ...s.gemini, apiKey: this.geminiService.getEnvKey()! }
      }));
    }

    // Auto-save history to localStorage whenever it changes.
    effect(() => {
        if (this.history().length > 0) {
            localStorage.setItem('optimizer_history', JSON.stringify(this.history()));
        } else {
            localStorage.removeItem('optimizer_history');
        }
    });

    effect(() => {
      if (this.isLoading()) {
        this.startLoadingAnimation();
      } else {
        this.stopLoadingAnimation();
      }
    });
  }

  activeHistoryItem = computed(() => {
    const index = this.activeHistoryIndex();
    if (index === null) return null;
    return this.history()[index];
  });

  groupedHistory = computed((): GroupedHistoryItem[] => {
    const historyItems = this.history();
    if (historyItems.length === 0) {
      return [];
    }

    const groups = new Map<string, HistoryItem[]>();
    // Group by original prompt
    for (const item of historyItems) {
      if (!groups.has(item.originalPrompt)) {
        groups.set(item.originalPrompt, []);
      }
      groups.get(item.originalPrompt)!.push(item);
    }
    
    const term = this.searchTerm().toLowerCase().trim();
    if (!term) {
      return Array.from(groups.entries()).map(([originalPrompt, items]) => ({
        originalPrompt,
        items
      }));
    }

    const filteredGroups: GroupedHistoryItem[] = [];
    for (const [originalPrompt, items] of groups.entries()) {
        const isGroupTitleMatch = originalPrompt.toLowerCase().includes(term);
        
        if (isGroupTitleMatch) {
            filteredGroups.push({ originalPrompt, items });
            continue;
        }

        const matchingItems = items.filter(item => 
            item.optimizedPrompt.toLowerCase().includes(term) ||
            (item.changeRequest && item.changeRequest.toLowerCase().includes(term))
        );

        if (matchingItems.length > 0) {
            filteredGroups.push({
                originalPrompt,
                items: matchingItems
            });
        }
    }
    return filteredGroups;
  });

  availableModels = computed(() => {
    const objective = this.promptObjective();
    if (objective === 'image') {
      return [
        { value: 'universal', name: 'Any' },
        { value: 'gpt-image-1', name: 'GPT-Image-1 (4o)' },
        { value: 'gemini-flash', name: 'Gemini Flash (Nano Banana)' },
        { value: 'midjourney', name: 'Midjourney' },
        { value: 'stable-diffusion', name: 'Stable Diffusion' },
        { value: 'flux', name: 'FLUX' },
      ];
    }
    if (objective === 'video') {
      return [
        { value: 'universal', name: 'Any' },
        { value: 'veo', name: 'Veo (Family)' },
        { value: 'sora', name: 'Sora (Family)' },
        { value: 'kling', name: 'Kling (Family)' },
        { value: 'wan', name: 'Wan (Family)' },
      ];
    }
    return [
      { value: 'universal', name: 'Any' },
      { value: 'gpt', name: 'GPT (Family)' },
      { value: 'claude', name: 'Claude (Family)' },
      { value: 'gemini', name: 'Gemini (Family)' },
      { value: 'deepseek', name: 'DeepSeek (Family)' },
      { value: 'qwen', name: 'Qwen (Family)' }
    ];
  });

  availableObjectives = computed(() => {
    return [
      { value: 'general', name: 'General' },
      { value: 'coding', name: 'Coding' },
      { value: 'technical', name: 'Technical' },
      { value: 'writing', name: 'Writing' },
      { value: 'instructional', name: 'Instructional' },
      { value: 'image', name: 'Image' },
      { value: 'video', name: 'Video' },
    ];
  });

  getModelName(value: string): string {
    return this.allModels.find(m => m.value === value)?.name ?? value;
  }
  
  getObjectiveName(value: string): string {
    return this.availableObjectives().find(m => m.value === value)?.name ?? value;
  }

  onPromptInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.userPrompt.set(target.value);
  }

  onChangesInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement;
    this.changeRequest.set(target.value);
  }

  onSearchTermInput(event: Event): void {
    this.searchTerm.set((event.target as HTMLInputElement).value);
  }
  
  onModelChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.targetModel.set(target.value);
  }

  onObjectiveChange(event: Event): void {
    const target = event.target as HTMLSelectElement;
    this.promptObjective.set(target.value);
    this.targetModel.set('universal');
  }

  toggleChanges(): void {
    this.showChanges.set(!this.showChanges());
  }
  
  toggleSidebar(): void {
    this.isSidebarCollapsed.update(v => !v);
  }

  private calculateWordDiff(html: string): { additions: number; deletions: number } {
    if (typeof DOMParser === 'undefined') { // Guard for non-browser environments
      const additions = (html.match(/<ins>/g) || []).length;
      const deletions = (html.match(/<del>/g) || []).length;
      return { additions, deletions };
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${html}</div>`, 'text/html');
    
    const countWords = (text: string | null): number => {
      if (!text || !text.trim()) return 0;
      return text.trim().split(/\s+/).length;
    };

    const additions = Array.from(doc.querySelectorAll('ins')).reduce(
      (acc, el) => acc + countWords(el.textContent), 0
    );

    const deletions = Array.from(doc.querySelectorAll('del')).reduce(
      (acc, el) => acc + countWords(el.textContent), 0
    );

    return { additions, deletions };
  }

  async optimizePrompt(): Promise<void> {
    const promptToOptimize = this.userPrompt().trim();
    if (!promptToOptimize) {
      return;
    }

    this.isLoading.set(true);
    this.startThinkingTimer();
    if (!this.originalPrompt() || this.activeHistoryIndex() === null) {
      this.originalPrompt.set(promptToOptimize);
    }
    this.error.set(null);

    try {
      const isIterating = this.activeHistoryIndex() !== null;
      const currentPrompt = this.userPrompt();
      const originalPromptForApi = isIterating ? currentPrompt : this.originalPrompt();
      const currentSettings = this.settings();
      const objective = this.promptObjective();
      const systemInstruction = (objective === 'image' || objective === 'video')
        ? SYSTEM_INSTRUCTION_VISUAL
        : SYSTEM_INSTRUCTION;
      
      let resultString: string;
      const onContentStart = () => {
        this.stopThinkingTimer();
      };

      if (currentSettings.provider === 'openai' && currentSettings.openai.endpoint && currentSettings.openai.apiKey) {
        if (!currentSettings.openai.executionModel) {
          this.error.set('No execution model is selected. Please go to Settings, fetch models, and save your selection.');
          this.isLoading.set(false);
          this.stopThinkingTimer();
          return;
        }
        resultString = await this.openaiService.optimizePrompt(
          originalPromptForApi,
          currentPrompt,
          this.changeRequest(),
          this.outputPreference(),
          this.targetModel(),
          this.promptObjective(),
          currentSettings.openai.apiKey,
          currentSettings.openai.endpoint,
          currentSettings.openai.executionModel,
          onContentStart,
          systemInstruction
        );
      } else {
        const { apiKey, model } = currentSettings.gemini;
         if (!apiKey) {
          this.error.set('Gemini API Key is not set. Please add it in Settings.');
          this.isLoading.set(false);
          this.stopThinkingTimer();
          return;
        }
        resultString = await this.geminiService.optimizePrompt(
          originalPromptForApi, 
          currentPrompt, 
          this.changeRequest(),
          this.outputPreference(),
          this.targetModel(),
          this.promptObjective(),
          apiKey,
          model,
          onContentStart,
          systemInstruction
        );
      }
      
      let result: Partial<OptimizedPromptResponse>;
      try {
        // The model might return the JSON wrapped in markdown like ```json ... ``` or with other text.
        // We will extract the main JSON object from the string.
        let jsonString = resultString.trim();
        const jsonMatch = jsonString.match(/```(json)?\s*(\{[\s\S]*\})\s*```/);

        if (jsonMatch && jsonMatch[2]) {
          jsonString = jsonMatch[2];
        } else {
            // Fallback for raw JSON that might have leading/trailing text
            const jsonStart = jsonString.indexOf('{');
            const jsonEnd = jsonString.lastIndexOf('}');
            if (jsonStart !== -1 && jsonEnd !== -1 && jsonEnd > jsonStart) {
                jsonString = jsonString.substring(jsonStart, jsonEnd + 1);
            }
        }
        
        result = JSON.parse(jsonString);
      } catch (parseError) {
        console.error('Failed to parse JSON response from model:', parseError);
        console.error('Original response string:', resultString);
        // Rethrow with a more user-friendly message
        throw new Error('The model returned data in an unexpected format. Please check the console for details and try again.');
      }

      const safeChanges = result.changes || [];
      const safeOptimizedPrompt = result.optimizedPrompt || currentPrompt;
      const safeFullPromptDiffHtml = result.fullPromptDiffHtml || safeOptimizedPrompt;

      const { additions, deletions } = this.calculateWordDiff(safeFullPromptDiffHtml);

      const newHistoryItem: HistoryItem = {
        changes: safeChanges,
        optimizedPrompt: safeOptimizedPrompt,
        fullPromptDiffHtml: safeFullPromptDiffHtml,
        originalPrompt: this.originalPrompt(),
        targetModel: this.targetModel(),
        promptObjective: this.promptObjective(),
        timestamp: new Date(),
        additions,
        deletions,
        changeRequest: this.changeRequest()
      };

      this.history.update(current => [newHistoryItem, ...current]);
      this.viewHistoryItem(0);
      this.changeRequest.set('');

    } catch (e: any) {
      this.error.set(e.message || 'An error occurred while optimizing the prompt. The model may have returned an invalid format. Please try again.');
      console.error(e);
    } finally {
      this.isLoading.set(false);
      this.stopThinkingTimer();
    }
  }

  viewHistoryItem(index: number): void {
    const item = this.history()[index];
    if (!item) return;

    this.activeHistoryIndex.set(index);
    this.originalPrompt.set(item.originalPrompt);
    this.optimizedPrompt.set(item.optimizedPrompt);
    this.userPrompt.set(item.optimizedPrompt);
    this.targetModel.set(item.targetModel);
    this.promptObjective.set(item.promptObjective);
    this.showChanges.set(false);
    this.isLoading.set(false);
    this.error.set(null);
    this.copied.set(false);
  }

  viewLatestItemOfGroup(group: GroupedHistoryItem): void {
    if (!group.items.length) return;

    const latestItem = group.items[0];
    const flatIndex = this.history().indexOf(latestItem);

    if (flatIndex > -1) {
      this.viewHistoryItem(flatIndex);
    }
  }

  startNewOptimizationFrom(originalPrompt: string): void {
    const latestItemInGroup = this.history().find(item => item.originalPrompt === originalPrompt);

    this.activeHistoryIndex.set(null);
    this.userPrompt.set(originalPrompt);
    this.originalPrompt.set(originalPrompt);
    this.optimizedPrompt.set('');
    this.changeRequest.set('');
    this.error.set(null);
    this.isLoading.set(false);

    if (latestItemInGroup) {
      this.targetModel.set(latestItemInGroup.targetModel);
      this.promptObjective.set(latestItemInGroup.promptObjective);
    } else {
      this.targetModel.set('universal');
      this.promptObjective.set('general');
    }
  }

  copyToClipboard(): void {
    if (!this.optimizedPrompt()) return;

    navigator.clipboard.writeText(this.optimizedPrompt()).then(() => {
      this.copied.set(true);
      setTimeout(() => {
        this.copied.set(false);
      }, 2000);
    }).catch(err => {
      console.error('Failed to copy text: ', err);
      this.error.set('Failed to copy text to clipboard.');
    });
  }

  startNewPrompt(): void {
    this.userPrompt.set('');
    this.originalPrompt.set('');
    this.optimizedPrompt.set('');
    this.changeRequest.set('');
    this.error.set(null);
    this.isLoading.set(false);
    this.activeHistoryIndex.set(null);
    this.targetModel.set('universal');
    this.promptObjective.set('general');
  }

  openSettingsModal(): void {
    const current = this.settings();
    this.tempSettings.set({
      gemini: { ...current.gemini },
      openai: { ...current.openai }
    });
    this.fetchModelsError.set(null);
    this.showSettingsModal.set(true);
    this.activeSettingsTab.set(current.provider);
  }

  closeSettingsModal(): void {
    this.showSettingsModal.set(false);
  }

  onTempGeminiApiKeyInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.tempSettings.update(s => ({ ...s, gemini: { ...s.gemini, apiKey: value } }));
  }

  onTempGeminiModelChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.tempSettings.update(s => ({ ...s, gemini: { ...s.gemini, model: value } }));
  }

  onTempEndpointInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.tempSettings.update(s => ({ ...s, openai: { ...s.openai, endpoint: value } }));
  }

  onTempApiKeyInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.tempSettings.update(s => ({ ...s, openai: { ...s.openai, apiKey: value } }));
  }
  
  onTempModelChange(event: Event): void {
    const value = (event.target as HTMLSelectElement).value;
    this.tempSettings.update(s => ({ ...s, openai: { ...s.openai, executionModel: value } }));
  }

  async fetchModels(): Promise<void> {
    this.isFetchingModels.set(true);
    this.fetchModelsError.set(null);
    const { apiKey, endpoint } = this.tempSettings().openai;
    if (!apiKey || !endpoint) {
      this.fetchModelsError.set('API Key and Endpoint URL are required.');
      this.isFetchingModels.set(false);
      return;
    }

    try {
      const models = await this.openaiService.listModels(apiKey, endpoint);
      this.tempSettings.update(s => ({ 
        ...s, 
        openai: { ...s.openai, models, executionModel: models[0] || '' } 
      }));
    } catch (e: any) {
      this.fetchModelsError.set(e.message || 'An unknown error occurred.');
      this.tempSettings.update(s => ({...s, openai: {...s.openai, models: [], executionModel: ''}}));
    } finally {
      this.isFetchingModels.set(false);
    }
  }

  saveSettings(): void {
    const temp = this.tempSettings();
    const isOpenAIConfigured = temp.openai.endpoint && temp.openai.apiKey && temp.openai.models.length > 0 && temp.openai.executionModel;
    
    const newSettings: OptimizerSettings = {
      provider: isOpenAIConfigured ? 'openai' : 'gemini',
      gemini: { ...temp.gemini },
      openai: { ...temp.openai }
    };

    this.settings.set(newSettings);
    localStorage.setItem('optimizer_settings', JSON.stringify(newSettings));
    
    this.closeSettingsModal();
  }


  private startLoadingAnimation(): void {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
    }
    let messageIndex = 0;
    this.loadingMessage.set(this.LOADING_MESSAGES[messageIndex]);
    this.loadingInterval = setInterval(() => {
      messageIndex = (messageIndex + 1) % this.LOADING_MESSAGES.length;
      this.loadingMessage.set(this.LOADING_MESSAGES[messageIndex]);
    }, 2500);
  }

  private stopLoadingAnimation(): void {
    if (this.loadingInterval) {
      clearInterval(this.loadingInterval);
      this.loadingInterval = null;
    }
  }

  private startThinkingTimer(): void {
    this.isThinking.set(true);
    this.thinkingTime.set(0);
    if (this.thinkingInterval) clearInterval(this.thinkingInterval);
    this.thinkingInterval = setInterval(() => {
      this.thinkingTime.update(t => t + 1);
    }, 1000);
  }

  private stopThinkingTimer(): void {
    this.isThinking.set(false);
    if (this.thinkingInterval) {
      clearInterval(this.thinkingInterval);
      this.thinkingInterval = null;
    }
  }
}
