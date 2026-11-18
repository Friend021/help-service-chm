export interface KeycloakTokens {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  refresh_expires_in: number;
  token_type: 'Bearer';
  id_token: string;
  session_state: string;
  scope: string;
}

export interface UserProfile {
  sub: string;
  preferred_username: string;
  email: string;
  name: string;
  roles: string[];
  given_name?: string;
  family_name?: string;
}

export interface KeycloakConfig {
  url: string;
  clientId: string;
  realm: string;
}

export interface AuthState {
  isAuthenticated: boolean;
  user: UserProfile | null;
  tokens: KeycloakTokens | null;
  loading: boolean;
  error: string | null;
}