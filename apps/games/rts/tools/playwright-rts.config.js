'use strict';
// Run the existing real-input RTS contracts against this checkout, without
// requiring a deployed shell, authentication or modifications to shared tests.
const path=require('node:path');
const {defineConfig,devices}=require('../../../../tests/e2e/node_modules/@playwright/test');
module.exports=defineConfig({
 testDir:path.resolve(__dirname,'../../../../tests/e2e/tests'),
 testMatch:'rts-player.spec.js',
 outputDir:path.resolve(__dirname,'../art/out/player-test-results'),
 timeout:45000,expect:{timeout:7000},workers:1,retries:0,reporter:'list',
 use:{baseURL:'http://127.0.0.1:18179',serviceWorkers:'block',screenshot:'only-on-failure'},
 projects:[{name:'desktop-chromium',use:{...devices['Desktop Chrome']}}],
 webServer:{command:'node tools/lib/serve-rts.js --port 18179',
   cwd:path.resolve(__dirname,'..'),url:'http://127.0.0.1:18179/rts.html',reuseExistingServer:false}
});
