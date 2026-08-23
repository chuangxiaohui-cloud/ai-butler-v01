import { strict as assert } from 'node:assert';
import { test } from 'node:test';

import { StdioMcpClient } from './client.js';

const MOCK_SERVER = "\nconst rl=require('node:readline').createInterface({input:process.stdin});\nrl.on('line',(l)=>{let m;try{m=JSON.parse(l)}catch{return}let result;\nif(m.method==='initialize')result={protocolVersion:'2025-03-26',capabilities:{}};\nelse if(m.method==='tools/list')result={tools:[{name:'kicad.run',description:'run',inputSchema:{type:'object'}}]};\nelse if(m.method==='tools/call'){\n  if(m.params.name==='kicad.hang')return;\n  result={content:[{type:'text',text:'ok:'+JSON.stringify(m.params.arguments)}],isError:false};\n}\nprocess.stdout.write(JSON.stringify({jsonrpc:'2.0',id:m.id,result})+'\\n');});\n";

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
