import { useState, useCallback, useEffect, useRef } from 'react'
import './theme'

const API_BASE = window.location.origin + '/app-pagebank'

interface CachedPage {
  url: string
  contentType: string
  statusCode: number
  cachedAt: string
  size: number
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export default function App() {
  const [url, setUrl] = useState('https://harper.fast')
  const [pages, setPages] = useState<CachedPage[]>([])
  const [originMs, setOriginMs] = useState<number | null>(null)
  const [cacheMs, setCacheMs] = useState<number | null>(null)
  const [originLoading, setOriginLoading] = useState(false)
  const [cacheLoading, setCacheLoading] = useState(false)
  const [originLoaded, setOriginLoaded] = useState(false)
  const [cacheLoaded, setCacheLoaded] = useState(false)
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const originRef = useRef<HTMLIFrameElement>(null)
  const cacheRef = useRef<HTMLIFrameElement>(null)

  const loadStats = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/page?stats=true`)
      const data = await res.json()
      setPages((data.pages || []).filter((p: CachedPage) => p.url))
    } catch { /* ignore */ }
  }, [])

  useEffect(() => { loadStats() }, [loadStats])

  const loadPanels = useCallback((fullUrl: string) => {
    const cacheUrl = `${API_BASE}/page?url=${encodeURIComponent(fullUrl)}`

    setOriginLoading(true)
    setOriginLoaded(false)
    setOriginMs(null)
    setCacheLoading(true)
    setCacheLoaded(false)
    setCacheMs(null)

    // Measure cache response time via fetch API
    const cacheStart = performance.now()
    fetch(cacheUrl).finally(() => {
      setCacheMs(Math.round(performance.now() - cacheStart))
    })

    // Origin timing via iframe onload
    const originStart = performance.now()
    const originIframe = originRef.current
    if (originIframe) {
      originIframe.onload = () => {
        setOriginMs(Math.round(performance.now() - originStart))
        setOriginLoading(false)
        setOriginLoaded(true)
      }
      originIframe.src = fullUrl
    }

    const cacheIframe = cacheRef.current
    if (cacheIframe) {
      cacheIframe.onload = () => {
        setCacheLoading(false)
        setCacheLoaded(true)
        loadStats()
      }
      cacheIframe.src = cacheUrl
    }
  }, [loadStats])

  const handleFetch = useCallback(() => {
    const trimmed = url.trim()
    if (!trimmed) return
    loadPanels(trimmed)
  }, [url, loadPanels])

  const handleCardClick = useCallback((page: CachedPage) => {
    loadPanels(page.url)
  }, [loadPanels])

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleFetch()
  }, [handleFetch])

  const handleDeleteAll = useCallback(async () => {
    setShowDeleteModal(false)
    setPages([])
    try {
      await fetch(`${API_BASE}/page?all=true`, { method: 'DELETE' })
      loadStats()
    } catch { /* ignore */ }
  }, [loadStats])

  function speedBadge() {
    if (originMs == null || cacheMs == null) return null
    if (cacheMs >= originMs) return null
    const speedup = (originMs / cacheMs).toFixed(1)
    return <span className="speed-badge">{speedup}x faster</span>
  }

  return (
    <div className="app">
      <nav className="nav">
        <div className="nav-left">
          <a href="/">
            <img src={`${import.meta.env.BASE_URL}logo_white.svg`} alt="Yeti" className="nav-logo" />
          </a>
        </div>
        <span className="nav-title">PageBank</span>
        <div className="nav-right" />
      </nav>
      <main className="page cols-2">
        {/* Left panel */}
        <div className="panel">
          <div className="panel-header">
            <span className="panel-title">Cached Pages ({pages.length})</span>
            <div className="header-actions">
              <input
                type="text"
                className="search-input"
                placeholder="https://example.com"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onKeyDown={handleKeyDown}
              />
              <button
                className="btn btn-primary btn-sm"
                onClick={handleFetch}
                disabled={originLoading || cacheLoading || !url.trim()}
              >
                {originLoading || cacheLoading ? '...' : 'Fetch'}
              </button>
              <button
                className="btn btn-sm"
                onClick={() => setShowDeleteModal(true)}
                disabled={pages.length === 0}
              >
                Delete All
              </button>
            </div>
          </div>
          <div className="panel-body" style={{ padding: 0 }}>
            {pages.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--space-8) var(--space-4)' }}>
                <p>No cached pages yet</p>
                <p style={{ fontSize: '0.7rem', marginTop: '0.5rem', color: '#666' }}>
                  Enter a URL above and click Fetch
                </p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>URL</th>
                    <th className="col-mime">MIME</th>
                    <th className="col-size">Size</th>
                    <th className="col-status">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {pages.map(page => (
                    <tr key={page.url} className="data-table-row-clickable" onClick={() => handleCardClick(page)}>
                      <td>{page.url}</td>
                      <td className="col-mime">{page.contentType}</td>
                      <td className="col-size">{formatSize(page.size)}</td>
                      <td className="col-status">{page.statusCode}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="panel compare-panel">
          <div className="panel-header origin-header">
            <span className="panel-title">Origin</span>
            <div style={{ marginLeft: 'auto' }}>
              {originLoading && <span className="timing-badge origin-timing">loading...</span>}
              {originMs != null && <span className="timing-badge origin-timing">{originMs}ms</span>}
            </div>
          </div>
          <div className={`iframe-container${originLoaded ? ' loaded' : ''}`}>
            <iframe ref={originRef} title="Origin" />
          </div>

          <div className="panel-header cache-header">
            <span className="panel-title">Yeti Cache</span>
            <div className="cache-header-center">{speedBadge()}</div>
            <div className="cache-header-right">
              {cacheLoading && <span className="timing-badge origin-timing">loading...</span>}
              {cacheMs != null && <span className="timing-badge origin-timing">{cacheMs}ms</span>}
            </div>
          </div>
          <div className={`iframe-container${cacheLoaded ? ' loaded' : ''}`}>
            <iframe ref={cacheRef} title="Yeti Cache" />
          </div>
        </div>
      </main>

      {showDeleteModal && (
        <div className="modal-overlay" onClick={() => setShowDeleteModal(false)}>
          <div className="modal-content" onClick={e => e.stopPropagation()}>
            <h2 className="modal-title">Delete All Cached Pages?</h2>
            <p className="modal-message">This will permanently delete all {pages.length} cached page{pages.length !== 1 ? 's' : ''}.</p>
            <div className="modal-actions">
              <button onClick={() => setShowDeleteModal(false)} className="btn btn-cancel">Cancel</button>
              <button onClick={handleDeleteAll} className="btn btn-primary">Delete All</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
