'use strict';
// These factories are injected verbatim into both server and client builds.
// Keep their dependencies explicit: no Node APIs or enclosing module bindings.
function createChainRuntime(read, routedCall, processScript) {
  const apply=Reflect.apply,keys=Reflect.ownKeys,freeze=Object.freeze,create=Object.create;
  const prototype=Object.create(null);
  function chain(value,owner,key) {
    const result=create(prototype);
    result.v=value;result.owner=owner;result.key=key;
    return freeze(result);
  }
  prototype.n=function(){return this.v===null || this.v===undefined?undefined:this;};
  prototype.p=function(key,mode,privateRead){
    key=keys({[key]:0})[0];
    return chain(privateRead?privateRead(this.v):read(mode,this.v,key),this.v,key);
  };
  prototype.s=function(key,readSuper){key=keys({[key]:0})[0];return chain(readSuper(key),this.v,key);};
  prototype.c=function(args,routed){
    return chain(routed?routedCall(this.owner,this.key,args,this.v):apply(this.v,this.owner,args));
  };
  freeze(prototype);
  chain.r=function(reference){return reference===undefined?chain(undefined):reference;};
  chain.t=function(reference,routed,processMode){reference=chain.r(reference);return function(...args){if(processMode && args.length>1)args[1]=processScript(args[1],processMode===2);return reference.c(args,routed).v;};};
  return freeze(chain);
}

