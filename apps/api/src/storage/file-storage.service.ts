import { Injectable, Logger } from '@nestjs/common';
import type { Bucket } from '@google-cloud/storage';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { dirname, join } from 'path';

@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly mode: 'gcs' | 'local';
  private readonly localRoot: string;
  private bucket: Bucket | null = null;

  constructor() {
    if (process.env.GCS_BUCKET) {
      this.mode = 'gcs';
      this.localRoot = '';
    } else {
      this.mode = 'local';
      this.localRoot = process.env.LOCAL_STORAGE_PATH ?? join(process.cwd(), 'data');
      this.logger.log(`File storage: local (${this.localRoot})`);
    }
  }

  isGcs(): boolean {
    return this.mode === 'gcs';
  }

  private async getBucket(): Promise<Bucket> {
    if (!this.bucket) {
      const { Storage } = await import('@google-cloud/storage');
      const storage = new Storage(
        process.env.GCS_PROJECT_ID ? { projectId: process.env.GCS_PROJECT_ID } : undefined,
      );
      this.bucket = storage.bucket(process.env.GCS_BUCKET!);
      this.logger.log(`File storage: GCS bucket ${process.env.GCS_BUCKET}`);
    }
    return this.bucket;
  }

  async save(key: string, data: Buffer, contentType: string): Promise<string> {
    if (this.mode === 'gcs') {
      const bucket = await this.getBucket();
      await bucket.file(key).save(data, {
        contentType,
        resumable: false,
        metadata: { cacheControl: 'private, max-age=3600' },
      });
      return key;
    }
    const full = join(this.localRoot, key);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, data);
    return key;
  }

  async read(key: string): Promise<Buffer | null> {
    try {
      if (this.mode === 'gcs') {
        const bucket = await this.getBucket();
        const file = bucket.file(key);
        const [exists] = await file.exists();
        if (!exists) return null;
        const [buf] = await file.download();
        return buf;
      }
      const full = join(this.localRoot, key);
      return await readFile(full);
    } catch {
      return null;
    }
  }

  async getSignedUrl(key: string, expiresMinutes = 60): Promise<string | null> {
    if (this.mode !== 'gcs') return null;
    const bucket = await this.getBucket();
    const [url] = await bucket.file(key).getSignedUrl({
      version: 'v4',
      action: 'read',
      expires: Date.now() + expiresMinutes * 60 * 1000,
    });
    return url;
  }
}
