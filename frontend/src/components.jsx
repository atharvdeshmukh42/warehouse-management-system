import { useEffect, useState } from 'react'
import { AlertCircle, CheckCircle2, ChevronLeft, ChevronRight, Plus, Search, Trash2, X } from 'lucide-react'
import { money, number } from './api.js'

// ---------- Brand ----------

// A cardboard box with a face. `mood` is one of: idle, shy, sad, happy.
// `look` (0 to 1) moves the eyes left to right, following the username as it is typed.
export function BoxBuddy({ mood, look }) {
  const shift = look * 6 - 3
  const mouths = {
    idle: 'M52 77 q8 6 16 0',
    shy: 'M54 78 q6 3 12 0',
    sad: 'M52 81 q8 -7 16 0',
    happy: 'M49 74 q11 13 22 0',
  }

  return (
    <svg className={'buddy ' + mood} viewBox="0 0 120 100" aria-hidden="true">
      <ellipse cx="60" cy="96" rx="40" ry="3.5" className="buddy-shadow" />
      <rect x="15" y="30" width="90" height="62" rx="6" className="buddy-body" />
      <rect x="10" y="22" width="100" height="14" rx="4" className="buddy-lid" />
      <rect x="55" y="22" width="10" height="26" className="buddy-tape" />

      {mood === 'shy' ? (
        <>
          {/* eyes shut tight while the password is typed */}
          <path d="M37 60 q7 5 14 0" className="buddy-line" />
          <path d="M69 60 q7 5 14 0" className="buddy-line" />
        </>
      ) : mood === 'happy' ? (
        <>
          <path d="M37 62 q7 -8 14 0" className="buddy-line" />
          <path d="M69 62 q7 -8 14 0" className="buddy-line" />
        </>
      ) : (
        <>
          <circle cx="44" cy="60" r="8" className="buddy-eye" />
          <circle cx="76" cy="60" r="8" className="buddy-eye" />
          <circle cx={44 + shift} cy={mood === 'sad' ? 63 : 61} r="4" className="buddy-pupil" />
          <circle cx={76 + shift} cy={mood === 'sad' ? 63 : 61} r="4" className="buddy-pupil" />
        </>
      )}

      <circle cx="31" cy="72" r="5" className="buddy-blush" />
      <circle cx="89" cy="72" r="5" className="buddy-blush" />
      <path d={mouths[mood]} className="buddy-line" />
    </svg>
  )
}

// The app's logo: Box Buddy reduced to its essentials (lid, box, two eyes) on a teal tile.
// Kept this simple on purpose so it still reads at 16px in a browser tab.
export function Logo({ size = 34 }) {
  return (
    <svg className="logo" width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx="8" className="logo-tile" />
      <rect x="5.5" y="8" width="21" height="4.5" rx="1.5" className="logo-box" />
      <rect x="7" y="13.5" width="18" height="11.5" rx="2" className="logo-box" />
      <circle cx="12.5" cy="19" r="2" className="logo-eye" />
      <circle cx="19.5" cy="19" r="2" className="logo-eye" />
    </svg>
  )
}

// ---------- Layout ----------

export function PageHeader({ title, subtitle, children }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle && <p>{subtitle}</p>}
      </div>
      <div className="page-actions">{children}</div>
    </div>
  )
}

