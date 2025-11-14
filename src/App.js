import { SparklesIcon } from '@heroicons/react/24/outline';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { FiCheck, FiChevronLeft, FiChevronRight, FiCopy, FiEdit, FiPlus, FiSearch, FiSettings, FiX, FiZap } from 'react-icons/fi';
import { GeminiService } from './services/gemini.service.js';
import { OpenaiService } from './services/openai.service.js';
import { SYSTEM_INSTRUCTION_VISUAL } from './services/system-prompt-visual.js';
import { SYSTEM_INSTRUCTION } from './services/system-prompt.js';

const App = () => {
  // State
  const [userPrompt, setUserPrompt] = useState('');
  const [originalPrompt, setOriginalPrompt] = useState('');
  const [changeRequest, setChangeRequest] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [loadingMessage] = useState('Receiving results...');
  const [error, setError] = useState(null);
  const [copied, setCopied] = useState(false);
  const [showChanges, setShowChanges] = useState(false);
  const [targetModel, setTargetModel] = useState('universal');
  const [promptObjective, setPromptObjective] = useState('general');
  const [isThinking, setIsThinking] = useState(false);
  const [thinkingTime, setThinkingTime] = useState(0);
  const [hoveredChangeIndex, setHoveredChangeIndex] = useState(null);

  // UI State
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // History
  const [history, setHistory] = useState(() => {
    const saved = localStorage.getItem('optimizer_history');
    if (!saved) return [];
    try {
      return JSON.parse(saved, (key, value) =>
        key === 'timestamp' ? new Date(value) : value
      );
    } catch {
      return [];
    }
  });
  const [activeHistoryIndex, setActiveHistoryIndex] = useState(null);

  // Settings
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [activeSettingsTab, setActiveSettingsTab] = useState('gemini');
  const [settings, setSettings] = useState(() => {
    const saved = localStorage.getItem('optimizer_settings');
    return saved ? JSON.parse(saved) : { provider: 'gemini', gemini: { apiKey: '', model: 'gemini-1.5-flash' }, openai: { endpoint: '', apiKey: '', models: [], executionModel: '' } };
  });
  const [tempSettings, setTempSettings] = useState(settings);
  const [isFetchingModels, setIsFetchingModels] = useState(false);
  const [fetchModelsError, setFetchModelsError] = useState(null);

  // Services
  const geminiService = useMemo(() => new GeminiService(), []);
  const openaiService = useMemo(() => new OpenaiService(), []);

  const isGeminiKeyFromEnv = useMemo(() => geminiService.isKeyFromEnv(), [geminiService]);

  // Data
  const allModels = useMemo(() => [
    { value: 'universal', name: 'Any' }, { value: 'gpt', name: 'GPT (Family)' },
    { value: 'claude', name: 'Claude (Family)' }, { value: 'gemini', name: 'Gemini (Family)' },
    { value: 'deepseek', name: 'DeepSeek (Family)' }, { value: 'qwen', name: 'Qwen (Family)' },
    { value: 'gpt-image-1', name: 'GPT-Image-1 (4o)' }, { value: 'gemini-flash', name: 'Gemini Flash (Nano Banana)' },
    { value: 'midjourney', name: 'Midjourney' }, { value: 'stable-diffusion', name: 'Stable Diffusion' },
    { value: 'flux', name: 'FLUX' }, { value: 'veo', name: 'Veo (Family)' },
    { value: 'sora', name: 'Sora (Family)' }, { value: 'kling', name: 'Kling (Family)' },
    { value: 'wan', name: 'Wan (Family)' },
  ], []);

  const availableObjectives = useMemo(() => [
    { value: 'general', name: 'General' }, { value: 'coding', name: 'Coding' },
    { value: 'technical', name: 'Technical' }, { value: 'writing', name: 'Writing' },
    { value: 'instructional', name: 'Instructional' }, { value: 'image', name: 'Image' },
    { value: 'video', name: 'Video' },
  ], []);

  const availableModels = useMemo(() => {
    if (promptObjective === 'image') return allModels.filter(m => ['universal', 'gpt-image-1', 'gemini-flash', 'midjourney', 'stable-diffusion', 'flux'].includes(m.value));
    if (promptObjective === 'video') return allModels.filter(m => ['universal', 'veo', 'sora', 'kling', 'wan'].includes(m.value));
    return allModels.filter(m => !['gpt-image-1', 'gemini-flash', 'midjourney', 'stable-diffusion', 'flux', 'veo', 'sora', 'kling', 'wan'].includes(m.value));
  }, [promptObjective, allModels]);

  const activeHistoryItem = useMemo(() => activeHistoryIndex !== null ? history[activeHistoryIndex] : null, [activeHistoryIndex, history]);

  const groupedHistory = useMemo(() => {
    const groups = new Map();
    history.forEach(item => {
      if (!groups.has(item.originalPrompt)) groups.set(item.originalPrompt, []);
      groups.get(item.originalPrompt).push(item);
    });
    const term = searchTerm.toLowerCase().trim();
    if (!term) return Array.from(groups.entries()).map(([op, items]) => ({ originalPrompt: op, items }));

    const filtered = [];
    for (const [op, items] of groups.entries()) {
      if (op.toLowerCase().includes(term)) {
        filtered.push({ originalPrompt: op, items });
      } else {
        const matchingItems = items.filter(i => i.optimizedPrompt.toLowerCase().includes(term) || (i.changeRequest || '').toLowerCase().includes(term));
        if (matchingItems.length > 0) filtered.push({ originalPrompt: op, items: matchingItems });
      }
    }
    return filtered;
  }, [history, searchTerm]);

  // Effects
  useEffect(() => {
    localStorage.setItem('optimizer_history', JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    localStorage.setItem('optimizer_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    if (!availableModels.find(m => m.value === targetModel)) {
      setTargetModel('universal');
    }
  }, [availableModels, targetModel]);

  useEffect(() => {
    let timer;
    if (isThinking) {
      timer = setInterval(() => setThinkingTime(t => t + 1), 1000);
    } else if (thinkingTime > 0) {
      setThinkingTime(0);
    }
    return () => clearInterval(timer);
  }, [isThinking, thinkingTime]);

  // Handlers
  const handleOptimize = useCallback(async () => {
    if (!userPrompt.trim()) return;
    setIsLoading(true);
    setIsThinking(true);
    setError(null);
    if (!originalPrompt || activeHistoryIndex === null) {
      setOriginalPrompt(userPrompt);
    }

    const systemInstruction = (promptObjective === 'image' || promptObjective === 'video') ? SYSTEM_INSTRUCTION_VISUAL : SYSTEM_INSTRUCTION;
    const onContentStart = () => setIsThinking(false);

    try {
      let resultString;
      if (settings.provider === 'openai' && settings.openai.endpoint) {
        resultString = await openaiService.optimizePrompt(originalPrompt, userPrompt, changeRequest, 'JSON', targetModel, promptObjective, settings.openai.apiKey, settings.openai.endpoint, settings.openai.executionModel, onContentStart, systemInstruction);
      } else {
        resultString = await geminiService.optimizePrompt(originalPrompt, userPrompt, changeRequest, 'JSON', targetModel, promptObjective, settings.gemini.apiKey, settings.gemini.model, onContentStart, systemInstruction);
      }

      let result;
      try {
        const jsonMatch = resultString.match(/```(json)?\s*(\{[\s\S]*\})\s*```/);
        const jsonString = jsonMatch ? jsonMatch[2] : resultString.substring(resultString.indexOf('{'), resultString.lastIndexOf('}') + 1);
        result = JSON.parse(jsonString);
      } catch {
        throw new Error("Model returned invalid JSON.");
      }

      const parser = new DOMParser();
      const doc = parser.parseFromString(`<div>${result.fullPromptDiffHtml}</div>`, 'text/html');
      const count = (selector) => Array.from(doc.querySelectorAll(selector)).reduce((acc, el) => acc + (el.textContent || '').trim().split(/\s+/).length, 0);

      const newItem = {
        ...result,
        originalPrompt: originalPrompt || userPrompt,
        targetModel,
        promptObjective,
        timestamp: new Date(),
        additions: count('ins'),
        deletions: count('del'),
        changeRequest,
      };

      setHistory(h => [newItem, ...h]);
      setActiveHistoryIndex(0);
      setUserPrompt(newItem.optimizedPrompt);
      setChangeRequest('');
    } catch (e) {
      setError(e.message);
    } finally {
      setIsLoading(false);
      setIsThinking(false);
    }
  }, [userPrompt, originalPrompt, changeRequest, promptObjective, targetModel, settings, activeHistoryIndex, openaiService, geminiService]);

  const handleViewHistory = (index) => {
    const item = history[index];
    setActiveHistoryIndex(index);
    setOriginalPrompt(item.originalPrompt);
    setUserPrompt(item.optimizedPrompt);
    setTargetModel(item.targetModel);
    setPromptObjective(item.promptObjective);
    setShowChanges(false);
    setError(null);
    setCopied(false);
  };

  const handleNewPrompt = () => {
    setActiveHistoryIndex(null);
    setUserPrompt('');
    setOriginalPrompt('');
    setChangeRequest('');
    setError(null);
  };

  const handleStartFromHistory = (prompt) => {
    const latest = history.find(h => h.originalPrompt === prompt);
    handleNewPrompt();
    setUserPrompt(prompt);
    setOriginalPrompt(prompt);
    if (latest) {
      setTargetModel(latest.targetModel);
      setPromptObjective(latest.promptObjective);
    }
  };

  const handleCopyToClipboard = () => {
    if (!activeHistoryItem) return;
    navigator.clipboard.writeText(activeHistoryItem.optimizedPrompt).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleFetchModels = async () => {
    setIsFetchingModels(true);
    setFetchModelsError(null);
    try {
      const models = await openaiService.listModels(tempSettings.openai.apiKey, tempSettings.openai.endpoint);
      setTempSettings(s => ({ ...s, openai: { ...s.openai, models, executionModel: models[0] || '' } }));
    } catch (e) {
      setFetchModelsError(e.message);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const handleSaveSettings = () => {
    const isOpenAIConfigured = tempSettings.openai.endpoint && tempSettings.openai.apiKey && tempSettings.openai.executionModel;
    setSettings({ ...tempSettings, provider: isOpenAIConfigured ? 'openai' : 'gemini' });
    setShowSettingsModal(false);
  };

  const sidebarClasses = `flex-shrink-0 bg-[#0A0A0A] flex flex-col transition-all duration-300 ease-in-out overflow-hidden ${isSidebarCollapsed ? 'w-0 p-0 border-r-0' : 'w-72 p-3 border-r border-neutral-800'}`;

  const diffHtml = useMemo(() => {
    if (!activeHistoryItem || !showChanges) return activeHistoryItem?.optimizedPrompt;
    if (hoveredChangeIndex === null) return activeHistoryItem.fullPromptDiffHtml;

    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div>${activeHistoryItem.fullPromptDiffHtml}</div>`, 'text/html');
    const changes = doc.querySelectorAll('ins, del');
    changes.forEach((el, i) => {
      if (i === hoveredChangeIndex) {
        el.classList.add('bg-yellow-500', 'bg-opacity-25');
      }
    });
    return doc.body.innerHTML;
  }, [activeHistoryItem, showChanges, hoveredChangeIndex]);

  return (
    <div className="flex h-screen bg-black text-neutral-300 font-sans">
      <aside className={sidebarClasses}>
        <div className="overflow-hidden h-full flex flex-col">
          <div className="space-y-3 p-1">
            <button onClick={handleNewPrompt} className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-white bg-neutral-800 hover:bg-neutral-700 transition-colors flex items-center flex-shrink-0">
              <FiPlus className="w-4 h-4 mr-2" /> New prompt
            </button>
            <div className="relative flex-shrink-0">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                <FiSearch className="h-4 w-4 text-neutral-500" />
              </div>
              <input type="text" placeholder="Search prompts..." className="block w-full rounded-lg border-0 bg-neutral-800 py-2 pl-9 pr-3 text-neutral-300 placeholder:text-neutral-500 focus:ring-1 focus:ring-inset focus:ring-blue-500 sm:text-sm" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} />
            </div>
          </div>
          <hr className="border-neutral-800 my-3" />
          <div className="flex-grow overflow-y-auto pr-1 space-y-4 min-h-0">
            {groupedHistory.map(group => (
              <div key={group.originalPrompt} className="space-y-1">
                <h4 onClick={() => handleStartFromHistory(group.originalPrompt)} className="px-2.5 pt-2 text-xs font-semibold text-neutral-500 uppercase truncate cursor-pointer hover:text-neutral-300" title={group.originalPrompt}>
                  {group.originalPrompt}
                </h4>
                {group.items.map(item => {
                  const index = history.indexOf(item);
                  const itemClasses = `w-full text-left p-2.5 rounded-lg text-sm transition-colors flex justify-between items-center ${activeHistoryIndex === index ? 'bg-neutral-800 text-white font-medium' : 'text-neutral-400 hover:bg-neutral-900'}`;
                  return (
                    <button key={index} onClick={() => handleViewHistory(index)} className={itemClasses}>
                      <span className="font-mono">{item.timestamp.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</span>
                      <div className="flex items-center space-x-2 text-xs font-mono">
                        <span className="text-green-500 font-semibold">+{item.additions}</span>
                        <span className="text-red-500 font-semibold">-{item.deletions}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
          <div className="mt-auto flex-shrink-0 p-1">
            <button onClick={() => { setTempSettings(settings); setShowSettingsModal(true); }} className="w-full text-left px-3 py-2 rounded-lg text-sm font-medium text-neutral-400 hover:bg-neutral-900 hover:text-white transition-colors flex items-center">
              <FiSettings className="w-4 h-4 mr-2" /> Settings
            </button>
          </div>
        </div>
      </aside>

      <main className="flex-grow flex flex-col relative overflow-hidden">
        <button onClick={() => setIsSidebarCollapsed(!isSidebarCollapsed)} className="absolute top-1/2 -translate-y-1/2 -left-3 z-20 bg-neutral-800 hover:bg-neutral-700 border border-neutral-700 rounded-full w-6 h-6 flex items-center justify-center text-neutral-400 hover:text-white" title={isSidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}>
          {isSidebarCollapsed ? <FiChevronRight className="w-4 h-4" /> : <FiChevronLeft className="w-4 h-4" />}
        </button>
        <div className="h-full flex flex-col">
          {activeHistoryItem && !isLoading && (
            <header className="flex justify-center items-center py-3 relative h-14 shrink-0 px-4 w-full">
              <div className="flex items-center gap-2">
                <h1 className="text-lg font-semibold text-white">Prompt Optimizer</h1>
              </div>
              <div className="absolute right-4 flex items-center space-x-2">
                <button onClick={handleCopyToClipboard} className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#3a3a3a] rounded-full text-sm font-medium transition-colors flex items-center">
                  {copied ? <FiCheck className="w-4 h-4 mr-2 text-green-400" /> : <FiCopy className="w-4 h-4 mr-2" />}
                  <span className={copied ? 'text-green-400' : ''}>{copied ? 'Copied!' : 'Copy'}</span>
                </button>
                <button onClick={handleNewPrompt} className="px-2.5 py-2.5 bg-[#2A2A2A] hover:bg-[#3a3a3a] rounded-full transition-colors">
                  <FiX className="w-5 h-5" />
                </button>
              </div>
            </header>
          )}

          <div className="flex-grow overflow-y-auto min-h-0">
            <div className="flex flex-col items-center justify-center space-y-6 py-6 px-4 h-full">
              {(!activeHistoryItem && !isLoading) && (
                <>
                  <div className="text-center flex-shrink-0">
                    <h1 className="text-4xl font-bold text-white">Prompt Optimizer</h1>
                    <p className="text-neutral-400 mt-2">Enter your prompt below to get started.</p>
                  </div>
                  <div className="w-full max-w-4xl mx-auto bg-[#1C1C1C] rounded-xl shadow-2xl p-1 flex flex-col space-y-2">
                    <textarea id="user-prompt" value={userPrompt} onChange={e => setUserPrompt(e.target.value)} placeholder="You are a helpful assistant..." className="w-full h-64 bg-transparent text-neutral-300 rounded-lg p-4 focus:ring-0 focus:border-transparent border-transparent transition duration-200 resize-none placeholder:text-neutral-600 text-lg"></textarea>
                    <div className="p-2 flex items-center space-x-6">
                      <div>
                        <label htmlFor="model-select" className="text-sm font-medium text-neutral-400 mr-3">Target Model:</label>
                        <select id="model-select" value={targetModel} onChange={e => setTargetModel(e.target.value)} className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2">
                          {availableModels.map(m => <option key={m.value} value={m.value}>{m.name}</option>)}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="objective-select" className="text-sm font-medium text-neutral-400 mr-3">Prompt Objective:</label>
                        <select id="objective-select" value={promptObjective} onChange={e => setPromptObjective(e.target.value)} className="bg-neutral-800 border border-neutral-700 text-white text-sm rounded-lg focus:ring-blue-500 focus:border-blue-500 p-2">
                          {availableObjectives.map(o => <option key={o.value} value={o.value}>{o.name}</option>)}
                        </select>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {isLoading && <div className="flex flex-grow items-center justify-center p-8 text-lg font-medium"><SparklesIcon className="w-6 h-6 mr-2 gradient-shimmer-icon" /><span className="shimmer-text">{isThinking ? `Thinking ${thinkingTime}s` : loadingMessage}</span></div>}
              {error && <div className="bg-red-900/20 text-red-300 p-4 rounded-lg text-center max-w-4xl mx-auto"><p className="font-bold">Error</p><p>{error}</p></div>}
              {activeHistoryItem && !isLoading && (
                <>
                  <h2 className="text-center text-xl font-semibold text-white flex-shrink-0">Optimize for {allModels.find(m => m.value === activeHistoryItem.targetModel)?.name} ({availableObjectives.find(o => o.value === activeHistoryItem.promptObjective)?.name})</h2>
                  <div className="bg-[#1C1C1C] rounded-lg p-6 max-w-6xl mx-auto w-full flex-grow overflow-y-auto">
                    <h3 className="text-sm font-semibold text-neutral-400 mb-2 uppercase tracking-wider">{showChanges ? 'Resulting Prompt' : 'Optimized Prompt'}</h3>
                    <div className="p-4 bg-black/30 rounded-md min-h-full">
                      {showChanges ? <div className="text-base leading-relaxed font-sans whitespace-pre-wrap break-words" dangerouslySetInnerHTML={{ __html: diffHtml }} /> : <pre className="whitespace-pre-wrap font-sans">{activeHistoryItem.optimizedPrompt}</pre>}
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          <footer className="shrink-0 pb-4 px-4">
            <div className="w-full max-w-4xl mx-auto">
              {activeHistoryItem && (
                <div className="flex justify-center mb-2">
                  <button onClick={() => setShowChanges(!showChanges)} className="text-sm text-neutral-400 hover:text-white transition-colors flex items-center space-x-1.5 px-3 py-1.5 bg-[#2A2A2A] hover:bg-[#3a3a3a] rounded-full font-medium">
                    <FiEdit />
                    <span>Review changes</span>
                    <span className="font-mono text-green-400 ml-1.5">+{activeHistoryItem.additions}</span>
                    <span className="font-mono text-red-400 ml-1">-{activeHistoryItem.deletions}</span>
                  </button>
                </div>
              )}
              <div className="flex items-center space-x-3 bg-[#1C1C1C] rounded-full p-2">
                {isThinking && <div className="flex items-center space-x-2 text-sm text-neutral-400 shrink-0 ml-2"><FiZap /> <span className="font-mono">Thinking {thinkingTime}s</span></div>}
                <input type="text" value={changeRequest} onChange={e => setChangeRequest(e.target.value)} placeholder="Request changes (optional)..." className="w-full bg-transparent text-neutral-300 rounded-full px-4 py-2 focus:ring-0 border-transparent placeholder:text-neutral-500" />
                <button onClick={handleOptimize} disabled={isLoading || !userPrompt.trim()} className="bg-neutral-200 hover:bg-white text-black font-bold py-2 px-6 rounded-full transition duration-200 disabled:bg-neutral-600 disabled:cursor-not-allowed disabled:text-neutral-400 flex items-center justify-center w-28 h-10">
                  {isLoading ? <FiZap className="animate-spin h-5 w-5 text-black" /> : 'Optimize'}
                </button>
              </div>
              <p className="text-center text-xs text-neutral-600 mt-3">Prompt Optimizer will apply best practices to your prompts.</p>
            </div>
          </footer>
        </div>
      </main>

      {showChanges && activeHistoryItem && (
        <aside className="w-96 flex-shrink-0 bg-[#0A0A0A] border-l border-neutral-800 flex flex-col">
          <div className="p-4 overflow-y-auto h-full">
            <h3 className="text-sm font-semibold text-neutral-400 mb-2 uppercase tracking-wider">Analysis & Reasoning</h3>
            {activeHistoryItem.changes.length > 0 && (
              <div className="bg-black/30 rounded-md p-4 h-full">
                <ul className="list-none text-sm text-neutral-300 space-y-4">
                  {activeHistoryItem.changes.map((change, i) => (
                    <li key={i} className="flex items-start" style={{ animation: 'fade-in-stagger 0.5s ease-out forwards', animationDelay: `${i * 100}ms`, opacity: 0 }} onMouseEnter={() => setHoveredChangeIndex(i)} onMouseLeave={() => setHoveredChangeIndex(null)}>
                      <SparklesIcon className="w-5 h-5 text-cyan-400 mr-3 mt-px shrink-0" />
                      <span className="break-words min-w-0">{change.reasoning}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </aside>
      )}

      {showSettingsModal && (
        <div className="fixed inset-0 bg-black/60 z-40 flex items-center justify-center" onClick={() => setShowSettingsModal(false)}>
          <div className="bg-[#1C1C1C] rounded-xl shadow-2xl w-full max-w-lg p-6 border border-neutral-700" onClick={e => e.stopPropagation()}>
            <h2 className="text-xl font-bold text-white mb-4">Settings</h2>
            <div className="flex border-b border-neutral-700 mb-6">
              <button onClick={() => setActiveSettingsTab('gemini')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeSettingsTab === 'gemini' ? 'border-blue-500 text-white' : 'border-transparent text-neutral-400 hover:text-white'}`}>Gemini</button>
              <button onClick={() => setActiveSettingsTab('openai')} className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${activeSettingsTab === 'openai' ? 'border-blue-500 text-white' : 'border-transparent text-neutral-400 hover:text-white'}`}>OpenAI Compatible</button>
            </div>
            {activeSettingsTab === 'gemini' && (
              <div className="space-y-4">
                <p className="text-sm text-neutral-400">Use Google's Gemini for prompt optimization. You can provide your own API key if one isn't configured for the environment.</p>
                <div>
                  <label htmlFor="gemini-api-key" className="block text-sm font-medium text-neutral-300 mb-1">API Key</label>
                  <input type="password" id="gemini-api-key" value={tempSettings.gemini.apiKey} onChange={e => setTempSettings(s => ({ ...s, gemini: { ...s.gemini, apiKey: e.target.value } }))} disabled={isGeminiKeyFromEnv} placeholder={isGeminiKeyFromEnv ? 'Using environment API key' : 'Enter your Gemini API key'} className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500 disabled:opacity-50" />
                </div>
                <div>
                  <label htmlFor="gemini-model-select" className="block text-sm font-medium text-neutral-300 mb-1">Model</label>
                  <select id="gemini-model-select" value={tempSettings.gemini.model} onChange={e => setTempSettings(s => ({ ...s, gemini: { ...s.gemini, model: e.target.value } }))} className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
                    <option value="gemini-1.5-flash">gemini-1.5-flash</option>
                  </select>
                </div>
              </div>
            )}
            {activeSettingsTab === 'openai' && (
              <div className="space-y-4">
                <p className="text-sm text-neutral-400 mb-2">Configure a custom OpenAI-compatible endpoint. When configured and saved, this will be used instead of Gemini.</p>
                <div>
                  <label htmlFor="endpoint-url" className="block text-sm font-medium text-neutral-300 mb-1">Endpoint URL</label>
                  <input type="text" id="endpoint-url" value={tempSettings.openai.endpoint} onChange={e => setTempSettings(s => ({ ...s, openai: { ...s.openai, endpoint: e.target.value } }))} placeholder="https://api.openai.com/v1" className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500" />
                </div>
                <div>
                  <label htmlFor="api-key" className="block text-sm font-medium text-neutral-300 mb-1">API Key</label>
                  <div className="flex items-center space-x-2">
                    <input type="password" id="api-key" value={tempSettings.openai.apiKey} onChange={e => setTempSettings(s => ({ ...s, openai: { ...s.openai, apiKey: e.target.value } }))} placeholder="sk-..." className="flex-grow bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500" />
                    <button onClick={handleFetchModels} disabled={isFetchingModels} className="p-2 bg-neutral-700 hover:bg-neutral-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-wait shrink-0" title="Fetch available models">
                      {isFetchingModels ? <FiZap className="animate-spin h-5 w-5 text-white" /> : <FiZap className="w-5 h-5 text-white" />}
                    </button>
                  </div>
                </div>
                {tempSettings.openai.models.length > 0 && (
                  <div>
                    <label htmlFor="model-select-modal" className="block text-sm font-medium text-neutral-300 mb-1">Execution Model</label>
                    <select id="model-select-modal" value={tempSettings.openai.executionModel} onChange={e => setTempSettings(s => ({ ...s, openai: { ...s.openai, executionModel: e.target.value } }))} className="w-full bg-neutral-800 border border-neutral-700 text-white rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500">
                      {tempSettings.openai.models.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  </div>
                )}
                <div className="h-8 mt-2 text-sm">
                  {fetchModelsError && <p className="text-red-400">{fetchModelsError}</p>}
                  {isFetchingModels && <p className="text-neutral-400">Fetching models...</p>}
                  {tempSettings.openai.models.length > 0 && <p className="text-green-400">Successfully fetched {tempSettings.openai.models.length} models.</p>}
                </div>
              </div>
            )}
            <div className="flex justify-end space-x-3 mt-6">
              <button onClick={() => setShowSettingsModal(false)} className="px-4 py-2 bg-[#2A2A2A] hover:bg-[#3a3a3a] rounded-full text-sm font-medium transition-colors">Cancel</button>
              <button onClick={handleSaveSettings} className="px-4 py-2 bg-neutral-200 hover:bg-white text-black rounded-full text-sm font-bold transition-colors">Save</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;