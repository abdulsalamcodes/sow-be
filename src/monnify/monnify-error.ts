export class MonnifyError extends Error {
  constructor(
    message: string,
    public readonly responseCode?: string,
  ) {
    super(message);
    this.name = 'MonnifyError';
  }
}
