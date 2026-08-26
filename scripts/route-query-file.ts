#!/usr/bin/env node
/**
 * E251：意图路由带参入口——从 argv[2] 指向的文件读取查询文本（供市场 Skill @input 通道使用），
 * 输出 routeV2 结构化 JSON。用户文本只经输入文件通道进入，不进命令行参数（无注入面）。
 * 用法：npm run route:query:file -- <查询文件绝对路径>
 */

import { readFileSync } from 'node:fs';
import { routeV2 } from '../src/agent/router-v2.js';

const file = process.argv[2];
if (!file) {
  console.error('用法: npm run route:query:file -- <查询文件绝对路径>');
  process.exit(1);
}
const query = readFileSync(file, 'utf-8');
console.log(JSON.stringify(routeV2(query), null, 2));