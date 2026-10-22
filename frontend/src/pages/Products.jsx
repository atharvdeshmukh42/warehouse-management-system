import { useState } from 'react'
import { Plus } from 'lucide-react'
import { api, useData, useAction, money, number, toast } from '../api.js'
import { Card, Field, TableState, Modal, ModalForm, PageHeader, SearchInput, StockBadge } from '../components.jsx'

function NewProduct({ onClose, onSaved }) {
  const [form, setForm] = useState({ sku: '', name: '', price: '', reorder_level: 10 })
  const [run, error] = useAction(onSaved)
  const update = (key, value) => setForm({ ...form, [key]: value })

  const save = () => run(async () => {
    await api('/products', 'POST', {
      ...form,
      price: Number(form.price),
      reorder_level: Number(form.reorder_level),
    })
    toast(`${form.sku} added to the catalog`)
  })

  return (
    <Modal title="Add product" subtitle="Products can be stocked in any warehouse." onClose={onClose}>
      <ModalForm onSubmit={save} onClose={onClose} submitLabel="Add product" error={error}>
        <div className="form-grid">
          <Field label="SKU">
            <input placeholder="e.g. BOX-M" value={form.sku} required onChange={(e) => update('sku', e.target.value)} />
          </Field>
          <Field label="Name">
            <input placeholder="e.g. Medium Box" value={form.name} required onChange={(e) => update('name', e.target.value)} />
          </Field>
          <Field label="Selling price">
            <input type="number" min="0" step="0.01" placeholder="0.00" value={form.price}
              onChange={(e) => update('price', e.target.value)} />
          </Field>
          <Field label="Reorder level" hint="Alert when available stock drops to this">
            <input type="number" min="0" value={form.reorder_level}
              onChange={(e) => update('reorder_level', e.target.value)} />
          </Field>
        </div>
      </ModalForm>
    </Modal>
  )
}

export default function Products() {
  const [products, reload, loading] = useData('/products')
  const [search, setSearch] = useState('')
  const [creating, setCreating] = useState(false)

  const term = search.toLowerCase()
  const rows = products.filter((p) => (p.sku + ' ' + p.name).toLowerCase().includes(term))
  const saved = () => {
    setCreating(false)
    reload()
  }

  return (
    <>
      <PageHeader title="Products" subtitle="Your catalog, with stock totals across all warehouses.">
        <button onClick={() => setCreating(true)}><Plus size={16} /> Add product</button>
      </PageHeader>

      <Card flush>
        <div className="toolbar">
          <SearchInput value={search} onChange={setSearch} placeholder="Search by SKU or name" />
          <span className="muted">{rows.length} products</span>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>SKU</th><th>Name</th><th className="num">Price</th><th className="num">Reorder at</th>
                <th className="num">On hand</th><th className="num">Available</th><th>Status</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="mono">{p.sku}</td>
                  <td className="strong">{p.name}</td>
                  <td className="num">{money(p.price)}</td>
                  <td className="num muted">{p.reorder_level}</td>
                  <td className="num">{number(p.on_hand)}</td>
                  <td className="num strong">{number(p.available)}</td>
                  <td><StockBadge available={p.available} reorderLevel={p.reorder_level} /></td>
                </tr>
              ))}
              <TableState loading={loading} empty={rows.length === 0} colSpan="7" text="No products found" />
            </tbody>
          </table>
        </div>
      </Card>

      {creating && <NewProduct onClose={() => setCreating(false)} onSaved={saved} />}
    </>
  )
}
