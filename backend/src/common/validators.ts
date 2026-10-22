import {
  registerDecorator,
  ValidationArguments,
  ValidationOptions,
} from 'class-validator';

/**
 * Rejects a string that is empty or made up entirely of whitespace.
 *
 * `@IsNotEmpty()` only checks for `''`, `null` and `undefined`, so `"   "`
 * slips through it. The services trim before storing, which would quietly
 * turn a whitespace-only value into an empty column — a blank logbook
 * activity, an unnamed holiday, a project with no title.
 */
export function IsNotBlank(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'isNotBlank',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate(value: unknown): boolean {
          return typeof value === 'string' && value.trim().length > 0;
        },
        defaultMessage(args: ValidationArguments): string {
          return `${args.property} must not be blank`;
        },
      },
    });
  };
}
