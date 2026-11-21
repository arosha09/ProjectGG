import { BadRequestException } from '@nestjs/common';
import { XpService } from './xp.service';

describe('character XP account contribution', () => {
  const user = 'account';
  const event = { event_id: 'a'.repeat(32), character_id: '12345678-1234-1234-1234-123456789abc', xp: 25 };
  let repository: any;
  let realtime: any;
  let service: XpService;
  beforeEach(() => {
    repository = { awardCharacterEvents: jest.fn(async () => ({ awarded_xp: 25 })) };
    realtime = { emitToUser: jest.fn() };
    service = new XpService(repository, realtime);
  });
  it('uses the authenticated owner and strips client-supplied account fields', async () => {
    await service.awardCharacterEvents(user, { user_id: 'someone-else', events: [{ ...event, user_id: 'someone-else' }] });
    expect(repository.awardCharacterEvents).toHaveBeenCalledWith(user, [event]);
    expect(realtime.emitToUser).toHaveBeenCalledWith(user, 'xp:changed', { amount: 25, source: 'project-free-will' });
  });
  it('does not announce another XP award for an acknowledged retry', async () => {
    repository.awardCharacterEvents.mockResolvedValue({ awarded_xp: 0 });
    await service.awardCharacterEvents(user, { events: [event] });
    expect(realtime.emitToUser).not.toHaveBeenCalled();
  });
  it.each([[], Array(101).fill(event), [event, event], [{ ...event, xp: -1 }], [{ ...event, xp: 1.5 }], [{ ...event, xp: 100001 }], [{ ...event, character_id: 'other' }], [{ ...event, event_id: '' }]].map(events => ({ events })))('rejects malformed or repeated batches %j', async ({ events }) => {
    await expect(service.awardCharacterEvents(user, { events })).rejects.toBeInstanceOf(BadRequestException);
    expect(repository.awardCharacterEvents).not.toHaveBeenCalled();
  });
});
