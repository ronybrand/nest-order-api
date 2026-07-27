import { Module } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { RateLimiterModule, RateLimiterGuard } from 'nestjs-rate-limiter';
import { typeOrmConfig } from './database/typeorm.config';
import { envConfig, EnvConfig } from './config/env.config';
import { CommonModule } from './common/common.module';
import { CustomerModule } from './customer/customer.module';
import { OrderModule } from './order/order.module';
import { NotificationModule } from './notification/notification.module';
import { CurrentUserInterceptor } from './common/audit/current-user.interceptor';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [envConfig] }),
    TypeOrmModule.forRoot(typeOrmConfig),
    EventEmitterModule.forRoot(),
    RateLimiterModule.registerAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const rateLimit = configService.get<EnvConfig['rateLimit']>('env.rateLimit');
        return { points: rateLimit?.points, duration: rateLimit?.duration };
      },
    }),
    CommonModule,
    CustomerModule,
    OrderModule,
    NotificationModule,
  ],
  providers: [
    // RateLimiterGuard é global: protege todos os endpoints por padrão contra abuso.
    // JwtAuthGuard/RolesGuard NÃO são globais aqui - são aplicados por controller
    // (ver customer.controller.ts / order.controller.ts) porque nem toda rota exige
    // autenticação, e a ordem @UseGuards(JwtAuthGuard, RolesGuard) importa: RolesGuard
    // lê `request.user`, que só existe depois que JwtAuthGuard (Passport) autentica.
    { provide: APP_GUARD, useClass: RateLimiterGuard },
    // CurrentUserInterceptor roda depois dos guards (guards -> interceptors no ciclo
    // do Nest), garantindo que `request.user` já esteja resolvido antes de popular o
    // AsyncLocalStorage usado pelo audit trail.
    { provide: APP_INTERCEPTOR, useClass: CurrentUserInterceptor },
  ],
})
export class AppModule {}
