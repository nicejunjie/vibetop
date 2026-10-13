'use strict';
const {createRequire} = require('node:module');
const engineRequire = createRequire(require.resolve('rammerhead/package.json'));
const hammerhead = name => engineRequire('testcafe-hammerhead/lib/' + name);
const cookieRequire = createRequire(engineRequire.resolve('testcafe-hammerhead/package.json'));
module.exports = {engineRequire, hammerhead, toughCookie: cookieRequire('tough-cookie')};
