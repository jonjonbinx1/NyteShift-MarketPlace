import tool from './tools/nyteshift/gmail/tool.js';

(async ()=>{
  const result = await tool.run({
     input:{action:'listMessages',query:'in:inbox'},
     context:{config:{clientId:'x',clientSecret:'y'}}
  });
  console.log('result', result);
})().catch(e=>console.error('err',e));
