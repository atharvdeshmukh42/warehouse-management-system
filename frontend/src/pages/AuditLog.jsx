import { useState } from 'react'
import { useData, formatTime } from '../api.js'
import { Card, PageHeader, Pagination, SearchInput, TableState, usePagination } from '../components.jsx'

export default function AuditLog() {
  const [entries, , loading] = useData('/audit')
  const [search, setSearch] = useState('')

  const term = search.toLowerCase()
  const rows = entries.filter((a) => (a.action + ' ' + a.entity + ' ' + a.details).toLowerCase().includes(term))
  const pager = usePagination(rows, 25)

  return (
    <>
      <PageHeader title="Audit Log" subtitle="A permanent, read-only record of every action in the system." />
      <Card flush>
        <div className="toolbar">
          <SearchInput value={search} onChange={(v) => { setSearch(v); pager.setPage(0) }} placeholder="Search actions" />
        </div>
        <div className="table-wrap">
          <table>
            <thead><tr><th>#</th><th>Date</th><th>Action</th><th>Record</th><th>Details</th></tr></thead>
            <tbody>
              {pager.rows.map((a) => (
                <tr key={a.id}>
                  <td className="mono">{a.id}</td>
                  <td className="nowrap muted">{formatTime(a.created_at)}</td>
                  <td><span className="badge">{a.action.replace('_', ' ').toLowerCase()}</span></td>
                  <td className="strong">{a.entity.replace('_', ' ')} {a.entity_id && `#${a.entity_id}`}</td>
                  <td>{a.details}</td>
                </tr>
              ))}
              <TableState loading={loading} empty={rows.length === 0} colSpan="5" text="No entries found" />
            </tbody>
          </table>
        </div>
        <Pagination pager={pager} />
      </Card>
    </>
  )
}
