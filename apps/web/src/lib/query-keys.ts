/** Include token so switching users does not reuse cached /auth/me */
export function meQueryKey(token: string | null) {
  return ['me', token] as const;
}
