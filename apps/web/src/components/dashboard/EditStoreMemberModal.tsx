import { FormEvent, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

export type StoreMember = {
  _id: string;
  email: string;
  displayName?: string;
  role: string;
  storeId: string | null;
};

type StoreOption = { _id: string; name: string };

type Props = {
  member: StoreMember;
  stores: StoreOption[];
  pending?: boolean;
  removePending?: boolean;
  onSave: (body: { displayName: string; role: string; storeId: string }) => void;
  onRemove: () => void;
  onClose: () => void;
};

export function EditStoreMemberModal({
  member,
  stores,
  pending,
  removePending,
  onSave,
  onRemove,
  onClose,
}: Props) {
  const { t } = useTranslation();
  const [displayName, setDisplayName] = useState(member.displayName ?? '');
  const [role, setRole] = useState(member.role);
  const [storeId, setStoreId] = useState(member.storeId ?? '');

  useEffect(() => {
    setDisplayName(member.displayName ?? '');
    setRole(member.role);
    setStoreId(member.storeId ?? '');
  }, [member]);

  const storeRequired = role === 'cashier' || role === 'warehouse_staff';

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!displayName.trim()) return;
    if (storeRequired && !storeId) return;
    onSave({
      displayName: displayName.trim(),
      role,
      storeId,
    });
  }

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal dashboard-member-modal"
        role="dialog"
        aria-labelledby="edit-store-member-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header">
          <h3 id="edit-store-member-title">{t('dashboard.editStoreMember')}</h3>
          <button type="button" className="pos-modal-close" onClick={onClose} aria-label={t('common.cancel')}>
            ×
          </button>
        </header>

        <form className="pos-modal-body dashboard-member-modal__form" onSubmit={onSubmit}>
          <div className="form-field">
            <label>{t('dashboard.memberName')}</label>
            <input
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
            />
          </div>
          <div className="form-field">
            <label>{t('auth.email')}</label>
            <input value={member.email} readOnly disabled className="input-readonly" />
          </div>
          <div className="form-field">
            <label>{t('dashboard.memberRole')}</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="manager">manager</option>
              <option value="cashier">cashier</option>
              <option value="warehouse_staff">warehouse_staff</option>
            </select>
          </div>
          <div className="form-field">
            <label>{t('dashboard.memberStore')}</label>
            <select
              value={storeId}
              onChange={(e) => setStoreId(e.target.value)}
              required={storeRequired}
            >
              <option value="">{t('common.selectPlaceholder')}</option>
              {stores.map((s) => (
                <option key={s._id} value={s._id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <footer className="pos-modal-footer dashboard-member-modal__footer">
            <button
              type="button"
              className="btn btn-danger btn-sm"
              disabled={pending || removePending}
              onClick={onRemove}
            >
              {t('dashboard.removeMember')}
            </button>
            <div className="dashboard-member-modal__actions">
              <button type="button" className="btn btn-secondary btn-sm" onClick={onClose}>
                {t('common.cancel')}
              </button>
              <button type="submit" className="btn btn-primary btn-sm" disabled={pending || removePending}>
                {t('common.save')}
              </button>
            </div>
          </footer>
        </form>
      </div>
    </div>
  );
}
