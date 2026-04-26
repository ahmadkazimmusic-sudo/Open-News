import { useEffect, useMemo, useState } from 'react'
import RadarCard from './RadarCard'

interface NewsItem {
  title: string
  url: string
  content: string
  source: string
  published?: string
}

interface RadarProps {
  consume: (amount?: number) => boolean
  credits: number
  limit: number
}

const STORAGE_KEY = 'open-news-radar-watchlist'
const PRESETS_STORAGE_KEY = 'open-news-radar-presets'
const DEFAULT_TOPICS = ['geopolitics', 'artificial intelligence', 'energy markets']

async function fetchRadarNews(topics: string[]): Promise<NewsItem[]> {
  const query = `breaking updates on ${topics.join(', ')}`
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: import.meta.env.VITE_TAVILY_API_KEY,
      query,
      search_depth: 'advanced',
      max_results: 12,
      include_domains: [
        'reuters.com', 'bbc.com', 'apnews.com', 'bloomberg.com', 'ft.com',
        'theguardian.com', 'nytimes.com', 'wsj.com', 'aljazeera.com', 'economist.com'
      ],
      include_answer: false,
      sort_by: 'date',
    })
  })
  if (!response.ok) throw new Error('Failed to fetch personalized radar feed')
  const data = await response.json()
  const results = data.results || []
  return results.map((r: { title: string; url: string; content: string; published_date?: string }) => {
    let source = r.url
    try { source = new URL(r.url).hostname.replace('www.', '') } catch { /* keep raw */ }
    return {
      title: r.title,
      url: r.url,
      content: r.content,
      source,
      published: r.published_date,
    }
  })
}

function readSavedTopics(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return DEFAULT_TOPICS
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed) || parsed.length === 0) return DEFAULT_TOPICS
    return parsed
      .map((t) => String(t).trim().toLowerCase())
      .filter(Boolean)
      .slice(0, 10)
  } catch {
    return DEFAULT_TOPICS
  }
}

function readSavedPresets(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(PRESETS_STORAGE_KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    if (!parsed || typeof parsed !== 'object') return {}
    const clean: Record<string, string[]> = {}
    Object.entries(parsed).forEach(([name, value]) => {
      if (!Array.isArray(value)) return
      const key = String(name).trim()
      if (!key) return
      const topics = value.map((t) => String(t).trim().toLowerCase()).filter(Boolean).slice(0, 10)
      if (topics.length > 0) clean[key] = topics
    })
    return clean
  } catch {
    return {}
  }
}

