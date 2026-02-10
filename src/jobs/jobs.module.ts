import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { BullModule } from '@nestjs/bullmq';
import { StripeEventsProcessor } from './stripe-events.processor';

function redisConnectionFromUrl(redisUrl: string) {
  const url = new URL(redisUrl);
  const port = url.port ? Number(url.port) : 6379;
  const db =
    url.pathname && url.pathname !== '/'
      ? Number(url.pathname.replace('/', ''))
      : 0;

  return {
    host: url.hostname,
    port,
    username: url.username || undefined,
    password: url.password || undefined,
    db: Number.isFinite(db) ? db : 0,
    tls: url.protocol === 'rediss:' ? {} : undefined,
  };
}

@Module({
  imports: [
    ConfigModule,
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const redisUrl = configService.getOrThrow<string>('REDIS_URL');
        return {
          connection: redisConnectionFromUrl(redisUrl),
        };
      },
    }),
    BullModule.registerQueue({
      name: 'stripe',
    }),
  ],
  providers: [StripeEventsProcessor],
  exports: [BullModule],
})
export class JobsModule {}
