'use strict';
// Lexical scope resolution for the RTS monolith.
//
// Nothing here is RTS-specific: give it an acorn AST and it builds the scope
// tree (function scopes with `var` hoisting, block scopes for let/const/class
// and block-level function declarations, `catch` params, `for` heads) and
// resolves every Identifier that is a REFERENCE — not a property key, not a
// label, not a binding site — to the binding it actually names.
//
// The RTS needs this rather than grep because the monolith shadows on purpose:
// `bakeBuilding` declares its own `rnd`/`rint` over the module-level pair, and
// a dozen unit-art bodies `var`-declare a name their bake function also uses.

const FN_TYPES = new Set(['FunctionDeclaration', 'FunctionExpression', 'ArrowFunctionExpression']);

class Scope {
  constructor(type, parent, node) {
    this.type = type;                      // function | block | for | catch | class | module
    this.parent = parent || null;
    this.node = node;
    this.bindings = new Map();
    this.children = [];
    if (parent) parent.children.push(this);
  }
  declare(name, kind, node) {
    const cur = this.bindings.get(name);
    if (cur) {
      if (cur.kind === 'var' && kind === 'function') { cur.kind = 'function'; cur.node = node; }
      return cur;
    }
    const b = { name, kind, node, scope: this, refs: [], writes: [] };
    this.bindings.set(name, b);
    return b;
  }
  lookup(name) {
    for (let s = this; s; s = s.parent) {
      const b = s.bindings.get(name);
      if (b) return b;
    }
    return null;
  }
  fnScope() {
    for (let s = this; s; s = s.parent) if (s.type === 'function' || s.type === 'module') return s;
    return null;
  }
}

function patternTargets(pat, out) {
  if (!pat) return out;
  switch (pat.type) {
    case 'Identifier': out.push(pat); break;
    case 'ObjectPattern':
      for (const p of pat.properties) patternTargets(p.type === 'RestElement' ? p.argument : p.value, out);
      break;
    case 'ArrayPattern': for (const e of pat.elements) patternTargets(e, out); break;
    case 'AssignmentPattern': patternTargets(pat.left, out); break;
    case 'RestElement': patternTargets(pat.argument, out); break;
    default: break;                        // MemberExpression target: not a binding
  }
  return out;
}

// ---- hoisting ---------------------------------------------------------- //
// `var` and function declarations climb to the enclosing FUNCTION scope; the
// walk below therefore stops dead at every function boundary.
const STMT_CHILDREN = {
  BlockStatement: ['body'], Program: ['body'], StaticBlock: ['body'],
  IfStatement: ['consequent', 'alternate'],
  ForStatement: ['init', 'body'], ForInStatement: ['left', 'body'], ForOfStatement: ['left', 'body'],
  WhileStatement: ['body'], DoWhileStatement: ['body'],
  TryStatement: ['block', 'handler', 'finalizer'], CatchClause: ['body'],
  SwitchStatement: ['cases'], SwitchCase: ['consequent'],
  LabeledStatement: ['body'], WithStatement: ['body'],
};

function hoistVars(nodes, scope) {
  const walk = (n) => {
    if (!n || typeof n.type !== 'string') return;
    if (FN_TYPES.has(n.type)) {
      if (n.type === 'FunctionDeclaration' && n.id) scope.declare(n.id.name, 'function', n);
      return;                              // never descend into a nested function
    }
    if (n.type === 'ClassDeclaration' || n.type === 'ClassExpression') return;
    if (n.type === 'VariableDeclaration') {
      if (n.kind === 'var') {
        for (const d of n.declarations) for (const id of patternTargets(d.id, [])) scope.declare(id.name, 'var', id);
      }
      return;
    }
    const keys = STMT_CHILDREN[n.type];
    if (!keys) return;
    for (const k of keys) {
      const v = n[k];
      if (Array.isArray(v)) v.forEach(walk); else walk(v);
    }
  };
  nodes.forEach(walk);
}

// let/const/class/function declared DIRECTLY in this block
function hoistLexical(nodes, scope, { functions = true } = {}) {
  for (const n of nodes) {
    if (!n) continue;
    if (n.type === 'VariableDeclaration' && n.kind !== 'var') {
      for (const d of n.declarations) for (const id of patternTargets(d.id, [])) scope.declare(id.name, n.kind, id);
    } else if (n.type === 'ClassDeclaration' && n.id) {
      scope.declare(n.id.name, 'class', n);
    } else if (functions && n.type === 'FunctionDeclaration' && n.id) {
      scope.declare(n.id.name, 'function', n);
    }
  }
}

// ---- the resolving walk ------------------------------------------------ //
//
// `analyze(statements, opts)` — statements is the root statement list (a
// Program body, or the body of the IIFE). Returns
// { root, scopes, refs, writes }:
//
//   refs   : { name, node, binding, scope, immediate, fn, top, read, write }
//   writes : { name, node, target, binding, kind, statement, stmt, immediate, fn, top }
//
// `immediate` = the reference executes when the root body is EVALUATED (it is
// not inside a deferred function body; an IIFE callee stays immediate).
// `top` = index of the root-level statement that contains it.

