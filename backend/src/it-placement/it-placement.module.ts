import { Module } from '@nestjs/common';
import { ItPlacementController } from './it-placement.controller';
import { ItPlacementService } from './it-placement.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ItPlacementController],
  providers: [ItPlacementService],
})
export class ItPlacementModule {}
