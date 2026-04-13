import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { WalletService } from './application/wallet.service';
import { JwtStrategy } from './infrastructure/auth/jwt.strategy';
import { WalletConsumer } from './infrastructure/messaging/wallet.consumer';
import { RABBITMQ_QUEUE } from './infrastructure/messaging/rabbitmq.constants';
import { WalletTransactionOrmEntity } from './infrastructure/persistence/typeorm/wallet-transaction.orm-entity';
import { WalletOrmEntity } from './infrastructure/persistence/typeorm/wallet.orm-entity';
import { WalletsController } from './presentation/controllers/wallets.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),

    TypeOrmModule.forRoot({
      type: 'postgres',
      url: process.env.DATABASE_URL,
      entities: [WalletOrmEntity, WalletTransactionOrmEntity],
      synchronize: true,
      ssl: false,
    }),

    TypeOrmModule.forFeature([WalletOrmEntity, WalletTransactionOrmEntity]),

    PassportModule.register({ defaultStrategy: 'jwt' }),
  ],
  controllers: [WalletsController, WalletConsumer],
  providers: [WalletService, JwtStrategy],
})
export class AppModule {}
