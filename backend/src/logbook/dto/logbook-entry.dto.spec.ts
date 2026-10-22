import { validate } from 'class-validator';
import { CreateLogbookEntryDto } from './create-logbook-entry.dto';
import { UpdateLogbookEntryDto } from './update-logbook-entry.dto';

async function errorsFor(dto: object, property: string): Promise<string[]> {
  const errors = await validate(dto as never);
  const forProperty = errors.find((e) => e.property === property);
  return forProperty ? Object.keys(forProperty.constraints ?? {}) : [];
}

describe('Logbook entry DTOs', () => {
  describe('CreateLogbookEntryDto', () => {
    it('accepts a valid activity and no evidence link', async () => {
      const dto = Object.assign(new CreateLogbookEntryDto(), {
        date: '2026-03-02',
        activity: 'Fixed the login bug.',
      });
      expect(await errorsFor(dto, 'activity')).toHaveLength(0);
      expect(await errorsFor(dto, 'evidenceUrl')).toHaveLength(0);
    });

    it('rejects an activity that is blank or too long', async () => {
      const blank = Object.assign(new CreateLogbookEntryDto(), {
        date: '2026-03-02',
        activity: '   ',
      });
      expect(await errorsFor(blank, 'activity')).not.toHaveLength(0);
      const long = Object.assign(new CreateLogbookEntryDto(), {
        date: '2026-03-02',
        activity: 'x'.repeat(2001),
      });
      expect(await errorsFor(long, 'activity')).not.toHaveLength(0);
    });

    it('rejects an evidence link that is not a URL', async () => {
      const dto = Object.assign(new CreateLogbookEntryDto(), {
        date: '2026-03-02',
        activity: 'Worked on the API.',
        evidenceUrl: 'not-a-url',
      });
      expect(await errorsFor(dto, 'evidenceUrl')).not.toHaveLength(0);
    });

    it('treats an empty evidence link as absent rather than invalid', async () => {
      const dto = Object.assign(new CreateLogbookEntryDto(), {
        date: '2026-03-02',
        activity: 'Worked on the API.',
        evidenceUrl: '',
      });
      expect(await errorsFor(dto, 'evidenceUrl')).toHaveLength(0);
    });
  });

  describe('UpdateLogbookEntryDto', () => {
    it('accepts a blank-free activity and a real URL', async () => {
      const dto = Object.assign(new UpdateLogbookEntryDto(), {
        activity: 'Fixed the login bug.',
        evidenceUrl: 'https://example.com/evidence',
      });
      expect(await errorsFor(dto, 'activity')).toHaveLength(0);
      expect(await errorsFor(dto, 'evidenceUrl')).toHaveLength(0);
    });

    it('rejects a blank activity', async () => {
      const dto = Object.assign(new UpdateLogbookEntryDto(), { activity: '  ' });
      expect(await errorsFor(dto, 'activity')).not.toHaveLength(0);
    });

    it('rejects a non-URL evidence link', async () => {
      const dto = Object.assign(new UpdateLogbookEntryDto(), { evidenceUrl: 'not-a-url' });
      expect(await errorsFor(dto, 'evidenceUrl')).not.toHaveLength(0);
    });

    it('lets an empty evidence link through so the student can clear it', async () => {
      const dto = Object.assign(new UpdateLogbookEntryDto(), { evidenceUrl: '' });
      expect(await errorsFor(dto, 'evidenceUrl')).toHaveLength(0);
    });

    it('rejects an unknown status', async () => {
      const dto = Object.assign(new UpdateLogbookEntryDto(), { status: 'NOPE' });
      expect(await errorsFor(dto, 'status')).not.toHaveLength(0);
    });
  });
});
