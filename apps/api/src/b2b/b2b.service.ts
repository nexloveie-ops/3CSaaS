import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  B2bOrder,
  B2bOrderDocument,
  Company,
  CompanyDocument,
  Product,
  ProductDocument,
  SerialUnit,
  SerialUnitDocument,
  Store,
  StoreDocument,
  TaxCategory,
  TaxCategoryDocument,
} from '@lz3c/db';
import { AuditService } from '../common/services/audit.service';
import { DocumentSequenceService } from '../common/services/document-sequence.service';
import { CompanyService } from '../company/company.service';
import { InventoryService } from '../inventory/inventory.service';
import { InvoiceBuilderService } from '../invoice/invoice-builder.service';
import { InvoicePdfService } from '../invoice/invoice-pdf.service';
import { CreateB2bOrderDto } from './dto/create-b2b-order.dto';
import { UpdateB2bPaymentDto } from './dto/update-b2b-payment.dto';
import { TransitionB2bDto } from './dto/transition-b2b.dto';

const TRANSITIONS: Record<string, string[]> = {
  draft: ['confirmed', 'cancelled'],
  confirmed: ['shipped', 'cancelled'],
  shipped: ['received'],
  received: ['invoiced'],
};

@Injectable()
export class B2bService {
  constructor(
    @InjectModel(B2bOrder.name) private b2bModel: Model<B2bOrderDocument>,
    @InjectModel(Product.name) private productModel: Model<ProductDocument>,
    @InjectModel(TaxCategory.name) private taxModel: Model<TaxCategoryDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(SerialUnit.name) private serialModel: Model<SerialUnitDocument>,
    private companyService: CompanyService,
    private docSeq: DocumentSequenceService,
    private inventoryService: InventoryService,
    private invoiceBuilder: InvoiceBuilderService,
    private invoicePdf: InvoicePdfService,
    private audit: AuditService,
  ) {}

  async list(userId: string, companyId: string, role: 'seller' | 'buyer') {
    await this.companyService.assertMember(userId, companyId);
    const field =
      role === 'seller' ? 'sellerCompanyId' : 'buyerCompanyId';
    return this.b2bModel
      .find({ [field]: new Types.ObjectId(companyId) })
      .sort({ updatedAt: -1 })
      .lean();
  }

  async create(
    userId: string,
    sellerCompanyId: string,
    sellerStoreId: string,
    dto: CreateB2bOrderDto,
  ) {
    await this.companyService.assertMember(userId, sellerCompanyId);
    const buyerStore = await this.storeModel.findById(dto.buyerStoreId);
    if (!buyerStore) throw new NotFoundException('Buyer store not found');

    const lines = [];
    let totalNet = 0;

    for (const line of dto.lines) {
      const product = await this.productModel.findOne({
        _id: line.productId,
        companyId: new Types.ObjectId(sellerCompanyId),
      });
      if (!product) throw new NotFoundException(`Product ${line.productId}`);
      const tax = await this.taxModel.findById(product.taxCategoryId).lean();
      const wholesale = line.unitWholesalePreTax ?? product.wholesalePrice ?? product.costPrice;
      lines.push({
        productId: product._id,
        productName: product.name,
        quantity: line.quantity,
        unitWholesalePreTax: wholesale,
        costPreTax: product.costPrice,
        taxScheme: tax?.scheme ?? 'standard_23',
        serialUnitId: line.serialUnitId
          ? new Types.ObjectId(line.serialUnitId)
          : undefined,
      });
      totalNet += wholesale * line.quantity;
    }

    const docNumber = await this.docSeq.next(sellerCompanyId, 'b2b_order');
    const order = await this.b2bModel.create({
      docNumber,
      sellerCompanyId: new Types.ObjectId(sellerCompanyId),
      sellerStoreId: new Types.ObjectId(sellerStoreId),
      buyerCompanyId: buyerStore.companyId,
      buyerStoreId: buyerStore._id,
      status: 'draft',
      lines,
      totalNetPreTax: totalNet,
      createdByUserId: new Types.ObjectId(userId),
    });

    void this.audit.log({
      companyId: sellerCompanyId,
      userId,
      storeId: sellerStoreId,
      action: 'b2b.create',
      entityType: 'b2b_order',
      entityId: order._id.toString(),
      metadata: { docNumber, buyerStoreId: dto.buyerStoreId },
    });

    return order;
  }

