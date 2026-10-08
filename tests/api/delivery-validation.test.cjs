const assert = require('node:assert/strict');
const { test } = require('node:test');
const { server } = require('../helpers/ranking-delivery.cjs');
const session = '1234567890123456';
const envelope = { game_id:'cat-tower', session_id:session, commands:[{id:'abcdefghijklmnop',path:'/score-sessions',body:{game_id:'cat-tower'}}] };
const invalid = [null, [], 7, 'text',
  {...envelope,commands:[null]},
  {...envelope,session_id:1234567890123456},
  {...envelope,commands:[{...envelope.commands[0],id:1234567890123456}]},
  {...envelope,commands:[{...envelope.commands[0],after:1234567890123456}]},
];
for (const [index,body] of invalid.entries()) test(`malformed ranking envelope ${index} returns 400 before persistence`,async()=>{
  let calls=0;
  const response=await server.deliveryWorker.fetch(new Request('https://api.test/ranking-delivery',{method:'POST',body:JSON.stringify(body)}),{
    RANKING_DELIVERY:{getByName(){calls++;throw new Error('invalid request reached storage');}},
  });
  assert.equal(response.status,400);
  assert.equal(calls,0);
});
