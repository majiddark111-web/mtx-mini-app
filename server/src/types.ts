export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  JWT_SECRET: string;
  APP_ORIGIN: string;
  AUTH_MAX_AGE_SECONDS?: string;
}

export interface AuthenticatedUser {
  id: string;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
}

export interface SessionClaims {
  sub: string;
  user: AuthenticatedUser;
  iat: number;
  exp: number;
}
