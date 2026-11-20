import { SavesService } from './saves.service';
import { NotFoundException } from '@nestjs/common';
describe('Project Free Will cloud save ownership', () => {
  it('rejects saves for a character outside the signed-in account', async () => {
    const table: any = {};
    for (const key of ['select','eq']) table[key] = jest.fn(() => table);
    table.maybeSingle = jest.fn(async () => ({ data: null }));
    table.upsert = jest.fn();
    const db: any = { schema: () => db, from: () => table };
    await expect(new SavesService(db).upload('other', { character_id:'remote', save_data:{} })).rejects.toBeInstanceOf(NotFoundException);
    expect(table.upsert).not.toHaveBeenCalled();
  });
  it('uses the PostgREST string conflict target for owned saves', async () => {
    const table: any = {};
    for (const key of ['select','eq']) table[key] = jest.fn(() => table);
    table.maybeSingle = jest.fn(async () => ({ data:{ id:'remote' } }));
    table.upsert = jest.fn(async () => ({ error:null }));
    const db: any = { schema: () => db, from: () => table };
    expect(await new SavesService(db).upload('owner', { character_id:'remote', save_data:{game:'project-free-will'} })).toEqual({success:true});
    expect(table.upsert).toHaveBeenCalledWith(expect.objectContaining({user_id:'owner', character_id:'remote'}),{onConflict:'user_id,character_id'});
  });
});
