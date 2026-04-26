import { useCallback, useEffect, useMemo, useState } from 'react'
import { MapContainer, TileLayer, CircleMarker, Tooltip, Popup } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

interface HeatMapProps {
  consume: (amount?: number) => boolean
  credits: number
  limit: number
}

interface NewsItem {
  title: string
  url: string
  content: string
  source: string
  published?: string
}

interface RegionConfig {
  id: string
  label: string
  center: [number, number]
  keywords: string[]
}

const REGION_CONFIGS: RegionConfig[] = [
  { id: 'north-america', label: 'North America', center: [-102, 43], keywords: ['united states', 'u.s.', 'us ', 'canada', 'mexico', 'washington', 'new york'] },
  { id: 'south-america', label: 'South America', center: [-58, -16], keywords: ['brazil', 'argentina', 'chile', 'colombia', 'peru'] },
  { id: 'europe', label: 'Europe', center: [18, 51], keywords: ['europe', 'uk', 'britain', 'france', 'germany', 'italy', 'spain', 'brussels', 'russia', 'ukraine'] },
  { id: 'africa', label: 'Africa', center: [20, 7], keywords: ['africa', 'nigeria', 'egypt', 'ethiopia', 'kenya', 'south africa', 'sudan'] },
  { id: 'middle-east', label: 'Middle East', center: [45, 30], keywords: ['middle east', 'israel', 'gaza', 'iran', 'iraq', 'saudi', 'uae', 'qatar'] },
  { id: 'asia', label: 'Asia', center: [97, 33], keywords: ['china', 'japan', 'india', 'pakistan', 'taiwan', 'korea', 'asia', 'beijing', 'tokyo', 'delhi'] },
  { id: 'oceania', label: 'Oceania', center: [135, -25], keywords: ['australia', 'new zealand', 'oceania', 'sydney', 'melbourne'] },
]

function extractSource(url: string): string {
  try {
    return new URL(url).hostname.replace('www.', '')
  } catch {
    return url
  }
}

async function fetchHeatMapNews(): Promise<NewsItem[]> {
  const response = await fetch('https://api.tavily.com/search', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      api_key: import.meta.env.VITE_TAVILY_API_KEY,
      query: 'breaking world news by region and country today',
      search_depth: 'advanced',
      max_results: 14,
      include_domains: [
        'reuters.com', 'bbc.com', 'apnews.com', 'bloomberg.com', 'ft.com',
        'theguardian.com', 'nytimes.com', 'wsj.com', 'aljazeera.com', 'economist.com'
      ],
      include_answer: false,
      sort_by: 'date',
    })
  })
  if (!response.ok) throw new Error('Failed to load heat map data')
  const data = await response.json()
  const results = data.results || []
  return results.map((r: { title: string; url: string; content: string; published_date?: string }) => ({
    title: r.title,
    url: r.url,
    content: r.content,
    source: extractSource(r.url),
    published: r.published_date,
  }))
}

function classifyRegion(item: NewsItem): string {
  const text = `${item.title} ${item.content}`.toLowerCase()
  const match = REGION_CONFIGS.find((r) => r.keywords.some((k) => text.includes(k)))
  return match ? match.id : 'europe'
}

