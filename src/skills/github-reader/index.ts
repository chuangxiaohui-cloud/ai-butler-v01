/**
 * Skill: github-reader（GitHub 项目解读）
 * 抓取仓库 README 做初步解读；无 README 时给仓库主页兜底。
 */

const GITHUB_URL_RE = /github\.com\/([^/\s?#`"'（）()，。；]+)\/([^/\s?#`"'（）()，。；]+)/;
const README_CANDIDATES = ['README.md', 'readme.md', 'README.rst', 'README.txt'];

function extractRepo(query: string): { owner: string; repo: string } | null {
  const m = query.match(GITHUB_URL_RE);
  if (!m) return null;
  return { owner: m[1], repo: m[2].replace(/\.git$/, '') };
}

export const skill = {
  name: 'github-reader',
  version: '0.2.0',
  triggers: ['github', 'repo', '项目解读'],
  handler: async (query: string): Promise<string> => {
    const repo = extractRepo(query);
    if (!repo) {
      return '请提供 GitHub 仓库链接，例如 https://github.com/zephyrproject-rtos/zephyr。';
    }
    for (const file of README_CANDIDATES) {
      const url = `https://raw.githubusercontent.com/${repo.owner}/${repo.repo}/HEAD/${file}`;
      try {
        const resp = await fetch(url);
        if (!resp.ok) continue;
        const text = await resp.text();
        if (text.trim()) {
          return `GitHub 项目 ${repo.owner}/${repo.repo} README 摘要：\n${text.slice(0, 1200)}`;
        }
      } catch {
        // 尝试下一个 README 候选
      }
    }
    return `已识别 ${repo.owner}/${repo.repo}，但未能拉到 README，可访问 https://github.com/${repo.owner}/${repo.repo} 查看详情。`;
  },
};
