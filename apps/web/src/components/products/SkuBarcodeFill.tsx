import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { api } from '../../lib/api';

type SkuRow = {
  _id: string;
  name: string;
  skuCode?: string;
  costPrice?: number;
  wholesalePrice?: number | null;
  retailPrice?: number;
};

type BarcodeDetectorLike = {
  detect: (source: HTMLVideoElement) => Promise<Array<{ rawValue?: string }>>;
};

function money(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return '—';
  return `€${value.toFixed(2)}`;
}

function SkuBarcodeModal({
  product,
  onClose,
  onSaved,
}: {
  product: SkuRow;
  onClose: () => void;
  onSaved: () => void;
}) {
  const { t } = useTranslation();
  const [barcode, setBarcode] = useState('');
  const [cameraOn, setCameraOn] = useState(false);
  const [cameraNote, setCameraNote] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const stopRef = useRef(false);

  useEffect(() => {
    if (!cameraOn) return;
    const Detector = (window as unknown as { BarcodeDetector?: new (opts?: { formats?: string[] }) => BarcodeDetectorLike })
      .BarcodeDetector;
    if (!Detector || !navigator.mediaDevices?.getUserMedia) {
      setCameraNote(t('products.fillBarcodeCameraUnsupported'));
      setCameraOn(false);
      return;
    }
    let cancelled = false;
    stopRef.current = false;
    const detector = new Detector({
      formats: ['ean_13', 'ean_8', 'code_128', 'code_39', 'qr_code', 'upc_a', 'upc_e', 'itf'],
    });
    void (async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        const tick = async () => {
          if (cancelled || stopRef.current) return;
          try {
            const codes = await detector.detect(video);
            const value = codes[0]?.rawValue?.trim();
            if (value) {
              setBarcode(value);
              setCameraOn(false);
              return;
            }
          } catch {
            /* keep scanning */
          }
          if (!cancelled && !stopRef.current) window.setTimeout(tick, 200);
        };
        void tick();
      } catch {
        if (!cancelled) {
          setCameraNote(t('products.fillBarcodeCameraUnsupported'));
          setCameraOn(false);
        }
      }
    })();
    return () => {
      cancelled = true;
      stopRef.current = true;
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    };
  }, [cameraOn, t]);

  function stopCamera() {
    setCameraOn(false);
  }

  const save = useMutation({
    mutationFn: () => api.updateProduct(product._id, { barcode: barcode.trim() }),
    onSuccess: () => {
      stopCamera();
      onSaved();
    },
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!barcode.trim()) return;
    save.mutate();
  }

  return (
    <div className="pos-modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="pos-modal pos-modal--preorder-create"
        role="dialog"
        aria-labelledby="sku-barcode-title"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="pos-modal-header">
          <h3 id="sku-barcode-title">{product.name}</h3>
          <button type="button" className="pos-modal-close" onClick={onClose} aria-label={t('common.cancel')}>
            ×
          </button>
        </header>
        <form className="pos-modal-body preorder-create-form" onSubmit={onSubmit}>
          <p className="muted" style={{ margin: 0 }}>
            SKU {product.skuCode || '—'}
          </p>
          <p className="muted" style={{ margin: 0 }}>
            {t('products.costPreTax')} {money(product.costPrice)} · {t('products.wholesalePrice')}{' '}
            {money(product.wholesalePrice)} · {t('products.retailIncVat')} {money(product.retailPrice)}
          </p>
          <label className="form-field preorder-form__full">
            <span>{t('products.barcode')}</span>
            <input
              value={barcode}
              onChange={(e) => setBarcode(e.target.value)}
              autoComplete="off"
              autoFocus
              required
            />
          </label>
          {cameraOn && (
            <video
              ref={videoRef}
              muted
              playsInline
              style={{ width: '100%', maxHeight: 220, background: '#111', borderRadius: 8 }}
            />
          )}
          {cameraNote && <p className="status-fail">{cameraNote}</p>}
          {save.error && <p className="status-fail">{(save.error as Error).message}</p>}
          <div className="pos-modal-footer" style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => (cameraOn ? stopCamera() : setCameraOn(true))}
            >
              {cameraOn ? t('products.fillBarcodeStop') : t('products.fillBarcodeScan')}
            </button>
            <button type="submit" className="btn btn-primary" disabled={!barcode.trim() || save.isPending}>
              {t('products.fillBarcodeSave')}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function SkuBarcodeFill() {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<SkuRow | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['products', 'missing-barcode'],
    queryFn: () => api.listProducts({ missingBarcode: true }) as Promise<SkuRow[]>,
  });

  const rows = data ?? [];

  return (
    <section className="section-card">
      {isLoading && <p>{t('common.checking')}</p>}
      {!isLoading && rows.length === 0 && <p className="empty-state">{t('products.fillBarcodeEmpty')}</p>}
      {rows.length > 0 && (
        <div className="pos-product-grid products-catalog-grid">
          {rows.map((p) => (
            <button
              key={p._id}
              type="button"
              className="pos-product-tile"
              onClick={() => setSelected(p)}
            >
              <span className="pos-product-name">{p.name}</span>
              <span className="pos-product-meta">SKU {p.skuCode || '—'}</span>
              <span className="pos-product-price">{money(p.retailPrice ?? p.costPrice)}</span>
            </button>
          ))}
        </div>
      )}
      {selected && (
        <SkuBarcodeModal
          product={selected}
          onClose={() => setSelected(null)}
          onSaved={() => {
            setSelected(null);
            void qc.invalidateQueries({ queryKey: ['products'] });
          }}
        />
      )}
    </section>
  );
}
