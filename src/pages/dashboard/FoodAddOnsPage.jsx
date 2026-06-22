import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { getFoodAddOnsManage, updateFoodAddOn } from '@/api/foodAddOns';
import { FOOD_ADDONS_QUERY_KEY } from '@/hooks/useFoodAddOns';
import { normalizeFoodAddOnCatalog, formatFoodAddonRate } from '@/content/foodAddons';
import './FoodAddOnsPage.css';

const MANAGE_QUERY_KEY = ['food-add-ons', 'manage'];

function emptyDraft() {
  return { label: '', unitPrice: '', isActive: true };
}

export default function FoodAddOnsPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: MANAGE_QUERY_KEY,
    queryFn: async () => {
      const raw = await getFoodAddOnsManage();
      return normalizeFoodAddOnCatalog(raw, { activeOnly: false });
    },
  });

  const [drafts, setDrafts] = useState({});
  const [savedId, setSavedId] = useState('');

  useEffect(() => {
    if (!data?.length) return;
    const next = {};
    for (const row of data) {
      next[row.id] = {
        label: row.label,
        unitPrice: String(row.rate),
        isActive: row.isActive !== false,
      };
    }
    setDrafts(next);
  }, [data]);

  const saveMutation = useMutation({
    mutationFn: ({ id, body }) => updateFoodAddOn(id, body),
    onSuccess: (_res, vars) => {
      setSavedId(vars.id);
      setTimeout(() => setSavedId(''), 2500);
      queryClient.invalidateQueries({ queryKey: MANAGE_QUERY_KEY });
      queryClient.invalidateQueries({ queryKey: FOOD_ADDONS_QUERY_KEY });
    },
  });

  function setDraft(id, patch) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], ...patch } }));
  }

  function handleSave(row) {
    const d = drafts[row.id];
    if (!d) return;
    const unitPrice = Number(d.unitPrice);
    if (!Number.isFinite(unitPrice) || unitPrice < 0) {
      window.alert('Enter a valid price (0 or greater).');
      return;
    }
    saveMutation.mutate({
      id: row.id,
      body: {
        label: d.label.trim() || row.label,
        unitPrice,
        isActive: Boolean(d.isActive),
      },
    });
  }

  return (
    <div className="dashboard-page food-addons-page">
      <header className="food-addons-header">
        <div>
          <h1 className="dashboard-page-title">Food add-ons</h1>
          <p className="food-addons-lead">
            Set breakfast and picnic prices for the website booking form and event enquiries. Changes apply to new
            bookings only — confirmed bookings keep their stored amounts.
          </p>
        </div>
      </header>

      {error ? (
        <div className="food-addons-error" role="alert">
          {error?.message || 'Could not load food add-ons.'}
        </div>
      ) : null}

      {isLoading ? <p className="food-addons-loading">Loading…</p> : null}

      <div className="food-addons-grid">
        {(data || []).map((row) => {
          const d = drafts[row.id] || emptyDraft();
          const saving = saveMutation.isPending && saveMutation.variables?.id === row.id;
          return (
            <article key={row.id} className="food-addons-card">
              <div className="food-addons-card-top">
                <span className="food-addons-card-chip">{row.chip}</span>
                <span className="food-addons-card-id">{row.id}</span>
              </div>
              <p className="food-addons-card-desc">{row.description}</p>
              <p className="food-addons-card-billing">
                Billing: <strong>{row.unitLabel}</strong> (fixed per add-on type)
              </p>

              <label className="food-addons-field">
                <span>Display label</span>
                <input
                  className="form-control"
                  value={d.label}
                  onChange={(e) => setDraft(row.id, { label: e.target.value })}
                  placeholder={row.label}
                />
              </label>

              <label className="food-addons-field">
                <span>Unit price (ZAR)</span>
                <input
                  className="form-control"
                  type="number"
                  min={0}
                  step={1}
                  value={d.unitPrice}
                  onChange={(e) => setDraft(row.id, { unitPrice: e.target.value })}
                />
              </label>

              <label className="food-addons-check">
                <input
                  type="checkbox"
                  checked={d.isActive}
                  onChange={(e) => setDraft(row.id, { isActive: e.target.checked })}
                />
                <span>Visible on public site</span>
              </label>

              <div className="food-addons-card-footer">
                <div className="food-addons-preview">
                  Public rate:{' '}
                  <strong>
                    {formatFoodAddonRate({
                      rate: Number(d.unitPrice) || 0,
                      unitLabel: row.unitLabel,
                    })}
                  </strong>
                </div>
                <button
                  type="button"
                  className="btn btn-primary btn-sm"
                  onClick={() => handleSave(row)}
                  disabled={saving}
                >
                  {saving ? 'Saving…' : 'Save'}
                </button>
                {savedId === row.id ? (
                  <span className="food-addons-saved" role="status">
                    Saved
                  </span>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}
