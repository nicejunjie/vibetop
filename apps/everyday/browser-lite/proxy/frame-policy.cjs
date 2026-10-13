'use strict';
// Keep the trusted browser chrome as an allowed ancestor while preserving the
// original site's restrictions on other websites framing it. Separate CSP
// policies remain separate: the browser applies their intersection.
function framePolicies(headers, destination, registry, parentOrigin, trustedAncestors=[]) {
  const origin = new URL(destination).origin;
  const documents=()=>registry.isRealm
    ? [...registry.realms.records.values()].filter(record=>!record.resourceOnly).map(record=>[record.origin,record.physical])
    : [...registry.byOrigin];
  const addOrigin=(allowed,upstream)=>{
    if(registry.isRealm) {
      for(const [original,physical] of documents())if(original===new URL(upstream).origin)allowed.add(physical);
    } else allowed.add(registry.register(upstream));
  };
  const wildcard = `${registry.protocol}//*.${registry.domain}${registry.port ? ':'+registry.port : ''}`;
  const policies = (Array.isArray(headers['content-security-policy']) ? headers['content-security-policy']
    : [headers['content-security-policy'] || '']).flatMap(value => value.split(','));
  const ancestors = policies.map(policy => policy.split(';').map(x=>x.trim()).find(x=>/^frame-ancestors(?:\s|$)/i.test(x)))
    .filter(Boolean).map(directive=>directive.split(/\s+/).slice(1));
  if (!ancestors.length) {
    const xfo = String(headers['x-frame-options'] || '').trim().toUpperCase();
    if (xfo === 'DENY') ancestors.push([]);
    else if (xfo === 'SAMEORIGIN') ancestors.push(["'self'"]);
  }
  const trusted=[parentOrigin,...trustedAncestors];
  if (!ancestors.length) return [`frame-ancestors ${trusted.join(' ')} ${wildcard}`];
  return ancestors.map(sources => {
    const allowed = new Set(trusted);
    for (const source of sources) {
      if (source === "'self'") addOrigin(allowed,origin);
      else if (source === '*') allowed.add(wildcard);
      else if (/^https?:\/\/[^*]+$/i.test(source)) {
        try { addOrigin(allowed,source); } catch {}
      } else {
        // Scheme / wildcard-host sources only match upstream origins, never
        // physical sibling names. Every actual ancestor was registered first.
        for (const [upstream,physical] of documents()) {
          const candidate = new URL(upstream);
          if (/^https?:$/.test(source) && candidate.protocol === source) allowed.add(physical);
          const match = /^(https?):\/\/\*\.([^/:]+)(?::(\d+|\*))?$/.exec(source);
          if (match && candidate.protocol === match[1]+':' && candidate.hostname.endsWith('.'+match[2])
              && (match[3] === '*' || (candidate.port || (candidate.protocol==='https:'?'443':'80')) === (match[3] || (match[1]==='https'?'443':'80')))) allowed.add(physical);
        }
      }
    }
    return 'frame-ancestors '+[...allowed].join(' ');
  });
}
module.exports={framePolicies};
