import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollText, Search, RotateCcw, Download, Eye, Filter,
} from 'lucide-react';
import { api } from '../../api';
import {
  PageHeader, Card, Button, Modal, useToast,
  EmptyState, ErrorState, SkeletonTable, Badge, RoleBadge, FilterChips, Pagination,
} from '../../ui';
import { downloadCsv } from '../../ui/ImportCsvModal';

const ACTION_GROUPS = [
  { value: '', label: 'All Actions' },
  { value: 'user.', label: 'Users' },
  { value: 'question.', label: 'Questions' },
  { value: 'bundle.', label: 'Bundles' },
  { value: 'subject.', label: 'Subjects' },
  { value: 'quiz.', label: 'Quizzes' },
  { value: 'payment.', label: 'Payments' },
  { value: 'settings.', label: 'Settings' },
];

const ACTION_TONES = {
  create: 'green', update: 'blue', delete: 'red', restore: 'purple',
  suspend: 'orange', reactivate: 'green', import: 'cyan', export: 'slate',
};

function actionTone(action = '') {
  const verb = action.split('.')[1] || '';
  return ACTION_TONES[verb] || 'slate';
}
function humanAction(action = '') {
  return action.split('.').map((p) => p.replace(/_/g, ' ')).join(' → ');
}

export default function AdminAuditLog() {
  const toast = useToast();
  const [entries, setEntries] = useState(null);
  const [error, setError] = useState('');
  const [actionPrefix, setActionPrefix] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(25);
  const [active, setActive] = useState(null);

  const load = useCallback(() => {
    setError('');
    setEntries(null);
    const qs = new URLSearchParams({ limit: '500' });
    if (actionPrefix) qs.set('action', actionPrefix);
    api.get(`/admin/audit-log?${qs.toString()}`)
      .then((d) => setEntries(d.entries))
      .catch((e) => { setError(e.message); setEntries([]); });
  }, [actionPrefix]);

  useEffect(load, [load]);
  useEffect(() => { setPage(1); }, [search, actionPrefix, perPage]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (entries || []).filter((e) => !term
      || (e.actor_name || '').toLowerCase().includes(term)
      || (e.actor_email || '').toLowerCase().includes(term)
      || (e.action || '').toLowerCase().includes(term)
      || (e.entity_type || '').toLowerCase().includes(term));
  }, [entries, search]);

  const paged = useMemo(
    () => filtered.slice((page - 1) * perPage, page * perPage),
    [filtered, page, perPage]
  );

  function exportCsv() {
    if (!filtered.length) { toast.warning('Nothing to export', 'No log entries match your filters.'); return; }
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = [
      ['Date', 'Actor', 'Email', 'Role', 'Action', 'Entity Type', 'Entity ID', 'IP'],
      ...filtered.map((e) => [
        new Date(e.created_at).toISOString(), e.actor_name || '', e.actor_email || '',
        e.actor_role || '', e.action || '', e.entity_type || '', e.entity_id ?? '', e.ip || '',
      ]),
    ];
    downloadCsv('audit-log.csv', rows.map((r) => r.map(esc).join(',')).join('\n'));
    toast.success('Audit log exported', `${filtered.length} entries downloaded.`);
  }

  const activeGroup = ACTION_GROUPS.find((g) => g.value === actionPrefix);

  return (
    <div className="accent-slate">
      <PageHeader
        eyebrow="System"
        title="Audit Log"
        subtitle="An append-only record of every administrative action on the platform."
        actions={(
          <>
            <Button icon={Download} onClick={exportCsv}>Export CSV</Button>
            <Button variant="primary" icon={RotateCcw} onClick={load}>Refresh</Button>
          </>
        )}
      />

      {error && <div className="error-banner"><span>{error}</span><Button size="xs" icon={RotateCcw} onClick={load}>Retry</Button></div>}

      <Card flush className="table-card">
        <div className="toolbar" style={{ padding: '14px 16px', marginBottom: 0, borderBottom: '1px solid var(--border)' }}>
          <label className="input-with-icon" style={{ maxWidth: 300 }}>
            <Search size={15} />
            <input placeholder="Search by actor, action or entity…" value={search} onChange={(e) => setSearch(e.target.value)} aria-label="Search audit log" />
          </label>
          <span className="row" style={{ gap: 7 }}>
            <Filter size={15} className="muted" />
            <select value={actionPrefix} onChange={(e) => setActionPrefix(e.target.value)} aria-label="Filter by action">
              {ACTION_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select>
          </span>
          <span className="spacer" />
          {(actionPrefix || search) && (
            <FilterChips
              chips={[
                actionPrefix && { key: 'action', label: `Action: ${activeGroup?.label}`, onRemove: () => setActionPrefix('') },
                search && { key: 'search', label: `Search: ${search}`, onRemove: () => setSearch('') },
              ].filter(Boolean)}
              onClear={() => { setActionPrefix(''); setSearch(''); }}
            />
          )}
        </div>

        {entries === null ? <SkeletonTable rows={6} cols={5} /> : error ? (
          <ErrorState title="Unable to load the audit log" onRetry={load} />
        ) : paged.length ? (
          <>
            <div className="table-wrap">
              <table className="table-stack">
                <thead><tr><th>When</th><th>Actor</th><th>Action</th><th>Entity</th><th>IP</th><th className="td-actions">Details</th></tr></thead>
                <tbody>
                  {paged.map((e) => (
                    <tr key={e.id}>
                      <td data-label="When" className="td-nowrap">
                        <div className="td-strong">{new Date(e.created_at).toLocaleDateString()}</div>
                        <div className="td-muted">{new Date(e.created_at).toLocaleTimeString()}</div>
                      </td>
                      <td data-label="Actor">
                        <div className="td-strong">{e.actor_name || 'System'}</div>
                        <div className="td-muted">{e.actor_email || '—'}</div>
                      </td>
                      <td data-label="Action">
                        <Badge tone={actionTone(e.action)}>{humanAction(e.action)}</Badge>
                      </td>
                      <td data-label="Entity">
                        {e.entity_type ? <>{e.entity_type}{e.entity_id ? <span className="td-muted"> #{e.entity_id}</span> : null}</> : <span className="td-muted">—</span>}
                      </td>
                      <td data-label="IP" className="td-muted">{e.ip || '—'}</td>
                      <td data-label="Details" className="td-actions">
                        <Button size="xs" icon={Eye} onClick={() => setActive(e)}>View</Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Pagination page={page} pageSize={perPage} total={filtered.length} onPage={setPage} onPageSize={setPerPage} />
          </>
        ) : (
          <EmptyState
            icon={ScrollText} tone="slate"
            title={search || actionPrefix ? 'No entries match your filters' : 'No Activity Recorded'}
            description={search || actionPrefix ? 'Try clearing the filters to see the full log.' : 'Administrative actions will be recorded here as they happen.'}
            action={(search || actionPrefix) ? <Button onClick={() => { setSearch(''); setActionPrefix(''); }}>Clear Filters</Button> : null}
          />
        )}
      </Card>

      <Modal
        open={!!active}
        onClose={() => setActive(null)}
        title="Log Entry"
        description={active ? new Date(active.created_at).toLocaleString() : ''}
        footer={<Button variant="outline" onClick={() => setActive(null)}>Close</Button>}
      >
        {active && (
          <>
            <dl className="detail-list">
              <div><dt>Action</dt><dd><Badge tone={actionTone(active.action)}>{active.action}</Badge></dd></div>
              <div><dt>Actor</dt><dd>{active.actor_name || 'System'}</dd></div>
              <div><dt>Email</dt><dd>{active.actor_email || '—'}</dd></div>
              <div><dt>Role</dt><dd>{active.actor_role ? <RoleBadge role={active.actor_role} /> : '—'}</dd></div>
              <div><dt>Entity</dt><dd>{active.entity_type || '—'}{active.entity_id ? ` #${active.entity_id}` : ''}</dd></div>
              <div><dt>IP address</dt><dd>{active.ip || '—'}</dd></div>
            </dl>
            {active.meta && Object.keys(active.meta).length > 0 && (
              <>
                <strong style={{ display: 'block', margin: '16px 0 8px', fontSize: '.82rem' }}>Additional data</strong>
                <pre className="code-block">{JSON.stringify(active.meta, null, 2)}</pre>
              </>
            )}
          </>
        )}
      </Modal>
    </div>
  );
}
