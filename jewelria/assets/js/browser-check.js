export function checkBrowserSupport() {
  return [
    'PointerEvent' in window,
    'localStorage' in window,
    'CSS' in window,
    typeof Promise !== 'undefined'
  ].every(Boolean);
}
