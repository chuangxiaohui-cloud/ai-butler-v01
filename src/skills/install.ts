/**
 * Skill 安装器（§8.2.3）
 * 本地包 manifest 校验、Skill 源码生成、registry 自动注册。
 */

export interface SkillManifest {
  name: string;
  version: string;
  triggers: string[];
  description?: string;
}

export function validateSkillManifest(input: unknown): SkillManifest {
  if (typeof input !== 'object' || input === null) {
    throw new Error('Skill manifest 必须是对象');
  }
  const m = input as Record<string, unknown>;
  const name = typeof m.name === 'string' ? m.name.trim() : '';
  const version = typeof m.version === 'string' ? m.version.trim() : '';
  const triggers = Array.isArray(m.triggers)
    ? m.triggers.filter((t): t is string => typeof t === 'string' && t.trim().length > 0)
    : [];
  if (!/^[a-z0-9-]+$/.test(name)) {
    throw new Error('Skill name 只允许小写字母、数字和连字符');
  }
  if (!version) throw new Error('Skill version 不能为空');
  if (triggers.length === 0) throw new Error('Skill triggers 至少 1 个');
  return {
    name,
    version,
    triggers,
    description: typeof m.description === 'string' ? m.description : undefined,
  };
}

export function renderSkillSource(manifest: SkillManifest): string {
  const description = manifest.description
    ? ` * ${manifest.description.replace(/\n/g, '\n * ')}`
    : ' * 市场安装 Skill';
  return `/**
${description}
 */
export const skill = {
  name: '${manifest.name}',
  version: '${manifest.version}',
  triggers: [${manifest.triggers.map((t) => `'${t}'`).join(', ')}],
  handler: async (_query: string) => null,
};
`;
}

export function buildRegistryInsertion(
  manifest: SkillManifest,
  registrySource: string,
): { updated: string; varName: string } {
  const varName = manifest.name.replace(/-/g, '_');
  const importLine = `import { skill as ${varName} } from './${manifest.name}/index.js';`;
  if (registrySource.includes(importLine)) {
    return { updated: registrySource, varName };
  }

  const lines = registrySource.split('\n');
  let lastImport = -1;
  for (let i = 0; i < lines.length; i += 1) {
    if (/^import /.test(lines[i])) lastImport = i;
  }
  if (lastImport < 0) throw new Error('registry.ts 未找到 import 区块');
  lines.splice(lastImport + 1, 0, importLine);

  const arrayStart = lines.findIndex((line) => line.includes('const SKILLS: Skill[] = ['));
  const closing = lines.findIndex(
    (line, i) => i > arrayStart && line.trim() === '];',
  );
  if (arrayStart < 0 || closing < 0) {
    throw new Error('registry.ts 未找到 SKILLS 数组');
  }
  lines.splice(closing, 0, `  ${varName},`);
  return { updated: lines.join('\n'), varName };
}
