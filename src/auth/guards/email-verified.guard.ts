import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { UsersService } from '../../users/users.service.js';

interface AuthenticatedRequest {
  user?: { id: string };
}

@Injectable()
export class EmailVerifiedGuard implements CanActivate {
  constructor(private readonly usersService: UsersService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const userId = request.user?.id;
    if (!userId) {
      throw new ForbiddenException('Verify your email to continue');
    }

    const user = await this.usersService.findById(userId);
    if (!user?.emailVerified) {
      throw new ForbiddenException('Verify your email to continue');
    }

    return true;
  }
}
