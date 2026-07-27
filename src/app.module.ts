import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RateLimiterModule, RateLimiterGuard } from 'nestjs-rate-limiter';
import { typeOrmConfig } from './database/typeorm.config';
import { CommonModule } from './common/common.module';
import { CustomerModule } from './customer/customer.module';
import { OrderModule } from './order/order.module';
import { NotificationModule } from './notification/notification.module';
import { CurrentUserInterceptor } from './common/audit/current-user.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRoot(typeOrmConfig),
    EventEmitterModule.forRoot(),
    RateLimiterModule.register({
      points: Number(process.env.RATE_LIMIT_POINTS ?? 100),
      duration: Number(process.env.RATE_LIMIT_DURATION_SECONDS ?? 60),
    }),
    CommonModule,
    CustomerModule,
    OrderModule,
    NotificationModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: RateLimiterGuard },
    { provide: APP_INTERCEPTOR, useClass: CurrentUserInterceptor },
  ],
})
export class AppModule {}
