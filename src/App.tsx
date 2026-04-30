import { Suspense, lazy, useState, useEffect, useRef } from 'react'
import type { FormEvent } from 'react'
import ReactMarkdown from 'react-markdown'
import { OpenAI } from 'openai'
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts'
import { toPng } from 'html-to-image'
import { Camera } from 'lucide-react'
import { useAuth } from './auth/useAuth'
import { useCredits } from './auth/useCredits'
import { AuthModal } from './components/AuthModal'
import { TRUSTED_NEWS_DOMAINS, extractSource } from './lib/news'
import './App.css'

const BreakingNews = lazy(() => import('./components/BreakingNews'))
const Developing = lazy(() => import('./components/Developing'))
const Radar = lazy(() => import('./components/Radar'))
const AccountSettings = lazy(() => import('./components/AccountSettings'))
const HeatMap = lazy(() => import('./components/HeatMap'))

const openrouterClient = new OpenAI({
  baseURL: "https://openrouter.ai/api/v1",
  apiKey: import.meta.env.VITE_OPENROUTER_API_KEY || 'missing-token',
  dangerouslyAllowBrowser: true, // required to run the openai sdk in the frontend
  defaultHeaders: {
    "HTTP-Referer": typeof window !== 'undefined' ? window.location.href : '',
    "X-Title": "Open News",
  },
});

const OPENROUTER_MODEL = "openrouter/free";

interface ChartData {
  title: string;
  data: { label: string; value: number }[];
}

interface SourceItem {
  title: string
  url: string
  content?: string
}

interface ClaimItem {
  text: string
  status: 'Reported' | 'Confirmed' | 'Disputed' | 'Unclear'
}

interface TimelineItem {
  time: string
  event: string
  source?: string
}

interface RelatedStory {
  title: string
  angle: 'Background' | 'Latest Update' | 'Opposing Viewpoint' | 'Economic Impact' | 'Policy Impact' | 'Other'
  note: string
}

interface EntityItem {
  name: string
  type: 'Person' | 'Company' | 'Country' | 'Market' | 'Conflict' | 'Organization' | 'Other'
  note: string
}

interface SourcePerspective {
  source: string
  headline: string
  framing: string
  url: string
}

interface SentimentDriver {
  label: string
  weight: number
  direction: 'Positive' | 'Negative' | 'Neutral'
}

interface BiasSignal {
  label: string
  evidence: string
}

interface ChatMessage {
  id: string
  role: 'assistant' | 'user'
  text: string
  sources?: SourceItem[]
  followUps?: string[]
  sentiment?: number
  sentimentLabel?: 'Negative' | 'Mixed' | 'Neutral' | 'Positive'
  sentimentConfidence?: number
  sentimentRationale?: string
  sentimentDrivers?: SentimentDriver[]
  bias?: string
  biasScore?: number
  biasConfidence?: number
  biasRationale?: string
  biasSignals?: BiasSignal[]
  chartData?: ChartData
  limitReached?: boolean
  claims?: ClaimItem[]
  timeline?: TimelineItem[]
  relatedStories?: RelatedStory[]
  entities?: EntityItem[]
  sourcePerspectives?: SourcePerspective[]
}

interface TavilyResult {
  title: string
  url: string
  content: string
}

type SourceFilter = 'All Trusted' | 'Wire Only' | 'Reuters' | 'BBC' | 'Al Jazeera' | 'Bloomberg' | 'Financial Times'
type RecencyFilter = 'Latest' | 'Past 24 Hours' | 'Past Week'
type RegionFilter = 'Global' | 'North America' | 'Europe' | 'Middle East' | 'Asia' | 'Africa' | 'Latin America'

type OpenRouterStreamChunk = { choices?: Array<{ delta?: { content?: string } }> }

interface HistorySession {
  id: string;
  title: string;
  updatedAt: number;
  messages: ChatMessage[];
}

function isNewsQuery(query: string): boolean {
  const q = query.toLowerCase()
  const newsTerms = [
    'news', 'headline', 'headlines', 'breaking', 'developing', 'update', 'updates',
    'today', 'latest', 'report', 'reported', 'reuters', 'bbc', 'ap', 'bloomberg',
    'economy', 'market', 'stocks', 'policy', 'election', 'war', 'conflict', 'geopolitics',
    'government', 'minister', 'president', 'country', 'inflation', 'oil', 'crypto'
  ]

  return newsTerms.some((term) => q.includes(term))
}

function isChartQuery(query: string, responseText: string): boolean {
  const q = query.toLowerCase()
  const chartIntentTerms = [
    'chart', 'compare', 'comparison', 'trend', 'trends', 'percentage', 'percent',
    'stats', 'statistics', 'numbers', 'data', 'distribution', 'market share',
    'poll', 'index', 'growth', 'decline'
  ]
  const hasChartIntent = chartIntentTerms.some((term) => q.includes(term))
  const hasQuantSignals = /\b\d+(\.\d+)?%|\b\d{2,}\b/.test(responseText)
  return hasChartIntent && hasQuantSignals
}

const SOURCE_FILTER_DOMAINS: Record<SourceFilter, string[]> = {
  'All Trusted': TRUSTED_NEWS_DOMAINS,
  'Wire Only': ['reuters.com', 'apnews.com'],
  Reuters: ['reuters.com'],
  BBC: ['bbc.com'],
  'Al Jazeera': ['aljazeera.com'],
  Bloomberg: ['bloomberg.com'],
  'Financial Times': ['ft.com'],
}

