#!/usr/bin/env node
/**
 * E252：浏览器操作域名授权管理（§4.1.5 域名白名单，A3 授权本地持久化、可撤销）
 * 用法：
 *   npm run browser:auth -- list [skill]                （列出授权记录）
 *   npm run browser:auth -- authorize <skill> <domain>  （授权域名）
 *   npm run browser:auth -- revoke <skill> <domain>     （撤销授权）
 * 未授权域名一律拒绝执行（默认只读），授权是用户显式确认的持久化门禁。
 */

import { DomainAuthStore } from '../src/security/domain-auth.js';

function usage(): never {
  console.error(
    '用法：npm run browser:auth -- list [skill] | authorize <skill> <domain> | revoke <skill> <domain>',
  );
  process.exit(1);
}

const [cmd, ...rest] = process.argv.slice(2);
const store = new DomainAuthStore();
try {
  if (cmd === 'list') {
    const records = store.list(rest[0]);
    const effective: Record<string, boolean> = {};
    for (const record of records) {
      effective[`${record.skill}|${record.domain}`] = record.revoked !== true;
    }
    console.log(
      JSON.stringify(
        { ok: true, records, effectiveAuthorized: Object.keys(effective).filter((k) => effective[k]) },
        null,
        2,
      ),
    );
    process.exit(0);
  }
  const [skill, domain] = rest;
  if (!skill || !domain) usage();
  const normalized = domain.trim().toLowerCase();
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(normalized)) {
    console.error(`非法域名：${domain}（仅允许 www.example.com 形式，子域匹配自动覆盖）`);
    process.exit(1);
  }
  if (cmd === 'authorize') {
    store.authorize(skill, normalized);
    console.log(JSON.stringify({ ok: true, action: 'authorize', skill, domain: normalized }, null, 2));
    process.exit(0);
  }
  if (cmd === 'revoke') {
    store.revoke(skill, normalized);
    console.log(JSON.stringify({ ok: true, action: 'revoke', skill, domain: normalized }, null, 2));
    process.exit(0);
  }
  usage();
} finally {
  store.close();
}