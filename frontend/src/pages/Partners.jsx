import { useState } from 'react'
import { Plus } from 'lucide-react'
import { api, useData, useAction, toast } from '../api.js'
import { Card, Field, Modal, ModalForm, NameWithAvatar, PageHeader, TableState } from '../components.jsx'

function NewPartner({ title, path, onClose, onSaved }) {
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [run, error] = useAction(onSaved)

  const save = () => run(async () => {
    await api(path, 'POST', { name, email })
    toast(`${name} added`)
  })

  return (
    <Modal title={title} onClose={onClose}>
      <ModalForm onSubmit={save} onClose={onClose} submitLabel="Save" error={error}>
        <Field label="Company name">
          <input value={name} required onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Email">
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Field>
      </ModalForm>
    </Modal>
  )
}

// Suppliers and customers have the same fields, so one component handles both
function PartnerList({ title, singular, path }) {
  const [rows, reload, loading] = useData(path)
  const [creating, setCreating] = useState(false)

  const saved = () => {
    setCreating(false)
    reload()
  }

  return (
    <Card title={title} subtitle={`${rows.length} total`} flush
      actions={<button className="small secondary" onClick={() => setCreating(true)}><Plus size={14} /> Add {singular}</button>}>
      <table>
        <thead><tr><th>Name</th><th>Email</th></tr></thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><NameWithAvatar name={r.name} /></td>
              <td className="muted">{r.email || '—'}</td>
            </tr>
          ))}
          <TableState loading={loading} empty={rows.length === 0} colSpan="2" text={`No ${title.toLowerCase()} yet`} />
        </tbody>
      </table>
      {creating && <NewPartner title={`Add ${singular}`} path={path} onClose={() => setCreating(false)} onSaved={saved} />}
    </Card>
  )
}

export default function Partners() {
  return (
    <>
      <PageHeader title="Suppliers & Customers" subtitle="Who you buy from and who you sell to." />
      <div className="grid-2">
        <PartnerList title="Suppliers" singular="supplier" path="/suppliers" />
        <PartnerList title="Customers" singular="customer" path="/customers" />
      </div>
    </>
  )
}
