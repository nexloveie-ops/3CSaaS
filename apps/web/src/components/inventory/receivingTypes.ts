export type CatalogProduct = {
  _id: string;
  name: string;
  productType: string;
  retailPrice?: number;
  costPrice: number;
  variantDimensions?: { name: string; values: string[] }[];
};

export type InboundNewProductPayload = {
  productType: 'simple' | 'serialized' | 'sku';
  name: string;
  taxCategoryId: string;
  costPrice: number;
  catalogCategoryId?: string;
  retailPrice?: number;
  skuCode?: string;
};

export type ReceivingCartLine = {
  key: string;
  productName: string;
  productType: string;
  quantity: number;
  productId?: string;
  serialNumbers?: string[];
  unitCost?: number;
  retailPrice?: number;
  /** Correct on-hand before receive qty is added. */
  stockOnHand?: number;
  isNew?: boolean;
  newProduct?: InboundNewProductPayload;
};

export type ReceivingDraft = {
  supplier: string;
  notes: string;
  receivedDate: string;
  lines: ReceivingCartLine[];
};

export type PositionRow = {
  productId:
    | string
    | {
        _id: string;
        name: string;
        productType: string;
        parentProductId?: string | { _id: string; name: string } | null;
        variantValues?: string[];
      };
  quantity: number;
};

export function productIdOf(row: PositionRow): string {
  return typeof row.productId === 'object' ? row.productId._id : String(row.productId);
}
