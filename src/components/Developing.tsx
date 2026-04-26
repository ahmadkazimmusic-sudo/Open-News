import { useState, useEffect } from 'react'

interface NewsItem {
    title: string
    url: string
    content: string
    source: string
    published?: string
}

async function fetchDevelopingNews(): Promise<NewsItem[]> {
    const response = await fetch('https://api.tavily.com/search', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            api_key: import.meta.env.VITE_TAVILY_API_KEY,
            query: 'developing news stories ongoing events today',
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
    if (!response.ok) throw new Error('Failed to fetch developing news')
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

interface DevelopingProps {
    consume: (amount?: number) => boolean
}

export default function Developing({ consume }: DevelopingProps) {
    const [items, setItems] = useState<NewsItem[]>([])
    const [loading, setLoading] = useState(true)
    const [error, setError] = useState<string | null>(null)
    const [lastUpdated, setLastUpdated] = useState<Date>(new Date())

    const load = async () => {
        setLoading(true)
        setError(null)
        try {
            const news = await fetchDevelopingNews()
            const cost = news.length

            if (!consume(cost)) {
                setError(`Daily credit limit reached. Developing news requires ${cost} credits. Open News is currently in beta — please tune in later for updates!`)
                setLoading(false)
                return
            }

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
        const interval = setInterval(load, 5 * 60 * 1000) // refresh every 5 min
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

    if (loading && items.length === 0) {
        return (
            <div className="bn-page">
                <div className="bn-loader">
                    <div className="bn-loader-orb">
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <circle cx="12" cy="12" r="9" stroke="url(#logo-grad)" strokeWidth="2" strokeDasharray="4 2 8 2" strokeLinecap="round" />
                            <circle cx="12" cy="12" r="5" stroke="#ffc08a" strokeWidth="1.5" strokeDasharray="10 12" />
                            <defs>
                                <linearGradient id="logo-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                                    <stop stopColor="#ff7a18" />
                                    <stop offset="1" stopColor="#ff8ed7" />
                                </linearGradient>
                            </defs>
                        </svg>
                    </div>
                    <span className="bn-loader-text">Gathering developing stories...</span>
                </div>
            </div>
        )
    }

    if (error && items.length === 0) {
        return (
            <div className="bn-page">
                <div className="bn-error">
                    <svg width="48" height="48" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style={{ marginBottom: 12 }}>
                        <circle cx="12" cy="12" r="9" stroke="url(#dev-limit-grad)" strokeWidth="2" />
                        <circle cx="12" cy="12" r="5" stroke="url(#dev-limit-grad)" strokeWidth="1.5" strokeDasharray="3 2" />
                        <line x1="6" y1="6" x2="18" y2="18" stroke="#ff7a18" strokeWidth="2" strokeLinecap="round" />
                        <defs>
                            <linearGradient id="dev-limit-grad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                                <stop stopColor="#ff7a18" />
                                <stop offset="1" stopColor="#ff8ed7" />
                            </linearGradient>
                        </defs>
                    </svg>
                    <span>{error}</span>
                    <button onClick={load}>Retry</button>
                </div>
            </div>
        )
    }

    return (
        <div className="bn-page">
            <div className="bn-header">
                <div className="bn-header-left">
                    <span className="bn-live-dot" />
                    <span className="bn-title">Developing Stories</span>
                    <span className="bn-count">{items.length} stories</span>
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

            <div className="dev-list">
                {items.map((item, i) => (
                    <a
                        key={i}
                        href={item.url}
                        target="_blank"
                        rel="noreferrer"
                        className="dev-card"
                    >
                        <div className="dev-card-index">
                            <span>{String(i + 1).padStart(2, '0')}</span>
                        </div>
                        <div className="dev-card-body">
                            <div className="dev-card-meta">
                                <span className="dev-card-tag">
                                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                        <circle cx="12" cy="12" r="3" fill="#ff4d4d" />
                                        <circle cx="12" cy="12" r="7" stroke="#ff4d4d" strokeWidth="2" strokeDasharray="3 2" opacity="0.6" />
                                        <circle cx="12" cy="12" r="11" stroke="#ff4d4d" strokeWidth="1.5" strokeDasharray="4 3" opacity="0.35" />
                                    </svg>
                                    Developing
                                </span>
                                <span className="dev-card-source">{item.source}</span>
                                {item.published && (
                                    <span className="dev-card-time">{timeAgo(item.published)}</span>
                                )}
                            </div>
                            <h3 className="dev-card-title">{item.title}</h3>
                            <p className="dev-card-snippet">{item.content.slice(0, 220)}{item.content.length > 220 ? '...' : ''}</p>
                        </div>
                        <div className="dev-card-arrow">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <line x1="5" y1="12" x2="19" y2="12" />
                                <polyline points="12 5 19 12 12 19" />
                            </svg>
                        </div>
                    </a>
                ))}
            </div>
        </div>
    )
}
