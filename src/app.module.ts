import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { APP_GUARD, APP_INTERCEPTOR } from '@nestjs/core';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { typeOrmConfig } from './database/typeorm.config';
import { envConfig, getEnv } from './config/env.config';
import { CommonModule } from './common/common.module';
import { CustomerModule } from './customer/customer.module';
import { OrderModule } from './order/order.module';
import { NotificationModule } from './notification/notification.module';
import { CurrentUserInterceptor } from './common/audit/current-user.interceptor';
import { RequestIdMiddleware } from './common/http/request-id.middleware';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [envConfig] }),
    TypeOrmModule.forRoot(typeOrmConfig),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const rateLimit = getEnv(configService, 'rateLimit');
        // ttl em ms; storage em memória (default) expira as janelas
        // automaticamente, sem exigir limpeza manual.
        return { throttlers: [{ limit: rateLimit.points, ttl: rateLimit.duration * 1000 }] };
      },
    }),
    CommonModule,
    CustomerModule,
    OrderModule,
    NotificationModule,
  ],
  providers: [
    // ThrottlerGuard é global: protege todos os endpoints por padrão contra abuso.
    // Resolve o IP do cliente via req.ip, que respeita a allowlist de proxies
    // confiáveis configurada em `trust proxy` (ver configure-app.ts) - só
    // confia em X-Forwarded-For quando o hop direto é um proxy conhecido.
    // JwtAuthGuard/RolesGuard NÃO são globais aqui - são aplicados por controller
    // (ver customer.controller.ts / order.controller.ts) porque nem toda rota exige
    // autenticação, e a ordem @UseGuards(JwtAuthGuard, RolesGuard) importa: RolesGuard
    // lê `request.user`, que só existe depois que JwtAuthGuard (Passport) autentica.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    // CurrentUserInterceptor roda depois dos guards (guards -> interceptors no ciclo
    // do Nest), garantindo que `request.user` já esteja resolvido antes de popular o
    // AsyncLocalStorage usado pelo audit trail.
    { provide: APP_INTERCEPTOR, useClass: CurrentUserInterceptor },
  ],
})
export class AppModule implements NestModule {
  // Middleware (nao guard/interceptor) porque precisa rodar antes do
  // ThrottlerGuard/JwtAuthGuard - todo request, inclusive os rejeitados por
  // auth, ganha um request id correlacionavel em logs e na resposta de erro.
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
