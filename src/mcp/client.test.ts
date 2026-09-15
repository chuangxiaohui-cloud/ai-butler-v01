import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { StdioMcpClient } from './client.js';

const MOCK_SERVER = "\nconst rl=require('node:readline').createInterface({input:process.stdin});\nrl.on('line',(l)=>{let m;try{m=JSON.parse(l)}catch{return}let result;\nif(m.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{}};\nelse if(m.method==='tools/list')result={tools:[{name:'kicad.run',description:'run',inputSchema:{type:'object'}}]};\nelse if(m.method==='tools/call'){\n  if(m.params.name==='kicad.hang')return;\n  result=m.params.name==='kicad.error'\n    ? {content:[{type:'text',text:'具体工具错误'}],isError:true}\n    : {content:[{type:'text',text:'ok:'+JSON.stringify(m.params.arguments)}],isError:false};\n}\nprocess.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');});\n";

const CANCEL_SERVER = "\nlet cancelled=false;const rl=require('node:readline').createInterface({input:process.stdin});\nrl.on('line',(l)=>{let m;try{m=JSON.parse(l)}catch{return}\nif(m.method==='notifications/cancelled'){cancelled=true;return}\nlet result;if(m.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{}};\nelse if(m.method==='tools/list')result={tools:[{name:cancelled?'cancel-observed':'cancel-missing',description:'x',inputSchema:{}}]};\nelse if(m.method==='tools/call')return;\nprocess.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');});\n";

test('mcp-client: initialize + tools/list 返回工具清单', async () => {
  const client = new StdioMcpClient(['node', '-e', MOCK_SERVER], { heartbeatMs: 2000, startTimeoutMs: 2000 });
  try {
    const tools = await client.listTools();
    assert.ok(tools.length >= 1);
    assert.equal(tools[0]?.name, 'kicad.run');
  } finally {
    client.close();
  }
});

test('mcp-client: callTool 成功返回 untrusted 输出', async () => {
  const client = new StdioMcpClient(['node', '-e', MOCK_SERVER], { heartbeatMs: 2000, startTimeoutMs: 2000 });
  try {
    const result = await client.callTool('kicad.run', { q: 'STM32 最小系统' });
    assert.equal(result.ok, true);
    assert.equal(result.untrusted, true);
    assert.match(result.output, /STM32 最小系统/);
  } finally {
    client.close();
  }
});

test('mcp-client: 调用超时返回 timedOut（[P-41] 心跳）', async () => {
  const client = new StdioMcpClient(['node', '-e', MOCK_SERVER], { heartbeatMs: 2000, startTimeoutMs: 2000 });
  try {
    const result = await client.callTool('kicad.hang', {}, 60);
    assert.equal(result.ok, false);
    assert.equal(result.timedOut, true);
    assert.match(result.error ?? '', /超时/);
  } finally {
    client.close();
  }
});

test('mcp-client: MCP isError 文本进入 error 字段', async () => {
  const client = new StdioMcpClient(['node', '-e', MOCK_SERVER], { heartbeatMs: 2000, startTimeoutMs: 2000 });
  try {
    const result = await client.callTool('kicad.error', {});
    assert.equal(result.ok, false);
    assert.equal(result.error, '具体工具错误');
  } finally {
    client.close();
  }
});

test('mcp-client: 运行中 AbortSignal 发送 cancelled 通知并返回 cancelled', async () => {
  const client = new StdioMcpClient(['node', '-e', CANCEL_SERVER], { heartbeatMs: 2000, startTimeoutMs: 2000 });
  const controller = new AbortController();
  try {
    const pending = client.callTool('hang', {}, 2000, controller.signal);
    setTimeout(() => controller.abort(), 30);
    const result = await pending;
    assert.equal(result.ok, false);
    assert.equal(result.cancelled, true);
    assert.match(result.error ?? '', /已取消/);
    const tools = await client.listTools();
    assert.equal(tools[0]?.name, 'cancel-observed');
  } finally {
    client.close();
  }
});

test('mcp-client: tools/call 超时也通知 server 取消对应请求', async () => {
  const client = new StdioMcpClient(['node', '-e', CANCEL_SERVER], { heartbeatMs: 2000, startTimeoutMs: 2000 });
  try {
    const result = await client.callTool('hang', {}, 30);
    assert.equal(result.timedOut, true);
    const tools = await client.listTools();
    assert.equal(tools[0]?.name, 'cancel-observed');
  } finally {
    client.close();
  }
});

test('mcp-client: 启动超时（[P-57]）时 initialize 抛错', async () => {
  // 子进程不响应：node 脚本直接空转不读 stdin
  const dead = 'setInterval(()=>{},1000);';
  const client = new StdioMcpClient(['node', '-e', dead], { heartbeatMs: 2000, startTimeoutMs: 80 });
  try {
    await assert.rejects(() => client.initialize(), /超时/);
  } finally {
    client.close();
  }
});
