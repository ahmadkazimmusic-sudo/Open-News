interface RadarItem {
  title: string
  url: string
  content: string
  source: string
  published?: string
}

interface RadarCardProps {
  item: RadarItem
  index: number
  timeAgo: (dateStr?: string) => string
}

export default function RadarCard({ item, index, timeAgo }: RadarCardProps) {
  return (
    <a
      href={item.url}
      target="_blank"
      rel="noreferrer"
      className="radar-card"
    >
      <div className="radar-card-top">
        <span className="radar-card-rank">{String(index + 1).padStart(2, '0')}</span>
        <span className="radar-card-tag">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 3L14.6 9.4L21 12L14.6 14.6L12 21L9.4 14.6L3 12L9.4 9.4L12 3Z" fill="currentColor" />
          </svg>
          Radar
        </span>
      </div>

      <h3 className="radar-card-title">{item.title}</h3>

      <p className="radar-card-snippet">
        {item.content.slice(0, 200)}
        {item.content.length > 200 ? '...' : ''}
      </p>

      <div className="radar-card-footer">
        <span className="radar-card-source">{item.source}</span>
        {item.published && <span className="radar-card-time">{timeAgo(item.published)}</span>}
      </div>
    </a>
  )
}
