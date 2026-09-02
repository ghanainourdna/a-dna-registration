export class DuplicateRegistrationError extends Error {
  constructor() {
    super('You have already registered for this conference with this email address.');
    this.name = 'DuplicateRegistrationError';
  }
}

export class InvalidCountryError extends Error {
  constructor() {
    super('Country is not recognized. Please select a valid country.');
    this.name = 'InvalidCountryError';
  }
}

export class InvalidConferenceError extends Error {
  constructor() {
    super('This conference is not open for registration.');
    this.name = 'InvalidConferenceError';
  }
}

export class InvalidRegistrationTierError extends Error {
  constructor() {
    super('This registration option is not available for the selected conference.');
    this.name = 'InvalidRegistrationTierError';
  }
}
