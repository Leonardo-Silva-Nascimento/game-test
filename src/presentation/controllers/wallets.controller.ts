import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { WalletService } from '../../application/wallet.service';
import { JwtAuthGuard } from '../../infrastructure/auth/jwt.guard';
import { AuthUser } from '../../infrastructure/auth/jwt.strategy';

interface AuthRequest extends Request {
  user: AuthUser;
}

@ApiTags('Wallets')
@Controller()
export class WalletsController {
  constructor(private readonly walletService: WalletService) {}

  @Get('health')
  check() {
    return { status: 'ok', service: 'wallets' };
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create wallet for authenticated player (grants 1000.00 initial balance)' })
  async createWallet(@Req() req: AuthRequest) {
    const wallet = await this.walletService.createWallet(req.user.id, req.user.username);
    return this.serialize(wallet);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth()
  @Get('me')
  @ApiOperation({ summary: 'Get wallet and balance for authenticated player' })
  async getMyWallet(@Req() req: AuthRequest) {
    const wallet = await this.walletService.getWallet(req.user.id);
    return this.serialize(wallet);
  }

  private serialize(wallet: { id: string; playerId: string; playerName: string; balance: bigint; createdAt: Date }) {
    return {
      id: wallet.id,
      playerId: wallet.playerId,
      playerName: wallet.playerName,
      balance: Number(wallet.balance) / 100, // return as coins
      createdAt: wallet.createdAt,
    };
  }
}
