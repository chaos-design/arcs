import { NAV } from './docs';
import { hrefDoc } from './routes';

/** 首页：项目总览 + 文档矩阵入口 */
export function Home() {
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-kicker">Agent Runtime Correction System</div>
        <h1>
          ARCS：Agent 执行流内的<span className="grad">实时纠偏系统</span>
        </h1>
        <p className="hero-lead">
          在工具调用落地前检测偏航——参数幻觉、死循环、任务发散、高危越权——并原地修复：
          修参数、注入提示、改道工具、请求审批。任务始终向前推进，从不被中断。
        </p>
        <div className="hero-actions">
          <a className="btn primary" href={hrefDoc('architecture')}>
            从架构设计开始 →
          </a>
          <a className="btn" href={hrefDoc('interview')}>
            面试题库
          </a>
          <a className="btn ghost" href="https://github.com/chaos-design/arcs" target="_blank" rel="noreferrer">
            GitHub ↗
          </a>
        </div>
        <div className="hero-stats">
          <div>
            <b>4 级</b>
            <span>纠偏策略 L1–L4</span>
          </div>
          <div>
            <b>9 家</b>
            <span>宿主插件 + 2 个 SDK</span>
          </div>
          <div>
            <b>p99 &lt; 50ms</b>
            <span>sense + plan 预算</span>
          </div>
          <div>
            <b>fail-open</b>
            <span>绝不成为中断源</span>
          </div>
        </div>
      </section>

      <section className="principles">
        <div className="principle">
          <h3>① 任务不中断</h3>
          <p>纠偏发生在执行流内部——修复参数、注入提示、重定向工具——任务始终向前推进。</p>
        </div>
        <div className="principle">
          <h3>② 偏航立即纠偏</h3>
          <p>实时检测执行方向与既定目标的偏差，越界即修正，避免 Agent 在错误方向越走越远。</p>
        </div>
      </section>

      <section className="doc-grid-wrap">
        <h2>文档矩阵</h2>
        <div className="doc-grid">
          {NAV.map((group) => (
            <div className="grid-group" key={group.label}>
              <div className="grid-label">{group.label}</div>
              <div className="grid-cards">
                {group.entries.map((entry) => (
                  <a className="card" href={hrefDoc(entry.key)} key={entry.key}>
                    <b>{entry.title}</b>
                    <span>{entry.desc}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
