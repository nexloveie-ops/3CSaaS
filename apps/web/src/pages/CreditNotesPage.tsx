import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { PageHeader } from '../components/ui/PageHeader';
import { api } from '../lib/api';

export function CreditNotesPage() {
  const { t } = useTranslation();
  const { data: notes } = useQuery({
    queryKey: ['credit-notes'],
    queryFn: () => api.listCreditNotes(),
  });

  async function openPrint(id: string) {
    const html = await api.fetchCreditNotePrintHtml(id);
    const w = window.open('', '_blank');
    if (w) {
      w.document.write(html);
      w.document.close();
    }
  }

  return (
    <div className="page-content">
      <PageHeader title={t('creditNotes.title')} />
      <ul>
        {(
          notes as
            | {
                _id: string;
                docNumber: string;
                totalIncVat: number;
                businessDate?: string;
              }[]
            | undefined
        )?.map((n) => (
          <li key={n._id} className="card" style={{ listStyle: 'none' }}>
            {n.docNumber} — €{n.totalIncVat.toFixed(2)}
            {n.businessDate ? ` · ${n.businessDate}` : ''}
            <button
              type="button"
              style={{ marginLeft: 8 }}
              onClick={() => openPrint(n._id).catch((e) => alert((e as Error).message))}
            >
              {t('creditNotes.print')}
            </button>
          </li>
        ))}
      </ul>
      {!notes?.length && <p>{t('creditNotes.empty')}</p>}
    </div>
  );
}
