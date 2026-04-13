import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';
import {
  TransactionType,
  WalletTransactionOrmEntity,
} from '../infrastructure/persistence/typeorm/wallet-transaction.orm-entity';
import { WalletOrmEntity } from '../infrastructure/persistence/typeorm/wallet.orm-entity';

/** Initial balance granted on wallet creation: 1000.00 = 100_000 cents */
const INITIAL_BALANCE_CENTS = 100_000n;

@Injectable()
export class WalletService {
  private readonly logger = new Logger(WalletService.name);

  constructor(
    @InjectRepository(WalletOrmEntity)
    private readonly walletRepo: Repository<WalletOrmEntity>,

    @InjectRepository(WalletTransactionOrmEntity)
    private readonly txRepo: Repository<WalletTransactionOrmEntity>,

    private readonly dataSource: DataSource,
  ) {}

  async createWallet(playerId: string, playerName: string): Promise<WalletOrmEntity> {
    const existing = await this.walletRepo.findOne({ where: { playerId } });
    if (existing) throw new ConflictException('Wallet already exists for this player');

    const wallet = this.walletRepo.create({
      id: uuidv4(),
      playerId,
      playerName,
      balance: INITIAL_BALANCE_CENTS,
    });

    const saved = await this.walletRepo.save(wallet);

    await this.txRepo.save(
      this.txRepo.create({
        id: uuidv4(),
        walletId: saved.id,
        type: TransactionType.CREDIT,
        amount: INITIAL_BALANCE_CENTS,
        referenceId: null,
        description: 'Initial balance',
      }),
    );

    return saved;
  }

  async getWallet(playerId: string): Promise<WalletOrmEntity> {
    const wallet = await this.walletRepo.findOne({ where: { playerId } });
    if (!wallet) throw new NotFoundException('Wallet not found');
    return wallet;
  }

  /**
   * Debit (subtract) from wallet balance — atomic with SELECT FOR UPDATE.
   * Returns { success, message } for RPC callers.
   */
  async debit(
    playerId: string,
    amountCents: bigint,
    referenceId: string,
  ): Promise<{ success: boolean; message?: string }> {
    if (amountCents <= 0n) {
      return { success: false, message: 'Amount must be positive' };
    }

    return this.dataSource.transaction(async (manager) => {
      // Lock the row to prevent concurrent debits from overdrawing
      const wallet = await manager
        .createQueryBuilder(WalletOrmEntity, 'w')
        .setLock('pessimistic_write')
        .where('w.player_id = :playerId', { playerId })
        .getOne();

      if (!wallet) {
        return { success: false, message: 'Wallet not found' };
      }
      if (wallet.balance < amountCents) {
        return { success: false, message: 'Insufficient balance' };
      }

      wallet.balance -= amountCents;
      await manager.save(wallet);

      await manager.save(
        manager.create(WalletTransactionOrmEntity, {
          id: uuidv4(),
          walletId: wallet.id,
          type: TransactionType.DEBIT,
          amount: amountCents,
          referenceId,
          description: 'Bet debit',
        }),
      );

      return { success: true };
    });
  }

  /**
   * Credit (add) to wallet balance.
   */
  async credit(
    playerId: string,
    amountCents: bigint,
    referenceId: string,
  ): Promise<{ success: boolean; message?: string }> {
    if (amountCents <= 0n) {
      return { success: false, message: 'Amount must be positive' };
    }

    return this.dataSource.transaction(async (manager) => {
      const wallet = await manager
        .createQueryBuilder(WalletOrmEntity, 'w')
        .setLock('pessimistic_write')
        .where('w.player_id = :playerId', { playerId })
        .getOne();

      if (!wallet) {
        return { success: false, message: 'Wallet not found' };
      }

      wallet.balance += amountCents;
      await manager.save(wallet);

      await manager.save(
        manager.create(WalletTransactionOrmEntity, {
          id: uuidv4(),
          walletId: wallet.id,
          type: TransactionType.CREDIT,
          amount: amountCents,
          referenceId,
          description: 'Cashout credit',
        }),
      );

      return { success: true };
    });
  }
}