function createChainTransformer(find) {
  const mark=node=>{Object.defineProperty(node,'vtChainGenerated',{value:true});return node;};
  const id=name=>mark({type:'Identifier',name});
  const literal=value=>mark({type:'Literal',value});
  const member=(object,name,optional=false)=>mark({type:'MemberExpression',object,property:id(name),computed:false,optional,vtOwnOptional:optional});
  const call=(callee,args)=>mark({type:'CallExpression',callee,arguments:args,optional:false});
  const method=(object,name,args,optional=false)=>call(member(object,name,optional),args);
  const finish=expression=>mark({type:'ChainExpression',expression});
  const own=node=>node.vtOwnOptional===undefined?!!node.optional:node.vtOwnOptional;
  function shadow(node){
    if(node.type==='MemberExpression')return {...node,object:shadow(node.object),optional:false,vtOwnOptional:false};
    if(node.type==='CallExpression')return {...node,callee:shadow(node.callee.type==='ChainExpression'?node.callee.expression:node.callee),optional:false,vtOwnOptional:false};
    return node;
  }
  function classify(node,parent){
    const copy=shadow(node),up=parent?{...parent}:null;
    if(up)for(const key of Object.keys(up))if(up[key]===node || up[key]?.type==='ChainExpression' && up[key].expression===node)up[key]=copy;
    return find(copy,up)?.name;
  }
  function links(expression){
    const result=[];let node=expression;
    while(node.type==='MemberExpression' || node.type==='CallExpression'){
      result.unshift(node);node=node.type==='MemberExpression'?node.object:node.callee;
    }
    return {base:node,items:result};
  }
  function mode(name){
    if(name==='property-get'||name==='computed-property-get')return 1;
    if(name==='eval-get'||name==='window-eval-get')return 2;
    if(name==='post-message-get'||name==='window-post-message-get')return 3;
    return 0;
  }
  function callKind(callee,args){return classify({type:'CallExpression',callee,arguments:args||[],optional:false},null);}
  function wrappedEvalReference(chain){const {base,items}=links(chain.expression);return base.type==='Identifier'&&base.name==='eval'&&items.length===1&&items[0].type==='MemberExpression';}
  function needs(chain,parent,reference=false){
    const {base,items}=links(chain.expression);
    // Reparsed generated code has no non-enumerable markers. Restore only its
    // reserved helper spine, leaving original argument/key expressions walkable.
    if(base.type==='Identifier' && base.name==='__vtChain'){
      for(const node of items)if(!node.vtChainGenerated)mark(node);
      return false;
    }
    if(parent?.type==='UnaryExpression' && parent.operator==='delete')return true;
    if(reference && callKind(chain.expression,parent?.arguments || [literal(null),...(parent?.quasi?.expressions||[])]))return true;
    return items.some((node,i)=>!!classify(node,items[i+1]||parent));
  }
  function processArgs(node,kind){
    const args=node.arguments.slice();
    if(kind==='eval' && args.length)args[0]=call(id('__proc$Script'),[args[0]]);
    if(kind==='eval-call-apply' && args.length>1){const callee=node.callee.type==='ChainExpression'?node.callee.expression:node.callee;args[1]=call(id('__proc$Script'),[args[1],literal(callee.property.name==='apply')]);}
    return args;
  }
  function lower(chain,parent,reference=false){
    const {base,items}=links(chain.expression);
    let first=items.findIndex(own);
    if(first<0)return chain;
    // A member call's reference starts at its owner, even when only the call is
    // optional. Prefix eval/await/private/super expressions stay in their scope.
    if(items[first].type==='CallExpression' && first>0 && items[first-1].type==='MemberExpression')first--;
    const modes=items.map((node,i)=>mode(classify(node,items[i+1]||parent)));
    const kinds=items.map(node=>node.type==='CallExpression'?classify(node,null):null);
    for(let i=first;i<items.length;i++){
      if(kinds[i]==='eval-bind' || kinds[i]==='post-message-call-apply-bind'){
        const target=i-2;
        if(target>=first)modes[target]=kinds[i]==='eval-bind'?2:3;
      }
    }
    if(reference){
      const outside=callKind(chain.expression,parent?.arguments || [literal(null),...(parent?.quasi?.expressions||[])]);
      if(outside==='eval-bind' || outside==='post-message-call-apply-bind')modes[items.length-2]=outside==='eval-bind'?2:3;
    }
    let prefix=first?items[first-1]:base;
    let current;
    if(prefix.type==='ChainExpression' && items[first].type==='CallExpression')
      current=method(id('__vtChain'),'r',[lower(prefix,items[first],true)]);
    else current=call(id('__vtChain'),[prefix]);
    const deletion=parent?.type==='UnaryExpression' && parent.operator==='delete';
    for(let i=first;i<items.length;i++){
      const node=items[i],optional=own(node);
      if(optional)current=method(current,'n',[]);
      if(node.type==='MemberExpression'){
        if(node.object.type==='Super'){
          const readSuper=mark({type:'ArrowFunctionExpression',id:null,params:[id('__vtKey')],generator:false,async:false,expression:true,
            body:mark({...node,property:id('__vtKey'),computed:true,optional:false,vtOwnOptional:false})});
          current=method(call(id('__vtChain'),[mark({type:'ThisExpression'})]),'s',[node.computed?node.property:literal(node.property.name),readSuper]);
          continue;
        }
        if(deletion && i===items.length-1){
          // The final native member remains a reference, with native strictness
          // and no property read. Keep it inside the original optional spine.
          current=mark({...node,object:member(current,'v',optional),optional:false,vtOwnOptional:false});
          return finish(current);
        }
        const key=node.computed?node.property:literal(node.property.name);
        const args=[key,literal(modes[i])];
        if(node.property.type==='PrivateIdentifier')args.push(mark({type:'ArrowFunctionExpression',id:null,params:[id('__vtValue')],generator:false,async:false,expression:true,
          body:mark({...node,object:id('__vtValue'),optional:false,vtOwnOptional:false})}));
        current=method(current,'p',args,optional);
      }else{
        // A bare optional eval becomes indirect via eval-get on the preserved
        // base. That wrapper processes the script; do not process it twice.
        const wrappedEval=first===0 && base.type==='Identifier' && base.name==='eval' &&
          (node.callee===base || node.callee.type==='MemberExpression' && node.callee.object===base);
        const args=wrappedEval?node.arguments:processArgs(node,kinds[i]);
        current=method(current,'c',[mark({type:'ArrayExpression',elements:args}),literal(kinds[i]==='method-call')],optional);
      }
    }
    const result=finish(reference?current:member(current,'v'));
    return deletion?mark({type:'SequenceExpression',expressions:[result,literal(true)]}):result;
  }
  function grouped(node){
    const chain=node.type==='TaggedTemplateExpression'?node.tag:node.callee;
    return chain?.type==='ChainExpression' && needs(chain,node,true);
  }
  return {
    name:'vibetop-optional-chain',nodeReplacementRequireTransform:true,
    condition(node,parent){
      if(node.vtChainGenerated)return false;
      return node.type==='ChainExpression'?needs(node,parent):
        (node.type==='CallExpression'||node.type==='TaggedTemplateExpression') && grouped(node);
    },
    run(node,parent){
      if(node.type==='ChainExpression')return lower(node,parent);
      const chain=node.type==='TaggedTemplateExpression'?node.tag:node.callee;
      const reference=lower(chain,node,true),kind=callKind(chain.expression,node.arguments||[literal(null),...node.quasi.expressions]);
      if(node.type==='TaggedTemplateExpression'){
        const processing=kind==='eval-call-apply'&&!wrappedEvalReference(chain)?chain.expression.property.name==='apply'?2:1:0;
        return mark({...node,tag:method(id('__vtChain'),'t',[reference,literal(kind==='method-call'),literal(processing)])});
      }
      let value=method(id('__vtChain'),'r',[reference]);
      if(own(node))value=method(value,'n',[]);
      value=method(value,'c',[mark({type:'ArrayExpression',elements:wrappedEvalReference(chain)?node.arguments:processArgs(node,kind)}),literal(kind==='method-call')],own(node));
      const result=finish(member(value,'v'));
      return parent?.type==='UnaryExpression' && parent.operator==='delete'?mark({type:'SequenceExpression',expressions:[result,literal(true)]}):result;
    }
  };
}
function selectWindowReference(ast){
  const names=new Set();
  function binding(node){
    if(!node)return;
    if(node.type==='Identifier')names.add(node.name);
    else if(node.type==='RestElement')binding(node.argument);
    else if(node.type==='AssignmentPattern')binding(node.left);
    else if(node.type==='ArrayPattern')node.elements.forEach(binding);
    else if(node.type==='ObjectPattern')node.properties.forEach(p=>binding(p.type==='RestElement'?p.argument:p.value));
  }
  function walk(node){
    if(!node || typeof node!=='object')return;
    if(node.type==='FunctionDeclaration'||node.type==='ClassDeclaration'){binding(node.id);return;}
    if(node.type==='FunctionExpression'||node.type==='ArrowFunctionExpression'||node.type==='ClassExpression')return;
    if(node.type==='VariableDeclarator')binding(node.id);
    if(node.type==='ImportDeclaration')node.specifiers.forEach(s=>binding(s.local));
    for(const [key,value] of Object.entries(node)){
      if(key==='id'||key==='specifiers')continue;
      if(Array.isArray(value))value.forEach(walk);else if(value && typeof value.type==='string')walk(value);
    }
  }
  walk(ast);
  if(!names.has('window'))return 'window';
  if(!names.has('globalThis'))return 'globalThis.window';
  if(!names.has('self'))return 'self.window';
  if(!names.has('frames'))return 'frames';
  // Module code cannot bind eval. This rare fallback is for modules which
  // deliberately bind all public global aliases; normal scripts need no eval.
  return '(0,eval)("this").window';
}
module.exports={createChainRuntime,createChainTransformer,selectWindowReference};
