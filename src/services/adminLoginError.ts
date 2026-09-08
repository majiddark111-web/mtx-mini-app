import axios from 'axios';

export function adminLoginError(error: unknown): string {
  if (!axios.isAxiosError(error)) return 'Sign-in could not finish. Refresh the page and try again.';
  if (!error.response) return 'Cannot reach the admin server. Check your connection and try again. (NETWORK)';
  switch (error.response.status) {
    case 400: return 'Enter your username, password and a 6-digit authenticator code. (400)';
    case 401: return 'Sign-in rejected. Check your username and password, then use a new authenticator code. (401)';
    case 403: return 'This website is not allowed to access the admin server. Check APP_ORIGIN on the backend. (403)';
    case 404: return 'Admin login endpoint not found. Check the frontend API address. (404)';
    case 429: return 'Too many sign-in attempts. Wait 60 seconds, then use a new authenticator code. (429)';
    case 503: return 'Admin sign-in is unavailable. Check the backend Render logs for MTX admin auth. (503)';
    default: return `Admin server error. Check the backend Render logs. (${error.response.status})`;
  }
}
