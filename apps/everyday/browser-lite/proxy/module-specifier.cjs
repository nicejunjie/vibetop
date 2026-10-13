'use strict';
// Keep bare names bare. Absolute URL parsing normalizes ASCII whitespace and
// embedded tabs/newlines just as the browser's module resolver does.
function normalizeModuleSpecifier(value,URLConstructor=URL) {
 if (/^(?:\/|\.\/|\.\.\/)/.test(value)) return value;
 try { return new URLConstructor(value).href; } catch (_) { return null; }
}
module.exports={normalizeModuleSpecifier};
