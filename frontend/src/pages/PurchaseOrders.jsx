import { useState } from 'react'
import { Check, PackageCheck, Plus } from 'lucide-react'
import { api, useData, useAction, money, orderNo, formatTime, toast } from '../api.js'
import {
  Badge, Card, ErrorText, Field, ItemsEditor, Modal, ModalForm, NameWithAvatar, PageHeader, Pagination, Picker,
  TableState, Tabs, newItem, toItems, usePagination, warehouseName,
} from '../components.jsx'

const STATUSES = ['ALL', 'DRAFT', 'APPROVED', 'RECEIVED', 'CANCELLED']

function NewPurchaseOrder({ onClose, onSaved }) {
  const [suppliers] = useData('/suppliers')
  const [warehouses] = useData('/warehouses')
  const [products] = useData('/products')
  const [supplierId, setSupplierId] = useState('')
  const [warehouseId, setWarehouseId] = useState('')
  const [items, setItems] = useState([newItem()])
  const [run, error] = useAction(onSaved)

  const save = () => run(async () => {
    const order = await api('/purchase-orders', 'POST', {
      supplier_id: Number(supplierId),
      warehouse_id: Number(warehouseId),
      items: toItems(items),
    })
    toast(`${orderNo('PO', order.id)} saved as a draft`)
  })

  return (
    <Modal wide title="New purchase order" subtitle="The order starts as a draft. Approve it, then receive it to add the stock." onClose={onClose}>
      <ModalForm onSubmit={save} onClose={onClose} submitLabel="Create draft" error={error}>
        <div className="form-grid">
          <Field label="Supplier">
            <Picker items={suppliers} label="Select a supplier" show={(s) => s.name} value={supplierId} onChange={setSupplierId} />
          </Field>
          <Field label="Deliver to">
            <Picker items={warehouses} label="Select a warehouse" show={warehouseName} value={warehouseId} onChange={setWarehouseId} />
          </Field>
        </div>
        <ItemsEditor items={items} setItems={setItems} products={products} priceLabel="Unit cost" />
      </ModalForm>
    </Modal>
  )
}

export default function PurchaseOrders() {
  const [orders, reload, loading] = useData('/purchase-orders')
  const [status, setStatus] = useState('ALL')
  const [creating, setCreating] = useState(false)
  const [run, error] = useAction(reload)

  const DONE = { approve: 'approved', receive: 'received, stock added', cancel: 'cancelled' }
  const act = (id, action) => run(async () => {
    await api(`/purchase-orders/${id}/${action}`, 'POST')
    toast(`${orderNo('PO', id)} ${DONE[action]}`)
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
      <PageHeader title="Purchase Orders" subtitle="Buy stock from suppliers. Receiving an approved order adds it to the warehouse.">
        <button onClick={() => setCreating(true)}><Plus size={16} /> New purchase order</button>
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
                <th>Order</th><th>Supplier</th><th>Deliver to</th><th>Items</th>
                <th className="num">Total</th><th>Status</th><th></th>
              </tr>
            </thead>
            <tbody>
              {pager.rows.map((o) => (
                <tr key={o.id}>
                  <td>
                    <span className="mono">{orderNo('PO', o.id)}</span>
                    <span className="sub">{formatTime(o.created_at)}</span>
                  </td>
                  <td><NameWithAvatar name={o.supplier} /></td>
                  <td className="mono">{o.warehouse}</td>
                  <td>
                    <div className="line-items">
                      {o.items.map((i) => <span key={i.id}><span className="mono">{i.sku}</span> × {i.qty}</span>)}
                    </div>
                  </td>
                  <td className="num strong">{money(o.total)}</td>
                  <td><Badge status={o.status} /></td>
                  <td>
                    <div className="actions">
                      {o.status === 'DRAFT' && (
                        <button className="small" onClick={() => act(o.id, 'approve')}><Check size={14} /> Approve</button>
                      )}
                      {o.status === 'APPROVED' && (
                        <button className="small" onClick={() => act(o.id, 'receive')}><PackageCheck size={14} /> Receive</button>
                      )}
                      {(o.status === 'DRAFT' || o.status === 'APPROVED') && (
                        <button className="small danger" onClick={() => act(o.id, 'cancel')}>Cancel</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              <TableState loading={loading} empty={rows.length === 0} colSpan="7" text="No purchase orders here yet" />
            </tbody>
          </table>
        </div>
        <Pagination pager={pager} />
      </Card>

      {creating && <NewPurchaseOrder onClose={() => setCreating(false)} onSaved={saved} />}
    </>
  )
}
