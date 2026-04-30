export class DuplicateRegistrationError extends Error {
  constructor() {
    super('You have already registered with this email address.');
    this.name = 'DuplicateRegistrationError';
  }
}

export class InvalidCountryError extends Error {
  constructor() {
    super('Country is not recognized. Please select a valid country.');
    this.name = 'InvalidCountryError';
  }
}
