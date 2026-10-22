import { AlertTriangle, ArrowDownRight, ArrowUpRight, Boxes, IndianRupee, ShoppingCart } from 'lucide-react'
import { useData, compactMoney, money, number, formatTime } from '../api.js'
import { Card, EmptyRow, PageHeader } from '../components.jsx'
import { AreaChart, BarList } from '../charts.jsx'

function StatTile({ label, value, title, icon, color, children }) {
  const Icon = icon
  return (
    <div className="card stat">
      <div className="stat-top">
        <span className="stat-label">{label}</span>
        <span className={'stat-icon ' + color}><Icon size={16} /></span>
      </div>
      <div className="stat-value" title={title}>{value}</div>
      <div className="stat-foot">{children}</div>
    </div>
  )
}

// "▲ 12.5% vs previous 7 days", green when sales went up
function Change({ now, before }) {
  if (!before) return <span className="muted">No sales the week before</span>
  const percent = ((now - before) / before) * 100
  const up = percent >= 0
  const Arrow = up ? ArrowUpRight : ArrowDownRight
  return (
    <span className="muted">
      <span className={up ? 'delta up' : 'delta down'}><Arrow size={14} />{Math.abs(percent).toFixed(1)}%</span>
      {' '}vs previous 7 days
    </span>
  )
}

function DashboardSkeleton() {
  return (
    <>
      <div className="stats">
        {[1, 2, 3, 4].map((n) => <div className="card stat" key={n}><div className="skeleton tall" /></div>)}
      </div>
      <div className="card"><div className="card-body"><div className="skeleton chart-skeleton" /></div></div>
    </>
  )
}

export default function Dashboard() {
  const [data] = useData('/dashboard', null)

  const greeting = new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'

  if (!data) {
    return (
      <>
        <PageHeader title={greeting} subtitle="Here is how the business is doing today." />
        <DashboardSkeleton />
      </>
    )
  }

  const total30 = data.sales_by_day.reduce((sum, d) => sum + d.value, 0)
  const orders30 = data.sales_by_day.reduce((sum, d) => sum + d.orders, 0)

  return (
    <>
      <PageHeader title={greeting} subtitle={`Here is how the business is doing across ${data.warehouses} warehouses.`} />

      <div className="stats">
        <StatTile label="Sales · last 7 days" value={compactMoney(data.sales_last_7_days)}
          title={money(data.sales_last_7_days)} icon={IndianRupee} color="brand">
          <Change now={data.sales_last_7_days} before={data.sales_previous_7_days} />
        </StatTile>
        <StatTile label="Orders · last 7 days" value={number(data.orders_last_7_days)} icon={ShoppingCart} color="blue">
          <span className="muted">{data.open_sales_orders} waiting to ship</span>
        </StatTile>
        <StatTile label="Stock value" value={compactMoney(data.stock_value)} title={money(data.stock_value)}
          icon={Boxes} color="green">
          <span className="muted">{number(data.units_on_hand)} units on hand</span>
        </StatTile>
        <StatTile label="Low stock" value={data.alerts.length} icon={AlertTriangle} color="red">
          <span className="muted">
            {data.alerts.length === 0 ? 'Everything is well stocked' : `${data.open_purchase_orders} purchase orders on the way`}
          </span>
        </StatTile>
      </div>

      <Card title="Sales" subtitle="Order value per day, last 30 days"
        actions={
          <div className="card-figure">
            <div className="card-figure-value">{compactMoney(total30)}</div>
            <div className="muted">{number(orders30)} orders</div>
          </div>
        }>
        <AreaChart data={data.sales_by_day} />
      </Card>

      <div className="grid-2">
        <Card title="Stock value by warehouse" subtitle="At selling price">
          <BarList rows={data.stock_by_warehouse.map((w) => ({
            key: w.code, label: w.name, sub: `${number(w.units)} units`, value: w.value, display: compactMoney(w.value),
          }))} />
        </Card>
        <Card title="Top products" subtitle="By order value, last 30 days">
          <BarList rows={data.top_products.map((p) => ({
            key: p.sku, label: p.name, sub: `${number(p.units)} sold`, value: p.revenue, display: compactMoney(p.revenue),
          }))} />
        </Card>
      </div>

      <div className="grid-2">
        <Card title="Low stock alerts" subtitle="Available stock at or below the reorder level" flush>
          <div className="table-wrap">
            <table>
              <thead>
                <tr><th>Product</th><th>Warehouse</th><th>Available</th><th className="num">Reorder at</th></tr>
              </thead>
              <tbody>
                {data.alerts.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <span className="strong">{a.name}</span>
                      <span className="sub mono">{a.sku}</span>
                    </td>
                    <td className="mono">{a.warehouse}</td>
                    <td className="nowrap">
                      <span className="meter">
                        <span style={{ width: Math.min(100, (a.available / Math.max(a.reorder_level, 1)) * 100) + '%' }} />
                      </span>
                      <span className="text-red">{a.available}</span>
                    </td>
                    <td className="num">{a.reorder_level}</td>
                  </tr>
                ))}
                {data.alerts.length === 0 && <EmptyRow colSpan="4" text="All stock levels are healthy" mood="happy" />}
              </tbody>
            </table>
          </div>
        </Card>

        <Card title="Recent activity" subtitle="Latest actions from the audit log" flush>
          <ul className="activity">
            {data.recent_activity.map((a) => (
              <li key={a.id}>
                <span className="activity-dot" />
                <div>
                  <div className="activity-title">
                    {a.action.replace('_', ' ').toLowerCase()} {a.entity.replace('_', ' ')} {a.entity_id && `#${a.entity_id}`}
                  </div>
                  <div className="activity-meta">{formatTime(a.created_at)}{a.details && ` · ${a.details}`}</div>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  )
}
