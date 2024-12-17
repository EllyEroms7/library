import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Logger,
  Query,
  Req,
  Res,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { CreateUserDto } from '../dto/user/create-user.dto';
import { UpdateUserDto } from '../dto/user/update-user.dto';
import { LoginDto } from 'src/dto/auth/login.dto';
import { TokenService } from 'src/token/token.service';
import path from 'path';
import { ApiBody, ApiCookieAuth, ApiQuery, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';

@ApiTags('auth')
@Controller('')
export class AuthController {
  constructor(private readonly authService: AuthService,
    private readonly tokenService: TokenService,
  ) {}

  private cookieOptions = {
    httpOnly: true,
    secure: this.tokenService.isProduction(),
    sameSite: this.tokenService.isProduction() ? 'none' : 'lax',
    path: '/',
  };

  @Post('register')
  @ApiOperation({ summary: 'Register a new user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'user@example.com' },
        username: { type: 'string', example: 'user123' },
        password: { type: 'string', example: 'Pas$word123' },
      },
    },
  })
  @ApiResponse({ status: 201, description: 'User successfully registered.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  async create(@Body() createUserDto: CreateUserDto) {
    try {
      const data = await this.authService.create(createUserDto);
      return data;
    } catch (error: any) {
      Logger.error(error.message, error.stack, AuthController.name);
      throw error;
    }
  }

  @Get('verify-email')
  @ApiOperation({ summary: 'Verify email address' })
  @ApiQuery({
    name: 'token',
    type: 'string',
    required: true,
  })
  @ApiResponse({ status: 200, description: 'Email successfully verified.' })
  @ApiResponse({ status: 400, description: 'Invalid token.' })
  async verifyEmail(@Query('token') token: string) {
    Logger.log(`Received request to verify email with token ${token}`, AuthController.name);
    try {
      if (!token) {
        throw new Error('Token is required');
      }
      return await this.authService.verifyEmail(token);
    } catch (error: any) {
      Logger.error(error.message, error.stack, AuthController.name);
      throw error;
    }
  }

  @Post('/login')
  @ApiOperation({ summary: 'Login user' })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        email: { type: 'string', example: 'user@example.com' },
        password: { type: 'string', example: 'Pas$word123' },
      },
    },
  })
  @ApiResponse({ status: 200, description: 'Login successful.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async login(@Body() loginDto: LoginDto, @Res() res: any) {
    Logger.log('Received request to login', AuthController.name);
    try {
      const { accessToken, refreshToken} = await this.authService.login(loginDto);

      // set cookies
      await res.cookie('accessToken', accessToken, {
        ...this.cookieOptions,
        maxAge: 24 * 60 * 60 * 1000,
      });
      await res.cookie('refreshToken', refreshToken, {
        ...this.cookieOptions,
        maxAge: 7 * 24 * 60 * 60 * 1000,
      });
      Logger.log(`cookies set`, AuthController.name);

      Logger.log(`Login successful for user with email ${loginDto.email}`, AuthController.name);
      return res.json({
        message: 'Login successful',
      });
    } catch (error: any) {
      Logger.error(error.message, error.stack, AuthController.name);
      throw error;
    }
  }

  @Get('/profile')
  @ApiOperation({ summary: 'Get user profile' })
  @ApiResponse({ status: 200, description: 'Profile retrieved successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async profile(@Req() req) {
    Logger.log('Received request to get profile', AuthController.name);
    try {
      Logger.log(`Fetching profile for user with id ${req.user.id}`, AuthController.name);
      if (!req.user.id) {
        Logger.error('User id is required', AuthController.name);
        throw new Error('User id is required');
      }
      const profile = await this.authService.profile(req.user.id);
      return profile;
    } catch (error: any) {
      Logger.error(error.message, error.stack, AuthController.name);
      throw error;
    }
  }

  @Patch('update-profile')
  @ApiOperation({ summary: 'Update user profile' })
  @ApiResponse({ status: 200, description: 'Profile updated successfully.' })
  @ApiResponse({ status: 400, description: 'Bad Request.' })
  async update(@Req() req: any, @Body() updateUserDto: UpdateUserDto) {
    Logger.log('Received request to update profile', AuthController.name);
    try {
      Logger.log(`Updating profile for user with id ${req.user.id}`, AuthController.name);
      if (!req.user.id) {
        Logger.error('User id is required', AuthController.name);
        throw new Error('User id is required');
      }
      const updated = await this.authService.updateProfile(req.user.id, updateUserDto);
      return updated;
    } catch (error: any) {
      Logger.error(error.message, error.stack, AuthController.name);
      throw error;
    }
  }

  @Post('refresh-tokens')
  @ApiOperation({ summary: 'Refresh access and refresh tokens' })
  @ApiCookieAuth('refreshToken')
  @ApiResponse({ status: 200, description: 'Tokens refreshed successfully.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async refreshTokens(@Req() req: any) {
    Logger.log('Received request to refresh tokens', AuthController.name);
    try {
      Logger.log(`Refreshing tokens for user with id ${req.user.id}`, AuthController.name);
      if (!req.user.id) {
        Logger.error('User id is required', AuthController.name);
        throw new Error('User id is required');
      }
      const tokens = await this.authService.refreshTokens(req.user.refreshToken);
      return tokens;
    } catch (error: any) {
      Logger.error(error.message, error.stack, AuthController.name);
      throw error;
    }
  }

  @Post('logout')
  @ApiOperation({ summary: 'Logout user' })
  @ApiResponse({ status: 200, description: 'Logout successful.' })
  @ApiResponse({ status: 401, description: 'Unauthorized.' })
  async logout(@Req() req: any) {
    Logger.log('Received request to logout', AuthController.name);
    try {
      Logger.log(`Logging out user with id ${req.user.id}`, AuthController.name);
      if (!req.user.id) {
        Logger.error('User id is required', AuthController.name);
        throw new Error('User id is required');
      }
      await this.authService.logout(req.user.id);
      return {
        message: 'Logout successful',
      };
    } catch (error: any) {
      Logger.error(error.message, error.stack, AuthController.name);
      throw error;
    }
  }
}
