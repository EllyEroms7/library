import { Injectable, BadRequestException, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as argon2 from 'argon2';
import { CreateUserDto } from 'src/auth/dto/create-user.dto';
import * as jwt from 'jsonwebtoken';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  private readonly secret = process.env.JWT_SECRET ?? 'development';

  async create(data: CreateUserDto) {
    // Check if the email is already in use
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    if (existingUser) {
      Logger.error('Email already in use', UsersService.name);
      throw new BadRequestException('The email address is already associated with an account.');
    }

    // Hash the password and Create the user
    const hashedPassword = await argon2.hash(data.password);
    try {
      Logger.log('Creating user...', UsersService.name);
      const { password, ...result } = await this.prisma.user.create({
        data: {
          email: data.email,
          username: data.email.split('@')[0], // Default username based on email
          password: hashedPassword,
        },
      });
      Logger.log('User created successfully', UsersService.name);

      return result;
    } catch (error) {
      Logger.error(error.message, error.stack, UsersService.name);
      throw new BadRequestException('Error creating user');
    }
  }

  async generateEmailVerificationToken(email: string) {
    // Check if the user exists
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      Logger.error('User not found', UsersService.name);
      throw new BadRequestException('User not found');
    }

    // Generate the token
    const token = jwt.sign({ email }, this.secret, { expiresIn: '1h' });
    return token;
  }

  async verifyEmailVerificationToken(token: string) {
    try {
      // Verify the token
      const decoded = jwt.verify(token, this.secret);
      return decoded;
    } catch (error) {
      Logger.error(error.message, error.stack, UsersService.name);
      throw new BadRequestException('Invalid token');
    }
  }
}
