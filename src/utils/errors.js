/** Erreur "attendue" : son message est affiche tel quel a l'utilisateur Discord. */
export class UserError extends Error {
  constructor(message) {
    super(message);
    this.name = 'UserError';
  }
}
