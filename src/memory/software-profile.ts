import { execFileSync } from 'node:child_process';
import { platform } from 'node:os';
import { TextDecoder } from 'node:util';

const UNINSTALL_KEYS = [
  'HKLM\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKLM\\SOFTWARE\\WOW6432Node\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
  'HKCU\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\Uninstall',
];

const AUTOMOTIVE_SOFTWARE = [
  'vector canoe',
  'vector canalyzer',
  'carsim',
  'autoform',
  'autosar',
  'dspace',
];

const EMBEDDED_SOFTWARE = [
  'altium designer',
  'kicad',
  '嘉立创eda',
  'easyeda',
  'cadence',
  'ltspice',
  'keil',
  'stm32cube',
  'iar embedded workbench',
];

/** 从 `reg query` 输出中提取 DisplayName，并以名称大小写不敏感去重。 */
export function parseWindowsDisplayNames(output: string): string[] {
  const byKey = new Map<string, string>();
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*DisplayName\s+REG_(?:SZ|EXPAND_SZ)\s+(.+?)\s*$/i);
    if (!match) continue;
    const name = match[1].trim();
    if (name) byKey.set(name.toLocaleLowerCase(), name);
  }
  return [...byKey.values()].sort((a, b) => a.localeCompare(b, 'en', { sensitivity: 'base' }));
}

export function normalizeSoftwareNames(software: string[]): string[] {
  return parseWindowsDisplayNames(
    software.map((name) => `DisplayName REG_SZ ${name.trim()}`).join('\n'),
  );
}

/** §3.1–§3.3：仅对文档已明确的职业身份做确定性建议。 */
export function inferProfessionFromSoftware(software: string[]): string {
  const names = software.map((name) => name.toLocaleLowerCase());
  if (AUTOMOTIVE_SOFTWARE.some((token) => names.some((name) => name.includes(token)))) {
    return '汽车制造工程师';
  }
  if (EMBEDDED_SOFTWARE.some((token) => names.some((name) => name.includes(token)))) {
    return '嵌入式电子产品开发工程师';
  }
  return '';
}

/** 只读查询 Windows 卸载注册表；单个注册表视图不可用时跳过。 */
export function discoverInstalledSoftware(): string[] {
  if (platform() !== 'win32') return [];
  const outputs: string[] = [];
  const decoder = new TextDecoder('gb18030');
  for (const key of UNINSTALL_KEYS) {
    try {
      const output = execFileSync('reg.exe', ['query', key, '/s', '/v', 'DisplayName'], {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      outputs.push(decoder.decode(output));
    } catch {
      // 某些注册表视图可能不存在，不阻断其余视图。
    }
  }
  return parseWindowsDisplayNames(outputs.join('\n'));
}