export default function Radar({ consume, credits, limit }: RadarProps) {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [topicInput, setTopicInput] = useState('')
  const [presetNameInput, setPresetNameInput] = useState('')
  const [topics, setTopics] = useState<string[]>(() => readSavedTopics())
  const [presets, setPresets] = useState<Record<string, string[]>>(() => readSavedPresets())
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [lastRefreshCost, setLastRefreshCost] = useState(0)

  const canAddMore = topics.length < 10

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(topics))
  }, [topics])

  useEffect(() => {
    localStorage.setItem(PRESETS_STORAGE_KEY, JSON.stringify(presets))
  }, [presets])

  const load = async (activeTopics: string[] = topics) => {
    if (activeTopics.length === 0) {
      setItems([])
      setError('Add at least one topic to build your radar.')
      setLoading(false)
      return
    }

    setLoading(true)
    setError(null)
    try {
      const news = await fetchRadarNews(activeTopics)
      const cost = Math.max(1, news.length)
      if (!consume(cost)) {
        setError(`Daily credit limit reached. Radar refresh requires ${cost} credits.`)
        setLoading(false)
        return
      }
      setLastRefreshCost(cost)
      setItems(news)
      setLastUpdated(new Date())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    load()
    const interval = setInterval(() => load(), 5 * 60 * 1000)
    return () => clearInterval(interval)
  }, [])

  const timeAgo = (dateStr?: string) => {
    if (!dateStr) return ''
    const then = new Date(dateStr)
    const now = new Date()
    const diff = Math.floor((now.getTime() - then.getTime()) / 60000)
    if (diff < 1) return 'just now'
    if (diff < 60) return `${diff}m ago`
    const hours = Math.floor(diff / 60)
    if (hours < 24) return `${hours}h ago`
    return `${Math.floor(hours / 24)}d ago`
  }

  const addTopic = () => {
    const normalized = topicInput.trim().toLowerCase()
    if (!normalized || topics.includes(normalized) || !canAddMore) return
    const next = [...topics, normalized]
    setTopics(next)
    setTopicInput('')
    load(next)
  }

  const removeTopic = (topic: string) => {
    const next = topics.filter((t) => t !== topic)
    setTopics(next)
    load(next)
  }

  const savePreset = () => {
    const normalized = presetNameInput.trim()
    if (!normalized || topics.length === 0) return
    setPresets((current) => ({ ...current, [normalized]: topics }))
    setPresetNameInput('')
  }

  const applyPreset = (name: string) => {
    const selected = presets[name]
    if (!selected || selected.length === 0) return
    setTopics(selected)
    load(selected)
  }

  const deletePreset = (name: string) => {
    setPresets((current) => {
      const next = { ...current }
      delete next[name]
      return next
    })
  }

  const subtitle = useMemo(() => {
    if (topics.length === 0) return 'No active topics'
    if (topics.length === 1) return `Tracking ${topics[0]}`
    return `Tracking ${topics.length} topics`
  }, [topics])
  const isCreditError = Boolean(error && error.toLowerCase().includes('credit'))

  const projectedCost = Math.max(1, items.length || topics.length || 1)
  const hasEnoughCredits = credits >= projectedCost

  return (
    <div className="bn-page">
      <div className="bn-header">
        <div className="bn-header-left">
          <span className="bn-live-dot" />
          <span className="bn-title">Personal Radar</span>
          <span className="bn-count">{subtitle}</span>
        </div>
        <div className="bn-header-right">
          <span className="bn-updated">
            Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button className="bn-refresh" onClick={() => load()} disabled={loading} title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </div>

      <div className="radar-panel">
        <div className="radar-credits-row">
          <span className="radar-credits-pill">
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v12M9 10h6M9 14h6" strokeWidth="1.4" />
            </svg>
            Credits {credits}/{limit}
          </span>
          <span className={`radar-credits-meta${hasEnoughCredits ? '' : ' low'}`}>
            Next refresh: ~{projectedCost} credits
            {lastRefreshCost > 0 ? ` • last used ${lastRefreshCost}` : ''}
          </span>
        </div>
        <div className="radar-input-row">
          <input
            value={topicInput}
            onChange={(e) => setTopicInput(e.target.value)}
            placeholder="Add topic (e.g. climate policy, Nvidia, Red Sea)"
            maxLength={42}
            aria-label="Add radar topic"
          />
          <button onClick={addTopic} disabled={!topicInput.trim() || !canAddMore}>
            Add Topic
          </button>
        </div>
        {!hasEnoughCredits && (
          <div className="radar-credit-warning">
            Not enough credits for another radar refresh. Try again after daily reset.
          </div>
        )}
        <div className="radar-chips">
          {topics.map((topic) => (
            <button key={topic} className="radar-chip" onClick={() => removeTopic(topic)} title="Remove topic">
              <span>{topic}</span>
              <span aria-hidden="true">×</span>
            </button>
          ))}
        </div>
        <div className="radar-preset-row">
          <input
            value={presetNameInput}
            onChange={(e) => setPresetNameInput(e.target.value)}
            placeholder="Preset name (e.g. Macro + AI)"
            maxLength={28}
            aria-label="Preset name"
          />
          <button onClick={savePreset} disabled={!presetNameInput.trim() || topics.length === 0}>
            Save Preset
          </button>
        </div>
        <div className="radar-presets">
          {Object.entries(presets).map(([name, presetTopics]) => (
            <div key={name} className="radar-preset-chip-wrap">
              <button
                className="radar-chip radar-preset-chip"
                onClick={() => applyPreset(name)}
                title={`Load preset: ${name}`}
              >
                <span>{name}</span>
                <span className="radar-preset-count">{presetTopics.length}</span>
              </button>
              <button
                className="radar-preset-delete"
                onClick={() => deletePreset(name)}
                title={`Delete preset: ${name}`}
                aria-label={`Delete preset ${name}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {error && (
        <div className="bn-error">
          {isCreditError && (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: 12 }}>
              <circle cx="12" cy="12" r="9" stroke="url(#radar-limit-grad)" strokeWidth="2" />
              <circle cx="12" cy="12" r="5" stroke="url(#radar-limit-grad)" strokeWidth="1.5" strokeDasharray="3 2" />
              <line x1="6" y1="6" x2="18" y2="18" stroke="#ff7a18" strokeWidth="2" strokeLinecap="round" />
              <defs>
                <linearGradient id="radar-limit-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#ff7a18" />
                  <stop offset="1" stopColor="#ff8ed7" />
                </linearGradient>
              </defs>
            </svg>
          )}
          <span>{error}</span>
          <button onClick={() => load()}>Retry</button>
        </div>
      )}

      {!error && (
        <div className="radar-grid">
          {items.map((item, i) => (
            <RadarCard
              key={i}
              item={item}
              index={i}
              timeAgo={timeAgo}
            />
          ))}
        </div>
      )}
    </div>
  )
}
