import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

type PreorderRow = {
  _id: string;
  docNumber: string;
  customerPhone: string;
  customerName?: string;
  customerEmail?: string;
  lines: { productName: string }[];
};

type NotifyVia = 'email' | 'sms' | 'both';

type Props = {
  preorder: PreorderRow;
  onClose: () => void;
  onSuccess: () => void;
};

function defaultNotifyVia(p: PreorderRow): NotifyVia {
  if (p.customerEmail && p.customerPhone) return 'both';
  if (p.customerEmail) return 'email';
  return 'sms';
}

export function PreorderNotifyModal({ preorder, onClose, onSuccess }: Props) {
  const { t } = useTranslation();
  const [notifyVia, setNotifyVia] = useState<NotifyVia>(() => defaultNotifyVia(preorder));

  const arrived = useMutation({
    mutationFn: (via: NotifyVia) => api.markPreorderArrived(preorder._id, { notifyVia: via }),
    onSuccess: () => onSuccess(),
  });

  const hasPhone = Boolean(preorder.customerPhone?.trim());
  const hasEmail = Boolean(preorder.customerEmail?.trim());
  const productName = preorder.lines[0]?.productName ?? '—';

  const options: {
    value: NotifyVia;
    label: string;
    detail?: string;
    disabled: boolean;
  }[] = [
    {
      value: 'sms',
      label: t('preorders.notifySms'),
      detail: hasPhone ? preorder.customerPhone : t('preorders.notifyNoPhone'),
      disabled: !hasPhone,
    },
    {
      value: 'email',
      label: t('preorders.notifyEmail'),
      detail: hasEmail ? preorder.customerEmail : t('preorders.notifyNoEmail'),
      disabled: !hasEmail,
    },
    {
      value: 'both',
      label: t('preorders.notifyBoth'),
      detail: hasPhone && hasEmail ? undefined : t('preorders.notifyBothRequires'),
      disabled: !hasPhone || !hasEmail,
    },
  ];

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal pos-modal--preorder-notify"
        role="dialog"
        aria-labelledby="preorder-notify-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header">
          <h3 id="preorder-notify-title">{t('preorders.notifyTitle')}</h3>
          <p className="pos-modal-sub">{preorder.docNumber}</p>
          <button
            type="button"
            className="pos-modal-close"
            onClick={onClose}
            aria-label={t('common.cancel')}
          >
            ×
          </button>
        </header>

        <div className="pos-modal-body preorder-notify-body">
          <dl className="preorder-notify-summary">
            <div className="preorder-notify-summary__row">
              <dt>{t('preorders.colProduct')}</dt>
              <dd>{productName}</dd>
            </div>
            {(preorder.customerName || hasPhone || hasEmail) && (
              <div className="preorder-notify-summary__row">
                <dt>{t('preorders.colContact')}</dt>
                <dd>
                  {preorder.customerName && (
                    <span className="preorder-notify-summary__line">{preorder.customerName}</span>
                  )}
                  {hasPhone && (
                    <span className="preorder-notify-summary__line">{preorder.customerPhone}</span>
                  )}
                  {hasEmail && (
                    <span className="preorder-notify-summary__line">{preorder.customerEmail}</span>
                  )}
                </dd>
              </div>
            )}
          </dl>

          <div className="preorder-notify-options" role="radiogroup" aria-label={t('preorders.notifyVia')}>
            <span className="preorder-notify-options__legend">{t('preorders.notifyVia')}</span>
            {options.map((opt) => (
              <button
                key={opt.value}
                type="button"
                role="radio"
                aria-checked={notifyVia === opt.value}
                disabled={opt.disabled || arrived.isPending}
                className={`preorder-notify-option${notifyVia === opt.value ? ' preorder-notify-option--active' : ''}${opt.disabled ? ' preorder-notify-option--disabled' : ''}`}
                onClick={() => setNotifyVia(opt.value)}
              >
                <span className="preorder-notify-option__radio" aria-hidden />
                <span className="preorder-notify-option__text">
                  <span className="preorder-notify-option__label">{opt.label}</span>
                  {opt.detail && (
                    <span className="preorder-notify-option__detail">{opt.detail}</span>
                  )}
                </span>
              </button>
            ))}
          </div>
        </div>

        <footer className="pos-modal-footer">
          <button type="button" className="btn btn-secondary" onClick={onClose}>
            {t('common.cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={arrived.isPending}
            onClick={() => arrived.mutate(notifyVia)}
          >
            {t('preorders.notifyConfirm')}
          </button>
        </footer>
      </div>
    </div>
  );
}
