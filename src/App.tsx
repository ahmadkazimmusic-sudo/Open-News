import { useState, useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { OpenAI } from 'openai'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { toPng } from 'html-to-image'
import { Camera } from 'lucide-react'
import './App.css'

const hfClient = new OpenAI({
  baseURL: "https://router.huggingface.co/v1",
  apiKey: import.meta.env.VITE_HF_TOKEN || 'missing-token',
  dangerouslyAllowBrowser: true, // required to run the openai sdk in the frontend
});

interface ChartData {
  title: string;
  data: { label: string; value: number }[];
}

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
  sources?: { title: string; url: string }[]
  followUps?: string[]
  sentiment?: number
  bias?: string
  chartData?: ChartData
}

interface TavilyResult {
  title: string
  url: string
  content: string
}

interface HistorySession {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

async function fetchWebContext(query: string): Promise<{ contextBlock: string; sources: { title: string; url: string }[] }> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: import.meta.env.VITE_TAVILY_API_KEY,
      query,
      search_depth: 'advanced',
      max_results: 8,
      include_domains: [
        'reuters.com', 'bbc.com', 'apnews.com', 'bloomberg.com', 'ft.com',
        'theguardian.com', 'nytimes.com', 'wsj.com', 'aljazeera.com', 'economist.com'
      ],
      include_answer: false,
    })
  });
  if (!response.ok) throw new Error('Tavily search failed');
  const data = await response.json();
  const results: TavilyResult[] = data.results || [];
  const sources = results.map(r => ({ title: r.title, url: r.url }));
  const contextBlock = results.map((r, i) =>
    `[${i + 1}] ${r.title}\nSource: ${r.url}\n${r.content}`
  ).join('\n\n');
  return { contextBlock, sources };
}

const LogoIcon = () => (
  <svg
    width="48"
    height="48"
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className="brand-logo"
  >
    <circle cx="12" cy="12" r="9" stroke="url(#logo-grad)" strokeWidth="2" strokeDasharray="4 2 8 2" strokeLinecap="round" />
    <circle cx="12" cy="12" r="5" stroke="var(--barrier)" strokeWidth="1.5" strokeDasharray="10 12" className="spin-slow" />
    <path d="M12 2C16 2 19 6 19 12C19 18 16 22 12 22C8 22 5 18 5 12C5 6 8 2 12 2Z" stroke="url(#logo-grad)" strokeWidth="1" opacity="0.6" />
    <defs>
      <linearGradient id="logo-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop stopColor="#ff7a18" />
        <stop offset="1" stopColor="#ff8ed7" />
      </linearGradient>
    </defs>
  </svg>
)

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="custom-tooltip">
        <p className="tooltip-label">{label}</p>
        <p className="tooltip-value">
          <span className="tooltip-dot"></span>
          {payload[0].value}
        </p>
      </div>
    );
  }
  return null;
};

