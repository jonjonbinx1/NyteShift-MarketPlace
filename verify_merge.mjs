import tool from './tools/nyteshift/gmail/tool.js';

(async ()=>{
  const uiCfg={clientId:'x',clientSecret:'y',refreshToken:''};
  const result = await tool.run({
     input:{action:'listMessages',query:'in:inbox'},
     context:{config:uiCfg}
  });
  console.log('result', result);
})();
