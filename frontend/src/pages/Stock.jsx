import { useState } from 'react'
import { ArrowLeftRight, SlidersHorizontal } from 'lucide-react'
import { api, useData, useAction, number, toast } from '../api.js'
import {
  Card, Field, TableState, Modal, ModalForm, PageHeader, Picker, SearchInput, StockBadge,
  productName, warehouseName,
} from '../components.jsx'

function AdjustModal({ products, warehouses, onClose, onSaved }) {
  const [form, setForm] = useState({ product_id: '', warehouse_id: '', qty: '', reason: '' })
  const [run, error] = useAction(onSaved)
  const update = (key, value) => setForm({ ...form, [key]: value })

  const save = () => run(async () => {
    await api('/adjustments', 'POST', {
      product_id: Number(form.product_id),
      warehouse_id: Number(form.warehouse_id),
      qty: Number(form.qty),
      reason: form.reason,
    })
    toast('Stock adjusted')
  })

  return (
    <Modal title="Adjust stock" subtitle="Correct counts after a stock take, damage or loss." onClose={onClose}>
      <ModalForm onSubmit={save} onClose={onClose} submitLabel="Save adjustment" error={error}>
        <div className="form-grid">
          <Field label="Product" full>
            <Picker items={products} label="Select a product" show={productName}
              value={form.product_id} onChange={(v) => update('product_id', v)} />
          </Field>
          <Field label="Warehouse">
            <Picker items={warehouses} label="Select a warehouse" show={warehouseName}
              value={form.warehouse_id} onChange={(v) => update('warehouse_id', v)} />
          </Field>
          <Field label="Quantity change" hint="Use a minus sign to remove stock, e.g. -5">
            <input type="number" value={form.qty} required onChange={(e) => update('qty', e.target.value)} />
          </Field>
          <Field label="Reason" full>
            <input placeholder="e.g. Damaged in storage" value={form.reason} required
              onChange={(e) => update('reason', e.target.value)} />
          </Field>
        </div>
      </ModalForm>
    </Modal>
  )
}

function TransferModal({ products, warehouses, onClose, onSaved }) {
  const [form, setForm] = useState({ product_id: '', from_warehouse_id: '', to_warehouse_id: '', qty: '' })
  const [run, error] = useAction(onSaved)
  const update = (key, value) => setForm({ ...form, [key]: value })

  const save = () => run(async () => {
    await api('/transfers', 'POST', {
      product_id: Number(form.product_id),
      from_warehouse_id: Number(form.from_warehouse_id),
      to_warehouse_id: Number(form.to_warehouse_id),
      qty: Number(form.qty),
    })
    toast(`${form.qty} units transferred`)
  })

  return (
    <Modal title="Transfer stock" subtitle="Move units from one warehouse to another." onClose={onClose}>
      <ModalForm onSubmit={save} onClose={onClose} submitLabel="Transfer stock" error={error}>
        <div className="form-grid">
          <Field label="Product" full>
            <Picker items={products} label="Select a product" show={productName}
              value={form.product_id} onChange={(v) => update('product_id', v)} />
          </Field>
          <Field label="From">
            <Picker items={warehouses} label="Select a warehouse" show={warehouseName}
              value={form.from_warehouse_id} onChange={(v) => update('from_warehouse_id', v)} />
          </Field>
          <Field label="To">
            <Picker items={warehouses} label="Select a warehouse" show={warehouseName}
              value={form.to_warehouse_id} onChange={(v) => update('to_warehouse_id', v)} />
          </Field>
          <Field label="Quantity">
            <input type="number" min="1" value={form.qty} required onChange={(e) => update('qty', e.target.value)} />
          </Field>
        </div>
      </ModalForm>
    </Modal>
  )
}

export default function Stock() {
  const [warehouses] = useData('/warehouses')
  const [products] = useData('/products')
  const [warehouseId, setWarehouseId] = useState('')
  const [search, setSearch] = useState('')
  const [stock, reload, loading] = useData(warehouseId ? `/stock?warehouse_id=${warehouseId}` : '/stock')
  const [dialog, setDialog] = useState('') // '', 'adjust' or 'transfer'

  const term = search.toLowerCase()
  const rows = stock.filter((s) => (s.sku + ' ' + s.name).toLowerCase().includes(term))

  const closeDialog = () => setDialog('')
  const saved = () => {
    setDialog('')
    reload()
  }

  return (
    <>
      <PageHeader title="Stock" subtitle="On hand, reserved and available quantities in every warehouse.">
        <button className="secondary" onClick={() => setDialog('adjust')}>
          <SlidersHorizontal size={16} /> Adjust
        </button>
        <button onClick={() => setDialog('transfer')}>
          <ArrowLeftRight size={16} /> Transfer
        </button>
      </PageHeader>

      <Card flush>
        <div className="toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by SKU or name" />
          <select value={warehouseId} onChange={(e) => setWarehouseId(e.target.value)}>
            <option value="">All warehouses</option>
            {warehouses.map((w) => <option key={w.id} value={w.id}>{warehouseName(w)}</option>)}
          </select>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Product</th><th>Warehouse</th><th className="num">On hand</th><th className="num">Reserved</th>
                <th className="num">Available</th><th className="num">Reorder at</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((s) => (
                <tr key={`${s.product_id}-${s.warehouse_id}`}>
                  <td>
                    <span className="strong">{s.name}</span>
                    <span className="sub mono">{s.sku}</span>
                  </td>
                  <td className="mono">{s.warehouse}</td>
                  <td className="num">{number(s.on_hand)}</td>
                  <td className="num muted">{number(s.reserved)}</td>
                  <td className="num strong">{number(s.available)}</td>
                  <td className="num muted">{s.reorder_level}</td>
                  <td><StockBadge available={s.available} reorderLevel={s.reorder_level} /></td>
                </tr>
              ))}
              <TableState loading={loading} empty={rows.length === 0} colSpan="7" text="No stock found" />
            </tbody>
          </table>
        </div>
      </Card>

      {dialog === 'adjust' && (
        <AdjustModal products={products} warehouses={warehouses} onClose={closeDialog} onSaved={saved} />
      )}
      {dialog === 'transfer' && (
        <TransferModal products={products} warehouses={warehouses} onClose={closeDialog} onSaved={saved} />
      )}
    </>
  )
}
