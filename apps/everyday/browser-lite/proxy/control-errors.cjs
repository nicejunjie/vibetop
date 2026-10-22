'use strict';
function controlError(error,body) {
 const message=String(error.message),expired=/Browser tab expired|Stale tab/.test(message),quota=/Too many browser tabs/.test(message);
 return {protocol:'vibetop-browser-control-v1',clientId:body?.clientId,operation:body?.operation,
  code:expired?'expired':quota?'capacity':'rejected',
  message:expired?'This browser session ended. Retry to reopen the page.':quota?'Too many browser tabs are open. Close a tab and retry.':message,
  reset:expired||quota};
}
module.exports={controlError};
