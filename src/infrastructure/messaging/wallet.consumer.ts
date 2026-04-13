import { Controller, Logger } from '@nestjs/common';
import { MessagePattern, Payload } from '@nestjs/microservices';
import { WalletService } from '../../application/wallet.service';
import { WALLET_PATTERNS } from './rabbitmq.constants';

interface DebitPayload {
  playerId: string;
  amount: string; // cents as string
  referenceId: string;
}

interface CreditPayload {
  playerId: string;
  amount: string; // cents as string
  referenceId: string;
}

@Controller()
export class WalletConsumer {
  private readonly logger = new Logger(WalletConsumer.name);

  constructor(private readonly walletService: WalletService) {}

  @MessagePattern(WALLET_PATTERNS.DEBIT)
  async handleDebit(@Payload() payload: DebitPayload) {
    this.logger.debug(`Debit request: playerId=${payload.playerId} amount=${payload.amount}`);
    try {
      return await this.walletService.debit(
        payload.playerId,
        BigInt(payload.amount),
        payload.referenceId,
      );
    } catch (err: unknown) {
      this.logger.error('Debit handler error', err);
      return { success: false, message: 'Internal error' };
    }
  }

  @MessagePattern(WALLET_PATTERNS.CREDIT)
  async handleCredit(@Payload() payload: CreditPayload) {
    this.logger.debug(`Credit request: playerId=${payload.playerId} amount=${payload.amount}`);
    try {
      return await this.walletService.credit(
        payload.playerId,
        BigInt(payload.amount),
        payload.referenceId,
      );
    } catch (err: unknown) {
      this.logger.error('Credit handler error', err);
      return { success: false, message: 'Internal error' };
    }
  }
}
