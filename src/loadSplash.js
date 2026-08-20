/**
 * Dismissal for the load splash painted by public/index.html.
 *
 * This has to run from the bundle rather than an inline script in that file: the
 * server sends script-src 'self', so inline scripts never execute.
 *
 * window.load alone isn't enough. The gallery fetches its data first and only then
 * mounts the photos and videos, so the load event fires while the page is still
 * visibly filling in. The splash therefore stays up until the media that is actually
 * loading has finished, re-arming whenever something new mounts.
 */

const FADE_MS = 350;
const POLL_MS = 250;
// Media has to read ready this many polls running, so a video that mounts between
// two checks puts the splash back rather than slipping through a single quiet tick.
const STABLE_POLLS = 3;
// Nothing waits forever: a dead CDN or a stalled stream must not strand a viewer
// behind the splash. Keep this under the CSS fallback in public/index.html.
const MAX_WAIT_MS = 20000;

const hasSource = (el) =>
  Boolean(el.currentSrc || el.getAttribute('src') || el.querySelector?.('source'));

const isPendingImage = (img) => {
  if (!hasSource(img)) return false;
  // complete covers decoded and failed alike — a broken image shouldn't hold the splash.
  if (img.complete) return false;
  // A lazy image below the fold doesn't start loading until it's scrolled to, so
  // waiting on one would hold the splash until the cap every time.
  if (img.loading === 'lazy') {
    const rect = img.getBoundingClientRect();
    const inViewport = rect.top < window.innerHeight && rect.bottom > 0;
    if (!inViewport) return false;
  }
  return true;
};

const isPendingVideo = (video) => {
  if (video.preload === 'none') return false;
  if (!hasSource(video)) return false;
  if (video.error) return false;
  // HAVE_FUTURE_DATA: enough buffered to start playing rather than merely metadata.
  return video.readyState < 3;
};

export default function dismissLoadSplashWhenReady() {
  const splash = document.getElementById('app-splash');
  if (!splash) return;

  const startedAt = Date.now();
  let stablePolls = 0;
  let hidden = false;

  const hide = () => {
    if (hidden) return;
    hidden = true;
    window.clearInterval(timer);
    splash.classList.add('is-hidden');
    // Outlast the fade before taking it out of the document.
    window.setTimeout(() => splash.remove(), FADE_MS);
  };

  const isReady = () => {
    // The document and its own assets first, then whatever the app mounted after.
    if (document.readyState !== 'complete') return false;
    const root = document.getElementById('root');
    if (!root || root.childElementCount === 0) return false;
    if (Array.from(document.images).some(isPendingImage)) return false;
    if (Array.from(document.querySelectorAll('video')).some(isPendingVideo)) return false;
    return true;
  };

  const timer = window.setInterval(() => {
    if (Date.now() - startedAt >= MAX_WAIT_MS) {
      hide();
      return;
    }
    stablePolls = isReady() ? stablePolls + 1 : 0;
    if (stablePolls >= STABLE_POLLS) hide();
  }, POLL_MS);
}
