// Light, dark, or whatever the device is doing. Only an explicit light or dark
// is remembered (on this device, in localStorage); "system" is the absence of
// a choice, and follows the device live.
import { useSyncExternalStore } from 'react'

export type Theme = 'light' | 'dark' | 'system'

/** Every choice, in the order they are offered. */
export const THEMES: ReadonlyArray<Theme> = ['light', 'dark', 'system']

export const THEME_KEY = 'theme'

/** The browser chrome colours, matching --background in each theme. */
export const THEME_COLORS = { light: '#ffffff', dark: '#0a0a0a' }

/** Anything stored that is not exactly light or dark means system. */
export function parseTheme(stored: string | null | undefined): Theme {
  return stored === 'light' || stored === 'dark' ? stored : 'system'
}

const CHANGED = 'themechange'

// Runs in <head> before first paint, so a remembered choice never flashes the
// other theme. It also keeps the page in step when the device switches (for
// system), when another tab changes the choice, or when setTheme does.
//
// It owns the theme-color tags too: the router keeps only one meta per name,
// so the light and dark pair cannot be declared in the route head.
// Plain ES5 on purpose: it is inlined into the document as text.
export const themeBootScript = `(function(){
var m=window.matchMedia('(prefers-color-scheme: dark)');
var c=${JSON.stringify(THEME_COLORS)};
function stored(){try{var v=localStorage.getItem(${JSON.stringify(THEME_KEY)});return v==='light'||v==='dark'?v:'system'}catch(e){return'system'}}
function chrome(content,media){
var t=document.createElement('meta');
t.name='theme-color';t.content=content;if(media)t.media=media;
t.setAttribute('data-theme-color','');
document.head.appendChild(t)}
function apply(){
var t=stored();
var dark=t==='dark'||(t==='system'&&m.matches);
document.documentElement.classList.toggle('dark',dark);
document.documentElement.style.colorScheme=dark?'dark':'light';
var old=document.querySelectorAll('meta[data-theme-color]');
for(var i=0;i<old.length;i++)old[i].remove();
if(t==='system'){chrome(c.light,'(prefers-color-scheme: light)');chrome(c.dark,'(prefers-color-scheme: dark)')}
else chrome(c[t])}
apply();
m.addEventListener('change',apply);
window.addEventListener('storage',apply);
window.addEventListener(${JSON.stringify(CHANGED)},apply)
})()`

function read(): Theme {
  try {
    return parseTheme(localStorage.getItem(THEME_KEY))
  } catch {
    return 'system'
  }
}

function subscribe(notify: () => void) {
  window.addEventListener('storage', notify)
  window.addEventListener(CHANGED, notify)
  return () => {
    window.removeEventListener('storage', notify)
    window.removeEventListener(CHANGED, notify)
  }
}

export function setTheme(theme: Theme) {
  try {
    if (theme === 'system') localStorage.removeItem(THEME_KEY)
    else localStorage.setItem(THEME_KEY, theme)
  } catch {
    // Storage blocked: the choice holds until the page is reloaded.
  }
  window.dispatchEvent(new Event(CHANGED))
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, read, () => 'system')
}