  async transition(
    userId: string,
    companyId: string,
    id: string,
    dto: TransitionB2bDto,
  ) {
    const order = await this.getOrder(userId, companyId, id);
    if (!TRANSITIONS[order.status]?.includes(dto.status)) {
      throw new BadRequestException(
        `Cannot go from ${order.status} to ${dto.status}`,
      );
    }

    if (dto.status === 'received') {
      await this.applyStockTransfer(order);
    }

    if (dto.status === 'invoiced') {
      const { sellerInv, buyerInv } = await this.invoiceBuilder.createB2bPair(order);
      order.sellerInvoiceId = sellerInv._id;
      order.buyerInvoiceId = buyerInv._id;
      void this.invoicePdf
        .ensureStored(sellerInv._id.toString(), order.sellerCompanyId.toString())
        .catch((err) => console.warn('Seller PDF:', (err as Error).message));
      void this.invoicePdf
        .ensureStored(buyerInv._id.toString(), order.buyerCompanyId.toString())
        .catch((err) => console.warn('Buyer PDF:', (err as Error).message));
    }

    const prevStatus = order.status;
    order.status = dto.status;
    await order.save();
    void this.audit.log({
      companyId,
      userId,
      storeId: order.sellerStoreId?.toString(),
      action: 'b2b.transition',
      entityType: 'b2b_order',
      entityId: order._id.toString(),
      metadata: { from: prevStatus, to: dto.status, docNumber: order.docNumber },
    });
    return order;
  }

  async updatePayment(
    userId: string,
    companyId: string,
    id: string,
    dto: UpdateB2bPaymentDto,
  ) {
    const order = await this.getOrder(userId, companyId, id);
    if (order.status !== 'invoiced') {
      throw new BadRequestException('Payment only after invoiced');
    }
    order.paymentStatus = dto.paymentStatus;
    order.paymentMethod = dto.paymentMethod;
    await order.save();
    return order;
  }

  private async applyStockTransfer(order: B2bOrderDocument) {
    for (const line of order.lines) {
      const buyerProductId = await this.resolveBuyerProductId(order, line.productId);

      if (line.serialUnitId) {
        const unit = await this.serialModel.findById(line.serialUnitId);
        if (unit) {
          unit.currentStoreId = order.buyerStoreId;
          unit.purchaseCost = line.unitWholesalePreTax;
          await unit.save();
        }
      } else {
        await this.inventoryService.decrementStock(
          order.sellerCompanyId.toString(),
          order.sellerStoreId.toString(),
          line.productId.toString(),
          line.quantity,
        );
        await this.inventoryService.adjustQty(
          order.buyerCompanyId.toString(),
          order.buyerStoreId.toString(),
          buyerProductId,
          line.quantity,
        );
      }
    }
  }

  private async resolveBuyerProductId(
    order: B2bOrderDocument,
    sellerProductId: Types.ObjectId,
  ): Promise<string> {
    if (order.sellerCompanyId.equals(order.buyerCompanyId)) {
      return sellerProductId.toString();
    }
    const sellerProduct = await this.productModel.findById(sellerProductId).lean();
    if (!sellerProduct) throw new NotFoundException('Seller product missing');
    const buyerProduct = await this.productModel.findOne({
      companyId: order.buyerCompanyId,
      $or: [
        ...(sellerProduct.skuCode ? [{ skuCode: sellerProduct.skuCode }] : []),
        { name: sellerProduct.name },
      ],
    });
    if (!buyerProduct) {
      throw new BadRequestException(
        `Buyer company needs a matching product for: ${sellerProduct.name}`,
      );
    }
    return buyerProduct._id.toString();
  }

  private async getOrder(userId: string, companyId: string, id: string) {
    await this.companyService.assertMember(userId, companyId);
    const order = await this.b2bModel.findById(id);
    if (!order) throw new NotFoundException('B2B order not found');
    const cid = new Types.ObjectId(companyId);
    if (
      !order.sellerCompanyId.equals(cid) &&
      !order.buyerCompanyId.equals(cid)
    ) {
      throw new BadRequestException('Not party to this order');
    }
    return order;
  }
}
