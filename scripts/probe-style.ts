import { readFileSync } from 'node:fs';

import { createVisionClient } from '../src/search/llm.js';

async function main(): Promise<void> {
  const imagePath = 'C:/Users/zhxh/AppData/Local/Temp/codex-clipboard-cd1c4a75-9930-4cb3-81a6-c4086eba5329.png';
  const image = `data:image/png;base64,${readFileSync(imagePath).toString('base64')}`;
  const vision = createVisionClient({ timeoutMs: 30_000 });
  const description = await vision(
    {
      image,
      prompt:
        '这是一个人工智能助手桌面应用的 UI 截图。请精确描述它的视觉风格，包括：整体背景色、主色/强调色、布局结构（顶栏/侧栏/主区域）、卡片和面板样式、边框与圆角、字体风格、图标风格、按钮样式、以及任何有辨识度的元素。用简短条目输出，方便复刻。',
    },
    { maxTokens: 800 },
  );
  console.log(description);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
