import { Controller, Get } from '@nestjs/common';
import { InjectConnection } from '@nestjs/mongoose';
import { Connection } from 'mongoose';

@Controller('health')
export class HealthController {
  constructor(@InjectConnection() private readonly connection: Connection) {}

  @Get()
  async check() {
    const mongoState = this.connection.readyState;
    const mongoReady = mongoState === 1;
    let ping: unknown = null;
    if (mongoReady && this.connection.db) {
      ping = await this.connection.db.admin().command({ ping: 1 });
    }
    return {
      status: mongoReady ? 'ok' : 'degraded',
      mongo: {
        ready: mongoReady,
        state: mongoState,
        db: this.connection.name,
        ping,
      },
      timestamp: new Date().toISOString(),
    };
  }
}
