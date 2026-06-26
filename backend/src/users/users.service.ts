import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from './user.entity';
import { CreateUserDto } from './dto/create-user.dto';

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User)
    private readonly users: Repository<User>,
  ) {}

  async create(dto: CreateUserDto): Promise<User> {
    const existing = await this.users.findOne({ where: { wallet: dto.wallet } });
    if (existing) {
      throw new ConflictException('Wallet already registered');
    }
    const user = this.users.create({
      wallet: dto.wallet,
      displayName: dto.displayName,
      encryptedSecret: dto.encryptedSecret ?? null,
    });
    return this.users.save(user);
  }

  async findByWallet(wallet: string): Promise<User> {
    const user = await this.users.findOne({ where: { wallet } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async findByWalletOrNull(wallet: string): Promise<User | null> {
    return this.users.findOne({ where: { wallet } });
  }
}
