import { useEffect, useState } from 'react'
import {
  Boxes, CalendarDays, ChevronRight, History, LayoutDashboard, LogOut, Menu, Package, ScrollText,
  ShoppingCart, Truck, Users, Warehouse,
} from 'lucide-react'
import { api, getToken, saveToken } from './api.js'
import { Logo, Toaster } from './components.jsx'
import Login from './pages/Login.jsx'
import Dashboard from './pages/Dashboard.jsx'
import Stock from './pages/Stock.jsx'
import SalesOrders from './pages/SalesOrders.jsx'
import PurchaseOrders from './pages/PurchaseOrders.jsx'
import Products from './pages/Products.jsx'
import Warehouses from './pages/Warehouses.jsx'
import Partners from './pages/Partners.jsx'
import Ledger from './pages/Ledger.jsx'
import AuditLog from './pages/AuditLog.jsx'

// `count` names a number from /counts shown as a badge next to the page
const NAV = [
  { group: 'Overview', pages: [
    { name: 'Dashboard', icon: LayoutDashboard, component: Dashboard },
  ] },
  { group: 'Operations', pages: [
    { name: 'Sales Orders', icon: ShoppingCart, component: SalesOrders, count: 'sales_orders' },
    { name: 'Purchase Orders', icon: Truck, component: PurchaseOrders, count: 'purchase_orders' },
    { name: 'Stock', icon: Boxes, component: Stock, count: 'alerts', warn: true },
  ] },
  { group: 'Catalog', pages: [
    { name: 'Products', icon: Package, component: Products },
    { name: 'Warehouses', icon: Warehouse, component: Warehouses },
    { name: 'Suppliers & Customers', icon: Users, component: Partners },
  ] },
  { group: 'Records', pages: [
    { name: 'Stock Ledger', icon: ScrollText, component: Ledger },
    { name: 'Audit Log', icon: History, component: AuditLog },
  ] },
]

const ALL_PAGES = NAV.flatMap((section) => section.pages)

const TODAY = new Date().toLocaleDateString('en-IN', {
  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
})

export default function App() {
  const [user, setUser] = useState(null)
  const [checking, setChecking] = useState(Boolean(getToken()))

  // If a token is saved from an earlier visit, check it is still valid
  useEffect(() => {
    if (!getToken()) return
    api('/me')
      .then(setUser)
      .catch(() => saveToken(null))
      .finally(() => setChecking(false))
  }, [])

  const signOut = async () => {
    try {
      await api('/logout', 'POST')
    } finally {
      saveToken(null)
      setUser(null)
    }
  }

  if (checking) return null
  if (!user) return <Login onLogin={setUser} />
  return <Shell user={user} onSignOut={signOut} />
}

// Sidebar badge numbers, refreshed after every change anywhere in the app
function useCounts() {
  const [counts, setCounts] = useState({})
  useEffect(() => {
    const load = () => api('/counts').then(setCounts).catch(() => {})
    load()
    window.addEventListener('wms:changed', load)
    return () => window.removeEventListener('wms:changed', load)
  }, [])
  return counts
}

function Shell({ user, onSignOut }) {
  const [pageName, setPageName] = useState('Dashboard')
  const [menuOpen, setMenuOpen] = useState(false)
  const counts = useCounts()
  const Page = ALL_PAGES.find((p) => p.name === pageName).component

  const openPage = (name) => {
    setPageName(name)
    setMenuOpen(false)
    window.scrollTo(0, 0)
  }

  return (
    <div className="layout">
      <aside className={menuOpen ? 'sidebar open' : 'sidebar'}>
        <div className="brand">
          <Logo size={34} />
          <div>
            <div className="brand-name">Warehouse Manager</div>
            <div className="brand-sub">Inventory & orders</div>
          </div>
        </div>

        {NAV.map((section) => (
          <div className="nav-group" key={section.group}>
            <div className="nav-label">{section.group}</div>
            {section.pages.map((page) => {
              const Icon = page.icon
              const count = page.count ? counts[page.count] : 0
              return (
                <button key={page.name} className={page.name === pageName ? 'nav-item active' : 'nav-item'}
                  onClick={() => openPage(page.name)}>
                  <Icon size={17} />
                  <span className="nav-text">{page.name}</span>
                  {count > 0 && <span className={page.warn ? 'nav-count warn' : 'nav-count'}>{count}</span>}
                </button>
              )
            })}
          </div>
        ))}

        <div className="sidebar-footer">
          <div className="avatar">{user.username[0].toUpperCase()}</div>
          <div className="user-info">
            <div className="strong">{user.username}</div>
            <div className="brand-sub">Administrator</div>
          </div>
          <button className="icon-button" onClick={onSignOut} title="Sign out" aria-label="Sign out">
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      {menuOpen && <div className="sidebar-backdrop" onClick={() => setMenuOpen(false)} />}

      <div className="main">
        <header className="topbar">
          <div className="breadcrumb">
            <button className="icon-button menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label="Menu">
              <Menu size={18} />
            </button>
            <span>Warehouse Manager</span>
            <ChevronRight size={14} />
            <strong>{pageName}</strong>
          </div>
          <div className="topbar-date">
            <CalendarDays size={15} />
            {TODAY}
          </div>
        </header>

        <main className="content" key={pageName}>
          <Page />
        </main>
      </div>

      <Toaster />
    </div>
  )
}
