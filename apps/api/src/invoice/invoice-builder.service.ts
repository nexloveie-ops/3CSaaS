import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import {
  B2bOrder,
  B2bOrderDocument,
  Company,
  CompanyDocument,
  Invoice,
  InvoiceDocument,
  InvoiceParty,
} from '@lz3c/db';
import { calculateLineTax, TaxScheme } from '@lz3c/shared';
import { DocumentSequenceService } from '../common/services/document-sequence.service';

@Injectable()
export class InvoiceBuilderService {
  constructor(
    @InjectModel(Invoice.name) private invoiceModel: Model<InvoiceDocument>,
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    private docSeq: DocumentSequenceService,
  ) {}

  async createB2bPair(order: B2bOrderDocument) {
    const [sellerCo, buyerCo] = await Promise.all([
      this.companyModel.findById(order.sellerCompanyId).lean(),
      this.companyModel.findById(order.buyerCompanyId).lean(),
    ]);
    if (!sellerCo || !buyerCo) throw new Error('Company not found for invoice');

    const sellerParty = partyFromCompany(sellerCo);
    const buyerParty = partyFromCompany(buyerCo);

    const sellerLines = [];
    const buyerLines = [];
    let sellerVat = 0;
    let sellerPayable = 0;
    let buyerNet = 0;

    for (const line of order.lines) {
      const sellerTax = calculateLineTax({
        scheme: line.taxScheme as TaxScheme,
        wholesalePreTax: line.unitWholesalePreTax,
        costPreTax: line.costPreTax,
        perspective: 'b2b_seller',
        quantity: line.quantity,
      });
      const buyerTax = calculateLineTax({
        scheme: line.taxScheme as TaxScheme,
        wholesalePreTax: line.unitWholesalePreTax,
        costPreTax: line.costPreTax,
        perspective: 'b2b_buyer',
        quantity: line.quantity,
      });

      sellerLines.push({
        productName: line.productName,
        quantity: line.quantity,
        unitPricePreTax: line.unitWholesalePreTax,
        lineNetPreTax: sellerTax.netPreTax,
        lineVat: sellerTax.vatAmount,
      });
      buyerLines.push({
        productName: line.productName,
        quantity: line.quantity,
        unitPricePreTax: line.unitWholesalePreTax,
        lineNetPreTax: buyerTax.netPreTax,
        lineVat: 0,
      });
      sellerVat += sellerTax.vatAmount;
      sellerPayable += sellerTax.gross;
      buyerNet += buyerTax.netPreTax;
    }

    const sellerDoc = await this.docSeq.next(
      order.sellerCompanyId.toString(),
      'invoice_b2b',
    );
    const buyerDoc = await this.docSeq.next(
      order.buyerCompanyId.toString(),
      'invoice_b2b_buyer',
    );

    const sellerInv = await this.invoiceModel.create({
      companyId: order.sellerCompanyId,
      docNumber: sellerDoc,
      docType: 'invoice_b2b_seller',
      perspective: 'seller',
      b2bOrderId: order._id,
      seller: sellerParty,
      buyer: buyerParty,
      lines: sellerLines,
      subtotalPreTax: round2(sellerPayable - sellerVat),
      totalVat: round2(sellerVat),
      totalPayable: round2(sellerPayable),
    });

    const buyerInv = await this.invoiceModel.create({
      companyId: order.buyerCompanyId,
      docNumber: buyerDoc,
      docType: 'invoice_b2b_buyer',
      perspective: 'buyer',
      b2bOrderId: order._id,
      seller: sellerParty,
      buyer: buyerParty,
      lines: buyerLines,
      subtotalPreTax: round2(buyerNet),
      totalVat: 0,
      totalPayable: round2(buyerNet),
    });

    return { sellerInv, buyerInv };
  }
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

function partyFromCompany(c: {
  name: string;
  legalName?: string;
  vatNumber?: string;
  address?: string;
  contactName?: string;
  contactPhone?: string;
  contactEmail?: string;
  bankAccount?: string;
}): InvoiceParty {
  return {
    name: c.name,
    legalName: c.legalName,
    vatNumber: c.vatNumber,
    address: c.address,
    contactName: c.contactName,
    contactPhone: c.contactPhone,
    contactEmail: c.contactEmail,
    bankAccount: c.bankAccount,
  };
}