const REGION_HINTS: Record<RegionFilter, string> = {
  Global: '',
  'North America': 'North America United States Canada Mexico',
  Europe: 'Europe EU UK France Germany Ukraine Russia',
  'Middle East': 'Middle East Israel Gaza Iran Saudi Arabia Gulf',
  Asia: 'Asia China India Pakistan Japan Korea Taiwan',
  Africa: 'Africa Nigeria Egypt Ethiopia Kenya South Africa Sudan',
  'Latin America': 'Latin America Brazil Argentina Chile Colombia Peru',
}

function buildFilteredQuery(query: string, recency: RecencyFilter, region: RegionFilter): string {
  const recencyHint = recency === 'Latest' ? 'latest today' : recency === 'Past 24 Hours' ? 'past 24 hours' : 'past week'
  const regionHint = REGION_HINTS[region]
  return [query, recencyHint, regionHint].filter(Boolean).join(' ')
}

function buildSourcePerspectives(sources: SourceItem[]): SourcePerspective[] {
  const seen = new Set<string>()
  return sources
    .map((source) => {
      const outlet = extractSource(source.url)
      if (seen.has(outlet)) return null
      seen.add(outlet)
      return {
        source: outlet,
        headline: source.title,
        framing: source.content ? source.content.slice(0, 180) : 'Open this source to inspect framing details.',
        url: source.url,
      }
    })
    .filter(Boolean)
    .slice(0, 6) as SourcePerspective[]
}

function safeArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? value as T[] : []
}

function clampScore(value: unknown, fallback: number): number {
  const numeric = Number(value)
  if (!Number.isFinite(numeric)) return fallback
  return Math.max(0, Math.min(100, Math.round(numeric)))
}

function getBiasFallbackScore(bias?: string): number {
  if (bias === 'Left') return 20
  if (bias === 'Right') return 80
  if (bias === 'Center') return 50
  return 50
}

function normalizeBias(value: unknown): 'Left' | 'Center' | 'Right' | 'Unclear' {
  const normalized = String(value ?? '').trim().toLowerCase()
  if (normalized === 'left') return 'Left'
  if (normalized === 'right') return 'Right'
  if (normalized === 'center' || normalized === 'centre') return 'Center'
  return 'Unclear'
}

function deriveSentimentLabel(score: number): 'Negative' | 'Mixed' | 'Neutral' | 'Positive' {
  if (score <= 35) return 'Negative'
  if (score >= 65) return 'Positive'
  if (score >= 45 && score <= 55) return 'Neutral'
  return 'Mixed'
}

function deriveClaimFallbacks(text: string): ClaimItem[] {
  const parts = text
    .split(/[.!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 40)
    .slice(0, 4)

  return parts.map((p) => ({ text: p, status: 'Reported' as const }))
}

async function fetchWebContext(
  query: string,
  sourceFilter: SourceFilter,
  recency: RecencyFilter,
  region: RegionFilter,
): Promise<{ contextBlock: string; sources: SourceItem[] }> {
  const payload = {
    api_key: import.meta.env.VITE_TAVILY_API_KEY,
    query: buildFilteredQuery(query, recency, region),
    search_depth: 'advanced',
    max_results: 8,
    include_domains: SOURCE_FILTER_DOMAINS[sourceFilter],
    include_answer: false,
    sort_by: 'date',
  }

  let response = await fetch('/api/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok && import.meta.env.DEV) {
    response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }
  if (import.meta.env.DEV && !response.headers.get('content-type')?.includes('application/json')) {
    response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }
  if (!response.ok) throw new Error('Tavily search failed');
  const data = await response.json();
  const results: TavilyResult[] = data.results || [];
  const sources = results.map(r => ({ title: r.title, url: r.url, content: r.content }));
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

const AIModeIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
      fill="none"
    />
    <circle cx="12" cy="10" r="1.5" fill="currentColor" />
  </svg>
)

const BreakingNewsIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <rect
      x="3"
      y="4"
      width="18"
      height="16"
      rx="2"
      stroke="currentColor"
      strokeWidth="1.5"
      fill="none"
      strokeDasharray="3 2"
    />
    <path d="M7 9H17" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M7 13H14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <circle cx="17.5" cy="16" r="1.5" fill="#ff4d4d" stroke="none" />
  </svg>
)

const DevelopingIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="2.5" fill="currentColor" />
    <circle cx="12" cy="12" r="6" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
    <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.5" strokeDasharray="4 3" />
    <circle cx="12" cy="12" r="1" fill="currentColor" />
  </svg>
)

const RadarIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="1.5" />
    <circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.5" strokeDasharray="3 2" />
    <circle cx="12" cy="12" r="1.6" fill="currentColor" />
  </svg>
)

const HeatMapIcon = () => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M3 7L9 4L15 7L21 4V17L15 20L9 17L3 20V7Z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
    <circle cx="15" cy="11" r="1.6" fill="currentColor" />
  </svg>
)

