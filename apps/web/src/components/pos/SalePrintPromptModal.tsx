import { useTranslation } from 'react-i18next';

type Props = {
  total: number;
  pending?: boolean;
  onPrintAndComplete: () => void;
  onCompleteWithoutPrint: () => void;
  onCancel: () => void;
};

export function SalePrintPromptModal({
  total,
  pending,
  onPrintAndComplete,
  onCompleteWithoutPrint,
  onCancel,
}: Props) {
  const { t } = useTranslation();

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onCancel}>
      <div
        className="pos-modal pos-modal--sale-print-prompt"
        role="dialog"
        aria-labelledby="sale-print-prompt-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header">
          <h3 id="sale-print-prompt-title">{t('pos.printReceiptPromptTitle')}</h3>
          <p className="pos-modal-sub">{t('pos.printReceiptPromptBody', { total: total.toFixed(2) })}</p>
          <button
            type="button"
            className="pos-modal-close"
            onClick={onCancel}
            disabled={pending}
            aria-label={t('common.cancel')}
          >
            ×
          </button>
        </header>
        <footer className="pos-modal-footer pos-modal-footer--stack">
          <button
            type="button"
            className="btn btn-primary"
            disabled={pending}
            onClick={onPrintAndComplete}
          >
            {pending ? t('common.checking') : t('pos.printReceiptYes')}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={pending}
            onClick={onCompleteWithoutPrint}
          >
            {t('pos.printReceiptNo')}
          </button>
          <button type="button" className="btn btn-ghost" disabled={pending} onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </footer>
      </div>
    </div>
  );
}
