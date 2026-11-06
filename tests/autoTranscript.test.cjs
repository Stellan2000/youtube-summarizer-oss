const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const test = require('node:test');
const path = require('node:path');
const ts = require('typescript');
const code = fs.readFileSync(path.join(__dirname, '../src/content/utils/autoTranscript.js'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../src/content/utils/subtitles.ts'), 'utf8');
const extractCode = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText + '\nglobalThis.extractSubtitles = exports.extractSubtitles;\n';

function fixture({ open = false, captions = true, delay = 100, format = 'modern' } = {}) {
  const { parseHTML } = require('linkedom');
  const { document, HTMLElement, Event } = parseHTML(`<!doctype html><html><head></head><body>
    <ytd-watch-flexy video-id="one">
      <div hidden><button id="open-transcript" aria-label="Visa transkription">Visa transkription</button></div>
      <ytd-engagement-panel-section-list-renderer target-id="ads" visibility="ENGAGEMENT_PANEL_VISIBILITY_EXPANDED"><button aria-label="Stäng">Unrelated panel</button></ytd-engagement-panel-section-list-renderer>
      <ytd-engagement-panel-section-list-renderer id="transcript" ${format === 'legacy' ? 'target-id="engagement-panel-searchable-transcript"' : 'is-sync-scroll-panel'} visibility="ENGAGEMENT_PANEL_VISIBILITY_HIDDEN">
        <div id="header"><button id="close-transcript" aria-label="Stäng"></button></div>
        <button role="tab" aria-label="Manuskript" aria-selected="true">Manuskript</button>
        <div id="rows"></div>
      </ytd-engagement-panel-section-list-renderer>
    </ytd-watch-flexy></body></html>`);
  HTMLElement.prototype.getClientRects = function () {
    if (this.closest('[hidden]')) return [];
    const panel = this.closest('ytd-engagement-panel-section-list-renderer');
    return panel && panel.getAttribute('visibility') !== 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' ? [] : [{}];
  };
  Object.defineProperty(document, 'readyState', { value: 'complete' });
  const panel = document.getElementById('transcript');
  const watch = document.querySelector('ytd-watch-flexy');
  const openButton = document.getElementById('open-transcript');
  let now = 0;
  let timerId = 0;
  const timers = new Map();
  const location = { pathname: '/watch', search: '?v=one' };
  const observed = { opens: 0, closes: 0, maskOnOpen: false, delay, panel };
  Object.defineProperties(observed, {
    watchId: { get: () => watch.getAttribute('video-id'), set: id => watch.setAttribute('video-id', id) },
    panelOpen: { get: () => panel.getAttribute('visibility') === 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED', set: value => panel.setAttribute('visibility', value ? 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED' : 'ENGAGEMENT_PANEL_VISIBILITY_HIDDEN') },
    captions: { get: () => !openButton.disabled, set: value => { openButton.disabled = !value; } },
  });
  observed.captions = captions;
  observed.panelOpen = open;
  const attrs = {
    has: name => document.documentElement.hasAttribute(name),
    get size() { return Number(document.documentElement.hasAttribute('data-yt-summary-prefetch')); },
  };
  const setTimeout = (fn, ms) => { timers.set(++timerId, { at: now + ms, fn }); return timerId; };
  const clearTimeout = id => timers.delete(id);
  const dispatch = (name, options = {}) => {
    const event = new Event(name, { bubbles: true });
    if (options.isTrusted) Object.defineProperty(event, 'isTrusted', { value: true });
    (options.target ? panel : document).dispatchEvent(event);
  };
  const populate = (id = observed.watchId) => {
    const rows = [['0:01', `Transcript for ${id}`], ['1:00', `End of ${id}`]];
    panel.querySelector('#rows').innerHTML = rows.map(([time, text]) => format === 'legacy'
      ? `<ytd-transcript-segment-renderer><div role="button"><div class="segment-timestamp">${time}</div><yt-formatted-string class="segment-text">${text}</yt-formatted-string></div></ytd-transcript-segment-renderer>`
      : `<macro-markers-panel-item-view-model role="button"><timeline-item-view-model><transcript-segment-view-model><div class="ytwTranscriptSegmentViewModelTimestamp">${time}</div><div class="ytwTranscriptSegmentViewModelTimestampA11yLabel">timestamp accessibility label</div><span class="ytAttributedStringHost" role="text">${text}</span></transcript-segment-view-model></timeline-item-view-model></macro-markers-panel-item-view-model>`).join('');
  };
  openButton.addEventListener('click', () => {
    observed.opens++;
    observed.maskOnOpen = attrs.has('data-yt-summary-prefetch');
    observed.panelOpen = true;
    const id = observed.watchId;
    if (observed.delay !== null) setTimeout(() => populate(id), observed.delay);
  });
  document.getElementById('close-transcript').addEventListener('click', () => {
    observed.closes++;
    observed.panelOpen = false;
  });
  if (open) populate();
  const ctx = {
    document, location, URLSearchParams, AbortController, setTimeout, clearTimeout,
    Date: { now: () => now }, exports: {}, console: { error: () => {} },
    window: { location, addEventListener: document.addEventListener.bind(document) },
    fetch: () => { throw new Error('Cached transcript must not need a network request'); },
  };
  vm.createContext(ctx);
  const helperSource = fs.readFileSync(path.join(__dirname, '../src/content/utils/transcriptPanel.js'), 'utf8');
  const helperCode = ts.transpileModule(helperSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const helper = {};
  vm.runInContext(`(function(exports) { ${helperCode}\n })`, ctx)(helper);
  ctx.require = name => {
    assert.equal(name, './transcriptPanel.js');
    return helper;
  };
  const compiledAuto = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInContext(`(function(exports, require) { ${compiledAuto}\n })(exports, require);`, ctx);
  vm.runInContext(`(function(exports, require) { ${extractCode}\n })(exports, require);`, ctx);
  const settle = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
  const advance = async ms => {
    const end = now + ms;
    await settle();
    while (true) {
      let next;
      for (const entry of timers) if (entry[1].at <= end && (!next || entry[1].at < next[1].at)) next = entry;
      if (!next) break;
      now = next[1].at;
      timers.delete(next[0]);
      next[1].fn();
      await settle();
    }
    now = end;
    await settle();
  };
  const navigate = id => {
    location.search = `?v=${id}`;
    dispatch('yt-navigate-start');
    observed.watchId = id;
    dispatch('yt-navigate-finish');
  };
  return { ctx, observed, attrs, advance, navigate, dispatch, populate, document, helper };
}

test('loads from collapsed description, caches timestamps and closes its masked panel', async () => {
  const f = fixture();
  await f.advance(1000);
  assert.equal(f.observed.opens, 1);
  assert.equal(f.observed.maskOnOpen, true);
  assert.equal(f.observed.closes, 1);
  assert.equal(f.observed.panelOpen, false);
  assert.equal(f.attrs.size, 0);
  assert.equal(await f.ctx.extractSubtitles(), '[0:01] Transcript for one\n[1:00] End of one');
  f.dispatch('yt-navigate-finish');
  await f.advance(1000);
  assert.equal(f.observed.opens, 1, 'duplicate finish event must not reopen the panel');
});

test('preserves an already open user transcript', async () => {
  const f = fixture({ open: true });
  await f.advance(1000);
  assert.equal(f.observed.opens, 0);
  assert.equal(f.observed.closes, 0);
  assert.equal(f.observed.panelOpen, true);
  assert.match(await f.ctx.extractSubtitles(), /Transcript for one/);
});

test('a summary requested during loading waits for the cached transcript', async () => {
  const f = fixture({ delay: 1200 });
  let result;
  const pending = f.ctx.extractSubtitles().then(text => { result = text; });
  await f.advance(500);
  assert.equal(result, undefined);
  await f.advance(1500);
  await pending;
  assert.match(result, /Transcript for one/);
  assert.equal(f.observed.panelOpen, false);
});

test('video navigation replaces the cache and ignores lingering previous-video rows', async () => {
  const f = fixture();
  await f.advance(1000);
  f.observed.delay = 1500;
  f.navigate('two');
  await f.advance(1000);
  assert.equal(f.ctx.__ytSummaryTranscriptCache.videoId, 'two');
  assert.equal(f.ctx.__ytSummaryTranscriptCache.text, '');
  await f.advance(1200);
  assert.match(await f.ctx.extractSubtitles(), /Transcript for two/);
  assert.doesNotMatch(f.ctx.__ytSummaryTranscriptCache.text, /Transcript for one/);
  assert.equal(f.observed.closes, 2);
});

test('navigation while loading cancels and closes the preceding owned panel', async () => {
  const f = fixture({ delay: 100 });
  await f.advance(200);
  f.observed.delay = 1200;
  f.navigate('two');
  await f.advance(2000);
  assert.equal(f.observed.opens, 2);
  assert.equal(f.observed.closes, 2);
  assert.match(await f.ctx.extractSubtitles(), /Transcript for two/);
  assert.equal(f.attrs.size, 0);
});

test('videos without transcript controls leave the page alone and stop polling', async () => {
  const f = fixture({ captions: false });
  await f.advance(17000);
  assert.equal(f.observed.opens, 0);
  assert.equal(f.observed.closes, 0);
  assert.equal(f.ctx.__ytSummaryTranscriptCache.text, '');
  assert.equal(f.attrs.size, 0);
});

test('an empty transcript times out, restores visibility and closes the panel', async () => {
  const f = fixture({ delay: null });
  await f.advance(17000);
  assert.equal(f.observed.opens, 1);
  assert.equal(f.observed.closes, 1);
  assert.equal(f.ctx.__ytSummaryTranscriptCache.text, '');
  assert.equal(f.attrs.size, 0);
});

test('user interaction while loading keeps the panel open', async () => {
  const f = fixture({ delay: 500 });
  await f.advance(200);
  f.dispatch('keydown', { isTrusted: true, target: { closest: () => ({}) } });
  await f.advance(1200);
  assert.equal(f.observed.closes, 0);
  assert.equal(f.observed.panelOpen, true);
  assert.equal(f.attrs.size, 0);
});

test('a new video without captions never reuses the preceding open transcript', async () => {
  const f = fixture({ open: true });
  await f.advance(1000);
  f.observed.captions = false;
  f.navigate('two');
  await f.advance(17000);
  assert.equal(f.ctx.__ytSummaryTranscriptCache.text, '');
  assert.equal(await f.ctx.extractSubtitles(), null);
  assert.equal(f.observed.closes, 0, 'a user-owned panel is left alone');
});

test('a summary waiting for an old video is cancelled when navigation starts', async () => {
  const f = fixture({ delay: 1000 });
  const pending = f.ctx.extractSubtitles();
  await f.advance(100);
  f.navigate('two');
  await f.advance(100);
  assert.equal(await pending, null);
});


test('the legacy panel remains supported after adding the modern timeline layout', async () => {
  const f = fixture({ format: 'legacy' });
  await f.advance(1000);
  assert.equal(await f.ctx.extractSubtitles(), '[0:01] Transcript for one\n[1:00] End of one');
  assert.equal(f.observed.closes, 1);
  assert.equal(f.observed.panelOpen, false);
});

test('the modern panel without target-id is masked, read and closed instead of unrelated panels', async () => {
  const f = fixture();
  assert.equal(f.observed.panel.getAttribute('target-id'), null);
  assert.equal(f.observed.panel.matches(f.helper.TRANSCRIPT_PANEL_SELECTOR), true);
  await f.advance(1000);
  assert.equal(f.observed.closes, 1);
  assert.equal(f.observed.panelOpen, false);
  assert.equal(f.document.querySelector('[target-id="ads"]').getAttribute('visibility'), 'ENGAGEMENT_PANEL_VISIBILITY_EXPANDED');
  assert.equal(await f.ctx.extractSubtitles(), '[0:01] Transcript for one\n[1:00] End of one');
});
