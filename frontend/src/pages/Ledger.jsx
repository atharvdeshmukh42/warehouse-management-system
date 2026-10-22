import { useState } from 'react'
import { Undo2 } from 'lucide-react'
import { api, useData, useAction, formatTime, orderNo, toast } from '../api.js'
import {
  Badge, Card, Field, Modal, ModalForm, PageHeader, Pagination, SearchInput, TableState, Tabs, usePagination,
} from '../components.jsx'

const TYPES = ['ALL', 'RECEIPT', 'ISSUE', 'ADJUSTMENT', 'TRANSFER_IN', 'TRANSFER_OUT', 'REVERSAL']
const REVERSIBLE = ['RECEIPT', 'ISSUE', 'ADJUSTMENT']
const PREFIX = { PURCHASE_ORDER: 'PO', SALES_ORDER: 'SO' }

// Where a ledger entry came from, e.g. "PO-0003" or "Manual"
function source(t) {
  if (PREFIX[t.ref_type] && t.ref_id) return orderNo(PREFIX[t.ref_type], t.ref_id)
  if (t.ref_type === 'TRANSFER') return 'Transfer'
  return 'Manual'
}

function ReverseModal({ transaction, onClose, onSaved }) {
  const [reason, setReason] = useState('')
  const [run, error] = useAction(onSaved)
  const t = transaction

  const save = () => run(async () => {
    await api(`/transactions/${t.id}/reverse`, 'POST', { reason })
    toast(`Entry #${t.id} reversed`)
  })

  return (
    <Modal title={`Reverse entry #${t.id}`}
      subtitle="This adds a new entry with the opposite quantity. The original stays in the history."
      onClose={onClose}>
      <ModalForm onSubmit={save} onClose={onClose} submitLabel="Reverse entry" error={error}>
        <div className="summary">
          <div className="summary-row"><span>Type</span><Badge status={t.type} /></div>
          <div className="summary-row"><span>Product</span><span className="strong">{t.sku} · {t.name}</span></div>
          <div className="summary-row"><span>Warehouse</span><span className="mono">{t.warehouse}</span></div>
          <div className="summary-row"><span>Quantity</span><span className="strong">{t.qty > 0 ? '+' : ''}{t.qty}</span></div>
        </div>
        <Field label="Reason for reversal">
          <input placeholder="e.g. Entered the wrong quantity" value={reason} required autoFocus
            onChange={(e) => setReason(e.target.value)} />
        </Field>
      </ModalForm>
    </Modal>
  )
}

export default function Ledger() {
  const [entries, reload, loading] = useData('/transactions')
  const [type, setType] = useState('ALL')
  const [search, setSearch] = useState('')
  const [reversing, setReversing] = useState(null)

  const term = search.toLowerCase()
  const rows = entries
    .filter((t) => type === 'ALL' || t.type === type)
    .filter((t) => (t.sku + ' ' + t.name + ' ' + t.reason).toLowerCase().includes(term))
  const pager = usePagination(rows, 25)

  const saved = () => {
    setReversing(null)
    reload()
  }

  return (
    <>
      <PageHeader title="Stock Ledger"
        subtitle="Every stock movement, permanently recorded. Mistakes are fixed with reversals, never edits." />

      <Card flush>
        <div className="toolbar">
          <Tabs options={TYPES} value={type} onChange={(v) => { setType(v); pager.setPage(0) }} />
          <SearchInput value={search} onChange={(v) => { setSearch(v); pager.setPage(0) }} placeholder="Search product or reason" />
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th><th>Date</th><th>Type</th><th>Product</th><th>Warehouse</th>
                <th className="num">Qty</th><th>Reason</th><th>Source</th><th></th>
              </tr>
            </thead>
            <tbody>
              {pager.rows.map((t) => (
                <tr key={t.id} className={t.reversed_by ? 'struck' : ''}>
                  <td className="mono">{t.id}</td>
                  <td className="nowrap muted">{formatTime(t.created_at)}</td>
                  <td><Badge status={t.type} /></td>
                  <td><span className="mono">{t.sku}</span></td>
                  <td className="mono">{t.warehouse}</td>
                  <td className={'num ' + (t.qty > 0 ? 'qty-in' : 'qty-out')}>{t.qty > 0 ? '+' : ''}{t.qty}</td>
                  <td>{t.reason}</td>
                  <td>
                    {source(t)}
                    {t.reverses_id && <span className="sub">Reverses #{t.reverses_id}</span>}
                    {t.reversed_by && <span className="sub">Reversed by #{t.reversed_by}</span>}
                  </td>
                  <td>
                    {REVERSIBLE.includes(t.type) && !t.reversed_by && (
                      <div className="actions">
                        <button className="small secondary" onClick={() => setReversing(t)}><Undo2 size={14} /> Reverse</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
              <TableState loading={loading} empty={rows.length === 0} colSpan="9" text="No ledger entries found" />
            </tbody>
          </table>
        </div>
        <Pagination pager={pager} />
      </Card>

      {reversing && <ReverseModal transaction={reversing} onClose={() => setReversing(null)} onSaved={saved} />}
    </>
  )
}