function analyze(statements, opts = {}) {
  const root = new Scope(opts.rootType || 'module', null, opts.rootNode || null);
  const scopes = [root];
  const refs = [];
  const writes = [];

  hoistVars(statements, root);
  hoistLexical(statements, root);

  const mkScope = (type, parent, node) => { const s = new Scope(type, parent, node); scopes.push(s); return s; };

  let topIndex = -1;

  function isIIFE(node, parent, key) {
    if (!parent) return false;
    return parent.type === 'CallExpression' && key === 'callee';
  }

  function addRef(name, node, st, write) {
    const binding = st.scope.lookup(name);
    const r = {
      name, node, binding, scope: st.scope, immediate: st.immediate,
      fn: st.fn, top: topIndex, read: true, write: !!write,
    };
    refs.push(r);
    if (binding) binding.refs.push(r);
    return r;
  }

  function walk(node, parent, key, st) {
    if (!node || typeof node.type !== 'string') return;
    switch (node.type) {
      case 'Identifier': addRef(node.name, node, st, false); return;
      case 'MemberExpression':
        walk(node.object, node, 'object', st);
        if (node.computed) walk(node.property, node, 'property', st);
        return;
      case 'Property':
        if (node.computed) walk(node.key, node, 'key', st);
        walk(node.value, node, 'value', st);
        return;
      case 'MethodDefinition': case 'PropertyDefinition':
        if (node.computed) walk(node.key, node, 'key', st);
        walk(node.value, node, 'value', st);
        return;
      case 'LabeledStatement': walk(node.body, node, 'body', st); return;
      case 'BreakStatement': case 'ContinueStatement': return;
      case 'FunctionDeclaration': case 'FunctionExpression': case 'ArrowFunctionExpression': {
        const immediate = st.immediate && isIIFE(node, parent, key);
        const fs = mkScope('function', st.scope, node);
        if (node.type === 'FunctionExpression' && node.id) fs.declare(node.id.name, 'fn-name', node.id);
        if (node.type !== 'ArrowFunctionExpression') fs.declare('arguments', 'arguments', node);
        for (const p of node.params) for (const id of patternTargets(p, [])) fs.declare(id.name, 'param', id);
        const inner = { scope: fs, immediate, fn: node };
        for (const p of node.params) walkPatternExprs(p, inner);
        if (node.body.type === 'BlockStatement') {
          hoistVars(node.body.body, fs);
          hoistLexical(node.body.body, fs);
          for (const s of node.body.body) walk(s, node.body, 'body', inner);
        } else {
          walk(node.body, node, 'body', inner);
        }
        return;
      }
      case 'ClassDeclaration': case 'ClassExpression': {
        const cs = mkScope('class', st.scope, node);
        if (node.id) cs.declare(node.id.name, 'class', node.id);
        const inner = { ...st, scope: cs };
        walk(node.superClass, node, 'superClass', inner);
        walk(node.body, node, 'body', inner);
        return;
      }
      case 'BlockStatement': {
        const bs = mkScope('block', st.scope, node);
        hoistLexical(node.body, bs);
        const inner = { ...st, scope: bs };
        for (const s of node.body) walk(s, node, 'body', inner);
        return;
      }
      case 'SwitchStatement': {
        walk(node.discriminant, node, 'discriminant', st);
        const bs = mkScope('block', st.scope, node);
        for (const c of node.cases) hoistLexical(c.consequent, bs);
        const inner = { ...st, scope: bs };
        for (const c of node.cases) {
          walk(c.test, c, 'test', inner);
          for (const s of c.consequent) walk(s, c, 'consequent', inner);
        }
        return;
      }
      case 'CatchClause': {
        const cs = mkScope('catch', st.scope, node);
        if (node.param) for (const id of patternTargets(node.param, [])) cs.declare(id.name, 'catch', id);
        const inner = { ...st, scope: cs };
        if (node.param) walkPatternExprs(node.param, inner);
        hoistLexical(node.body.body, cs);
        for (const s of node.body.body) walk(s, node.body, 'body', inner);
        return;
      }
      case 'ForStatement': {
        const fs2 = mkScope('for', st.scope, node);
        if (node.init && node.init.type === 'VariableDeclaration' && node.init.kind !== 'var') hoistLexical([node.init], fs2);
        const inner = { ...st, scope: fs2 };
        walk(node.init, node, 'init', inner);
        walk(node.test, node, 'test', inner);
        walk(node.update, node, 'update', inner);
        walk(node.body, node, 'body', inner);
        return;
      }
      case 'ForInStatement': case 'ForOfStatement': {
        const fs2 = mkScope('for', st.scope, node);
        if (node.left.type === 'VariableDeclaration' && node.left.kind !== 'var') hoistLexical([node.left], fs2);
        const inner = { ...st, scope: fs2 };
        if (node.left.type === 'VariableDeclaration') {
          for (const d of node.left.declarations) walkPatternExprs(d.id, inner);
        } else {
          recordTarget(node.left, node, 'for-head', inner, null);
        }
        walk(node.right, node, 'right', inner);
        walk(node.body, node, 'body', inner);
        return;
      }
      case 'VariableDeclaration':
        for (const d of node.declarations) {
          walkPatternExprs(d.id, st);
          walk(d.init, d, 'init', st);
        }
        return;
      case 'AssignmentExpression': {
        const stmtNode = parent && parent.type === 'ExpressionStatement' ? parent : null;
        if (node.left.type === 'Identifier') {
          const binding = st.scope.lookup(node.left.name);
          const w = {
            name: node.left.name, node, target: node.left, binding,
            kind: node.operator === '=' ? 'simple' : 'compound', operator: node.operator,
            statement: !!stmtNode, stmt: stmtNode, parent, key,
            immediate: st.immediate, fn: st.fn, top: topIndex, scope: st.scope,
          };
          writes.push(w);
          if (binding) binding.writes.push(w);
          if (node.operator !== '=') addRef(node.left.name, node.left, st, true);
        } else if (node.left.type === 'MemberExpression') {
          walk(node.left, node, 'left', st);
        } else {
          recordTarget(node.left, node, 'destructuring', st, parent);
        }
        walk(node.right, node, 'right', st);
        return;
      }
      case 'UpdateExpression': {
        if (node.argument.type === 'Identifier') {
          const stmtNode = parent && parent.type === 'ExpressionStatement' ? parent : null;
          const binding = st.scope.lookup(node.argument.name);
          const w = {
            name: node.argument.name, node, target: node.argument, binding, kind: 'update',
            operator: node.operator, prefix: node.prefix, statement: !!stmtNode, stmt: stmtNode, parent, key,
            immediate: st.immediate, fn: st.fn, top: topIndex, scope: st.scope,
          };
          writes.push(w);
          if (binding) binding.writes.push(w);
          addRef(node.argument.name, node.argument, st, true);
        } else {
          walk(node.argument, node, 'argument', st);
        }
        return;
      }
      default: {
        for (const k of Object.keys(node)) {
          if (k === 'type' || k === 'start' || k === 'end' || k === 'loc' || k === 'range') continue;
          const v = node[k];
          if (Array.isArray(v)) { for (const e of v) if (e && typeof e.type === 'string') walk(e, node, k, st); }
          else if (v && typeof v.type === 'string') walk(v, node, k, st);
        }
      }
    }
  }

  // identifiers inside a BINDING pattern are declarations; only computed keys
  // and default values are references
  function walkPatternExprs(pat, st) {
    if (!pat) return;
    switch (pat.type) {
      case 'Identifier': return;
      case 'ObjectPattern':
        for (const p of pat.properties) {
          if (p.type === 'RestElement') { walkPatternExprs(p.argument, st); continue; }
          if (p.computed) walk(p.key, p, 'key', st);
          walkPatternExprs(p.value, st);
        }
        return;
      case 'ArrayPattern': for (const e of pat.elements) walkPatternExprs(e, st); return;
      case 'AssignmentPattern': walkPatternExprs(pat.left, st); walk(pat.right, pat, 'right', st); return;
      case 'RestElement': walkPatternExprs(pat.argument, st); return;
      default: walk(pat, null, null, st);
    }
  }

  // an assignment target that is a pattern, or a for-in/of head identifier
  function recordTarget(target, node, kind, st, parent) {
    for (const id of patternTargets(target, [])) {
      const binding = st.scope.lookup(id.name);
      const w = {
        name: id.name, node, target: id, binding, kind, operator: '=',
        statement: !!(parent && parent.type === 'ExpressionStatement'), stmt: parent || null, parent, key: null,
        immediate: st.immediate, fn: st.fn, top: topIndex, scope: st.scope,
      };
      writes.push(w);
      if (binding) binding.writes.push(w);
    }
    const sub = (p) => {
      if (!p) return;
      if (p.type === 'ObjectPattern') {
        for (const q of p.properties) {
          if (q.type === 'RestElement') { sub(q.argument); continue; }
          if (q.computed) walk(q.key, q, 'key', st);
          sub(q.value);
        }
        return;
      }
      if (p.type === 'ArrayPattern') { for (const e of p.elements) sub(e); return; }
      if (p.type === 'AssignmentPattern') { sub(p.left); walk(p.right, p, 'right', st); return; }
      if (p.type === 'RestElement') { sub(p.argument); return; }
      if (p.type === 'MemberExpression') { walk(p, null, null, st); return; }
    };
    sub(target);
  }

  const st0 = { scope: root, immediate: true, fn: null };
  statements.forEach((s, i) => { topIndex = i; walk(s, opts.rootNode || null, 'body', st0); });

  return { root, scopes, refs, writes };
}

function innermostScopeAt(scopes, offset) {
  let best = null;
  for (const s of scopes) {
    const n = s.node;
    if (!n || typeof n.start !== 'number') continue;
    if (offset < n.start || offset > n.end) continue;
    if (!best || (n.end - n.start) < (best.node.end - best.node.start)) best = s;
  }
  return best;
}

module.exports = { Scope, analyze, patternTargets, innermostScopeAt, FN_TYPES };
