import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { Company, CompanyDocument, Store, StoreDocument } from '@lz3c/db';
import { feieOpen } from './feie.client';

@Injectable()
export class FeiePrintService {
  constructor(
    @InjectModel(Company.name) private companyModel: Model<CompanyDocument>,
    @InjectModel(Store.name) private storeModel: Model<StoreDocument>,
  ) {}

  async print(companyId: string, storeId: string, content: string) {
    const company = await this.companyModel
      .findById(companyId)
      .select('+feieUkey')
      .lean();
    if (!company) throw new NotFoundException('Company not found');
    const user = company.feieUser?.trim();
    const ukey = company.feieUkey?.trim();
    if (!user || !ukey) throw new BadRequestException('feie_not_configured');

    const store = await this.storeModel.findById(storeId).select('feiePrinterSn').lean();
    const sn = store?.feiePrinterSn?.trim();
    if (!sn) throw new BadRequestException('feie_printer_missing');

    let result: { ret?: number; msg?: string; data?: string };
    try {
      result = await feieOpen(user, ukey, {
        apiname: 'Open_printMsg',
        sn,
        content,
        times: '1',
      });
    } catch {
      throw new BadRequestException('feie_unreachable');
    }
    if (result.ret !== 0) {
      throw new BadRequestException(result.msg?.trim() || 'feie_rejected');
    }
    return { ok: true as const };
  }
}
