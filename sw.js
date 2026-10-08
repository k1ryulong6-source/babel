/* 巴别塔 App 版 service worker（由 build_pwa.py 生成，版本 20261008.1512-3c3a12）
   - 页面本身：先联网取最新版，没网用缓存 → 每次打开都是最新版本
   - 词库、录音、内容包：按文件哈希缓存，文件没变就一直用本机的，变了自动换新
   - Google 字体：第一次联网时缓存，之后离线也有 */
const BUILD = "20261008.1512-3c3a12";
const FILES = {"index.html":"55ea00b37d","manifest.webmanifest":"2cb66dc0ad","ja/words.json":"046f807849","ja/yomi.txt":"7beb9d4076","ja/kanji.json":"f93aaeaab1","ja/d/17.json":"600d2300a1","ja/d/54.json":"be421f0acb","ja/d/49.json":"9cd7eeabc4","ja/d/55.json":"dfab48cb2a","ja/d/41.json":"9a6fb09beb","ja/d/45.json":"dbc1509852","ja/d/42.json":"8e5b3b4da2","ja/d/3.json":"c7fb1978c6","ja/d/20.json":"f70dbb1787","ja/d/33.json":"bf25c046b2","ja/d/35.json":"9502b419ed","ja/d/56.json":"068e4283ee","ja/d/15.json":"994fe90d19","ja/d/40.json":"b21e17dc7c","ja/d/58.json":"c001547552","ja/d/7.json":"ac6eeaffdf","ja/d/10.json":"7bef6a5d47","ja/d/30.json":"7180de6fa6","ja/d/53.json":"9666397f40","ja/d/23.json":"f231f3ca7d","ja/d/48.json":"a62c88e8cf","ja/d/19.json":"ac48ca6a28","ja/d/47.json":"4e4eac8fff","ja/d/36.json":"b55eac27ab","ja/d/12.json":"133ea0a600","ja/d/60.json":"c50b2e5076","ja/d/6.json":"7687bc26c0","ja/d/29.json":"c2680773a7","ja/d/43.json":"258a93fc3f","ja/d/57.json":"1dc9ec08a0","ja/d/18.json":"1fb9a832e1","ja/d/13.json":"4584948584","ja/d/59.json":"2a50728c07","ja/d/38.json":"5e789020b9","ja/d/1.json":"18f12677b7","ja/d/26.json":"b386000cbb","ja/d/62.json":"bb4b70685f","ja/d/2.json":"0aa63f9a88","ja/d/32.json":"25fdd7f711","ja/d/44.json":"6166666002","ja/d/31.json":"8835f0ff00","ja/d/46.json":"9859619100","ja/d/52.json":"6894bf3074","ja/d/63.json":"8a0610761f","ja/d/24.json":"02fa16a5bb","ja/d/61.json":"067eb09bdd","ja/d/9.json":"1042f93762","ja/d/37.json":"409e68529c","ja/d/14.json":"845240a0cc","ja/d/28.json":"c9cc73c69b","ja/d/16.json":"23d4cf0823","ja/d/27.json":"7d1743251b","ja/d/21.json":"21533eedc0","ja/d/0.json":"c2c242aff0","ja/d/4.json":"bbe5768683","ja/d/22.json":"7d3fe21c31","ja/d/51.json":"f8a41a34f8","ja/d/50.json":"5174683957","ja/d/5.json":"776a8504ee","ja/d/25.json":"a6ac47f94b","ja/d/34.json":"af03aaecf0","ja/d/11.json":"fdad7d5b9b","ja/d/39.json":"c8db8340f1","ja/d/8.json":"11a9e57c91","es/words.json":"05b1686fde","es/conj.json":"d0092dadb1","audio/wd_3.json":"b557b68985","audio/wd_12.json":"6eddf45653","audio/wd_39.json":"749d8986d5","audio/wd_38.json":"6e57c935b0","audio/wd_37.json":"58e66ec46a","audio/wd_17.json":"f2bd58a391","audio/wd_15.json":"eaa2e91e7e","audio/wd_8.json":"63e4d94571","audio/wd_35.json":"ffe7823dd8","audio/wd_16.json":"454c28fa81","audio/wd_34.json":"ccc3c12103","audio/wd_21.json":"24bc501a6f","audio/wd_4.json":"0410e35960","audio/wd_19.json":"65cbd61280","audio/wd_22.json":"b880c5efbc","audio/wd_27.json":"6432993800","audio/wd_28.json":"97e00939e8","audio/wd_26.json":"8b4984e053","audio/wd_36.json":"b7f6419dc1","audio/wd_20.json":"ecb97673a0","audio/wd_6.json":"97d16e0a92","audio/wd_1.json":"ee95b222bc","audio/wd_31.json":"4bc38846c7","audio/wd_14.json":"ed2a41ca78","audio/wd_33.json":"8e9a6e1411","audio/wd_23.json":"525b8c7767","audio/wd_5.json":"7235921617","audio/wd_0.json":"fe960e8f2a","audio/wd_25.json":"22f20699ad","audio/index.json":"9fb53400a3","audio/wd_2.json":"6599e0aa92","audio/wd_10.json":"39917fbf5a","audio/wd_18.json":"077d6afd11","audio/wd_9.json":"2ad068e5ea","audio/wd_24.json":"7250112956","audio/wd_32.json":"bd380e6b3c","audio/wd_11.json":"de40c3dc7e","audio/wd_29.json":"4089688ac7","audio/wd_7.json":"479884b163","audio/wd_30.json":"9e557d76f2","audio/wd_13.json":"c46c89adb6","icons/icon-96.png":"b54e058c90","icons/icon-192.png":"9a44974d0d","icons/icon.svg":"38018ce532","icons/icon-512.png":"eb1807b342","data/roots.json":"933cd62137","data/ext.json":"49f3db4f30","data/words.json":"87cd945a17","data/syn.json":"d01e2a7865","packs/es-lesson.json":"5659bf8482","packs/es-reading.json":"07093b9e37","packs/es-examples.json":"21d5accd19","packs/es-listening.json":"c5ac9fa566","packs/index.json":"a45cab9b02","packs/audio/es-index.json":"f89a531ec7","packs/audio/es_3.json":"069d029fe4","packs/audio/es_21.json":"d05b7a6c91","packs/audio/es_20.json":"44ca53b3ae","packs/audio/es_17.json":"27b78e8e28","packs/audio/es_11.json":"eea4acc412","packs/audio/es_14.json":"2dfd94d7da","packs/audio/es_8.json":"6a188ac0fe","packs/audio/es_1.json":"076cdc9c89","packs/audio/es_6.json":"72ece8e1ef","packs/audio/es_0.json":"7a5cd48512","packs/audio/es_10.json":"94d1f167bd","packs/audio/es_2.json":"24cddd125a","packs/audio/es_12.json":"1c5721584e","packs/audio/es_15.json":"dcb7a51e2f","packs/audio/es_4.json":"62f76b891f","packs/audio/es_18.json":"382dc0fed7","packs/audio/es_5.json":"95a0b72ac6","packs/audio/es_13.json":"d9b9a2fabc","packs/audio/es_9.json":"b314c8115f","packs/audio/es_19.json":"4904f42f64","packs/audio/es_16.json":"541c42391e","packs/audio/es_7.json":"edec284615","vendor/pdf.min.js":"a4641a2626","vendor/pdf.worker.min.js":"49162d546a","vendor/jszip.min.js":"c96375d50e","dict/d.json":"d06cd88d92","dict/p.json":"1fbd2edb33","dict/k.json":"44b6d1a5a9","dict/y.json":"ce76140f4c","dict/l.json":"6253146548","dict/a.json":"eab9ad5d43","dict/h.json":"f9fdd44b5e","dict/q.json":"b25a5f567e","dict/g.json":"0c23fd1e46","dict/v.json":"bf10deeb08","dict/o.json":"6b9d228d9f","dict/i.json":"0a5d2b0800","dict/e.json":"1f0ca0791b","dict/s.json":"c0fa964a21","dict/m.json":"8270c1b4a8","dict/b.json":"da97c150c6","dict/n.json":"8f339d41f5","dict/c.json":"c6131614e0","dict/x.json":"a74f51edbc","dict/j.json":"18517bfb31","dict/t.json":"b32fc928e7","dict/z.json":"9d38adcb0f","dict/w.json":"fe0e69f568","dict/r.json":"319784d5af","dict/u.json":"2e509f1df6","dict/f.json":"756fda23e3","curriculum/index.json":"30884ff00f","curriculum/en/1-1.json":"1f7fccbcd3","curriculum/en/1-2.json":"3619b22265","curriculum/en/1-3.json":"af941d63e5","curriculum/en/1-4.json":"5c00447e4e","curriculum/en/1-5.json":"743c374fbc","curriculum/en/1-6.json":"9a30b3d9a0","curriculum/en/1-7.json":"17bd82b3d1","curriculum/en/1-8.json":"b42d13be88","curriculum/es/1-1.json":"cca90b43ac","curriculum/es/1-2.json":"92bfa6fcbc","curriculum/es/1-3.json":"4a8555f768","curriculum/es/1-4.json":"d65b731c12","curriculum/es/1-5.json":"f0c39ac187","curriculum/es/1-6.json":"198257f160","curriculum/es/1-7.json":"5468d3418d","curriculum/es/1-8.json":"51d3269179","curriculum/ja/1-1.json":"b598acb530","curriculum/ja/1-2.json":"7e08e4294c","curriculum/ja/1-3.json":"3ca84e8f20","curriculum/ja/1-4.json":"60834f725a","curriculum/ja/1-5.json":"111a0da6a5","curriculum/ja/1-6.json":"a2470f24b1"};
const SHELL = "shell-" + BUILD, DATA = "data", FONTS = "fonts";

