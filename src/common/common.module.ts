import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { ConfigModule } from '@nestjs/config';
import { JwtStrategy } from './auth/jwt.strategy';
import { AuditSubscriber } from './audit/audit.subscriber';
import { SearchService } from './filter/search.service';

@Module({
  imports: [PassportModule, ConfigModule],
  providers: [JwtStrategy, AuditSubscriber, SearchService],
  exports: [SearchService],
})
export class CommonModule {}
