import { CharactersService } from './characters.service';
import { BadRequestException, NotFoundException } from '@nestjs/common';

describe('Project Free Will character contract', () => {
  let service: CharactersService;
  let db: any;
  let table: any;
  let answers: any[];
  beforeEach(() => {
    answers = [];
    table = {};
    for (const method of ['select','eq','contains','insert','update','delete']) table[method] = jest.fn(() => table);
    table.maybeSingle = table.single = jest.fn(async () => answers.shift());
    table.then = (resolve: any) => Promise.resolve(answers.shift()).then(resolve);
    const bucket = { remove: jest.fn(async () => ({ error:null })), upload: jest.fn(async () => ({ error: null })), createSignedUrl: jest.fn(async () => ({ data: { signedUrl: 'https://storage/portrait.png' } })) };
    db = { schema: jest.fn(() => db), from: jest.fn(() => table), storage: { from: jest.fn(() => bucket) } };
    service = new CharactersService(db);
  });
  it('reuses a character when creation is retried with its local ID', async () => {
    answers.push({ data: { id: 'remote' } }, { data: { id: 'remote', data: {} } }, { data: { id: 'remote' } });
    expect(await service.create('owner', { local_id: 'local', name: 'Operative' })).toEqual({ id: 'remote' });
    expect(table.insert).not.toHaveBeenCalled();
    expect(table.eq).toHaveBeenCalledWith('user_id', 'owner');
  });
  it('updates the profile while preserving the local-to-cloud association', async () => {
    answers.push({ data: { id: 'remote', data: { local_id: 'local', voice_type: 'male' } } }, { data: { id: 'remote' } });
    await service.update('owner', 'remote', { name: 'Renamed' });
    expect(table.update).toHaveBeenCalledWith(expect.objectContaining({ name: 'Renamed', data: expect.objectContaining({ local_id: 'local', character_name: 'Renamed' }) }));
  });
  it('checks ownership before uploading any image or resetting a collection', async () => {
    answers.push({ data: null });
    await expect(service.uploadMugshot('other', 'remote', { buffer: Buffer.alloc(8) })).rejects.toBeInstanceOf(NotFoundException);
    expect(db.storage.from).not.toHaveBeenCalled();
    answers.push({ data: null });
    await expect(service.resetCollection('other', 'remote')).rejects.toBeInstanceOf(NotFoundException);
    expect(table.delete).not.toHaveBeenCalled();
  });
  it('uploads PNG bytes and persists the resulting URL', async () => {
    answers.push({ data: { id: 'remote' } }, { error: null });
    const buffer = Buffer.from([137,80,78,71,13,10,26,10,0]);
    expect(await service.uploadMugshot('owner','remote',{ buffer, mimetype: 'image/png' })).toEqual({ url: 'https://storage/portrait.png' });
    expect(db.storage.from().upload).toHaveBeenCalledWith('characters/owner/remote/mugshot.png',buffer,{ contentType:'image/png',upsert:true });
    expect(table.update).toHaveBeenCalledWith(expect.objectContaining({ mugshot_url:'https://storage/portrait.png' }));
  });
  it('reports database failures and invalid images instead of false success', async () => {
    answers.push({ error: { message:'database offline' } });
    await expect(service.list('owner')).rejects.toBeInstanceOf(BadRequestException);
    answers.push({ data: { id:'remote' } });
    await expect(service.uploadMugshot('owner','remote',{ buffer:Buffer.from('text'),mimetype:'image/png' })).rejects.toBeInstanceOf(BadRequestException);
  });
  it('lists cloud cards only for their owner', async () => {
    answers.push({data:{id:'remote'}},{data:[{card_id:'rare_card'}]});
    expect(await service.belongings('owner','remote')).toEqual({collections:[{card_id:'rare_card'}]});
    expect(table.eq).toHaveBeenCalledWith('user_id','owner');
  });
  it('checks both characters before moving cloud cards', async () => {
    answers.push({data:{id:'source'}},{data:null});
    await expect(service.transferCollection('owner','source','other-account')).rejects.toBeInstanceOf(NotFoundException);
    expect(table.update).not.toHaveBeenCalled();
    answers.push({data:{id:'source'}},{data:{id:'target'}},{error:null});
    expect(await service.transferCollection('owner','source','target')).toEqual({success:true});
    expect(table.update).toHaveBeenCalledWith({character_id:'target'});
    expect(table.eq).toHaveBeenCalledWith('character_id','source');
  });
  it('deletes collections, saves, portrait and character after explicit confirmation', async () => {
    answers.push({data:{id:'remote'}},{error:null},{error:null},{error:null});
    expect(await service.remove('owner','remote')).toEqual({success:true});
    expect(db.from.mock.calls.map((call:any[])=>call[0])).toEqual(['game_characters','character_collections','game_saves','game_characters']);
    expect(db.storage.from().remove).toHaveBeenCalledWith(['characters/owner/remote/mugshot.png']);
    expect(table.eq).toHaveBeenCalledWith('user_id','owner');
  });
  it('does not delete another account character or its saved data', async () => {
    answers.push({data:null});
    expect(await service.remove('other','remote')).toEqual({success:true});
    expect(table.delete).not.toHaveBeenCalled();
    expect(db.storage.from).not.toHaveBeenCalled();
  });

});
