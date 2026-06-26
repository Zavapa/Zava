import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  Post,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Post()
  @HttpCode(201)
  async register(@Body() dto: CreateUserDto) {
    const user = await this.users.create(dto);
    return this.shape(user);
  }

  @Get(':wallet')
  async getByWallet(@Param('wallet') wallet: string) {
    const user = await this.users.findByWallet(wallet);
    return this.shape(user);
  }

  private shape(u: import('./user.entity').User) {
    return {
      id: u.id,
      wallet: u.wallet,
      displayName: u.displayName,
      createdAt: u.createdAt,
    };
  }
}
