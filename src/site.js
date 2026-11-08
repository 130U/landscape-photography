const bar = document.querySelector('[data-bar]');
const burger = document.querySelector('.burger');
const menu = document.getElementById('menu');
const root = document.documentElement;

function setMenu(open) {
  menu.hidden = !open;
  bar.classList.toggle('bar--open', open);
  root.classList.toggle('is-locked', open);
  document.querySelectorAll('main, footer').forEach((region) => {
    region.inert = open;
  });
  burger.setAttribute('aria-expanded', String(open));
  burger.setAttribute('aria-label', open ? 'Close album menu' : 'Open album menu');
}

burger.addEventListener('click', () => setMenu(menu.hidden));

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !menu.hidden) {
    setMenu(false);
    burger.focus();
  }
});

menu.addEventListener('click', (event) => {
  if (event.target.closest('a')) setMenu(false);
});

const staysStuck = bar.classList.contains('bar--stuck');
const layers = [...document.querySelectorAll('[data-parallax]')];
const animateLayers = layers.length > 0 && !matchMedia('(prefers-reduced-motion: reduce)').matches;
const TRAVEL = 8;
let queued = false;

function update() {
  queued = false;
  if (!staysStuck) bar.classList.toggle('bar--stuck', window.scrollY > 40);
  if (!animateLayers) return;
  const viewport = window.innerHeight;
  for (const layer of layers) {
    const rect = layer.parentElement.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > viewport) continue;
    const reach = (viewport + rect.height) / 2;
    const offset = (rect.top + rect.height / 2 - viewport / 2) / reach;
    layer.style.transform = `translate3d(0, ${(-offset * TRAVEL).toFixed(2)}%, 0)`;
  }
}

function queueUpdate() {
  if (queued) return;
  queued = true;
  requestAnimationFrame(update);
}

addEventListener('scroll', queueUpdate, { passive: true });
addEventListener('resize', queueUpdate);
update();