function timeAgo(dateStr?: string): string {
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

export default function HeatMap({ consume, credits, limit }: HeatMapProps) {
  const [items, setItems] = useState<NewsItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date>(new Date())
  const [selectedRegion, setSelectedRegion] = useState<string>('europe')
  const [lastRefreshCost, setLastRefreshCost] = useState(0)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const news = await fetchHeatMapNews()
      const cost = Math.max(1, news.length)
      if (!consume(cost)) {
        setError(`Daily credit limit reached. Heat Map refresh requires ${cost} credits.`)
        setLoading(false)
        return
      }
      setLastRefreshCost(cost)
      setItems(news)
      setLastUpdated(new Date())

      // Pick most active region based on this refresh
      const counts = new Map<string, number>()
      for (const item of news) {
        const r = classifyRegion(item)
        counts.set(r, (counts.get(r) || 0) + 1)
      }
      let topId = selectedRegion
      let topCount = -1
      for (const region of REGION_CONFIGS) {
        const c = counts.get(region.id) || 0
        if (c > topCount) {
          topCount = c
          topId = region.id
        }
      }
      setSelectedRegion(topId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unknown error')
    } finally {
      setLoading(false)
    }
  }, [consume, selectedRegion])

  useEffect(() => {
    const t = setTimeout(() => { void load() }, 0)
    const interval = setInterval(load, 5 * 60 * 1000)
    return () => { clearTimeout(t); clearInterval(interval) }
  }, [load])

  const byRegion = useMemo(() => {
    const grouped: Record<string, NewsItem[]> = {}
    for (const region of REGION_CONFIGS) grouped[region.id] = []
    for (const item of items) grouped[classifyRegion(item)]?.push(item)
    return grouped
  }, [items])

  const hotspotData = useMemo(() => {
    return REGION_CONFIGS.map((region) => {
      const regionItems = byRegion[region.id] || []
      return {
        ...region,
        score: regionItems.length,
        items: regionItems,
      }
    })
  }, [byRegion])
  const projectedCost = Math.max(1, items.length || 8)
  const hasEnoughCredits = credits >= projectedCost
  const isCreditError = Boolean(error && error.toLowerCase().includes('credit'))

  return (
    <div className="bn-page heatmap-page">
      <div className="bn-header">
        <div className="bn-header-left">
          <span className="bn-live-dot" />
          <span className="bn-title">Heat Map</span>
          <span className="bn-count">{items.length} stories mapped</span>
        </div>
        <div className="bn-header-right">
          <span className="bn-updated">
            Updated {lastUpdated.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          <button className="bn-refresh" onClick={load} disabled={loading} title="Refresh">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="23 4 23 10 17 10" />
              <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
            </svg>
          </button>
        </div>
      </div>

      <div className="radar-panel heatmap-credits-panel">
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
        {!hasEnoughCredits && (
          <div className="radar-credit-warning">
            Not enough credits for another heat map refresh. Try again after daily reset.
          </div>
        )}
      </div>

      {error && (
        <div className="bn-error">
          {isCreditError && (
            <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: 12 }}>
              <circle cx="12" cy="12" r="9" stroke="url(#heatmap-limit-grad)" strokeWidth="2" />
              <circle cx="12" cy="12" r="5" stroke="url(#heatmap-limit-grad)" strokeWidth="1.5" strokeDasharray="3 2" />
              <line x1="6" y1="6" x2="18" y2="18" stroke="#ff7a18" strokeWidth="2" strokeLinecap="round" />
              <defs>
                <linearGradient id="heatmap-limit-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#ff7a18" />
                  <stop offset="1" stopColor="#ff8ed7" />
                </linearGradient>
              </defs>
            </svg>
          )}
          <span>{error}</span>
          <button onClick={load}>Retry</button>
        </div>
      )}

      {!error && (
        <div className="heatmap-shell">
          <div className="heatmap-world">
            <div className="heatmap-grid-overlay" />
            <MapContainer
              center={[18, 10]}
              zoom={2}
              minZoom={2}
              maxZoom={6}
              zoomControl={false}
              scrollWheelZoom
              className="heatmap-world-map"
            >
              <TileLayer
                attribution='&copy; OpenStreetMap contributors &copy; CARTO'
                url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
              />

              {hotspotData.map((spot) => {
                const isActive = spot.id === selectedRegion
                const intensity = Math.max(0.35, Math.min(1, spot.score / 4))
                const radius = 5 + spot.score * 1.4
                return (
                  <CircleMarker
                    key={spot.id}
                    center={[spot.center[1], spot.center[0]]}
                    radius={radius}
                    pathOptions={{
                      color: isActive ? '#ffd166' : '#ff7a18',
                      weight: isActive ? 2 : 1.4,
                      fillColor: '#ff7a18',
                      fillOpacity: intensity * 0.65,
                    }}
                    eventHandlers={{ click: () => setSelectedRegion(spot.id) }}
                  >
                    <Tooltip direction="top" offset={[0, -8]} opacity={1} className="heatmap-tooltip" permanent={isActive}>
                      {spot.label} ({spot.score})
                    </Tooltip>
                    {isActive && spot.items.length > 0 && (
                      <Popup
                        className="heatmap-point-popup"
                        autoPan
                        closeButton={false}
                        offset={[0, -12]}
                      >
                        <div className="heatmap-popover-cards">
                          {spot.items.slice(0, 3).map((item, idx) => (
                            <a key={`${spot.id}-${idx}`} href={item.url} target="_blank" rel="noreferrer" className="heatmap-pop-card">
                              <span className="heatmap-pop-source">{item.source}</span>
                              <p>{item.title}</p>
                              {item.published && <span className="heatmap-pop-time">{timeAgo(item.published)}</span>}
                            </a>
                          ))}
                        </div>
                      </Popup>
                    )}
                  </CircleMarker>
                )
              })}
            </MapContainer>
          </div>

          <div className="heatmap-region-rail">
            {hotspotData
              .filter((h) => h.score > 0)
              .sort((a, b) => b.score - a.score)
              .map((spot) => (
                <button
                  key={spot.id}
                  className={`heatmap-rail-item${spot.id === selectedRegion ? ' active' : ''}`}
                  onClick={() => setSelectedRegion(spot.id)}
                >
                  <span>{spot.label}</span>
                  <strong>{spot.score}</strong>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  )
}
