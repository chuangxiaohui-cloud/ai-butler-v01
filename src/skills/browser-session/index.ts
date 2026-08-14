/**
 * Skill: browser-session
 *
 * Agent 通过持久化浏览器会话抓取网页：首次用 `npm run browser:open` 登录，
 * 之后该 Skill 直接复用 Session/Cookie 读取页面正文。
 */

import { browserSession, type BrowserSessionManager } from '../../browser/session.js';
import type { ExecutableSkill, SkillInput, SkillOutput } from '../registry.js';

export function createBrowserSessionSkill(
  manager: BrowserSessionManager = browserSession,
): ExecutableSkill {
  return {
    name: 'browser-session',
    version: '0.1.0',
    triggers: ['浏览器会话', '登录网页', 'session', 'cookie', '抓取网页', '网页正文'],
    async execute(input: SkillInput): Promise<SkillOutput> {
      const query = input.query.trim();
      const url = query.match(/https?:\/\/[^\s]+/)?.[0];
      if (url) {
        const page = await manager.fetchPage(url);
        return {
          result: {
            answer: page.text.slice(0, 2000),
            url: page.url,
            title: page.title,
            sessionDomains: page.sessionDomains,
          },
          confidence: 0.8,
        };
      }
      const sessionDomains = await manager.sessionDomains();
      return {
        result: {
          answer:
            sessionDomains.length > 0
              ? `浏览器会话可用，已登录域：${sessionDomains.join(', ')}。给我网址即可抓取。`
              : '浏览器会话尚未登录。请先运行 npm run browser:open，在打开的窗口里完成登录后回车。',
          sessionDomains,
        },
        confidence: 0.7,
        followUpAction: '需要我抓取哪个网页？',
      };
    },
  };
}
