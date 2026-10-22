import { useState } from 'react'
import { Plus } from 'lucide-react'
import { api, useData, useAction, number, toast } from '../api.js'
import { Card, Field, TableState, Modal, ModalForm, PageHeader } from '../components.jsx'

function NewWarehouse({ onClose, onSaved }) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [run, error] = useAction(onSaved)

  const save = () => run(async () => {
    await api('/warehouses', 'POST', { code, name })
    toast(`${code} added`)
  })

  return (
    <Modal title="Add warehouse" onClose={onClose}>
      <ModalForm onSubmit={save} onClose={onClose} submitLabel="Add warehouse" error={error}>
        <div className="form-grid">
          <Field label="Code" hint="Short unique code">
            <input placeholder="e.g. WEST" value={code} required onChange={(e) => setCode(e.target.value)} />
          </Field>
          <Field label="Name">
            <input placeholder="e.g. West Hub" value={name} required onChange={(e) => setName(e.target.value)} />
          </Field>
        </div>
      </ModalForm>
    </Modal>
  )
}

export default function Warehouses() {
  const [warehouses, reload, loading] = useData('/warehouses')
  const [stock] = useData('/stock')
  const [creating, setCreating] = useState(false)

  // Add up stock rows for one warehouse
  const totals = (warehouseId) => {
    const rows = stock.filter((s) => s.warehouse_id === warehouseId)
    return {
      products: rows.filter((s) => s.on_hand > 0).length,
      onHand: rows.reduce((sum, s) => sum + s.on_hand, 0),
      reserved: rows.reduce((sum, s) => sum + s.reserved, 0),
    }
  }

  const saved = () => {
    setCreating(false)
    reload()
  }

  return (
    <>
      <PageHeader title="Warehouses" subtitle="Locations where stock is held.">
        <button onClick={() => setCreating(true)}><Plus size={16} /> Add warehouse</button>
      </PageHeader>

      <Card flush>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Code</th><th>Name</th><th className="num">Products stocked</th>
                <th className="num">Units on hand</th><th className="num">Reserved</th>
              </tr>
            </thead>
            <tbody>
              {warehouses.map((w) => {
                const t = totals(w.id)
                return (
                  <tr key={w.id}>
                    <td className="mono">{w.code}</td>
                    <td className="strong">{w.name}</td>
                    <td className="num">{t.products}</td>
                    <td className="num">{number(t.onHand)}</td>
                    <td className="num muted">{number(t.reserved)}</td>
                  </tr>
                )
              })}
              <TableState loading={loading} empty={warehouses.length === 0} colSpan="5" text="No warehouses yet" />
            </tbody>
          </table>
        </div>
      </Card>

      {creating && <NewWarehouse onClose={() => setCreating(false)} onSaved={saved} />}
    </>
  )
}