export function Card({ title, subtitle, actions, flush, children }) {
  return (
    <section className="card">
      {title && (
        <div className="card-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={flush ? 'card-body flush' : 'card-body'}>{children}</div>
    </section>
  )
}

// ---------- Dialogs ----------

export function Modal({ title, subtitle, wide, onClose, children }) {
  // Close with the Escape key
  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="overlay" onMouseDown={onClose}>
      <div className={wide ? 'modal wide' : 'modal'} onMouseDown={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{title}</h2>
            {subtitle && <p>{subtitle}</p>}
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

// The body and Cancel / Save buttons of a dialog form
export function ModalForm({ onSubmit, onClose, submitLabel, error, children }) {
  const submit = (e) => {
    e.preventDefault()
    onSubmit()
  }
  return (
    <form onSubmit={submit}>
      <div className="modal-body">
        <ErrorText error={error} />
        {children}
      </div>
      <div className="modal-footer">
        <button type="button" className="secondary" onClick={onClose}>Cancel</button>
        <button>{submitLabel}</button>
      </div>
    </form>
  )
}

// ---------- Form pieces ----------

export function Field({ label, hint, full, children }) {
  return (
    <label className={full ? 'field full' : 'field'}>
      <span className="field-label">{label}</span>
      {children}
      {hint && <span className="field-hint">{hint}</span>}
    </label>
  )
}

// A <select> filled from a list of records
export function Picker({ items, value, onChange, label, show }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} required>
      <option value="">{label}</option>
      {items.map((item) => (
        <option key={item.id} value={item.id}>{show(item)}</option>
      ))}
    </select>
  )
}

export function SearchInput({ value, onChange, placeholder }) {
  return (
    <div className="search">
      <Search size={16} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} />
    </div>
  )
}

// Segmented filter, e.g. All / Draft / Approved
export function Tabs({ options, value, onChange }) {
  return (
    <div className="tabs">
      {options.map((option) => (
        <button key={option} type="button" className={option === value ? 'tab active' : 'tab'}
          onClick={() => onChange(option)}>
          {option.replace('_', ' ').toLowerCase()}
        </button>
      ))}
    </div>
  )
}

// ---------- Display pieces ----------

export function ErrorText({ error }) {
  if (!error) return null
  return (
    <div className="alert">
      <AlertCircle size={18} />
      <span>{error}</span>
    </div>
  )
}

export function Badge({ status, label }) {
  return (
    <span className={'badge badge-' + status.toLowerCase()}>
      {label || status.replace('_', ' ').toLowerCase()}
    </span>
  )
}

const STOCK_LABELS = { OUT: 'Out of stock', LOW: 'Low stock', OK: 'In stock' }

export function StockBadge({ available, reorderLevel }) {
  let status = 'OK'
  if (available <= 0) status = 'OUT'
  else if (available <= reorderLevel) status = 'LOW'
  return <Badge status={status} label={STOCK_LABELS[status]} />
}

// Box Buddy with a message, for tables with nothing to show
export function EmptyState({ text, mood = 'idle' }) {
  return (
    <div className="empty-state">
      <BoxBuddy mood={mood} look={0.5} />
      <span>{text}</span>
    </div>
  )
}

export function EmptyRow({ colSpan, text, mood }) {
  return (
    <tr className="empty-row">
      <td colSpan={colSpan}><EmptyState text={text} mood={mood} /></td>
    </tr>
  )
}

// Grey placeholder rows while loading, a friendly message when there is nothing to show
export function TableState({ loading, empty, colSpan, text, mood }) {
  if (loading) {
    return [1, 2, 3, 4, 5].map((n) => (
      <tr key={n} className="skeleton-row">
        <td colSpan={colSpan}><div className="skeleton" style={{ width: 40 + n * 9 + '%' }} /></td>
      </tr>
    ))
  }
  if (empty) return <EmptyRow colSpan={colSpan} text={text} mood={mood} />
  return null
}

// Round initials badge, e.g. "Patel Retail Mart" -> "PR"
const AVATAR_COLORS = ['brand', 'green', 'blue', 'amber', 'purple', 'red']

export function Avatar({ name }) {
  const initials = name.split(' ').slice(0, 2).map((word) => word[0]).join('').toUpperCase()
  let sum = 0
  for (const letter of name) sum += letter.charCodeAt(0)
  return <span className={'avatar-sm ' + AVATAR_COLORS[sum % AVATAR_COLORS.length]}>{initials}</span>
}

export function NameWithAvatar({ name }) {
  return (
    <span className="with-avatar">
      <Avatar name={name} />
      <span className="strong">{name}</span>
    </span>
  )
}

// ---------- Pagination ----------

// Splits rows into pages. Returns { rows, page, setPage, pageCount, total }
export function usePagination(allRows, pageSize = 20) {
  const [page, setPage] = useState(0)
  const pageCount = Math.max(1, Math.ceil(allRows.length / pageSize))
  const current = Math.min(page, pageCount - 1)
  return {
    rows: allRows.slice(current * pageSize, (current + 1) * pageSize),
    page: current,
    setPage,
    pageCount,
    pageSize,
    total: allRows.length,
  }
}

export function Pagination({ pager }) {
  if (pager.total === 0) return null
  const first = pager.page * pager.pageSize + 1
  const last = Math.min(first + pager.pageSize - 1, pager.total)
  return (
    <div className="pagination">
      <span className="muted">
        Showing <b>{number(first)}–{number(last)}</b> of <b>{number(pager.total)}</b>
      </span>
      <div className="pagination-buttons">
        <button className="small secondary" disabled={pager.page === 0}
          onClick={() => pager.setPage(pager.page - 1)} aria-label="Previous page">
          <ChevronLeft size={16} />
        </button>
        <span className="page-number">Page {pager.page + 1} of {pager.pageCount}</span>
        <button className="small secondary" disabled={pager.page >= pager.pageCount - 1}
          onClick={() => pager.setPage(pager.page + 1)} aria-label="Next page">
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  )
}

// ---------- Toasts ----------

// Shows messages sent with toast() from api.js, each for a few seconds
export function Toaster() {
  const [toasts, setToasts] = useState([])

  useEffect(() => {
    const onToast = (e) => {
      const id = Date.now() + Math.random()
      setToasts((list) => [...list, { id, ...e.detail }])
      setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), 3500)
    }
    window.addEventListener('wms:toast', onToast)
    return () => window.removeEventListener('wms:toast', onToast)
  }, [])

  return (
    <div className="toasts" role="status">
      {toasts.map((t) => (
        <div key={t.id} className={'toast ' + t.type}>
          {t.type === 'error' ? <AlertCircle size={18} /> : <CheckCircle2 size={18} />}
          <span>{t.message}</span>
        </div>
      ))}
    </div>
  )
}

