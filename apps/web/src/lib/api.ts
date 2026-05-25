import { useAuthStore } from '../stores/auth';
import { useContextStore } from '../stores/context';

const BASE = '/api';

type RequestContext = { companyId?: string | null; storeId?: string | null };

function headers(ctx?: RequestContext): HeadersInit {
  const token = useAuthStore.getState().token;
  const defaults = useContextStore.getState();
  const companyId = ctx?.companyId ?? defaults.companyId;
  const storeId = ctx?.storeId ?? defaults.storeId;
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) h.Authorization = `Bearer ${token}`;
  if (companyId) h['X-Company-Id'] = companyId;
  if (storeId) h['X-Store-Id'] = storeId;
  return h;
}

async function request<T>(
  path: string,
  init?: RequestInit & { context?: RequestContext },
): Promise<T> {
  const { context, ...rest } = init ?? {};
  const res = await fetch(`${BASE}${path}`, {
    ...rest,
    headers: { 'Content-Type': 'application/json', ...headers(context), ...rest?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    const msg = Array.isArray(body.message)
      ? body.message.join(', ')
      : body.message ?? res.statusText;
    throw new Error(msg);
  }
  return res.json() as Promise<T>;
}

export interface HealthResponse {
  status: string;
  mongo: { ready: boolean; db: string };
}

export const api = {
  getHealth: () => request<HealthResponse>('/health'),

  login: (email: string, password: string) =>
    request<{
      accessToken: string;
      user: { id: string; email: string; displayName: string; locale?: string };
      memberships?: unknown[];
    }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),

  register: (email: string, password: string, displayName: string, locale?: string) =>
    request<{ accessToken: string; user: { id: string; email: string; displayName: string } }>(
      '/auth/register',
      {
        method: 'POST',
        body: JSON.stringify({ email, password, displayName, locale }),
      },
    ),

  me: () =>
    request<{
      user: {
        id: string;
        email: string;
        displayName: string;
        locale?: string;
        isSuperAdmin?: boolean;
      };
      memberships: unknown[];
    }>('/auth/me'),

  updateUserLocale: (locale: string) =>
    request<{ user: { locale: string } }>('/auth/locale', {
      method: 'PATCH',
      body: JSON.stringify({ locale }),
    }),

  getCompany: (id: string) =>
    request<{
      _id: string;
      name: string;
      legalName?: string;
      registrationNumber?: string;
      vatNumber?: string;
      address?: string;
      contactPhone?: string;
      contactEmail?: string;
      defaultLocale?: string;
      enabledLocales?: string[];
      localeOverrides?: Record<string, Record<string, unknown>>;
      enabledModules?: string[];
      subscriptionStatus?: string;
    }>(`/companies/${id}`),

  updateCompanyProfile: (
    companyId: string,
    body: {
      legalName?: string;
      registrationNumber?: string;
      vatNumber?: string;
      address?: string;
      contactPhone?: string;
      contactEmail?: string;
    },
  ) =>
    request(`/companies/${companyId}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  updateCompanyLocale: (
    id: string,
    body: {
      defaultLocale?: string;
      enabledLocales?: string[];
      localeOverrides?: Record<string, Record<string, unknown>>;
    },
  ) =>
    request(`/companies/${id}/locale`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  listCompanies: () => request<{ _id: string; name: string }[]>('/companies'),

  createCompany: (name: string) =>
    request<{ _id: string; name: string }>('/companies', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  addCompanyMember: (
    companyId: string,
    body: { email: string; role: string; storeId?: string },
  ) =>
    request(`/companies/${companyId}/members`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  createInvite: (
    companyId: string,
    body: { email: string; role: string; storeId?: string },
  ) =>
    request<{ token: string; inviteUrl: string; expiresAt: string }>(
      `/companies/${companyId}/invites`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  previewInviteEmail: (
    companyId: string,
    body: { email: string; role: string; storeId?: string; locale?: 'en' | 'zh' },
  ) =>
    request<{ subject: string; text: string; html: string; locale?: string }>(
      `/companies/${companyId}/invites/preview`,
      { method: 'POST', body: JSON.stringify(body) },
    ),

  updateCompanySettings: (
    companyId: string,
    body: {
      webhookUrl?: string;
      auditRetentionDays?: number;
      inviteEmailNote?: string;
      inviteEmailNoteZh?: string;
    },
  ) =>
    request(`/companies/${companyId}/settings`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  purgeCompanyAudit: (companyId: string) =>
    request<{
      deleted: number;
      cutoff: string;
      lastAuditPurgeAt?: string;
      notify?: { enabled: boolean; recipients: number; mode?: string };
    }>(`/companies/${companyId}/audit/purge`, {
      method: 'POST',
      body: '{}',
    }),

  listWebhookDeliveries: (
    companyId: string,
    opts?: { event?: string; status?: 'success' | 'failed' },
  ) => {
    const q = new URLSearchParams();
    if (opts?.event) q.set('event', opts.event);
    if (opts?.status) q.set('status', opts.status);
    const qs = q.toString();
    return request<
      {
        _id: string;
        event: string;
        status: string;
        attempts: number;
        httpStatus?: number;
        lastError?: string;
        url?: string;
        payload?: Record<string, unknown>;
        createdAt: string;
      }[]
    >(`/companies/${companyId}/webhook/deliveries${qs ? `?${qs}` : ''}`);
  },

  getWebhookDelivery: (companyId: string, deliveryId: string) =>
    request<{
      _id: string;
      event: string;
      status: string;
      attempts: number;
      httpStatus?: number;
      lastError?: string;
      url: string;
      payload?: Record<string, unknown>;
      createdAt: string;
    }>(`/companies/${companyId}/webhook/deliveries/${deliveryId}`),

  retryAllFailedWebhooks: (companyId: string, event?: string) =>
    request<{ attempted: number; succeeded: number; stillFailed: number }>(
      `/companies/${companyId}/webhook/deliveries/retry-failed${event ? `?event=${encodeURIComponent(event)}` : ''}`,
      { method: 'POST', body: '{}' },
    ),

  fetchWebhookDeliveriesCsv: async (
    companyId: string,
    opts?: { event?: string; status?: string },
  ) => {
    const q = new URLSearchParams();
    if (opts?.event) q.set('event', opts.event);
    if (opts?.status) q.set('status', opts.status);
    const qs = q.toString();
    const res = await fetch(
      `${BASE}/companies/${companyId}/webhook/deliveries/export.csv${qs ? `?${qs}` : ''}`,
      { headers: headers() as Record<string, string> },
    );
    if (!res.ok) throw new Error('Webhook CSV export failed');
    return res.blob();
  },

  retryWebhookDelivery: (companyId: string, deliveryId: string) =>
    request<{ dispatched: boolean; mode: string; attempts: number }>(
      `/companies/${companyId}/webhook/deliveries/${deliveryId}/retry`,
      { method: 'POST', body: '{}' },
    ),

  getCompanyMaintenanceStatus: (companyId: string) =>
    request<{
      auditRetentionDays: number;
      lastAuditPurgeAt: string | null;
      lastAuditPurgeDeleted: number;
      serverAutoPurgeEnabled: boolean;
    }>(`/companies/${companyId}/maintenance/status`),

  listInvites: (companyId: string) =>
    request<
      { _id: string; email: string; role: string; expiresAt: string; createdAt: string }[]
    >(`/companies/${companyId}/invites`),

  revokeInvite: (companyId: string, inviteId: string) =>
    request(`/companies/${companyId}/invites/${inviteId}`, { method: 'DELETE' }),

  previewInvite: async (token: string) => {
    const res = await fetch(`${BASE}/invites/${token}`);
    const body = await res.json();
    if (!res.ok) throw new Error(body.message ?? 'Invite not found');
    return body as {
      companyName: string;
      email: string;
      role: string;
      expired: boolean;
      accepted: boolean;
      valid: boolean;
    };
  },

  acceptInvite: (token: string) =>
    request<{ companyId: string; companyName?: string; role: string }>('/auth/accept-invite', {
      method: 'POST',
      body: JSON.stringify({ token }),
    }),

  listStores: () => request<{ _id: string; name: string; warehouseEnabled: boolean }[]>('/stores'),

  createStore: (name: string, warehouseEnabled?: boolean) =>
    request<{ _id: string; name: string }>('/stores', {
      method: 'POST',
      body: JSON.stringify({ name, warehouseEnabled }),
    }),

  getStore: (id: string) =>
    request<{
      _id: string;
      name: string;
      address?: string;
      phone?: string;
      email?: string;
      repairTerms?: string;
      salesTerms?: string;
    }>(`/stores/${id}`),

  updateStoreProfile: (
    id: string,
    body: { address?: string; phone?: string; email?: string },
  ) =>
    request(`/stores/${id}/profile`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  updateStoreRepairTerms: (id: string, repairTerms: string) =>
    request(`/stores/${id}/repair-terms`, {
      method: 'PATCH',
      body: JSON.stringify({ repairTerms }),
    }),

  updateStoreSalesTerms: (id: string, salesTerms: string) =>
    request(`/stores/${id}/sales-terms`, {
      method: 'PATCH',
      body: JSON.stringify({ salesTerms }),
    }),

  listTaxCategories: () => request('/tax-categories'),

  listCatalogCategories: () =>
    request<{ _id: string; name: string; sortOrder: number }[]>('/catalog-categories'),

  createCatalogCategory: (name: string) =>
    request<{ _id: string; name: string }>('/catalog-categories', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  updateCatalogCategory: (id: string, name: string) =>
    request<{ _id: string; name: string }>(`/catalog-categories/${id}`, {
      method: 'PATCH',
      body: JSON.stringify({ name }),
    }),

  deleteCatalogCategory: (id: string) =>
    request<{ deleted: boolean }>(`/catalog-categories/${id}`, { method: 'DELETE' }),

  listProducts: (opts?: {
    productType?: string;
    catalogCategoryId?: string;
    q?: string;
  }) => {
    const q = new URLSearchParams();
    if (opts?.productType) q.set('productType', opts.productType);
    if (opts?.catalogCategoryId) q.set('catalogCategoryId', opts.catalogCategoryId);
    if (opts?.q?.trim()) q.set('q', opts.q.trim());
    const qs = q.toString();
    return request(`/products${qs ? `?${qs}` : ''}`);
  },

  createProduct: (body: Record<string, unknown>) =>
    request('/products', { method: 'POST', body: JSON.stringify(body) }),

  listProductVariants: (parentId: string) =>
    request<{
      parent: {
        _id: string;
        name: string;
        variantDimensions?: { name: string; values: string[] }[];
      };
      variants: Array<{
        _id: string;
        name: string;
        variantValues: string[];
        costPrice: number;
        retailPrice?: number;
      }>;
    }>(`/products/${parentId}/variants`),

  listProductVariantsInStock: (parentId: string) =>
    request<{
      parent: {
        _id: string;
        name: string;
        variantDimensions: { name: string; values: string[] }[];
      };
      variants: Array<{
        _id: string;
        name: string;
        variantValues: string[];
        costPrice: number;
        retailPrice?: number;
        quantity: number;
      }>;
    }>(`/products/${parentId}/variants/in-stock`),

  syncProductVariants: (
    parentId: string,
    body: {
      dimensions: { name: string; values: string[] }[];
      variants: Array<{
        variantValues: string[];
        costPrice: number;
        retailPrice?: number;
        skuCode?: string;
      }>;
    },
  ) =>
    request(`/products/${parentId}/variants/sync`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listInventory: () => request('/inventory/positions'),

  listInboundReceipts: (opts?: { from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    const qs = q.toString();
    return request(`/inventory/inbound${qs ? `?${qs}` : ''}`);
  },

  createInbound: (body: Record<string, unknown>) =>
    request('/inventory/inbound', { method: 'POST', body: JSON.stringify(body) }),

  listSerials: (opts?: { status?: string; productId?: string; q?: string }) => {
    const q = new URLSearchParams();
    if (opts?.status) q.set('status', opts.status);
    if (opts?.productId) q.set('productId', opts.productId);
    if (opts?.q?.trim()) q.set('q', opts.q.trim());
    const qs = q.toString();
    return request<
      {
        _id: string;
        sn: string;
        productId: string | { _id: string; name?: string };
        status: string;
      }[]
    >(`/serials${qs ? `?${qs}` : ''}`);
  },

  lookupSerial: async (sn: string) => {
    const res = await request<{
      unit: { _id: string; sn: string; productId: string; status: string };
      events?: unknown[];
    }>(`/serials/lookup/${encodeURIComponent(sn)}`);
    return res.unit ?? (res as unknown as { _id: string; sn: string; productId: string; status: string });
  },

  listCustomers: (q?: string) =>
    request(`/customers${q ? `?q=${encodeURIComponent(q)}` : ''}`),

  createCustomer: (body: Record<string, unknown>) =>
    request('/customers', { method: 'POST', body: JSON.stringify(body) }),

  listTodayOrders: () =>
    request<
      {
        _id: string;
        docNumber: string;
        totalIncVat: number;
        netTotalIncVat?: number;
        refundedTotalIncVat?: number;
        paymentMethod: string;
        cashAmount?: number;
        cardAmount?: number;
        pdfStorageKey?: string;
        createdAt?: string;
      }[]
    >('/pos/orders/today'),

  getPosReceipt: (orderId: string) => request(`/pos/orders/${orderId}`),

  refundPosReceipt: (
    orderId: string,
    body: { lines: { lineIndex: number; quantity: number }[] },
  ) =>
    request(`/pos/orders/${orderId}/refund`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  createSale: (body: Record<string, unknown>) =>
    request<{ _id: string; docNumber: string; totalIncVat: number }>('/pos/sales', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  fetchReceiptHtml: async (orderId: string) => {
    const res = await fetch(`${BASE}/pos/orders/${orderId}/receipt`, {
      headers: headers() as Record<string, string>,
    });
    if (!res.ok) throw new Error('Failed to load receipt');
    return res.text();
  },

  generateReceiptPdf: (orderId: string) =>
    request<{ storageKey: string; docNumber?: string }>(`/pos/orders/${orderId}/pdf`, {
      method: 'POST',
      body: '{}',
    }),

  fetchReceiptPdf: async (orderId: string) => {
    const res = await fetch(`${BASE}/pos/orders/${orderId}/pdf`, {
      headers: headers() as Record<string, string>,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.message ?? 'Failed to load receipt PDF');
    }
    return res.blob();
  },

  listPriceList: () =>
    request<
      {
        _id: string;
        brand: string;
        model: string;
        issue: string;
        name: string;
        priceIncVat: number;
      }[]
    >('/price-list'),

  listPriceListBrands: () =>
    request<{ _id: string; name: string; sortOrder: number }[]>('/price-list/brands'),

  createPriceListBrand: (name: string) =>
    request('/price-list/brands', { method: 'POST', body: JSON.stringify({ name }) }),

  deletePriceListBrand: (id: string) =>
    request(`/price-list/brands/${id}`, { method: 'DELETE' }),

  listPriceListModels: (brandId: string) =>
    request<{ _id: string; name: string; brandId: string }[]>(
      `/price-list/brands/${brandId}/models`,
    ),

  createPriceListModel: (brandId: string, name: string) =>
    request(`/price-list/brands/${brandId}/models`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),

  deletePriceListModel: (id: string) =>
    request(`/price-list/models/${id}`, { method: 'DELETE' }),

  listPriceListIssueTemplates: () =>
    request<{ _id: string; label: string; kind: 'template' | 'custom' }[]>(
      '/price-list/issue-templates',
    ),

  createPriceListIssueTemplate: (label: string, kind: 'template' | 'custom' = 'template') =>
    request('/price-list/issue-templates', {
      method: 'POST',
      body: JSON.stringify({ label, kind }),
    }),

  deletePriceListIssueTemplate: (id: string) =>
    request(`/price-list/issue-templates/${id}`, { method: 'DELETE' }),

  getPriceListMatrix: (brandId: string) =>
    request<{
      brand: { _id: string; name: string };
      models: { _id: string; name: string }[];
      issues: { label: string; kind: string }[];
      prices: Record<string, Record<string, number>>;
    }>(`/price-list/matrix?brandId=${encodeURIComponent(brandId)}`),

  bulkSavePriceListMatrix: (body: {
    brandId: string;
    entries: { modelId: string; issue: string; priceIncVat?: number | null }[];
    newIssues?: string[];
  }) =>
    request<{ saved: number }>('/price-list/matrix/bulk', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  listWorkOrders: (status?: string) =>
    request(`/work-orders${status ? `?status=${status}` : ''}`),

  listPayableWorkOrders: () =>
    request<{
      repairProductId: string;
      orders: {
        _id: string;
        docNumber: string;
        customerPhone?: string;
        customerName?: string;
        deviceBrand?: string;
        deviceModel?: string;
        issueDescription?: string;
        quotedPriceIncVat: number;
      }[];
    }>('/work-orders/payable'),
  createWorkOrder: (body: Record<string, unknown>) =>
    request<{ _id: string; docNumber: string }>('/work-orders', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  fetchWorkOrderReceiptHtml: async (
    workOrderId: string,
    copy: 'customer' | 'shop',
  ) => {
    const res = await fetch(
      `${BASE}/work-orders/${workOrderId}/receipt?copy=${copy}`,
      { headers: headers() as Record<string, string> },
    );
    if (!res.ok) throw new Error('Failed to load repair receipt');
    return res.text();
  },
  transitionWorkOrder: (
    id: string,
    status: string,
    paymentOrderId?: string,
    completionResult?: 'successful' | 'failed',
  ) =>
    request(`/work-orders/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ status, paymentOrderId, completionResult }),
    }),

  listPreorders: () => request('/preorders'),
  createPreorder: (body: Record<string, unknown>) =>
    request('/preorders', { method: 'POST', body: JSON.stringify(body) }),
  markPreorderArrived: (id: string, body: { notifyVia: 'email' | 'sms' | 'both' }) =>
    request(`/preorders/${id}/arrived`, { method: 'POST', body: JSON.stringify(body) }),
  markPreorderCompleted: (id: string) =>
    request(`/preorders/${id}/complete`, { method: 'POST', body: '{}' }),
  cancelPreorder: (id: string) =>
    request(`/preorders/${id}/cancel`, { method: 'POST', body: '{}' }),

  listB2bOrders: (role: 'seller' | 'buyer') =>
    request(`/b2b/orders?role=${role}`),
  createB2bOrder: (body: Record<string, unknown>) =>
    request('/b2b/orders', { method: 'POST', body: JSON.stringify(body) }),
  transitionB2bOrder: (id: string, status: string) =>
    request(`/b2b/orders/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),
  updateB2bPayment: (id: string, body: Record<string, unknown>) =>
    request(`/b2b/orders/${id}/payment`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  listInvoices: () => request('/invoices'),
  getInvoice: (id: string) => request(`/invoices/${id}`),

  listTransfers: () => request('/transfers'),
  createTransfer: (body: Record<string, unknown>) =>
    request('/transfers', { method: 'POST', body: JSON.stringify(body) }),
  transitionTransfer: (id: string, status: string) =>
    request(`/transfers/${id}/transition`, {
      method: 'POST',
      body: JSON.stringify({ status }),
    }),

  fetchTransferPickListHtml: async (id: string) => {
    const res = await fetch(`${BASE}/transfers/${id}/pick-list`, {
      headers: headers() as Record<string, string>,
    });
    if (!res.ok) throw new Error('Pick list failed');
    return res.text();
  },

  fetchTransferPickListPdf: async (id: string) => {
    const res = await fetch(`${BASE}/transfers/${id}/pick-list.pdf`, {
      headers: headers() as Record<string, string>,
    });
    if (!res.ok) throw new Error('Pick list PDF failed');
    return res.blob();
  },

  getDailyReport: (date?: string) =>
    request(`/reports/daily${date ? `?date=${date}` : ''}`),
  regenerateDailyReport: (date?: string) =>
    request(`/reports/daily/regenerate${date ? `?date=${date}` : ''}`, {
      method: 'POST',
      body: '{}',
    }),

  getCompanyReport: (date?: string) =>
    request(`/reports/company${date ? `?date=${date}` : ''}`),

  getSalesReport: (from: string, to: string) =>
    request(
      `/reports/sales?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
    ),

  downloadDailyReportCsv: async (date?: string) => {
    const d = date ?? new Date().toISOString().slice(0, 10);
    const res = await fetch(
      `${BASE}/reports/daily/export.csv${date ? `?date=${date}` : ''}`,
      { headers: headers() as Record<string, string> },
    );
    if (!res.ok) throw new Error('CSV export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `daily-${d}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  downloadRangeReportCsv: async (from: string, to: string) => {
    const res = await fetch(
      `${BASE}/reports/range/export.csv?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`,
      { headers: headers() as Record<string, string> },
    );
    if (!res.ok) throw new Error('CSV export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sales-${from}-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  listAuditActions: (opts?: { from?: string; to?: string }) => {
    const q = new URLSearchParams();
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    const qs = q.toString();
    return request<string[]>(`/audit/actions${qs ? `?${qs}` : ''}`);
  },

  listAudit: (opts?: {
    from?: string;
    to?: string;
    limit?: number;
    before?: string;
    action?: string;
  }) => {
    const q = new URLSearchParams();
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    if (opts?.limit) q.set('limit', String(opts.limit));
    if (opts?.before) q.set('before', opts.before);
    if (opts?.action) q.set('action', opts.action);
    const qs = q.toString();
    return request<{
      events: {
        _id: string;
        createdAt: string;
        action: string;
        entityType: string;
        entityId?: string;
        userEmail?: string;
        userDisplayName?: string;
        metadata?: Record<string, unknown>;
      }[];
      nextCursor: string | null;
    }>(`/audit${qs ? `?${qs}` : ''}`);
  },

  downloadAuditCsv: async (opts?: { from?: string; to?: string; action?: string }) => {
    const q = new URLSearchParams();
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    if (opts?.action) q.set('action', opts.action);
    const qs = q.toString();
    const res = await fetch(`${BASE}/audit/export.csv${qs ? `?${qs}` : ''}`, {
      headers: headers() as Record<string, string>,
    });
    if (!res.ok) throw new Error('Audit CSV export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-${opts?.from ?? 'export'}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  downloadCompanyReportCsv: async (date?: string) => {
    const d = date ?? new Date().toISOString().slice(0, 10);
    const res = await fetch(
      `${BASE}/reports/company/export.csv${date ? `?date=${date}` : ''}`,
      { headers: headers() as Record<string, string> },
    );
    if (!res.ok) throw new Error('CSV export failed');
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `company-${d}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  emailInvoice: (id: string, to: string) =>
    request<{ sent: boolean; mode: string }>(`/invoices/${id}/email`, {
      method: 'POST',
      body: JSON.stringify({ to }),
    }),

  emailReceipt: (orderId: string, to: string) =>
    request<{ sent: boolean; mode: string }>(`/pos/orders/${orderId}/email`, {
      method: 'POST',
      body: JSON.stringify({ to }),
    }),

  listPlans: () => request('/subscription/plans'),
  getBilling: () => request('/subscription/billing'),
  checkout: (planId: string, successUrl: string, cancelUrl: string) =>
    request<{ url: string }>('/subscription/checkout', {
      method: 'POST',
      body: JSON.stringify({ planId, successUrl, cancelUrl }),
    }),
  activateFreePlan: (planId: string) =>
    request('/subscription/activate-free', {
      method: 'POST',
      body: JSON.stringify({ planId }),
    }),

  adminListPlans: () => request('/admin/plans'),
  adminListCompanies: () =>
    request<{ _id: string; name: string }[]>('/admin/companies'),
  adminSeedPlans: () => request('/admin/plans/seed', { method: 'POST', body: '{}' }),
  adminListAudit: (opts?: {
    from?: string;
    to?: string;
    limit?: number;
    before?: string;
    action?: string;
    companyId?: string;
  }) => {
    const q = new URLSearchParams();
    if (opts?.from) q.set('from', opts.from);
    if (opts?.to) q.set('to', opts.to);
    if (opts?.limit) q.set('limit', String(opts.limit));
    if (opts?.before) q.set('before', opts.before);
    if (opts?.action) q.set('action', opts.action);
    if (opts?.companyId) q.set('companyId', opts.companyId);
    const qs = q.toString();
    return request<{
      events: {
        _id: string;
        createdAt: string;
        action: string;
        entityType: string;
        companyId: string;
        companyName?: string;
        userEmail?: string;
        userDisplayName?: string;
        metadata?: Record<string, unknown>;
      }[];
      nextCursor: string | null;
    }>(`/admin/audit${qs ? `?${qs}` : ''}`);
  },

  adminListWebhookDeliveries: (
    opts?: { companyId?: string; event?: string; status?: 'success' | 'failed' },
  ) => {
    const q = new URLSearchParams();
    if (opts?.companyId) q.set('companyId', opts.companyId);
    if (opts?.event) q.set('event', opts.event);
    if (opts?.status) q.set('status', opts.status);
    const qs = q.toString();
    return request<
      {
        _id: string;
        companyId: string;
        companyName?: string;
        event: string;
        status: string;
        attempts: number;
        httpStatus?: number;
        lastError?: string;
        createdAt: string;
      }[]
    >(`/admin/webhook/deliveries${qs ? `?${qs}` : ''}`);
  },

  adminMaintenanceStatus: () =>
    request<{
      auditAutoPurgeEnabled: boolean;
      auditAutoPurgeHours: number;
      lastAuditPurgeAt: string | null;
      lastAuditPurgeDeleted: number;
      lastAuditPurgeCompanies: number;
    }>('/admin/maintenance/status'),

  adminPurgeAllAudit: () =>
    request<{ companies: number; deleted: number; at?: string }>(
      '/admin/maintenance/audit-purge-all',
      { method: 'POST', body: '{}' },
    ),

  generateInvoicePdf: (id: string) =>
    request<{ storageKey: string; generatedAt: string; cached?: boolean }>(
      `/invoices/${id}/pdf`,
      { method: 'POST', body: '{}' },
    ),

  fetchInvoicePdfBlob: async (id: string) => {
    const res = await fetch(`${BASE}/invoices/${id}/pdf`, {
      headers: headers() as Record<string, string>,
    });
    if (!res.ok) throw new Error('Failed to load PDF');
    return res.blob();
  },

  fetchInvoicePrintHtml: async (id: string) => {
    const res = await fetch(`${BASE}/invoices/${id}/print`, {
      headers: headers() as Record<string, string>,
    });
    if (!res.ok) throw new Error('Failed to load invoice');
    return res.text();
  },

  listChains: () =>
    request<
      {
        _id: string;
        name: string;
        memberStoreIds: string[];
        members?: { storeId: string; storeName: string; companyName: string }[];
      }[]
    >('/chains'),

  listChainMemberStores: () =>
    request<
      {
        _id: string;
        name: string;
        companyId: string;
        companyName: string;
        warehouseEnabled?: boolean;
      }[]
    >('/chains/picker/stores'),

  getChain: (id: string) => request(`/chains/${id}`),

  createChain: (name: string, storeIds: string[]) =>
    request<{ _id: string; name: string }>('/chains', {
      method: 'POST',
      body: JSON.stringify({ name, storeIds }),
    }),

  updateChain: (chainId: string, body: { name?: string }) =>
    request(`/chains/${chainId}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  updateChainMembers: (chainId: string, storeIds: string[]) =>
    request(`/chains/${chainId}/members`, {
      method: 'PATCH',
      body: JSON.stringify({ storeIds }),
    }),

  addChainShareRule: (
    chainId: string,
    body: { sourceStoreId: string; mode: 'quantity' | 'percent'; value: number },
  ) =>
    request(`/chains/${chainId}/share-rules`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  getChainSharedStock: (chainId: string, viewerStoreId: string) =>
    request<
      {
        sourceStoreId: string;
        productId: string;
        name: string;
        skuCode?: string;
        sharedQuantity: number;
        pricePreTax: number;
        priceLabel: string;
      }[]
    >(`/chains/${chainId}/shared-stock?viewerStoreId=${encodeURIComponent(viewerStoreId)}`),

  getWarehouseScope: (ctx?: RequestContext) =>
    request<{ allowedStoreIds: string[] } | null>('/warehouse/scope', { context: ctx }),

  updateWarehouseScope: (allowedStoreIds: string[], ctx?: RequestContext) =>
    request('/warehouse/scope', {
      method: 'PUT',
      body: JSON.stringify({ allowedStoreIds }),
      context: ctx,
    }),

  getWarehouseCatalog: (warehouseStoreId: string) =>
    request<
      {
        productId: string;
        name: string;
        skuCode?: string;
        quantity: number;
        pricePreTax: number;
        priceLabel: string;
      }[]
    >(`/warehouse/catalog/${warehouseStoreId}`),

  createB2bOrderAsSeller: (
    seller: { companyId: string; storeId: string },
    body: Record<string, unknown>,
  ) =>
    request('/b2b/orders', {
      method: 'POST',
      body: JSON.stringify(body),
      context: { companyId: seller.companyId, storeId: seller.storeId },
    }),
};

