/**
 * 陪伴聊天专用回复（EC31）
 * 不搜索、不推荐 App；只承接情绪并引导用户展开。
 */

export function buildCompanionReply(query: string): string {
  const topic = /工作|项目|老板|客户|代码|板子|产品/.test(query)
    ? '工作上的事'
    : /家里|家人|对象|孩子|父母|朋友/.test(query)
      ? '生活里的事'
      : '不管什么事';
  return `老板，我在呢。今天不用硬撑，${topic}都可以慢慢说。你先告诉我：是想找个人听你吐槽，还是需要我帮你把一件事拆开理清楚？如果你只想安静待会儿，我也陪着你，不说话也行。`;
}
