import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { WalletTransactionOrmEntity } from './wallet-transaction.orm-entity';

@Entity('wallets')
export class WalletOrmEntity {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true, name: 'player_id' })
  playerId: string;

  @Column({ name: 'player_name' })
  playerName: string;

  /** Balance in cents — BIGINT, never floating point. */
  @Column({
    type: 'bigint',
    default: '0',
    transformer: {
      to: (v: bigint) => v.toString(),
      from: (v: string) => BigInt(v),
    },
  })
  balance: bigint;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;

  @OneToMany(() => WalletTransactionOrmEntity, (tx) => tx.wallet)
  transactions: WalletTransactionOrmEntity[];
}
