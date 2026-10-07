import { useEffect, useState } from 'react';
import { useAuthStore } from '../../stores/auth';
import { useContextStore } from '../../stores/context';

function authHeaders(): HeadersInit {
  const token = useAuthStore.getState().token;
  const { companyId, storeId } = useContextStore.getState();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (companyId) headers['X-Company-Id'] = companyId;
  if (storeId) headers['X-Store-Id'] = storeId;
  return headers;
}

function AuthImage({ path }: { path: string }) {
  const [url, setUrl] = useState('');

  useEffect(() => {
    let cancelled = false;
    let objectUrl = '';
    void (async () => {
      const res = await fetch(`/api${path}`, { headers: authHeaders() });
      if (!res.ok || cancelled) return;
      const blob = await res.blob();
      objectUrl = URL.createObjectURL(blob);
      if (!cancelled) setUrl(objectUrl);
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [path]);

  const [open, setOpen] = useState(false);
  if (!url) return null;
  return (
    <>
      <img
        src={url}
        alt=""
        style={{ width: 72, height: 72, objectFit: 'cover', borderRadius: 8, cursor: 'pointer' }}
        onClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          setOpen(true);
        }}
      />
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 80,
            background: 'rgba(0,0,0,0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <img
            src={url}
            alt=""
            style={{ maxWidth: '92vw', maxHeight: '92vh', objectFit: 'contain' }}
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}
    </>
  );
}

export function OrderPhotos({ orderId, photoIds }: { orderId: string; photoIds?: string[] }) {
  if (!photoIds?.length) return null;
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
      {photoIds.map((id) => (
        <AuthImage key={id} path={`/work-orders/${orderId}/photos/${id}`} />
      ))}
    </div>
  );
}
