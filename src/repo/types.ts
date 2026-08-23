/**
 * v1.0 S6：代码托管联动类型（§11.4 GitHub/Gitee）
 * 本地变更清单 → 授权仓库校验 → 测试/build 预检 → commit → push → 审计 JSONL。
 */

export type RepoHost = 'github.com' | 'gitee.com';

export interface RepoIdentity {
  host: RepoHost;
  /** 账号：GitHub chuangxiaohui-cloud / Gitee cxv138（§11.4） */
  owner: string;
  /** 仓库名（不含 .git） */
  name: string;
}

/** 推送范围：全部工作区 vs 项目代码（src/scripts/bench/docs/tests/需求文档/配置等） */
export type PushScope = 'all' | 'project';

export interface PushPlan {
  repo: RepoIdentity;
  branch: string;
  /** 本地变更清单（git status --porcelain 行，按 scope 过滤） */
  changes: string[];
  message: string;
  /** 目标裸 URL（不含 token，展示/审计可读） */
  url: string;
  /** 是否已显式授权（§11.4 白名单） */
  authorized: boolean;
  /** 缺少 token 的主机（push 前可提示，不落盘） */
  missingTokenHosts: RepoHost[];
}

export interface PushResult {
  ok: boolean;
  repo: RepoIdentity;
  /** 已创建/复用的提交（push 成功或已 commit） */
  commit?: string;
  /** push 成功后的仓库 URL（裸地址，不含 token） */
  url?: string;
  error?: string;
  /** 远程冲突（non-fast-forward 等），提示 rebase/merge */
  conflict?: boolean;
  hint?: string;
}
