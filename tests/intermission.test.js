const {test} = require('node:test');
const assert = require('node:assert/strict');
const B = require('../integrations/intermission.js');
const id = 'live-' + 'a'.repeat(24);
const fixture = () => ({protocol: B.protocol, schema_version: 1, id, source_hash: 'b'.repeat(64),
  title: '作品「光」', language: 'ja', text: 'Original text 2026.\n\nSaved paragraph.',
  blocks: [{type:'paragraph',text:'Original text 2026.'},{type:'quote',text:'Saved paragraph.'},
    {type:'image',url:'https://example.org/photo.jpg',caption:'Photo',credit:'Creator'}],
  source: {name:'Publisher',url:'https://example.org/news',author:'Author'},
  news_url:'https://mujianrest.work/#reader/'+id,access:'public-partial',
  translation_zh: {kind:'ai-direct',title:'中文参考',blocks:[{type:'paragraph',text:'中文正文'}],model:'actual-model'}});

test('validated import keeps original, language, pictures, public-partial identity and separate Chinese',()=>{
  const payload=B.validate(fixture(),id), plan=B.plan(payload);
  assert.equal(plan.article.lang,'ja'); assert.equal(plan.article.text,fixture().text);
  assert.equal(plan.article.title,fixture().title); assert.equal(plan.article.access,'public-partial');
  assert.equal(plan.article.source_blocks[2].credit,'Creator');
  assert.equal(plan.article.translation_zh.kind,'ai-direct');
  assert.equal(plan.article.translation_zh.model,'actual-model');
});
test('duplicate opens existing copy with notes and learning marks intact; source changes add revision',()=>{
  const payload=B.validate(fixture(),id), first=B.plan(payload);
  first.article.notes={saved:'my annotation'}; first.article.marks=[{text:'Original'}];
  const content={[first.id]:first.article}, again=B.plan(payload,content);
  assert.equal(again.existing,true); assert.equal(again.article,first.article);
  assert.deepEqual(again.article.notes,{saved:'my annotation'});
  const revision=B.plan({...payload,source_hash:'c'.repeat(64)},content);
  assert.notEqual(revision.id,first.id); assert.equal(revision.existing,false);
  assert.deepEqual(content[first.id].marks,[{text:'Original'}]);
});
test('a 40k article passes intact instead of the old 30k manual-import cutoff',()=>{
  const f=fixture();f.text='Long original. '.repeat(3000);f.blocks=[{type:'paragraph',text:f.text}];
  assert.equal(B.plan(B.validate(f,id)).article.text,f.text);
});
test('only fixed known article endpoint is fetched; malformed IDs and mismatched response fail',async()=>{
  let endpoint=''; const fetcher=async u=>{endpoint=u;return new Response(JSON.stringify(fixture()),{status:200});};
  await B.fetchArticle(id,fetcher);
  assert.equal(endpoint,'https://mujianrest.work/integrations/babel/'+id+'.json');
  await assert.rejects(B.fetchArticle('../private',fetcher),/invalid_article_link/);
  await assert.rejects(B.fetchArticle('live-'+'c'.repeat(24),fetcher),/invalid_article_identity/);
  assert.throws(()=>B.request('https://example.org/?intermission=../private'),/invalid_article_link/);
});
test('domain DNS, HTTPS, server and malformed-response failures fall back to the fixed legacy API',async()=>{
  for(const failure of ['dns',404,503,'invalid']) {
    const calls=[];
    const result=await B.fetchArticle(id,async(u,options)=>{
      calls.push(u);assert.equal(options.credentials,'omit');
      if(calls.length===1) {
        if(failure==='dns')throw new TypeError('Failed to fetch');
        if(failure==='invalid')return new Response(JSON.stringify({...fixture(),id:'live-'+'f'.repeat(24)}));
        return new Response('',{status:failure});
      }
      return new Response(JSON.stringify(fixture()));
    });
    assert.deepEqual(calls,['https://mujianrest.work/integrations/babel/'+id+'.json',
      'https://k1ryulong6-source.github.io/ART-NEWS/integrations/babel/'+id+'.json']);
    assert.equal(result.text,fixture().text);
  }
});
test('missing article, invalid version and unsafe links never import fake content',async()=>{
  await assert.rejects(B.fetchArticle(id,async()=>new Response('',{status:404})),/article_not_available/);
  assert.throws(()=>B.validate({...fixture(),schema_version:2},id),/invalid_article_identity/);
  const f=fixture();f.source.url='javascript:alert(1)';f.blocks[2].url='javascript:alert(2)';
  const safe=B.validate(f,id);assert.equal(safe.source.url,'');assert.equal(safe.blocks[2].url,'');
});
test('reopen link identifies the locally saved original and preserves other query parameters',()=>{
  const plan=B.plan(B.validate(fixture(),id));
  const url=B.readerURL('https://example.org/babel/?other=value',id,plan.id);
  assert.equal(new URL(url).searchParams.get('other'),'value');
  assert.deepEqual(B.request(url),{id,savedId:plan.id});
});
test('generic source languages retain their identity and are not advertised as native study languages',()=>{
  for(const language of ['fr','pt','zh']) {
    const f=fixture();f.language=language;const plan=B.plan(B.validate(f,id));
    assert.equal(plan.article.lang,language);assert.equal(B.studyLanguages.includes(language),false);
  }
});
