//---------------------------------------------------------------------
// Single source of truth for the build tag.
//
// Loaded by index.html as a plain script and by sw.js via importScripts,
// so the page and the cache can never disagree about which build is live.
// Bump this on every asset change: it names the cache, so bumping it is
// what retires the old one.
//---------------------------------------------------------------------

self.APP_BUILD = 'v4';
