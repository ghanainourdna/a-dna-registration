export class DuplicateRegistrationError extends Error {
  constructor() {
    super('You have already registered with this email address.');
    this.name = 'DuplicateRegistrationError';
  }
}
