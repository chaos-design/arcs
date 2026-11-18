import type { CSSProperties } from 'react';
import { navFor, t } from './i18n';
import { hrefDoc, type Lang } from './routes';

/** 卡片色条轮换：6 色 accent */
const ACCENTS = [
  'var(--blue)',
  'var(--cyan)',
  'var(--green)',
  'var(--purple)',
  'var(--yellow)',
  'var(--red)',
];

function accentAt(i: number, j: number): CSSProperties {
  return { '--card-accent': ACCENTS[(i + j) % ACCENTS.length] } as CSSProperties;
}

/** 首页：项目总览 + 文档矩阵入口 */
export function Home({ lang }: { lang: Lang }) {
  const s = t(lang);
  const nav = navFor(lang);
  return (
    <div className="home">
      <section className="hero">
        <div className="hero-kicker">{s.heroKicker}</div>
        <h1>
          {s.heroTitleLead}
          <span className="grad">{s.heroTitleGrad}</span>
        </h1>
        <p className="hero-lead">{s.heroLead}</p>
        <div className="hero-actions">
          <a className="btn primary" href={hrefDoc('architecture', lang)}>
            {s.heroCtaArchitecture}
          </a>
          <a className="btn" href={hrefDoc('interview', lang)}>
            {s.heroCtaInterview}
          </a>
          <a className="btn ghost" href="https://github.com/chaos-design/arcs" target="_blank" rel="noreferrer">
            {s.heroCtaGithub}
          </a>
        </div>
        <div className="hero-stats">
          <div>
            <b>{s.stat1Value}</b>
            <span>{s.stat1Label}</span>
          </div>
          <div>
            <b>{s.stat2Value}</b>
            <span>{s.stat2Label}</span>
          </div>
          <div>
            <b>{s.stat3Value}</b>
            <span>{s.stat3Label}</span>
          </div>
          <div>
            <b>{s.stat4Value}</b>
            <span>{s.stat4Label}</span>
          </div>
        </div>
      </section>

      <section className="principles">
        <div className="principle">
          <h3>{s.principle1Title}</h3>
          <p>{s.principle1Body}</p>
        </div>
        <div className="principle">
          <h3>{s.principle2Title}</h3>
          <p>{s.principle2Body}</p>
        </div>
      </section>

      <section className="doc-grid-wrap">
        <h2>{s.docMatrix}</h2>
        {nav.map((group, gi) => (
          <div className="grid-group" key={group.label}>
            <div className="grid-label">{group.label}</div>
            <div className="grid-cards">
              {group.entries.map((entry, ei) => (
                <a
                  className="card"
                  style={accentAt(gi, ei)}
                  href={hrefDoc(entry.key, lang)}
                  key={entry.key}
                >
                  <span className="card-kicker">{group.label}</span>
                  <b>{entry.title}</b>
                  <span>{entry.desc}</span>
                </a>
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}
