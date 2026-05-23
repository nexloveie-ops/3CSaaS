import { Injectable } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { DocumentSequence, DocumentSequenceDocument } from '@lz3c/db';
import { formatDocNumber } from '@lz3c/shared';

@Injectable()
export class DocumentSequenceService {
  constructor(
    @InjectModel(DocumentSequence.name)
    private seqModel: Model<DocumentSequenceDocument>,
  ) {}

  async next(companyId: string, docType: string): Promise<string> {
    const year = new Date().getFullYear();
    const updated = await this.seqModel.findOneAndUpdate(
      {
        companyId: new Types.ObjectId(companyId),
        docType,
        year,
      },
      { $inc: { lastNumber: 1 } },
      { upsert: true, new: true },
    );
    return formatDocNumber(docType, year, updated!.lastNumber);
  }
}