const LimitReachedIcon = ({ size = 48 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <circle cx="12" cy="12" r="9" stroke="url(#limit-grad)" strokeWidth="2" />
    <circle cx="12" cy="12" r="5" stroke="url(#limit-grad)" strokeWidth="1.5" strokeDasharray="3 2" />
    <line x1="6" y1="6" x2="18" y2="18" stroke="#ff7a18" strokeWidth="2" strokeLinecap="round" />
    <defs>
      <linearGradient id="limit-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
        <stop stopColor="#ff7a18" />
        <stop offset="1" stopColor="#ff8ed7" />
      </linearGradient>
    </defs>
  </svg>
)

const FeedFallback = ({ label = 'Loading workspace' }: { label?: string }) => (
  <div className="bn-page">
    <div className="bn-loader">
      <div className="bn-loader-orb">
        <LogoIcon />
      </div>
      <span className="bn-loader-text">{label}...</span>
    </div>
  </div>
)

interface CustomTooltipProps {
  active?: boolean;
  payload?: Array<{ value: number }>;
  label?: string;
}

const CustomTooltip = ({ active, payload, label }: CustomTooltipProps) => {
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

// Generate a deterministic gradient color pair from a string
function avatarGradient(str: string): [string, string] {
  let hash = 0
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash)
  const h1 = Math.abs(hash % 360)
  const h2 = (h1 + 40) % 360
  return [`hsl(${h1},70%,55%)`, `hsl(${h2},70%,45%)`]
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase()
}

const makeSessionId = () => `sess-${Date.now()}`;

function App() {
  const { user, signOut, loading } = useAuth()
  const { credits, consume, limit } = useCredits(user?.id)

  const [query, setQuery] = useState('')
  const [isFocused, setIsFocused] = useState(false)
  const [isSearching, setIsSearching] = useState(false)
  const [loadingPhase, setLoadingPhase] = useState<'web' | 'thinking' | 'responding' | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const [theme, setTheme] = useState<'dark' | 'light'>(() => {
    const saved = localStorage.getItem('open-news-theme') as 'dark' | 'light';
    return saved || 'dark';
  })
  const [language, setLanguage] = useState('English')
  const [sourceFilter] = useState<SourceFilter>('All Trusted')
  const [recencyFilter] = useState<RecencyFilter>('Latest')
  const [regionFilter] = useState<RegionFilter>('Global')
  const [isSidebarOpen, setIsSidebarOpen] = useState(false)
  const [sessionId, setSessionId] = useState<string>(makeSessionId)
  const [history, setHistory] = useState<HistorySession[]>(() => {
    const saved = localStorage.getItem('open-news-history');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      } catch { /* ignore */ }
    }
    return [];
  })

  const [profileOpen, setProfileOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)

  const [page, setPage] = useState<'ai-mode' | 'breaking-news' | 'developing' | 'radar' | 'heat-map' | 'account-settings'>('ai-mode')
  const [showV1Notice, setShowV1Notice] = useState<boolean>(() => {
    return localStorage.getItem('open-news-v1-notice-dismissed') !== '1'
  })

  const [streamingText, setStreamingText] = useState('')
  const [streamingSources, setStreamingSources] = useState<{ title: string, url: string }[] | null>(null)
  const [loaderTick, setLoaderTick] = useState(0)

  const bottomAnchorRef = useRef<HTMLDivElement>(null)

  // Close profile dropdown when clicking outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  // Save to history when messages change
  useEffect(() => {
    if (messages.length === 0) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    setSessionId(makeSessionId());
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

  const dismissV1Notice = () => {
    setShowV1Notice(false)
    localStorage.setItem('open-news-v1-notice-dismissed', '1')
  }

  // Auto-scroll to bottom whenever messages update, streaming text changes, or loading starts
  useEffect(() => {
    bottomAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, streamingText, isSearching])

  // Rotate micro-status text while AI is working
  useEffect(() => {
    if (!isSearching || !loadingPhase) return
    const interval = setInterval(() => setLoaderTick((n) => n + 1), 1400)
    return () => clearInterval(interval)
  }, [isSearching, loadingPhase])

  const loaderSubMessages: Record<'web' | 'thinking' | 'responding', string[]> = {
    web: [
      'Scanning trusted sources',
      'Filtering by relevance',
      'Collecting latest developments',
    ],
    thinking: [
      'Connecting facts across sources',
      'Checking consistency and context',
      'Structuring your brief',
    ],
    responding: [
      'Writing your response',
      'Refining clarity and tone',
      'Preparing final brief',
    ],
  }

  const dynamicLoaderSub =
    loadingPhase ? loaderSubMessages[loadingPhase][loaderTick % loaderSubMessages[loadingPhase].length] : ''

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

    if (!consume(1)) {
      const limitId = `assistant-${Date.now()}`
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: limitId,
          role: 'assistant',
          limitReached: true,
          text: `## Daily Limit Reached\n\nYou've used all your daily AI search credits.\n\n**Open News is currently in beta.** We're actively working to expand access — please tune in later for updates!`
        }
      ]);
      setQuery('')
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
      const shouldUseNewsSearch = isNewsQuery(cleanQuery);

      if (shouldUseNewsSearch) {
        try {
          const result = await fetchWebContext(cleanQuery, sourceFilter, recencyFilter, regionFilter);
          webContext = result.contextBlock;
          sources = result.sources;
          // Consume credits for each article fetched via Tavily
          if (sources.length > 0) {
            const hasCreditsForSources = consume(sources.length);
            if (!hasCreditsForSources) {
              webContext = '';
              sources = [];
            }
          }
        } catch (e) {
          console.warn('Tavily search failed, proceeding without web context:', e);
        }
      }

      // Step 2: Think
      setLoadingPhase('thinking')
      const systemPrompt = webContext
        ? `You are Open News, an expert AI journalist and news analyst powered by trusted global sources.
        
CRITICAL REQUIREMENT: Though your sources and internal reasoning may be in English, YOU MUST WRITE YOUR ENTIRE FINAL RESPONSE IN ${language.toUpperCase()}.

Response style:
- Respond naturally and adapt structure to the user's query.
- Use concise or detailed format as needed; do not force a fixed template.
- Use markdown only when it helps readability.
- When relevant, cite supporting sources inline using [1], [2], etc.
- Filters applied: ${sourceFilter}, ${recencyFilter}, ${regionFilter}.

Here is live web search context to help you answer accurately:

${webContext}

Use the above sources to answer accurately and clearly.`
        : `You are Open News, an expert AI journalist and news analyst.

CRITICAL REQUIREMENT: YOU MUST WRITE YOUR ENTIRE FINAL RESPONSE IN ${language.toUpperCase()}.

Response style:
- Respond naturally and adapt structure to the user's query.
- Use concise or detailed format as needed; do not force a fixed template.
- Use markdown only when it helps readability.
- If asked about your exact model identity, say Open News is routed through OpenRouter and model routing may vary by configuration.`;

      // Step 3: Respond via Streaming
      setLoadingPhase('responding')
      await new Promise(r => setTimeout(r, 100)); // brief pause

      const stream = await openrouterClient.chat.completions.create({
        model: OPENROUTER_MODEL,
        max_tokens: 2048,
        stream: true as const,
        messages: [
          { role: 'system', content: systemPrompt },
          ...newMessages.map(msg => ({
            role: msg.role as 'assistant' | 'user' | 'system',
            content: msg.text
          }))
        ],
      } as Parameters<typeof openrouterClient.chat.completions.create>[0])
      const typedStream = stream as unknown as AsyncIterable<OpenRouterStreamChunk>

      let fullText = '';
      setStreamingSources(sources);

      let streamError = false;
      try {
        for await (const chunk of typedStream) {
          const contentDelta = chunk.choices?.[0]?.delta?.content || '';
          if (contentDelta) {
            fullText += contentDelta;
            setStreamingText(fullText);
          }
        }
      } catch (streamErr) {
        streamError = true;
        console.warn('Stream interrupted:', streamErr);
      }

      const assistantId = `assistant-${Date.now()}`;
      const fallbackSentiment = clampScore(50, 50)
      const fallbackBias = normalizeBias('Unclear')
      const fallbackClaims = deriveClaimFallbacks(fullText)
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: assistantId,
          role: 'assistant',
          text: fullText || "I'm sorry, I couldn't generate a report at this time.",
          sources,
          sourcePerspectives: buildSourcePerspectives(sources),
          sentiment: fallbackSentiment,
          sentimentLabel: deriveSentimentLabel(fallbackSentiment),
          sentimentConfidence: 50,
          bias: fallbackBias,
          biasScore: getBiasFallbackScore(fallbackBias),
          biasConfidence: 50,
          claims: fallbackClaims,
          timeline: [],
          relatedStories: [],
        }
      ]);

      setStreamingText('')
      setStreamingSources(null)

      if (streamError) return;

      // Step 4: Generate follow up questions & Metadata
      const allowFollowUps = isNewsQuery(cleanQuery)
      const allowChart = isChartQuery(cleanQuery, fullText)
      const metadataPrompt = `Based on the following news brief, analyze and return ONLY a single valid JSON object representing metadata. The JSON must have the following schema, and no other text:
{
  "followUps": ["Q1", "Q2", "Q3"], // exactly 3 short follow-up questions
  "sentiment": 75, // integer 0-100, where 0=very negative story impact/tone, 50=mixed/neutral, 100=very positive
  "sentimentLabel": "Mixed", // string: "Negative", "Mixed", "Neutral", or "Positive"
  "sentimentConfidence": 72, // integer 0-100, confidence in the sentiment assessment
  "sentimentRationale": "One sentence explaining what factual evidence drives the score.",
  "sentimentDrivers": [{"label": "Market selloff", "weight": 35, "direction": "Negative"}],
  "bias": "Center", // string: "Left", "Right", "Center", or "Unclear"
  "biasScore": 50, // integer 0-100, where 0=left-framed, 50=balanced/center, 100=right-framed
  "biasConfidence": 65, // integer 0-100, confidence in the framing assessment
  "biasRationale": "One sentence explaining observed framing, source balance, or why it is unclear.",
  "biasSignals": [{"label": "Source mix", "evidence": "Most citations are straight-wire reports"}],
  "claims": [{"text": "Specific factual claim", "status": "Reported"}],
  "timeline": [{"time": "Today / Date / Sequence label", "event": "What changed", "source": "Optional source"}],
  "relatedStories": [{"title": "Related story", "angle": "Background", "note": "Why it matters"}],
  "entities": [{"name": "Entity", "type": "Country", "note": "Role in the story"}],
  "chartData": {
    "title": "Brief Chart Title",
    "data": [{"label": "Category A", "value": 50}]
  } // OPTIONAL: only provide chartData if the brief contains strong numerical distributions or comparisons.
}

Brief:
${fullText}

Metadata rules:
- Extract 3-6 claims and classify each status as exactly one of: Reported, Confirmed, Disputed, Unclear.
- Sentiment must be based on the reported facts and wording in the brief, not on whether the topic is politically liked.
- Bias must describe framing/source balance in this generated brief and cited sources, not a permanent rating of an outlet.
- If evidence is thin, set bias to "Unclear", biasScore to 50, and lower biasConfidence.
- Return 2-5 sentimentDrivers with weights that roughly explain the sentiment score.
- Return 2-5 biasSignals grounded in source mix, word choice, omitted perspectives, or explicit framing.
- Create a timeline only when the brief describes a developing sequence; otherwise return an empty array.
- Return 2-5 relatedStories with angles chosen from: Background, Latest Update, Opposing Viewpoint, Economic Impact, Policy Impact, Other.
- Return 3-8 entities mentioned in the brief.

Chart eligibility:
- Chart allowed for this query: ${allowChart ? 'YES' : 'NO'}
- If NO, you MUST return chartData as null.

Follow-up eligibility:
- Follow-ups allowed for this query: ${allowFollowUps ? 'YES' : 'NO'}
- If NO, you MUST return followUps as an empty array.`;

      try {
        const metaCompletion = await openrouterClient.chat.completions.create({
          model: OPENROUTER_MODEL,
          max_tokens: 350,
          messages: [{ role: 'user', content: metadataPrompt }],
          stream: false as const,
        } as Parameters<typeof openrouterClient.chat.completions.create>[0]);

        const jsonContent =
          (metaCompletion as unknown as { choices?: Array<{ message?: { content?: string } }> })
            .choices?.[0]?.message?.content || '{}';
        const match = jsonContent.match(/\{[\s\S]*\}/); // extract json object
        const meta = JSON.parse(match ? match[0] : jsonContent);

        setMessages(currentMessages => currentMessages.map(msg =>
          msg.id === assistantId ? {
            ...msg,
            bias: normalizeBias(meta.bias),
            followUps: allowFollowUps ? (meta.followUps?.slice(0, 3) || []) : [],
            sentiment: clampScore(meta.sentiment, msg.sentiment ?? 50),
            sentimentLabel: (meta.sentimentLabel || msg.sentimentLabel || deriveSentimentLabel(msg.sentiment ?? 50)),
            sentimentConfidence: clampScore(meta.sentimentConfidence, msg.sentimentConfidence ?? 50),
            sentimentRationale: meta.sentimentRationale || msg.sentimentRationale,
            sentimentDrivers: safeArray<SentimentDriver>(meta.sentimentDrivers).slice(0, 5),
            biasScore: clampScore(meta.biasScore, msg.biasScore ?? getBiasFallbackScore(normalizeBias(meta.bias))),
            biasConfidence: clampScore(meta.biasConfidence, msg.biasConfidence ?? 50),
            biasRationale: meta.biasRationale || msg.biasRationale,
            biasSignals: safeArray<BiasSignal>(meta.biasSignals).slice(0, 5),
            chartData: allowChart ? meta.chartData : undefined,
            claims: safeArray<ClaimItem>(meta.claims).slice(0, 6).length > 0
              ? safeArray<ClaimItem>(meta.claims).slice(0, 6)
              : (msg.claims && msg.claims.length > 0 ? msg.claims : deriveClaimFallbacks(msg.text)),
            timeline: safeArray<TimelineItem>(meta.timeline).slice(0, 6).length > 0
              ? safeArray<TimelineItem>(meta.timeline).slice(0, 6)
              : (msg.timeline || []),
            relatedStories: safeArray<RelatedStory>(meta.relatedStories).slice(0, 5).length > 0
              ? safeArray<RelatedStory>(meta.relatedStories).slice(0, 5)
              : (msg.relatedStories || []),
            entities: safeArray<EntityItem>(meta.entities).slice(0, 8),
          } : msg
        ));
      } catch (e) {
        console.warn("Failed to parse metadata", e);
      }
    } catch (error) {
      console.error('Error:', error);
      const msg = error instanceof Error ? error.message : 'Unknown error occurred';
      const status = (error as { status?: number }).status;
      setMessages((currentMessages) => [
        ...currentMessages,
        {
          id: `assistant-${Date.now()}`,
          role: 'assistant',
          text: status === 401
            ? `## ⚠️ Authentication Error\n\nYour AI service token (OpenRouter) appears to have expired or is invalid. Please update the \`VITE_OPENROUTER_API_KEY\` in your \`.env\` file with a fresh key from https://openrouter.ai/keys.\n\nError details: ${msg}`
            : `Error communicating with the AI service: ${msg}`
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

  // Derived avatar values
  const displayName = user?.user_metadata?.full_name || user?.email || 'User'
  const initials = getInitials(displayName)
  const [grad1, grad2] = avatarGradient(user?.email || displayName)

  if (loading) {
    return (
      <div className="auth-loading">
        <span className="auth-spinner" style={{ width: 32, height: 32 }} />
      </div>
    )
  }

  if (!user) {
    return <AuthModal />
  }

  return (
    <main className={shellClassName}>
      {page === 'ai-mode' && showV1Notice && !isConversationMode && (
        <section className="v1-notice" role="status" aria-live="polite">
          <div className="v1-notice-mascot" aria-hidden="true">
            <svg width="34" height="34" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="12" cy="12" r="9" stroke="url(#v1-grad)" strokeWidth="1.8" />
              <circle cx="9.2" cy="10" r="1.2" fill="currentColor" />
              <circle cx="14.8" cy="10" r="1.2" fill="currentColor" />
              <path d="M8.5 14C9.2 15.3 10.4 16 12 16C13.6 16 14.8 15.3 15.5 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <path d="M6.5 6.8L8 8.2M17.5 6.8L16 8.2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
              <defs>
                <linearGradient id="v1-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#ff7a18" />
                  <stop offset="1" stopColor="#ff8ed7" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="v1-notice-copy">
            <strong>V1 testing phase is now open</strong>
            <span>Open News is actively evolving. Expect rapid updates and occasional rough edges.</span>
          </div>
          <button className="v1-notice-close" onClick={dismissV1Notice} aria-label="Dismiss V1 testing notice">
            ×
          </button>
        </section>
      )}

      {/* Navbar */}
      <nav className="app-nav">
        <div className="nav-items">
          <button
            className={`nav-item${page === 'ai-mode' ? ' active' : ''}`}
            aria-current={page === 'ai-mode' ? 'page' : undefined}
            onClick={() => setPage('ai-mode')}
          >
            <span className="nav-icon">
              <AIModeIcon />
            </span>
            AI Mode
          </button>
          <button
            className={`nav-item${page === 'breaking-news' ? ' active' : ''}`}
            aria-current={page === 'breaking-news' ? 'page' : undefined}
            onClick={() => setPage('breaking-news')}
          >
            <span className="nav-icon">
              <BreakingNewsIcon />
            </span>
            Breaking News
          </button>
          <button
            className={`nav-item${page === 'developing' ? ' active' : ''}`}
            aria-current={page === 'developing' ? 'page' : undefined}
            onClick={() => setPage('developing')}
          >
            <span className="nav-icon">
              <DevelopingIcon />
            </span>
            Developing
          </button>
          <button
            className={`nav-item${page === 'radar' ? ' active' : ''}`}
            aria-current={page === 'radar' ? 'page' : undefined}
            onClick={() => setPage('radar')}
          >
            <span className="nav-icon">
              <RadarIcon />
            </span>
            Radar
          </button>
          <button
            className={`nav-item${page === 'heat-map' ? ' active' : ''}`}
            aria-current={page === 'heat-map' ? 'page' : undefined}
            onClick={() => setPage('heat-map')}
          >
            <span className="nav-icon">
              <HeatMapIcon />
            </span>
            Heat Map
          </button>
        </div>
      </nav>

      <header className="brand">
        <div className="brand-title">
          <div className="brand-header-row">
            <LogoIcon />
            <h1>Open News</h1>
          </div>
          <p>AI-powered search engine for trusted global news sources.</p>
        </div>

        {/* Profile Avatar + Dropdown */}
        <div className="brand-actions">
          <div className="profile-wrapper" ref={profileRef}>
            <button
              className={`profile-avatar-btn${profileOpen ? ' active' : ''}`}
              onClick={() => setProfileOpen(o => !o)}
              aria-label="Open profile menu"
              aria-expanded={profileOpen}
              id="profile-avatar-btn"
              style={{ background: `linear-gradient(135deg, ${grad1}, ${grad2})` }}
            >
              {initials}
            </button>

            {profileOpen && (
              <div className="profile-dropdown" role="menu">
                {/* Profile info */}
                <div className="profile-menu-info">
                  <div
                    className="profile-menu-avatar"
                    style={{ background: `linear-gradient(135deg, ${grad1}, ${grad2})` }}
                  >
                    {initials}
                  </div>
                  <div className="profile-menu-identity">
                    <span className="profile-menu-name">{displayName}</span>
                    <span className="profile-menu-email">{user.email}</span>
                  </div>
                </div>

                <div className="profile-menu-divider" />

                {/* Account settings */}
                <button
                  className="profile-menu-item"
                  onClick={() => { setPage('account-settings'); setProfileOpen(false) }}
                  role="menuitem"
                  id="profile-account-settings-btn"
                >
                  <span className="profile-menu-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="3.2" />
                      <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a1.9 1.9 0 0 1 0 2.7l-.1.1a1.9 1.9 0 0 1-2.7 0l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a1.9 1.9 0 0 1-1.9 1.9h-.4A1.9 1.9 0 0 1 11 20v-.1a1 1 0 0 0-.6-.9 1 1 0 0 0-1.1.2l-.1.1a1.9 1.9 0 0 1-2.7 0l-.1-.1a1.9 1.9 0 0 1 0-2.7l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H5.6A1.9 1.9 0 0 1 3.7 13v-.4A1.9 1.9 0 0 1 5.6 10h.1a1 1 0 0 0 .9-.6 1 1 0 0 0-.2-1.1l-.1-.1a1.9 1.9 0 0 1 0-2.7l.1-.1a1.9 1.9 0 0 1 2.7 0l.1.1a1 1 0 0 0 1.1.2h0a1 1 0 0 0 .6-.9V4.6A1.9 1.9 0 0 1 12.8 2.7h.4A1.9 1.9 0 0 1 15.1 4.6v.1a1 1 0 0 0 .6.9h0a1 1 0 0 0 1.1-.2l.1-.1a1.9 1.9 0 0 1 2.7 0l.1.1a1.9 1.9 0 0 1 0 2.7l-.1.1a1 1 0 0 0-.2 1.1v0a1 1 0 0 0 .9.6h.1a1.9 1.9 0 0 1 1.9 1.9v.4a1.9 1.9 0 0 1-1.9 1.9h-.1a1 1 0 0 0-.9.6Z" strokeWidth="1.2" />
                    </svg>
                  </span>
                  Account Settings
                </button>

                <div className="profile-menu-divider" />

                {/* Credits */}
                <div className="profile-menu-item" role="menuitem" style={{ cursor: 'default' }}>
                  <span className="profile-menu-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 6v12M9 10h6M9 14h6" strokeWidth="1.5" />
                    </svg>
                  </span>
                  Credits
                  <span className="profile-credits-badge">{credits}/100</span>
                </div>

                <div className="profile-menu-divider" />

                {/* Theme toggle */}
                <button
                  className="profile-menu-item"
                  onClick={() => setTheme(t => t === 'dark' ? 'light' : 'dark')}
                  role="menuitem"
                  id="profile-theme-toggle"
                >
                  <span className="profile-menu-icon">
                    {theme === 'dark' ? (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="5" />
                        <line x1="12" y1="1" x2="12" y2="4" />
                        <line x1="12" y1="20" x2="12" y2="23" />
                        <line x1="4.22" y1="4.22" x2="6.34" y2="6.34" />
                        <line x1="17.66" y1="17.66" x2="19.78" y2="19.78" />
                        <line x1="1" y1="12" x2="4" y2="12" />
                        <line x1="20" y1="12" x2="23" y2="12" />
                        <line x1="4.22" y1="19.78" x2="6.34" y2="17.66" />
                        <line x1="17.66" y1="6.34" x2="19.78" y2="4.22" />
                      </svg>
                    ) : (
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
                      </svg>
                    )}
                  </span>
                  {theme === 'dark' ? 'Light Mode' : 'Dark Mode'}
                </button>

                {/* Language selector */}
                <div className="profile-menu-item profile-menu-lang" role="menuitem">
                  <span className="profile-menu-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="10" />
                      <line x1="2" y1="12" x2="22" y2="12" />
                      <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
                    </svg>
                  </span>
                  Language
                  <select
                    className="profile-lang-select"
                    value={language}
                    onChange={e => setLanguage(e.target.value)}
                    aria-label="Response language"
                    id="profile-language-select"
                  >
                    <option value="English">English</option>
                    <option value="Spanish">Español</option>
                    <option value="French">Français</option>
                    <option value="German">Deutsch</option>
                    <option value="Japanese">日本語</option>
                    <option value="Arabic">العربية</option>
                  </select>
                </div>

                {/* History */}
                <button
                  className="profile-menu-item"
                  onClick={() => { setIsSidebarOpen(true); setProfileOpen(false) }}
                  role="menuitem"
                  id="profile-history-btn"
                >
                  <span className="profile-menu-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="23 4 23 10 17 10" />
                      <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
                    </svg>
                  </span>
                  History
                </button>

                {/* Sign out */}
                <button
                  className="profile-menu-item profile-menu-signout"
                  onClick={() => { signOut(); setProfileOpen(false) }}
                  role="menuitem"
                  id="profile-signout-btn"
                >
                  <span className="profile-menu-icon">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                  </span>
                  Sign Out
                </button>
              </div>
            )}
          </div>
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
            [...history].sort((a, b) => b.updatedAt - a.updatedAt).map(session => (
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

      {page === 'breaking-news' ? (
        <section className="feed-shell">
          <Suspense fallback={<FeedFallback label="Loading breaking news" />}>
            <BreakingNews consume={consume} />
          </Suspense>
        </section>
      ) : page === 'developing' ? (
        <section className="feed-shell">
          <Suspense fallback={<FeedFallback label="Loading developing stories" />}>
            <Developing consume={consume} />
          </Suspense>
        </section>
      ) : page === 'radar' ? (
        <section className="feed-shell">
          <Suspense fallback={<FeedFallback label="Loading radar" />}>
            <Radar consume={consume} credits={credits} limit={limit} />
          </Suspense>
        </section>
      ) : page === 'heat-map' ? (
        <section className="feed-shell">
          <Suspense fallback={<FeedFallback label="Loading heat map" />}>
            <HeatMap consume={consume} credits={credits} limit={limit} />
          </Suspense>
        </section>
      ) : page === 'account-settings' ? (
        <section className="feed-shell">
          <Suspense fallback={<FeedFallback label="Loading settings" />}>
            <AccountSettings
              email={user.email || 'No email'}
              displayName={displayName}
            />
          </Suspense>
        </section>
      ) : (
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

          <div className={isExpanded ? 'chatbar visible' : 'chatbar'}>
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
                  {message.limitReached && (
                    <div className="limit-icon" style={{ marginBottom: 12 }}>
                      <LimitReachedIcon size={48} />
                    </div>
                  )}
                  <ReactMarkdown>{message.text}</ReactMarkdown>
                  {message.sources && message.sources.length > 0 && (
                    <div className="sources-list">
                      <span className="sources-label">Sources</span>
                      <div className="source-icons">
                        {message.sources.map((src, i) => {
                          let hostname = src.url;
                          try { hostname = new URL(src.url).hostname; } catch { /* keep raw url */ }
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
                                    const img = e.target as HTMLImageElement;
                                    img.style.display = 'none';
                                    const fallback = img.nextElementSibling;
                                    if (fallback) fallback.textContent = hostname[0].toUpperCase();
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
                          <div className="sentiment-header">
                            <span className="meta-label">Sentiment</span>
                            <span className="sentiment-score" style={{ color: message.sentiment > 60 ? '#6ef0b9' : message.sentiment < 40 ? '#ff7a18' : '#ffd166' }}>
                              {message.sentiment}<span className="sentiment-denom">/100</span>
                            </span>
                          </div>
                          <div className="meter-subhead">
                            <span>{message.sentimentLabel || 'Mixed'}</span>
                            {message.sentimentConfidence !== undefined && <span>{message.sentimentConfidence}% confidence</span>}
                          </div>
                          <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${message.sentiment}%`, background: message.sentiment > 60 ? '#6ef0b9' : message.sentiment < 40 ? '#ff7a18' : '#ffd166' }}></div>
                          </div>
                          <div className="progress-ticks">
                            <span>0</span>
                            <span>25</span>
                            <span>50</span>
                            <span>75</span>
                            <span>100</span>
                          </div>
                          <div className="sentiment-labels">
                            <span>Negative</span>
                            <span>Neutral</span>
                            <span>Positive</span>
                          </div>
                          {message.sentimentRationale && (
                            <p className="meter-rationale">{message.sentimentRationale}</p>
                          )}
                          {message.sentimentDrivers && message.sentimentDrivers.length > 0 && (
                            <div className="meter-evidence-list">
                              {message.sentimentDrivers.map((driver, i) => (
                                <div key={`${driver.label}-${i}`} className={`meter-evidence-item sentiment-${driver.direction.toLowerCase()}`}>
                                  <span>{driver.direction}</span>
                                  <p>{driver.label}</p>
                                  <strong>{clampScore(driver.weight, 0)}</strong>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                      {message.bias && (
                        <div className="bias-meter-container">
                          <div className="bias-header">
                            <span className="meta-label">Bias Rating</span>
                            <span className={`bias-badge bias-${message.bias.toLowerCase()}`}>{message.bias}</span>
                          </div>
                          <div className="meter-subhead">
                            <span>Framing score {message.biasScore ?? getBiasFallbackScore(message.bias)}/100</span>
                            {message.biasConfidence !== undefined && <span>{message.biasConfidence}% confidence</span>}
                          </div>
                          <div className="bias-spectrum">
                            <div className="bias-track"></div>
                            <div className="bias-ticks">
                              <span></span><span></span><span></span><span></span><span></span>
                            </div>
                            <div
                              className={`bias-marker ${message.bias.toLowerCase()}`}
                              style={{
                                left: `${message.biasScore ?? getBiasFallbackScore(message.bias)}%`
                              }}
                            >
                              <span className="bias-marker-value">
                                {message.biasScore ?? getBiasFallbackScore(message.bias)}
                              </span>
                            </div>
                          </div>
                          <div className="bias-labels">
                            <span>Left</span>
                            <span>Center</span>
                            <span>Right</span>
                          </div>
                          {message.biasRationale && (
                            <p className="meter-rationale">{message.biasRationale}</p>
                          )}
                          {message.sources && message.sources.length > 0 && (
                            <div className="source-balance-row">
                              <span>{message.sources.length} cited sources</span>
                              <span>{new Set(message.sources.map((source) => extractSource(source.url))).size} outlets</span>
                            </div>
                          )}
                          {message.biasSignals && message.biasSignals.length > 0 && (
                            <div className="meter-evidence-list">
                              {message.biasSignals.map((signal, i) => (
                                <div key={`${signal.label}-${i}`} className="meter-evidence-item bias-signal">
                                  <span>{signal.label}</span>
                                  <p>{signal.evidence}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {message.sourcePerspectives && message.sourcePerspectives.length > 0 && (
                    <div className="intel-panel">
                      <div className="intel-panel-header">
                        <span>Source Comparison</span>
                      </div>
                      <div className="source-compare-grid">
                        {message.sourcePerspectives.map((perspective) => (
                          <a key={perspective.url} href={perspective.url} target="_blank" rel="noreferrer" className="source-compare-card">
                            <strong>{perspective.source}</strong>
                            <span>{perspective.headline}</span>
                            <p>{perspective.framing}</p>
                          </a>
                        ))}
                      </div>
                    </div>
                  )}

                  {message.claims && message.claims.length > 0 && (
                    <div className="intel-panel">
                      <div className="intel-panel-header">
                        <span>Claims</span>
                      </div>
                      <div className="claim-list">
                        {message.claims.map((claim, i) => (
                          <div key={`${claim.status}-${i}`} className="claim-item">
                            <span className={`claim-status status-${claim.status.toLowerCase()}`}>{claim.status}</span>
                            <p>{claim.text}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {message.timeline && message.timeline.length > 0 && (
                    <div className="intel-panel">
                      <div className="intel-panel-header">
                        <span>Timeline</span>
                      </div>
                      <div className="timeline-list">
                        {message.timeline.map((item, i) => (
                          <div key={`${item.time}-${i}`} className="timeline-item">
                            <strong>{item.time}</strong>
                            <p>{item.event}</p>
                            {item.source && <span>{item.source}</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {message.relatedStories && message.relatedStories.length > 0 && (
                    <div className="intel-panel">
                      <div className="intel-panel-header">
                        <span>Related Stories</span>
                      </div>
                      <div className="related-grid">
                        {message.relatedStories.map((story, i) => (
                          <div key={`${story.title}-${i}`} className="related-card">
                            <span>{story.angle}</span>
                            <strong>{story.title}</strong>
                            <p>{story.note}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {message.entities && message.entities.length > 0 && (
                    <div className="intel-panel entity-panel">
                      <div className="intel-panel-header">
                        <span>Entity Tracking</span>
                      </div>
                      <div className="entity-list">
                        {message.entities.map((entity, i) => (
                          <span key={`${entity.name}-${i}`} className="entity-chip" title={entity.note}>
                            {entity.name}
                            <small>{entity.type}</small>
                          </span>
                        ))}
                      </div>
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
                          let hostname = src.url;
                          try { hostname = new URL(src.url).hostname; } catch { /* keep raw url */ }
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
                                    const img = e.target as HTMLImageElement;
                                    img.style.display = 'none';
                                    const fallback = img.nextElementSibling;
                                    if (fallback) fallback.textContent = hostname[0].toUpperCase();
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
                    {loadingPhase === 'web' && <><span className="phase-label web">Searching the web</span><span className="phase-sub">{dynamicLoaderSub}<span className="typing-dots"><span>.</span><span>.</span><span>.</span></span></span></>}
                    {loadingPhase === 'thinking' && <><span className="phase-label thinking">Thinking</span><span className="phase-sub">{dynamicLoaderSub}<span className="typing-dots"><span>.</span><span>.</span><span>.</span></span></span></>}
                    {loadingPhase === 'responding' && <><span className="phase-label responding">Responding</span><span className="phase-sub">{dynamicLoaderSub}<span className="typing-dots"><span>.</span><span>.</span><span>.</span></span></span></>}
                  </div>
                </div>
              </article>
            )}
            <div ref={bottomAnchorRef} style={{ height: 1 }} />
          </div>
        </section>
      )}
    </main>
  )
}

export default App
