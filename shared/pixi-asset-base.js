// Pixi joins a relative asset URL onto the document URL and only steps up from a
// ".html" segment. An extensionless page such as /blockpang/index-en is therefore
// treated as a directory, so assets are requested from /blockpang/index-en/assets.
// Pin the resolver to the directory that actually contains the game.
(function () {
  var resolver = window.PIXI && window.PIXI.Assets && window.PIXI.Assets.resolver;
  if (!resolver) return;
  resolver.basePath = new URL("./", document.baseURI || location.href).href;
})();
