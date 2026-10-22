import { useState } from 'react'
import { Plus, Send } from 'lucide-react'
import { api, useData, useAction, money, orderNo, formatTime, toast } from '../api.js'
import {
  Badge, Card, ErrorText, Field, ItemsEditor, Modal, ModalForm, NameWithAvatar, PageHeader, Pagination, Picker,
  TableState, Tabs, newItem, toItems, usePagination, warehouseName,
} from '../components.jsx'

const STATUSES = ['ALL', 'RESERVED', 'SHIPPED', 'CANCELLED']

function NewSalesOrder({ onClose, onSaved }) {
  const [customers] = useData('/customers')
  const [warehouses] = useData('/warehouses')
  const [products] = useData('/products')
  const [customerId, setCustomerId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [items, setItems] = useState([newItem()])
  const [run, error] = useAction(onSaved)

  const save = () => run(async () => {
    const order = await api('/sales-orders', 'POST', {
      customer_id: Number(customerId),
      warehouse_id: Number(warehouseId),
      items: toItems(items),
    })
    toast(`${orderNo('SO', order.id)} created and stock reserved`)
  })

  return (
    <Modal wide title="New sales order" subtitle="Stock is reserved as soon as the order is created. If any line is short, nothing is saved." onClose={onClose}>
      <ModalForm onSubmit={save} onClose={onClose} submitLabel="Create & reserve stock" error={error}>
        <div className="form-grid">
          <Field label="Customer">
            <Picker items={customers} label="Select a customer" show={(c) => c.name} value={customerId} onChange={setCustomerId} />
          </Field>
          <Field label="Ship from">
            <Picker items={warehouses} label="Select a warehouse" show={warehouseName} value={warehouseId} onChange={setWarehouseId} />
          </Field>
        </div>
        <ItemsEditor items={items} setItems={setItems} products={products} priceLabel="Unit price" />
      </ModalForm>
    </Modal>
  )
}

export default function SalesOrders() {
  const [orders, reload, loading] = useData('/sales-orders')
  const [status, setStatus] = useState('ALL')
  const [creating, setCreating] = useState(false)
  const [run, error] = useAction(reload)

  const act = (id, action) => run(async () => {
    await api(`/sales-orders/${id}/${action}`, 'POST')
    toast(`${orderNo('SO', id)} ${action === 'ship' ? 'shipped' : 'cancelled'}`)
  })
  const rows = status === 'ALL' ? orders : orders.filter((o) => o.status === status)
  const pager = usePagination(rows)
  const changeStatus = (value) => {
    setStatus(value)
    pager.setPage(0)
  }
  const saved = () => {
    setCreating(false)
    reload()
  }

  return (
    <>
      <PageHeader title="Sales Orders" subtitle="Sell to customers. Creating an order reserves stock; shipping it issues the stock.">
        <button onClick={() => setCreating(true)}><Plus size={16} /> New sales order</button>
      </PageHeader>

      <ErrorText error={error} />

      <Card flush>
        <div className="toolbar">
          <Tabs options={STATUSES} value={status} onChange={changeStatus} />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Order</th><th>Customer</th><th>Ship from</th><th>Items</th>
                <th className="num">Total</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {pager.rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <span className="mono">{orderNo('SO', o.id)}</span>
                    <span className="sub">{formatTime(o.created_at)}</span>
                  </td>
                  <td><NameWithAvatar name={o.customer} /></td>
                  <td className="mono">{o.warehouse}</td>
                  <td>
                    <div className="line-items">
                      {o.items.map((i) => <span key={i.id}><span className="mono">{i.sku}</span> × {i.qty}</span>)}
                    </div>
                  </td>
                  <td className="num strong">{money(o.total)}</td>
                  <td><Badge status={o.status} /></td>
                  <td>
                    {o.status === 'RESERVED' && (
                      <div className="actions">
                        <button className="small" onClick={() => act(o.id, 'ship')}><Send size={14} /> Ship</button>
                        <button className="small danger" onClick={() => act(o.id, 'cancel')}>Cancel</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              <TableState loading={loading} empty={rows.length === 0} colSpan="7" text="No sales orders here yet" />
            </tbody>
          </table>
        </div>
        <Pagination pager={pager} />
      </Card>

      {creating && <NewSalesOrder onClose={() => setCreating(false)} onSaved={saved} />}
    </>
  )
}
