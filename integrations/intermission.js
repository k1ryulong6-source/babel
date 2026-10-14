/* Public article import v1. No account, model API, or cross-site personal state. */
(function(root) {
  'use strict';
  const protocol = 'intermission-article-v1';
  const idPattern = /^live-[a-f0-9]{24}$/;
  const articlePattern = /^intermission_live-[a-f0-9]{24}_[a-f0-9]{16}$/;
  const languages = ['en', 'ja', 'es', 'fr', 'pt', 'zh'];
  const studyLanguages = ['en', 'ja', 'es'];
  const baseURL = 'https://k1ryulong6-source.github.io/ART-NEWS/integrations/babel/';
  const maxBytes = 2_000_000;
  function url(value) {
    try { const u = new URL(value); return ['https:', 'http:'].includes(u.protocol) && !u.username && !u.password ? u.href : ''; }
    catch { return ''; }
  }
  function text(value, cap = 1_000_000) {
    if (typeof value !== 'string' || value.length > cap) throw new Error('invalid_article_text');
    return value;
  }
  function blocks(value) {
    if (!Array.isArray(value) || value.length > 5000) throw new Error('invalid_article_blocks');
    return value.map(b => {
      if (!b || !['paragraph', 'heading', 'quote', 'list_item', 'image'].includes(b.type)) throw new Error('invalid_article_block');
      if (b.type !== 'image') return {type: b.type, text: text(b.text)};
      return {type: 'image', url: url(b.url), caption: text(b.caption || ''), alt: text(b.alt || ''), credit: text(b.credit || '', 2000)};
    });
  }
  function validate(value, expectedId) {
    if (!value || value.protocol !== protocol || value.schema_version !== 1 || !idPattern.test(value.id) || value.id !== expectedId) throw new Error('invalid_article_identity');
    if (!/^[a-f0-9]{64}$/.test(value.source_hash) || !languages.includes(value.language)) throw new Error('unsupported_article_language');
    const body = text(value.text);
    if (!body.trim()) throw new Error('empty_article');
    const result = {protocol, id: value.id, source_hash: value.source_hash, language: value.language,
      title: text(value.title, 600), text: body, blocks: blocks(value.blocks),
      source: {name: text(value.source?.name || '', 300), url: url(value.source?.url),
               author: text(value.source?.author || '', 1000), published_at: text(value.source?.published_at || '', 100)},
      news_url: url(value.news_url), access: value.access === 'public-partial' ? 'public-partial' : 'collected',
      collected_at: text(value.collected_at || '', 100), translation_zh: null};
    if (value.translation_zh && ['ai-reviewed', 'ai-direct', 'machine'].includes(value.translation_zh.kind)) {
      result.translation_zh = {kind: value.translation_zh.kind, title: text(value.translation_zh.title, 600),
                              blocks: blocks(value.translation_zh.blocks), model: text(value.translation_zh.model || '', 300)};
    }
    return result;
  }
  function request(locationURL) {
    const u = new URL(locationURL), id = u.searchParams.get('intermission');
    if (!id) return null;
    if (!idPattern.test(id)) throw new Error('invalid_article_link');
    const savedId = u.searchParams.get('article');
    return {id, savedId: articlePattern.test(savedId || '') && savedId.startsWith('intermission_' + id + '_') ? savedId : null};
  }
  async function fetchArticle(id, fetcher = root.fetch.bind(root)) {
    if (!idPattern.test(id)) throw new Error('invalid_article_link');
    const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 15000);
    try {
      const response = await fetcher(baseURL + id + '.json', {signal: controller.signal, cache: 'no-cache', credentials: 'omit'});
      if (!response.ok) throw new Error(response.status === 404 ? 'article_not_available' : 'article_fetch_failed');
      if (+response.headers.get('content-length') > maxBytes) throw new Error('article_too_large');
      const bytes = await response.arrayBuffer();
      if (bytes.byteLength > maxBytes) throw new Error('article_too_large');
      return validate(JSON.parse(new TextDecoder().decode(bytes)), id);
    } finally { clearTimeout(timer); }
  }
  function plan(payload, content = {}) {
    const id = 'intermission_' + payload.id + '_' + payload.source_hash.slice(0, 16);
    if (content[id]) {
      if (content[id].type !== 'article' || content[id].source_hash !== payload.source_hash) throw new Error('article_id_conflict');
      return {id, article: content[id], existing: true};
    }
    return {id, existing: false, article: {type: 'article', lang: payload.language,
      title: payload.title, text: payload.text, t: Date.now(), marks: [], notes: {},
      url: payload.source.url, intermission: true, source_id: payload.id, source_hash: payload.source_hash,
      source: payload.source, news_url: payload.news_url, access: payload.access,
      source_blocks: payload.blocks, translation_zh: payload.translation_zh, collected_at: payload.collected_at}};
  }
  function readerURL(locationURL, sourceId, articleId) {
    const u = new URL(locationURL);
    u.searchParams.set('intermission', sourceId); u.searchParams.set('article', articleId); u.hash = 'reading';
    return u.href;
  }
  function documentHTML(list, tokenHTML, escape) {
    return list.map(b => {
      if (b.type === 'image') return `${b.url ? `<figure><img src="${escape(b.url)}" alt="${escape(b.alt)}" loading="lazy" style="max-width:100%;height:auto"><figcaption>${tokenHTML(b.caption)}${b.credit ? `<small>${escape(b.credit)}</small>` : ''}</figcaption></figure>` : ''}`;
      const tags = {heading: 'h2', quote: 'blockquote', list_item: 'p', paragraph: 'p'}, tag = tags[b.type];
      return `<${tag}>${b.type === 'list_item' ? '• ' : ''}${tokenHTML(b.text)}</${tag}>`;
    }).join('');
  }
  function errorMessage(error) {
    return ({article_not_available: '这篇新闻正文暂未发布，请返回幕间休息稍后再试。',
      article_fetch_failed: '新闻正文暂时无法读取，请稍后重试。',
      unsupported_article_language: '这篇文章的语种暂不支持导入，原文仍保留在幕间休息。',
      article_too_large: '文章超过当前导入容量，未截断或替换已有文章。',
      invalid_article_link: '文章链接无效，请从幕间休息重新打开。'})[error?.message] || '导入未完成，未覆盖已有学习记录。可刷新重试或返回幕间休息。';
  }
  const api = {version: 1, protocol, request, validate, fetchArticle, plan, readerURL, documentHTML, errorMessage, studyLanguages};
  root.BabelIntermission = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
