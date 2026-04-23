import { useState, useMemo } from 'react';
import DashboardListFilters from '@/components/dashboard/DashboardListFilters';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { createSupplier, getSuppliers } from '@/api/suppliers';

const LIMIT = 20;

const emptyForm = () => ({
  name: '',
  contactEmail: '',
  contactPhone: '',
  category: '',
  notes: '',
  isActive: true,
});

export default function SuppliersPage() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [addOpen, setAddOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [formError, setFormError] = useState('');
  const [tableSearch, setTableSearch] = useState('');
  const [monthFilter, setMonthFilter] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['suppliers', page],
    queryFn: () => getSuppliers({ page, limit: LIMIT }),
  });
  const listRaw = Array.isArray(data) ? data : (data?.data ?? []);
  const meta = data?.meta ?? {};

  const list = useMemo(() => {
    let rows = listRaw;
    if (monthFilter) {
      rows = rows.filter((s) => {
        const d = String(s.createdAt ?? s.updatedAt ?? s.created_at ?? '').slice(0, 7);
        if (!d) return true;
        return d === monthFilter;
      });
    }
    if (!tableSearch.trim()) return rows;
    const q = tableSearch.trim().toLowerCase();
    return rows.filter(
      (s) =>
        String(s.name || '').toLowerCase().includes(q) ||
        String(s.contactEmail || '').toLowerCase().includes(q) ||
        String(s.contactPhone || '').toLowerCase().includes(q) ||
        String(s.category || '').toLowerCase().includes(q) ||
        String(s.notes || '').toLowerCase().includes(q)
    );
  }, [listRaw, monthFilter, tableSearch]);

  const createMutation = useMutation({
    mutationFn: (body) => createSupplier(body),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['suppliers'] });
      setAddOpen(false);
      setForm(emptyForm());
      setFormError('');
    },
    onError: (err) => {
      setFormError(err?.message || 'Could not create supplier.');
    },
  });

  function openAdd() {
    setForm(emptyForm());
    setFormError('');
    setAddOpen(true);
  }

  function closeAdd() {
    if (createMutation.isPending) return;
    setAddOpen(false);
    setFormError('');
  }

  function submitAdd(e) {
    e.preventDefault();
    const name = String(form.name || '').trim();
    if (!name) {
      setFormError('Supplier name is required.');
      return;
    }
    const body = {
      name,
      isActive: Boolean(form.isActive),
      ...(String(form.contactEmail || '').trim() ? { contactEmail: String(form.contactEmail).trim() } : {}),
      ...(String(form.contactPhone || '').trim() ? { contactPhone: String(form.contactPhone).trim() } : {}),
      ...(String(form.category || '').trim() ? { category: String(form.category).trim() } : {}),
      ...(String(form.notes || '').trim() ? { notes: String(form.notes).trim() } : {}),
    };
    createMutation.mutate(body);
  }

  return (
    <div className="page-stack">
      <div className="page-header page-header--compact">
        <div className="page-header-left">
          <div className="page-title">Suppliers</div>
          <div className="page-subtitle">Supplier list and payment history</div>
        </div>
        <button type="button" className="btn btn-primary btn-sm" onClick={openAdd}>
          <i className="fas fa-plus" /> Add
        </button>
      </div>
      {error && <div className="card card--error"><div className="card-body">{error.message}</div></div>}
      <DashboardListFilters
        search={tableSearch}
        onSearchChange={setTableSearch}
        searchPlaceholder="Search name, contact, category, notes…"
        month={monthFilter}
        onMonthChange={setMonthFilter}
      />
      <div className="card">
        <div className="card-body card-body--no-pad">
          <div className="statement-table-wrap">
            <table className="statement-table">
              <thead>
                <tr><th>Name</th><th>Contact</th><th>Category</th><th>Status</th></tr>
              </thead>
              <tbody>
                {isLoading && <tr><td colSpan={4}>Loading…</td></tr>}
                {!isLoading && list.length === 0 && <tr><td colSpan={4}>No suppliers</td></tr>}
                {!isLoading && list.map((s) => (
                  <tr key={s._id}>
                    <td><strong>{s.name || '—'}</strong></td>
                    <td>{s.contactEmail || s.contactPhone || '—'}</td>
                    <td>{s.category || '—'}</td>
                    <td><span className={'badge ' + (s.isActive !== false ? 'badge-active' : 'badge-inactive')}>{s.isActive !== false ? 'Active' : 'Inactive'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {(meta.total || 0) > LIMIT && (
            <div className="pagination-bar">
              <span className="pagination-info">Page {meta.page ?? page}</span>
              <div className="pagination-btns">
                <button type="button" className="btn btn-outline btn-sm" disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>Prev</button>
                <button type="button" className="btn btn-outline btn-sm" disabled={page >= Math.ceil((meta.total || 0) / LIMIT)} onClick={() => setPage((p) => p + 1)}>Next</button>
              </div>
            </div>
          )}
        </div>
      </div>

      {addOpen && (
        <div className="transactions-modal-overlay" role="dialog" aria-modal="true" onClick={closeAdd}>
          <div className="transactions-modal" onClick={(e) => e.stopPropagation()}>
            <div className="transactions-modal-header">
              <h3>Add supplier</h3>
              <button type="button" className="transactions-modal-close" onClick={closeAdd} aria-label="Close">
                ×
              </button>
            </div>
            <div className="transactions-modal-body">
              <form onSubmit={submitAdd}>
                <div className="transactions-form-grid">
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label htmlFor="sup-name">Name *</label>
                    <input
                      id="sup-name"
                      className="form-control"
                      value={form.name}
                      onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                      required
                      autoComplete="organization"
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="sup-email">Email</label>
                    <input
                      id="sup-email"
                      type="email"
                      className="form-control"
                      value={form.contactEmail}
                      onChange={(e) => setForm((f) => ({ ...f, contactEmail: e.target.value }))}
                      autoComplete="email"
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="sup-phone">Phone</label>
                    <input
                      id="sup-phone"
                      type="tel"
                      className="form-control"
                      value={form.contactPhone}
                      onChange={(e) => setForm((f) => ({ ...f, contactPhone: e.target.value }))}
                      autoComplete="tel"
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label htmlFor="sup-cat">Category</label>
                    <input
                      id="sup-cat"
                      className="form-control"
                      value={form.category}
                      onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                      placeholder="e.g. Utilities, Stock"
                    />
                  </div>
                  <div className="transactions-form-field transactions-form-field--wide">
                    <label htmlFor="sup-notes">Notes</label>
                    <input
                      id="sup-notes"
                      className="form-control"
                      value={form.notes}
                      onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    />
                  </div>
                  <div className="transactions-form-field">
                    <label className="checkbox-inline" style={{ marginTop: 24 }}>
                      <input
                        type="checkbox"
                        checked={form.isActive}
                        onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))}
                      />{' '}
                      Active
                    </label>
                  </div>
                </div>
                {formError && (
                  <div className="card card--error" style={{ marginTop: 12 }}>
                    <div className="card-body">{formError}</div>
                  </div>
                )}
                <div className="transactions-modal-actions">
                  <button type="button" className="btn btn-outline btn-sm" onClick={closeAdd} disabled={createMutation.isPending}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary btn-sm" disabled={createMutation.isPending}>
                    {createMutation.isPending ? 'Saving…' : 'Create supplier'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