self.addEventListener("install", e => {
  e.waitUntil(caches.open(SHELL).then(c => c.addAll(["./", "manifest.webmanifest", "icons/icon-192.png", "icons/icon-512.png"])).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
  e.waitUntil((async () => {
    for (const k of await caches.keys()) if (k.startsWith("shell-") && k !== SHELL) await caches.delete(k);
    // 删掉内容已经变了的旧文件（键里带哈希，对不上就是旧的）
    const c = await caches.open(DATA);
    for (const req of await c.keys()) {
      const u = new URL(req.url), p = u.pathname.slice(new URL(self.registration.scope).pathname.length);
      if (FILES[p] !== u.searchParams.get("v")) await c.delete(req);
    }
    await self.clients.claim();
  })());
});

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.hostname === "fonts.googleapis.com" || url.hostname === "fonts.gstatic.com") { e.respondWith(cacheFirst(FONTS, req, req)); return; }
  if (url.origin !== location.origin) return;
  if (req.mode === "navigate") {
    e.respondWith((async () => {
      try { const r = await fetch(req); if (r.ok) (await caches.open(SHELL)).put("./", r.clone()); return r; }
      catch { return (await caches.match("./")) || Response.error(); }
    })());
    return;
  }
  const p = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  const h = FILES[p];
  if (h) { e.respondWith(cacheFirst(DATA, req, new Request(url.origin + url.pathname + "?v=" + h))); return; }
});

async function cacheFirst(name, req, key) {
  const c = await caches.open(name);
  const hit = await c.match(key);
  if (hit) return hit;
  const r = await fetch(req);
  if (r.ok || r.type === "opaque") c.put(key, r.clone()).catch(() => { });
  return r;
}