export const productName = (p) => `${p.sku} · ${p.name}`
export const warehouseName = (w) => `${w.code} · ${w.name}`

// ---------- Order lines ----------

export const newItem = () => ({ product_id: '', qty: 1, price: 0 })

// Turn form values (strings) into numbers for the API
export const toItems = (items) =>
  items.map((i) => ({ product_id: Number(i.product_id), qty: Number(i.qty), price: Number(i.price) }))

// Order lines editor used by purchase and sales orders
export function ItemsEditor({ items, setItems, products, priceLabel }) {
  const update = (index, key, value) => {
    const copy = [...items]
    copy[index] = { ...copy[index], [key]: value }
    if (key === 'product_id') {
      const product = products.find((p) => p.id === Number(value))
      if (product) copy[index].price = product.price
    }
    setItems(copy)
  }

  const total = items.reduce((sum, i) => sum + Number(i.qty) * Number(i.price), 0)

  return (
    <div className="lines">
      <table>
        <thead>
          <tr>
            <th>Product</th>
            <th className="num">Qty</th>
            <th className="num">{priceLabel}</th>
            <th className="num">Amount</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {items.map((item, i) => (
            <tr key={i}>
              <td>
                <Picker items={products} label="Select a product" show={productName}
                  value={item.product_id} onChange={(v) => update(i, 'product_id', v)} />
              </td>
              <td className="num">
                <input type="number" min="1" value={item.qty} required
                  onChange={(e) => update(i, 'qty', e.target.value)} />
              </td>
              <td className="num">
                <input type="number" min="0" step="0.01" value={item.price}
                  onChange={(e) => update(i, 'price', e.target.value)} />
              </td>
              <td className="num strong">{money(item.qty * item.price)}</td>
              <td>
                {items.length > 1 && (
                  <button type="button" className="icon-button" aria-label="Remove line"
                    onClick={() => setItems(items.filter((_, j) => j !== i))}>
                    <Trash2 size={16} />
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="lines-footer">
        <button type="button" className="ghost" onClick={() => setItems([...items, newItem()])}>
          <Plus size={16} /> Add line
        </button>
        <div className="lines-total">Total <strong>{money(total)}</strong></div>
      </div>
    </div>
  )
}
