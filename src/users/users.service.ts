import { Injectable, BadRequestException, Logger, InternalServerErrorException } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import * as argon2 from 'argon2';
import { CreateUserDto } from 'src/auth/dto/create-user.dto';
import * as jwt from 'jsonwebtoken';
import { MailerService } from '@nestjs-modules/mailer';
import { UpdateUserDto } from 'src/auth/dto/update-auth.dto';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService, private mailerService: MailerService) {}

  private readonly secret = () => {
      const secret = process.env.JWT_SECRET;
      if (!secret) {
        Logger.error('JWT secret is not set!', UsersService.name);
        if(process.env.NODE_ENV !== 'production') {
          Logger.warn('Using default secret', UsersService.name)
          return 'default-secret';
        }
        throw new InternalServerErrorException('JWT secret is not set');
      }
      return secret;
  }

  async create(data: CreateUserDto) {
    Logger.log('Received request to create user', UsersService.name);
    // Check if the email is already in use
    Logger.log('Checking if email is already in use...', UsersService.name);
    const existingUser = await this.prisma.user.findUnique({
      where: { email: data.email },
    });
    Logger.log('Check complete', UsersService.name);
    if (existingUser) {
      Logger.error('Email already in use', UsersService.name);
      throw new BadRequestException('The email address is already associated with an account.');
    }
    Logger.log('Email is not associated to any account', UsersService.name);

    // Hash the password and Create the user
    const hashedPassword = await argon2.hash(data.password);
    try {
      Logger.log('Creating user...', UsersService.name);
      const { password, ...result } = await this.prisma.user.create({
        data: {
          email: data.email,
          username: data.username,
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

  async generateEmailVerificationToken(email: string, id: string) {
    Logger.log('Received request to generate email verification token', UsersService.name);
    // Check if the user exists
    Logger.log('Checking if user exists...', UsersService.name);
    const user = await this.prisma.user.findUnique({
      where: { email },
    });
    if (!user) {
      Logger.error('User not found', UsersService.name);
      throw new BadRequestException('User not found');
    }
    Logger.log('User found', UsersService.name);

    // Generate the token
    Logger.log('Generating token...', UsersService.name);
    const token = jwt.sign({ email }, this.secret(), { expiresIn: '1h' });
    Logger.log('Token generated', UsersService.name);
    return token;
  }

  async verifyEmailVerificationToken(token: string) {
    Logger.log('Received request to verify email verification token', UsersService.name);
    if (!token || typeof token !== 'string') {
      Logger.error('Invalid token: Token is required and must be a string', UsersService.name);
      throw new BadRequestException('Invalid token');
    }
    try {
      // Verify the token
      Logger.log('Verifying token...', UsersService.name);
      const decoded = jwt.verify(token, this.secret());
      Logger.log('Token verified', UsersService.name);

      // update the user's email verification status
      Logger.log('Updating user email verification status...', UsersService.name);
      const decodedToken = decoded as jwt.JwtPayload & { email: string };
      Logger.log('Decoded token:', decodedToken, UsersService.name);
      await this.prisma.user.update({
        where: { email: decodedToken.email },
        data: { emailIsVerified: true },
      });
      return 'Email verified successfully';
    } catch (error) {
      Logger.error(error.message, error.stack, UsersService.name);
      if(error.name === 'TokenExpiredError') {
        throw new BadRequestException('Token has expired');
      }
      throw new BadRequestException('Invalid token');
    }
  }

  private generateVerificationLink(token: string): string {
    const baseUrl = process.env.API_URL || 'http://localhost:8080';
    const url = new URL('/verify-email', baseUrl);
    url.searchParams.set('token', token);
    Logger.log('Verification link:', url.toString());
    return url.toString();
  }

  async sendEmail(email: string, subject: string, content: string) {
    Logger.log('Sending email...');

    try {
      const info = await this.mailerService.sendMail({
        from: process.env.SMTP_FROM || 'stationphast@gmail.com',
        to: email,
        subject,
        html: content,
      });
      Logger.log(`Email sent successfully: ${info.messageId}`);
    } catch (error) {
      Logger.error('Error sending email', error.stack);
      throw new InternalServerErrorException('Error sending email');
    }
  }
  
  private generateEmailTemplate(content: string): string {
    return `
        <body style="font-family: Arial, sans-serif; text-align: center;">
            ${content}
        </body>
    `;
  }


  async sendEmailVerificationEmail(email: string, token: string) {
    Logger.log('Preparing to send verification email...');
    const verificationLink = this.generateVerificationLink(token);

    const subject = 'Email Verification';
    const content = this.generateEmailTemplate(`
        <h1>Welcome to MyLibrary!</h1>
        <p>Please click the button below to verify your email address</p>
        <a href="${verificationLink}" style="background-color: #007bff; color: white; padding: 10px 20px; border-radius: 5px; text-decoration: none;">
          <button style="background-color: #007bff; color: white; padding: 10px 20px; text-decoration: none;">
            Verify Email
          </button>
        </a>
    `);

    await this.sendEmail(email, subject, content);
  }

  async findAll(){
    Logger.log('Finding all users...', UsersService.name);
    try {
      const users = await this.prisma.user.findMany();
      Logger.log(`Found ${users.length} users`, UsersService.name);
      return users;
    } catch (error) {
      Logger.error(error.message, error.stack, UsersService.name);
      throw new InternalServerErrorException('Error finding users');
    }
  }

  async findOne(id: string){
    Logger.log(`Finding user with id ${id}`, UsersService.name);
    try {
      Logger.log('Finding user...', UsersService.name);
      const user = await this.prisma.user.findUnique({
        where: { id },
      });
      if (user === null) {
        Logger.error('User not found', UsersService.name);
        throw new BadRequestException('User not found');
      }
      Logger.log(`User found: ${user.email}`, UsersService.name);
      return user;
    } catch (error) {
      Logger.error(error.message, error.stack, UsersService.name);
      // catch the error from user===null
      if(error.message === 'User not found') {
        Logger.error('User not found', UsersService.name);
        throw new BadRequestException('User not found');
      }
      // catch other errors
      throw new InternalServerErrorException('Error finding user');
    }
  }

  async update(id: string, data: UpdateUserDto){
    Logger.log(`Updating user with id ${id}`, UsersService.name);
    try {
      Logger.log('Updating user...', UsersService.name);
      const update = await this.prisma.user.update({
        where: { id },
        data,
      });
      Logger.log(`User updated: ${update}`, UsersService.name);
      return update;
    } catch (error) {
      Logger.error(error.message, error.stack, UsersService.name);
      throw new InternalServerErrorException('Error updating user');
    }
  }

  async delete(id: string){
    try {
      Logger.log('Deleting user...', UsersService.name);
      return await this.prisma.user.delete({
        where: { id },
      });
    } catch (error) {
      Logger.error(error.message, error.stack, UsersService.name);
      throw new InternalServerErrorException('Error deleting user');
    }
  }
}
