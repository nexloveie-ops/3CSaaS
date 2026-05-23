import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';

type Brand = { _id: string; name: string };
type DeviceModel = { _id: string; name: string };
type IssueCol = { label: string; kind: string };

export function PriceListPage() {
  const { t } = useTranslation();
  const qc = useQueryClient();

  const [expandedBrandId, setExpandedBrandId] = useState<string | null>(null);
  const [newBrand, setNewBrand] = useState('');
  const [newModelByBrand, setNewModelByBrand] = useState<Record<string, string>>({});
  const [newTemplateIssue, setNewTemplateIssue] = useState('');
  const [matrixBrandId, setMatrixBrandId] = useState('');
  const [extraIssues, setExtraIssues] = useState<string[]>([]);
  const [newExtraIssue, setNewExtraIssue] = useState('');
  const [draft, setDraft] = useState<Record<string, Record<string, string>>>({});

  const { data: brands } = useQuery({
    queryKey: ['price-list-brands'],
    queryFn: () => api.listPriceListBrands(),
  });

  const { data: issueTemplates } = useQuery({
    queryKey: ['price-list-issue-templates'],
    queryFn: () => api.listPriceListIssueTemplates(),
  });

  const { data: models } = useQuery({
    queryKey: ['price-list-models', expandedBrandId],
    queryFn: () => api.listPriceListModels(expandedBrandId!),
    enabled: !!expandedBrandId,
  });

  const { data: matrix, isLoading: matrixLoading } = useQuery({
    queryKey: ['price-list-matrix', matrixBrandId],
    queryFn: () => api.getPriceListMatrix(matrixBrandId),
    enabled: !!matrixBrandId,
  });

  useEffect(() => {
    if (!matrix) return;
    const next: Record<string, Record<string, string>> = {};
    for (const m of matrix.models) {
      const row = matrix.prices[m._id] ?? {};
      next[m._id] = {};
      for (const [issue, price] of Object.entries(row)) {
        next[m._id]![issue] = String(price);
      }
    }
    setDraft(next);
    setExtraIssues([]);
  }, [matrix]);

  const issueColumns: IssueCol[] = useMemo(() => {
    const base = matrix?.issues ?? [];
    const labels = new Set(base.map((i) => i.label));
    const extras = extraIssues.filter((l) => !labels.has(l)).map((label) => ({
      label,
      kind: 'custom',
    }));
    return [...base, ...extras];
  }, [matrix?.issues, extraIssues]);

  const addBrand = useMutation({
    mutationFn: () => api.createPriceListBrand(newBrand.trim()),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-list-brands'] });
      setNewBrand('');
    },
  });

  const addModel = useMutation({
    mutationFn: ({ brandId, name }: { brandId: string; name: string }) =>
      api.createPriceListModel(brandId, name.trim()),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['price-list-models', vars.brandId] });
      qc.invalidateQueries({ queryKey: ['price-list-matrix', matrixBrandId] });
      setNewModelByBrand((prev) => ({ ...prev, [vars.brandId]: '' }));
    },
  });

  const addTemplate = useMutation({
    mutationFn: () =>
      api.createPriceListIssueTemplate(newTemplateIssue.trim(), 'template'),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-list-issue-templates'] });
      qc.invalidateQueries({ queryKey: ['price-list-matrix', matrixBrandId] });
      setNewTemplateIssue('');
    },
  });

  const deleteTemplate = useMutation({
    mutationFn: (id: string) => api.deletePriceListIssueTemplate(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-list-issue-templates'] });
      qc.invalidateQueries({ queryKey: ['price-list-matrix', matrixBrandId] });
      qc.invalidateQueries({ queryKey: ['price-list'] });
    },
  });

  const saveMatrix = useMutation({
    mutationFn: () => {
      const entries: { modelId: string; issue: string; priceIncVat?: number | null }[] =
        [];
      for (const m of matrix?.models ?? []) {
        const row = draft[m._id] ?? {};
        for (const col of issueColumns) {
          const raw = row[col.label]?.trim();
          entries.push({
            modelId: m._id,
            issue: col.label,
            priceIncVat: raw === '' || raw == null ? null : Number(raw),
          });
        }
      }
      return api.bulkSavePriceListMatrix({
        brandId: matrixBrandId,
        entries,
        newIssues: extraIssues.length ? extraIssues : undefined,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['price-list-matrix', matrixBrandId] });
      qc.invalidateQueries({ queryKey: ['price-list'] });
      qc.invalidateQueries({ queryKey: ['price-list-issue-templates'] });
    },
  });

  function setCell(modelId: string, issue: string, value: string) {
    setDraft((prev) => ({
      ...prev,
      [modelId]: { ...(prev[modelId] ?? {}), [issue]: value },
    }));
  }

  function addExtraIssueColumn() {
    const label = newExtraIssue.trim();
    if (!label || extraIssues.includes(label)) return;
    if (issueColumns.some((c) => c.label === label)) return;
    setExtraIssues((prev) => [...prev, label]);
    setNewExtraIssue('');
  }

  const brandList = (brands as Brand[] | undefined) ?? [];
  const templateList = (issueTemplates as { _id: string; label: string; kind: string }[] | undefined) ?? [];

  return (
    <div className="page-content">
      <PageHeader title={t('priceList.title')} />
      <p style={{ marginTop: 0, color: 'var(--text-muted)', fontSize: '0.875rem' }}>
        {t('priceList.subtitle')}
      </p>

      <section className="section-card">
        <h3>{t('priceList.setupBrands')}</h3>
        <form
          className="form-row"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            addBrand.mutate();
          }}
        >
          <div className="form-field" style={{ flex: 1 }}>
            <label>{t('priceList.addBrand')}</label>
            <input
              value={newBrand}
              onChange={(e) => setNewBrand(e.target.value)}
              placeholder="Apple"
              required
            />
          </div>
          <button type="submit" disabled={addBrand.isPending}>
            {t('priceList.addBrand')}
          </button>
        </form>
        <ul className="clean-list" style={{ marginTop: '1rem' }}>
          {brandList.map((b) => (
            <li key={b._id}>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginRight: 8, fontSize: '0.75rem' }}
                onClick={() =>
                  setExpandedBrandId(expandedBrandId === b._id ? null : b._id)
                }
              >
                {expandedBrandId === b._id ? '▼' : '▶'}
              </button>
              <strong>{b.name}</strong>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ marginLeft: 8, fontSize: '0.75rem' }}
                onClick={() => {
                  if (confirm(t('priceList.confirmDeleteBrand'))) {
                    api.deletePriceListBrand(b._id).then(() => {
                      qc.invalidateQueries({ queryKey: ['price-list-brands'] });
                      if (matrixBrandId === b._id) setMatrixBrandId('');
                    });
                  }
                }}
              >
                {t('products.deleteCategory')}
              </button>
              {expandedBrandId === b._id && (
                <div style={{ marginTop: 8, paddingLeft: 8 }}>
                  <form
                    className="form-row"
                    onSubmit={(e: FormEvent) => {
                      e.preventDefault();
                      const name = newModelByBrand[b._id]?.trim();
                      if (name) addModel.mutate({ brandId: b._id, name });
                    }}
                  >
                    <div className="form-field" style={{ flex: 1 }}>
                      <input
                        value={newModelByBrand[b._id] ?? ''}
                        onChange={(e) =>
                          setNewModelByBrand((prev) => ({
                            ...prev,
                            [b._id]: e.target.value,
                          }))
                        }
                        placeholder={t('priceList.addModel')}
                      />
                    </div>
                    <button type="submit">{t('priceList.addModel')}</button>
                  </form>
                  <div className="price-model-chips">
                    {(models as DeviceModel[] | undefined)?.map((m) => (
                      <span key={m._id} className="price-model-chip">
                        {m.name}
                        <button
                          type="button"
                          className="price-model-chip-remove"
                          aria-label={t('products.deleteCategory')}
                          onClick={() => {
                            api.deletePriceListModel(m._id).then(() => {
                              qc.invalidateQueries({
                                queryKey: ['price-list-models', b._id],
                              });
                              qc.invalidateQueries({
                                queryKey: ['price-list-matrix', matrixBrandId],
                              });
                            });
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section className="section-card">
        <h3>{t('priceList.setupIssues')}</h3>
        <p style={{ marginTop: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          {t('priceList.setupIssuesHint')}
        </p>
        <form
          className="form-row"
          onSubmit={(e: FormEvent) => {
            e.preventDefault();
            addTemplate.mutate();
          }}
        >
          <div className="form-field" style={{ flex: 1 }}>
            <input
              value={newTemplateIssue}
              onChange={(e) => setNewTemplateIssue(e.target.value)}
              placeholder={t('priceList.issuePlaceholder')}
              required
            />
          </div>
          <button type="submit" disabled={addTemplate.isPending}>
            {t('priceList.addTemplateIssue')}
          </button>
        </form>
        <div className="price-model-chips" style={{ marginTop: 12 }}>
          {templateList.map((i) => (
            <span key={i._id} className="price-model-chip" title={i.kind}>
              {i.label}
              {i.kind === 'custom' ? ' *' : ''}
              <button
                type="button"
                className="price-model-chip-remove"
                aria-label={t('priceList.deleteTemplateIssue')}
                disabled={deleteTemplate.isPending}
                onClick={() => {
                  if (!confirm(t('priceList.confirmDeleteIssue'))) return;
                  deleteTemplate.mutate(i._id);
                }}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      </section>

      <section className="section-card">
        <h3>{t('priceList.matrixTitle')}</h3>
        <p style={{ marginTop: 0, fontSize: '0.875rem', color: 'var(--text-muted)' }}>
          {t('priceList.matrixHint')}
        </p>
        <div className="form-field" style={{ maxWidth: 280 }}>
          <label>{t('priceList.pickBrandForMatrix')}</label>
          <select
            value={matrixBrandId}
            onChange={(e) => setMatrixBrandId(e.target.value)}
          >
            <option value="">{t('common.selectPlaceholder')}</option>
            {brandList.map((b) => (
              <option key={b._id} value={b._id}>
                {b.name}
              </option>
            ))}
          </select>
        </div>

        {matrixBrandId && (
          <>
            <div className="form-row" style={{ marginTop: 12 }}>
              <div className="form-field" style={{ flex: 1 }}>
                <label>{t('priceList.addExtraIssue')}</label>
                <input
                  value={newExtraIssue}
                  onChange={(e) => setNewExtraIssue(e.target.value)}
                  placeholder={t('priceList.issuePlaceholder')}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      addExtraIssueColumn();
                    }
                  }}
                />
              </div>
              <button type="button" onClick={addExtraIssueColumn}>
                {t('priceList.addExtraIssue')}
              </button>
            </div>

            {matrixLoading && <p>{t('common.checking')}</p>}
            {!matrixLoading && matrix && matrix.models.length === 0 && (
              <p className="empty-state">{t('priceList.noModels')}</p>
            )}
            {!matrixLoading && matrix && matrix.models.length > 0 && issueColumns.length === 0 && (
              <p className="empty-state">{t('priceList.noIssues')}</p>
            )}
            {!matrixLoading && matrix && matrix.models.length > 0 && issueColumns.length > 0 && (
              <div className="table-wrap price-matrix-wrap" style={{ marginTop: 12 }}>
                <table className="price-matrix-table price-matrix-table--models-horizontal">
                  <thead>
                    <tr>
                      <th className="price-matrix-corner">{t('priceList.issue')}</th>
                      {matrix.models.map((m) => (
                        <th key={m._id}>{m.name}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {issueColumns.map((col) => (
                      <tr key={col.label}>
                        <th className="price-matrix-issue" title={col.kind}>
                          {col.label}
                          {col.kind === 'custom' || extraIssues.includes(col.label) ? ' *' : ''}
                        </th>
                        {matrix.models.map((m) => (
                          <td key={m._id}>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className="price-matrix-cell"
                              value={draft[m._id]?.[col.label] ?? ''}
                              onChange={(e) => setCell(m._id, col.label, e.target.value)}
                              placeholder="—"
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <button
              type="button"
              className="btn btn-primary"
              style={{ marginTop: 16 }}
              disabled={!matrixBrandId || saveMatrix.isPending || !matrix?.models.length}
              onClick={() => saveMatrix.mutate()}
            >
              {t('priceList.saveAllPrices')}
            </button>
            {saveMatrix.isSuccess && (
              <p className="status-ok" style={{ marginTop: 8 }}>
                {t('priceList.savedOk')}
              </p>
            )}
            {saveMatrix.error && (
              <p className="status-fail">{(saveMatrix.error as Error).message}</p>
            )}
          </>
        )}
      </section>
    </div>
  );
}
