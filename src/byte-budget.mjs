import {AsyncLocalStorage} from 'node:async_hooks';
const scope=new AsyncLocalStorage();
export async function withByteBudget(maxBytes,controller,work){
 const state={bytes:0,maxBytes,controller};
 try{return {value:await scope.run(state,work),bytes:state.bytes};}
 catch(error){error.receivedBytes=state.bytes;throw error;}
}
export function accountBudgetBytes(n){
 const state=scope.getStore();if(!state)return;state.bytes+=n;
 if(state.bytes>state.maxBytes){const error=new Error('catalog_network_budget');state.controller.abort(error);throw error;}
}
