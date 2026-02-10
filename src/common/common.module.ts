import { Global, Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RolesGuard } from './guards/roles.guard';
import { SessionAuthGuard } from './guards/session-auth.guard';

@Global()
@Module({
  imports: [AuthModule],
  providers: [SessionAuthGuard, RolesGuard],
  exports: [SessionAuthGuard, RolesGuard],
})
export class CommonModule {}
