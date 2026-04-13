import {
  Column,
  CreateDateColumn,
  Entity,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { WalletOrmEntity } from './wallet.orm-entity';

export enum TransactionType {
  DEBIT = 'DEBIT',
  CREDIT = 'CREDIT',
}

@Entity('wallet_transactions')
export class WalletTransactionOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'wallet_id' })
  walletId: string;

  @ManyToOne(() => WalletOrmEntity, (wallet) => wallet.transactions)
  wallet: WalletOrmEntity;

  @Column({ type: 'varchar', length: 10 })
  type: TransactionType;

  /** Amount in cents — always positive. */
  @Column({
    type: 'bigint',
    transformer: {
      to: (v: bigint) => v.toString(),
      from: (v: string) => BigInt(v),
    },
  })
  amount: bigint;

  /** External reference (betId, etc.) */
  @Column({ nullable: true, name: 'reference_id' })
  referenceId: string | null;

  @Column({ nullable: true })
  description: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
