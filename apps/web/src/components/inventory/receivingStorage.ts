import type { ReceivingDraft } from './receivingTypes';

const DRAFT_PREFIX = 'lz3c-receiving-draft-';
const SUPPLIERS_PREFIX = 'lz3c-recent-suppliers-';

export function loadReceivingDraft(storeId: string | null): ReceivingDraft | null {
  if (!storeId) return null;
  try {
    const raw = localStorage.getItem(`${DRAFT_PREFIX}${storeId}`);
    if (!raw) return null;
    return JSON.parse(raw) as ReceivingDraft;
  } catch {
    return null;
  }
}

export function saveReceivingDraft(storeId: string | null, draft: ReceivingDraft): void {
  if (!storeId) return;
  localStorage.setItem(`${DRAFT_PREFIX}${storeId}`, JSON.stringify(draft));
}

export function clearReceivingDraft(storeId: string | null): void {
  if (!storeId) return;
  localStorage.removeItem(`${DRAFT_PREFIX}${storeId}`);
}

export function loadRecentSuppliers(storeId: string | null): string[] {
  if (!storeId) return [];
  try {
    const raw = localStorage.getItem(`${SUPPLIERS_PREFIX}${storeId}`);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function rememberSupplier(storeId: string | null, supplier: string): void {
  const trimmed = supplier.trim();
  if (!storeId || !trimmed) return;
  const prev = loadRecentSuppliers(storeId).filter((s) => s !== trimmed);
  const next = [trimmed, ...prev].slice(0, 5);
  localStorage.setItem(`${SUPPLIERS_PREFIX}${storeId}`, JSON.stringify(next));
}
