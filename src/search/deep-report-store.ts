/**
 * v1.0 S2：深度报告任务状态存储（§4.3.2 取消/恢复）
 * JSONL 落盘 data/deep-report-jobs.jsonl（构造可注入路径，测试隔离）；每个 job 一行，
 * 变更走全量原子重写（tmp + rename）。恢复 = 查同 query 最近一次 cancelled 的 job，
 * 复用其 headings + 已生成 sections 继续生成，不重复请求大纲。
 * 失败任务标记 failed 不参与恢复（与用户主动取消区分）。
 * 只保留最近 JOB_LIMIT 个 job，防止无界增长（与 jsonl 轮转同思路）。
 */

import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

export interface DeepReportJob {
  jobId: string;
  query: string;
  status: 'active' | 'cancelled' | 'done' | 'failed';
  stage: 'outline' | 'sections' | 'done';
  /** 大纲结果（LLM 或 fallback 标题行） */
  headings: string[];
  /** 已完成分节（Markdown，含 ## 标题） */
  sections: string[];
  evidenceCount: number;
  createdAt: number;
  updatedAt: number;
}

export interface DeepReportStoreLike {
  /** 找同 query 最近一次 cancelled 的 job（可恢复）；无则 null */
  findResumable(query: string): DeepReportJob | null;
  /** 开启（或恢复）一个 job，返回 jobId */
  start(query: string, evidenceCount: number, resumeFrom?: DeepReportJob | null): string;
  /** 记录一节完成（恢复时也逐节追加，保证取消后可续） */
  appendSection(jobId: string, section: string): void;
  markDone(jobId: string): void;
  markCancelled(jobId: string): void;
  /** 失败任务不参与恢复（与用户主动取消区分） */
  markFailed(jobId: string): void;
}

const JOB_LIMIT = 200;

export class DeepReportStore implements DeepReportStoreLike {
  private readonly filePath: string;

  constructor(filePath = join(process.cwd(), 'data', 'deep-report-jobs.jsonl')) {
    this.filePath = filePath;
  }

  findResumable(query: string): DeepReportJob | null {
    const candidates = this.readJobs()
      .filter((job) => job.query === query && job.status === 'cancelled')
      .sort((a, b) => b.updatedAt - a.updatedAt);
    return candidates[0] ?? null;
  }

  start(query: string, evidenceCount: number, resumeFrom?: DeepReportJob | null): string {
    const now = Date.now();
    const job: DeepReportJob = {
      jobId: randomUUID(),
      query,
      status: 'active',
      stage: resumeFrom ? 'sections' : 'outline',
      headings: resumeFrom?.headings ?? [],
      sections: resumeFrom?.sections ?? [],
      evidenceCount,
      createdAt: now,
      updatedAt: now,
    };
    const jobs = this.readJobs();
    if (resumeFrom) {
      // 旧 cancelled job 收编为 done（已被新 job 继承），不再参与 findResumable
      const prev = jobs.find((item) => item.jobId === resumeFrom.jobId);
      if (prev) {
        prev.status = 'done';
        prev.stage = 'done';
        prev.updatedAt = now;
      }
    }
    jobs.push(job);
    this.writeJobs(jobs);
    return job.jobId;
  }

  appendSection(jobId: string, section: string): void {
    this.mutate(jobId, (job) => {
      job.sections.push(section);
      job.stage = 'sections';
    });
  }

  markDone(jobId: string): void {
    this.mutate(jobId, (job) => {
      job.status = 'done';
      job.stage = 'done';
    });
  }

  markCancelled(jobId: string): void {
    this.mutate(jobId, (job) => {
      job.status = 'cancelled';
      if (job.sections.length > 0) job.stage = 'sections';
    });
  }

  markFailed(jobId: string): void {
    this.mutate(jobId, (job) => {
      job.status = 'failed';
      if (job.sections.length > 0) job.stage = 'sections';
    });
  }

  /** 测试清理用：删除全部 job（仅当文件存在） */
  clear(): void {
    if (!existsSync(this.filePath)) return;
    try {
      renameSync(this.filePath, `${this.filePath}.bak-${Date.now()}`);
    } catch {
      // 文件被外部删除等场景不阻塞
    }
  }

  private mutate(jobId: string, apply: (job: DeepReportJob) => void): void {
    const jobs = this.readJobs();
    const job = jobs.find((item) => item.jobId === jobId);
    if (!job) return;
    apply(job);
    job.updatedAt = Date.now();
    this.writeJobs(jobs);
  }

  private readJobs(): DeepReportJob[] {
    if (!existsSync(this.filePath)) return [];
    const jobs: DeepReportJob[] = [];
    for (const line of readFileSync(this.filePath, 'utf-8').split(/\r?\n/)) {
      if (!line.trim()) continue;
      try {
        const parsed = JSON.parse(line) as DeepReportJob;
        if (parsed && typeof parsed.jobId === 'string') jobs.push(parsed);
      } catch {
        // 单行损坏不阻塞整体读取（append-only 审计容忍坏行）
      }
    }
    return jobs;
  }

  private writeJobs(jobs: DeepReportJob[]): void {
    mkdirSync(dirname(this.filePath), { recursive: true });
    const trimmed = jobs.slice(-JOB_LIMIT);
    const tmp = `${this.filePath}.tmp`;
    writeFileSync(tmp, trimmed.map((job) => JSON.stringify(job)).join('\n') + '\n', 'utf-8');
    try {
      renameSync(tmp, this.filePath);
    } catch {
      // rename 跨盘等异常回退为直接写
      writeFileSync(this.filePath, trimmed.map((job) => JSON.stringify(job)).join('\n') + '\n', 'utf-8');
    }
  }
}