function App() {
  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [loadingPhase, setLoadingPhase] = useState<'web' | 'thinking' | 'responding' | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [theme, setTheme] = useState<'dark' | 'light'>('dark')
  const [language, setLanguage] = useState('English')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [sessionId, setSessionId] = useState<string>(`sess-${Date.now()}`)
  const [history, setHistory] = useState<HistorySession[]>([])

  const [streamingText, setStreamingText] = useState('')
  const [streamingSources, setStreamingSources] = useState<{ title: string, url: string }[] | null>(null)

  const chatbarRef = useRef<HTMLDivElement>(null)
  const bottomAnchorRef = useRef<HTMLDivElement>(null)

  // Initialize theme and history from localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('open-news-theme') as 'dark' | 'light';
    if (savedTheme) {
      setTheme(savedTheme);
    }
    const savedHistory = localStorage.getItem('open-news-history');
    if (savedHistory) {
      setHistory(JSON.parse(savedHistory));
    }
  }, []);

  // Save to history when messages change
  useEffect(() => {
    if (messages.length === 0) return;
    setHistory(prev => {
      const existingIdx = prev.findIndex(s => s.id === sessionId);
      const title = messages.find(m => m.role === 'user')?.text || 'New Chat';
      const newSession: HistorySession = { id: sessionId, title, updatedAt: Date.now(), messages };

      let updated = [...prev];
      if (existingIdx >= 0) {
        updated[existingIdx] = newSession;
      } else {
        updated = [newSession, ...updated];
      }
      localStorage.setItem('open-news-history', JSON.stringify(updated));
      return updated;
    });
  }, [messages, sessionId]);

  const startNewChat = () => {
    setSessionId(`sess-${Date.now()}`);
    setMessages([]);
    setQuery('');
    setIsSidebarOpen(false);
  };

  const loadSession = (id: string) => {
    const session = history.find(s => s.id === id);
    if (session) {
      setSessionId(session.id);
      setMessages(session.messages);
      setIsSidebarOpen(false);
    }
  };

  const deleteSession = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    const updated = history.filter(s => s.id !== id);
    setHistory(updated);
    localStorage.setItem('open-news-history', JSON.stringify(updated));
    if (id === sessionId) {
      startNewChat();
    }
  };

  const exportAsImage = async (id: string) => {
    const el = document.getElementById(`msg-${id}`)
    if (!el) return
    try {
      const dataUrl = await toPng(el, { backgroundColor: theme === 'dark' ? '#0a0a0d' : '#f7f8fa', style: { padding: '24px' } })
      const link = document.createElement('a')
      link.download = `open-news-brief.png`
      link.href = dataUrl
      link.click()
    } catch (err) {
      console.error('Failed to export image', err)
    }
  }

  // Apply theme to document
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('open-news-theme', theme);
  }, [theme]);

  // Auto-scroll to bottom whenever messages update or loading starts
  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, isSearching])

  const runSearch = async (event?: FormEvent<HTMLFormElement>, queryOverride?: string) => {
    if (event) event.preventDefault()

    // Set query state immediately if driven by a chip click
    if (queryOverride) {
      setQuery(queryOverride)
    }

    const cleanQuery = (queryOverride || query).trim()

    if (!cleanQuery) {
      return
    }

    const newMessages: ChatMessage[] = [
      ...messages,
      { id: `user-${Date.now()}`, role: 'user', text: cleanQuery }
    ]

    setMessages(newMessages)
    setQuery('')
    setIsSearching(true)
    setLoadingPhase('web')

    try {
      // Step 1: Fetch live web context from Tavily
      let webContext = '';
      let sources: { title: string; url: string }[] = [];
      try {
        const result = await fetchWebContext(cleanQuery);
        webContext = result.contextBlock;
        sources = result.sources;
      } catch (e) {
        console.warn('Tavily search failed, proceeding without web context:', e);
      }

      // Step 2: Think
      setLoadingPhase('thinking')
      const systemPrompt = webContext
        ? `You are Open News, an expert AI journalist and news analyst powered by trusted global sources. Your job is to produce thorough, well-structured, long-form news briefs.
        
CRITICAL REQUIREMENT: Though your sources and internal reasoning may be in English, YOU MUST WRITE YOUR ENTIRE FINAL RESPONSE IN ${language.toUpperCase()}.

Guidelines:
- Always write AT LEAST 4–6 substantial paragraphs
- Use markdown headers (##) to organize sections like Background, Key Developments, Analysis, Outlook
- Use bullet points for lists of facts, figures, or named parties
- Cite sources inline using [1], [2] etc. wherever relevant
- Include context, history, and implications — not just surface-level facts
- End with an "## Outlook" or "## What to Watch" section summarizing what comes next

Here is live web search context to help you answer accurately:

${webContext}

Use ALL of the above sources to inform your response thoroughly.`
        : `You are Open News, an expert AI journalist and news analyst.

CRITICAL REQUIREMENT: YOU MUST WRITE YOUR ENTIRE FINAL RESPONSE IN ${language.toUpperCase()}.

Guidelines:
- Always write AT LEAST 4–6 substantial paragraphs
- Use markdown headers (##) to organize sections like Background, Key Developments, Analysis, Outlook
- Use bullet points for lists of facts, figures, or named parties
- Include context, history, and implications — not just surface-level facts
- End with an "## Outlook" or "## What to Watch" section summarizing what comes next`;

      // Step 3: Respond via Streaming
      setLoadingPhase('responding')
      await new Promise(r => setTimeout(r, 100)); // brief pause

      const stream = await hfClient.chat.completions.create({
        model: "google/gemma-4-31B-it:novita",
        max_tokens: 2048,
        stream: true,
        messages: [
          { role: 'system', content: systemPrompt },
          ...newMessages.map(msg => ({
            role: msg.role as 'assistant' | 'user' | 'system',
            content: msg.text
          }))
        ]
      });

      let fullText = '';
      setStreamingSources(sources);

      for await (const chunk of stream) {
        const contentDelta = chunk.choices[0]?.delta?.content || '';
        if (contentDelta) {
          fullText += contentDelta;
          setStreamingText(fullText);
        }
      }

      const assistantId = `assistant-${Date.now()}`;
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: assistantId,
          role: 'assistant',
          text: fullText || "I'm sorry, I couldn't generate a report at this time.",
          sources,
        }
      ]);

      setStreamingText('')
      setStreamingSources(null)

      // Step 4: Generate follow up questions & Metadata
      const metadataPrompt = `Based on the following news brief, analyze and return ONLY a single valid JSON object representing metadata. The JSON must have the following schema, and no other text:
{
  "followUps": ["Q1", "Q2", "Q3"], // exactly 3 short follow-up questions
  "sentiment": 75, // integer 0-100 indicating sentiment (0=very negative, 100=very positive)
  "bias": "Left", // string: "Left", "Right", "Center", or "Unclear"
  "chartData": {
    "title": "Brief Chart Title",
    "data": [{"label": "Category A", "value": 50}]
  } // OPTIONAL: only provide chartData if the brief contains strong numerical distributions or comparisons.
}

Brief:
${fullText}`;

      try {
        const metaCompletion = await hfClient.chat.completions.create({
          model: "google/gemma-4-31B-it:novita",
          max_tokens: 350,
          messages: [{ role: 'user', content: metadataPrompt }],
        });

        const jsonContent = metaCompletion.choices[0]?.message?.content || '{}';
        const match = jsonContent.match(/\{[\s\S]*\}/); // extract json object
        const meta = JSON.parse(match ? match[0] : jsonContent);

        setMessages(currentMessages => currentMessages.map(msg =>
          msg.id === assistantId ? {
            ...msg,
            followUps: meta.followUps?.slice(0, 3) || [],
            sentiment: meta.sentiment,
            bias: meta.bias,
            chartData: meta.chartData
          } : msg
        ));
      } catch (e) {
        console.warn("Failed to parse metadata", e);
      }
    } catch (error: any) {
      console.error('Error:', error);
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: error.status === 401
            ? `## ⚠️ Authentication Error\n\nYour AI service token (Hugging Face) appears to have expired or is invalid. Please update the \`VITE_HF_TOKEN\` in your \`.env\` file with a fresh token from your Hugging Face settings.\n\nError details: ${error.message}`
            : `Error communicating with the AI service: ${error.message}`
        }
      ]);
    } finally {
      setIsSearching(false)
      setLoadingPhase(null)
    }
  }

  const isExpanded = isFocused || query.trim().length > 0 || messages.length > 0
  const isConversationMode = messages.length > 0 || isSearching
  const shellClassName = isConversationMode ? 'app-shell conversation-mode' : 'app-shell'
  const searchShellClassName = `search-shell${isExpanded ? ' expanded' : ''}${isConversationMode ? ' conversation-mode' : ''}`

  return (
    <main className={shellClassName}>
      <header className="brand">
        <div className="brand-title">
          <div className="brand-header-row">
            <LogoIcon />
            <h1>Open News</h1>
          </div>
          <p>AI-powered search engine for trusted global news sources.</p>
        </div>
        <div className="brand-actions">
          <select
            className="language-selector"
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            aria-label="Language"
          >
            <option value="English">EN</option>
            <option value="Spanish">ES</option>
            <option value="French">FR</option>
            <option value="German">DE</option>
            <option value="Japanese">JA</option>
            <option value="Arabic">AR</option>
          </select>
          <button
            className="icon-btn"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="History"
            title="History"
          >
            ☰
          </button>
          <button
            className="theme-toggle"
            onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
            aria-label="Toggle theme"
            title="Toggle theme"
          >
            {theme === 'dark' ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="5"></circle>
                <line x1="12" y1="1" x2="12" y2="4"></line>
                <line x1="12" y1="20" x2="12" y2="23"></line>
                <line x1="4.22" y1="4.22" x2="6.34" y2="6.34"></line>
                <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"></line>
                <line x1="1" y1="12" x2="4" y2="12"></line>
                <line x1="20" y1="12" x2="23" y2="12"></line>
                <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"></line>
                <line x1="17.66" y1="6.34" x2="19.78" y2="4.22"></line>
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
              </svg>
            )}
          </button>
        </div>
      </header>

      {/* Sidebar Overlay */}
      <div className={`sidebar-overlay ${isSidebarOpen ? 'open' : ''}`} onClick={() => setIsSidebarOpen(false)}></div>
      <aside className={`sidebar ${isSidebarOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <h2>History</h2>
          <button className="icon-btn" onClick={() => setIsSidebarOpen(false)}>×</button>
        </div>
        <button className="new-chat-btn" onClick={startNewChat}>
          <span>+</span> New Brief
        </button>
        <div className="history-list">
          {history.length === 0 ? (
            <p className="empty-history">No past briefs yet.</p>
          ) : (
            history.sort((a, b) => b.updatedAt - a.updatedAt).map(session => (
              <div
                key={session.id}
                className={`history-item ${session.id === sessionId ? 'active' : ''}`}
                onClick={() => loadSession(session.id)}
              >
                <div className="history-item-content">
                  <span className="history-title" title={session.title}>{session.title}</span>
                  <span className="history-date">
                    {new Date(session.updatedAt).toLocaleDateString()}
                  </span>
                </div>
                <button
                  className="history-delete-btn"
                  onClick={(e) => deleteSession(e, session.id)}
                  aria-label="Delete chat"
                  title="Delete chat"
                >
                  🗑️
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      <section className={searchShellClassName}>
        <form className="search-form" onSubmit={runSearch}>
          <span className="command-prefix">search://</span>
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Ask about finance, policy, geopolitics, technology..."
            aria-label="Search news"
          />
          <button type="submit" disabled={isSearching}>
            {isSearching ? 'Thinking...' : 'Search'}
          </button>
        </form>

        <div
          ref={chatbarRef}
          className={isExpanded ? 'chatbar visible' : 'chatbar'}
        >
          {messages.map((message) => (
            <article key={message.id} id={`msg-${message.id}`} className={`message-row ${message.role}`}>
              <span className="message-author">
                {message.role === 'assistant' ? 'open-news' : 'you'}
              </span>
              <div className="message-body">
                {message.role === 'assistant' && (
                  <div className="message-actions-row">
                    <button
                      className="copy-btn"
                      onClick={() => exportAsImage(message.id)}
                      title="Snapshot Brief"
                      aria-label="Snapshot Brief"
                    >
                      <Camera size={16} />
                    </button>
                    <button
                      className="copy-btn"
                      onClick={() => {
                        navigator.clipboard.writeText(message.text);
                        setCopiedId(message.id);
                        setTimeout(() => setCopiedId(null), 2000);
                      }}
                      title="Copy response"
                      aria-label="Copy response"
                    >
                      {copiedId === message.id ? '✓' : '⧉'}
                    </button>
                  </div>
                )}
                <ReactMarkdown>{message.text}</ReactMarkdown>
                {message.sources && message.sources.length > 0 && (
                  <div className="sources-list">
                    <span className="sources-label">Sources</span>
                    <div className="source-icons">
                      {message.sources.map((src, i) => {
                        const hostname = new URL(src.url).hostname;
                        const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
                        return (
                          <a
                            key={i}
                            href={src.url}
                            target="_blank"
                            rel="noreferrer"
                            className="source-icon-link"
                            title={src.title}
                            aria-label={src.title}
                          >
                            <div className="source-icon-circle">
                              <img
                                src={faviconUrl}
                                alt={hostname}
                                width={22}
                                height={22}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  (e.target as HTMLImageElement).nextElementSibling!.textContent = hostname[0].toUpperCase();
                                }}
                              />
                              <span className="source-icon-fallback"></span>
                            </div>
                            <span className="source-icon-label">{hostname.replace('www.', '')}</span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}

                {message.chartData && message.chartData.data && message.chartData.data.length > 0 && (
                  <div className="message-chart-container">
                    <div className="message-chart-header">
                      <h4>{message.chartData.title}</h4>
                    </div>
                    <div className="message-chart-content">
                      <ResponsiveContainer width="100%" height={220}>
                        <AreaChart data={message.chartData.data} margin={{ top: 20, right: 10, bottom: 0, left: 0 }}>
                          <defs>
                            <linearGradient id="chart-grad" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="#ff7a18" stopOpacity={0.3} />
                              <stop offset="95%" stopColor="#ff7a18" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.03)" />
                          <XAxis
                            dataKey="label"
                            stroke="rgba(255,255,255,0.2)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            dy={10}
                          />
                          <YAxis
                            stroke="rgba(255,255,255,0.2)"
                            fontSize={10}
                            tickLine={false}
                            axisLine={false}
                            dx={-10}
                          />
                          <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(255,255,255,0.1)', strokeWidth: 1 }} />
                          <Area
                            type="monotone"
                            dataKey="value"
                            stroke="#ff7a18"
                            strokeWidth={3}
                            fillOpacity={1}
                            fill="url(#chart-grad)"
                            animationDuration={1500}
                          />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                )}

                {(message.sentiment !== undefined || message.bias) && (
                  <div className="metadata-row">
                    {message.sentiment !== undefined && (
                      <div className="sentiment-meter">
                        <span className="meta-label">Sentiment</span>
                        <div className="progress-bar">
                          <div className="progress-fill" style={{ width: `${message.sentiment}%`, background: message.sentiment > 60 ? '#6ef0b9' : message.sentiment < 40 ? '#ff7a18' : '#ffd166' }}></div>
                        </div>
                      </div>
                    )}
                    {message.bias && (
                      <div className="bias-meter-container">
                        <span className="meta-label">Bias Rating: <strong>{message.bias}</strong></span>
                        <div className="bias-spectrum">
                          <div className="bias-track"></div>
                          <div
                            className={`bias-marker ${message.bias.toLowerCase()}`}
                            style={{
                              left: message.bias === 'Left' ? '15%' :
                                message.bias === 'Right' ? '85%' : '50%'
                            }}
                          ></div>
                          <div className="bias-labels">
                            <span>Left</span>
                            <span>Center</span>
                            <span>Right</span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {message.followUps && message.followUps.length > 0 && (
                  <div className="follow-ups">
                    {message.followUps.map((q, i) => (
                      <button
                        key={i}
                        className="follow-up-chip"
                        onClick={() => runSearch(undefined, q)}
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </article>
          ))}
          {streamingText && (
            <article className="message-row assistant">
              <span className="message-author">open-news</span>
              <div className="message-body">
                <ReactMarkdown>{streamingText}</ReactMarkdown>
                {streamingSources && streamingSources.length > 0 && (
                  <div className="sources-list">
                    <span className="sources-label">Sources</span>
                    <div className="source-icons">
                      {streamingSources.map((src, i) => {
                        const hostname = new URL(src.url).hostname;
                        const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${hostname}`;
                        return (
                          <a
                            key={i}
                            href={src.url}
                            target="_blank"
                            rel="noreferrer"
                            className="source-icon-link"
                          >
                            <div className="source-icon-circle">
                              <img
                                src={faviconUrl}
                                alt={hostname}
                                width={22}
                                height={22}
                                onError={(e) => {
                                  (e.target as HTMLImageElement).style.display = 'none';
                                  (e.target as HTMLImageElement).nextElementSibling!.textContent = hostname[0].toUpperCase();
                                }}
                              />
                              <span className="source-icon-fallback"></span>
                            </div>
                            <span className="source-icon-label">{hostname.replace('www.', '')}</span>
                          </a>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </article>
          )}

          {isSearching && !streamingText && (
            <article className="message-row assistant loading">
              <span className="message-author">open-news</span>
              <div className="ai-loader">
                <div className={`ai-loader-orb phase-${loadingPhase}`}>
                  <LogoIcon />
                </div>
                <div className="ai-loader-text">
                  {loadingPhase === 'web' && <><span className="phase-label web">Searching the web</span><span className="phase-sub">Pulling live sources via Tavily</span></>}
                  {loadingPhase === 'thinking' && <><span className="phase-label thinking">Thinking</span><span className="phase-sub">Analyzing sources & forming brief</span></>}
                  {loadingPhase === 'responding' && <><span className="phase-label responding">Responding</span><span className="phase-sub">Writing your brief now</span></>}
                </div>
              </div>
            </article>
          )}
          <div ref={bottomAnchorRef} style={{ height: 1 }} />
        </div>
      </section>
    </main>
  )
}

export default App
