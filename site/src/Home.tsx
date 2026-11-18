import { navFor, quickCardsFor, t } from './i18n';
import { hrefDoc, hrefHome, type Lang } from './routes';

/** 卡片 accent 色轮换（memx 同款 40×3 顶边色条）：blue → cyan → green → purple → yellow → red */
const ACCENTS = ['blue', 'cyan', 'green', 'purple', 'yellow', 'red'] as const;
function accentAt(i: number): string {
  return ACCENTS[i % ACCENTS.length];
}

/** 首页：面包屑 + hero + 快捷入口 + 核心原则 + 分区式文档矩阵（memx 布局） */
export function Home({ lang }: { lang: Lang }) {
  const s = t(lang);
  const nav = navFor(lang);
  return (
    <div className="home">
      <p className="crumb">
        <a href={hrefHome(lang)}>ARCS</a> · {s.crumbHub}
      </p>

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

      <div className="grid quick-grid">
        {quickCardsFor(lang).map((card, i) => (
          <a className="card" href={hrefDoc(card.key, lang)} key={card.key}>
            <i className={`card-accent ${accentAt(i)}`} />
            <span className="card-kicker">{card.kicker}</span>
            <b className="card-title">{card.title}</b>
            <span className="card-body">{card.desc}</span>
          </a>
        ))}
      </div>

      <div className="section-head">
        <h2>{s.principlesTitle}</h2>
        <p>{s.principlesDesc}</p>
      </div>
      <div className="grid">
        <div className="card static">
          <i className="card-accent blue" />
          <span className="card-kicker">PROMISE</span>
          <b className="card-title">{s.principle1Title}</b>
          <span className="card-body">{s.principle1Body}</span>
        </div>
        <div className="card static">
          <i className="card-accent cyan" />
          <span className="card-kicker">PROMISE</span>
          <b className="card-title">{s.principle2Title}</b>
          <span className="card-body">{s.principle2Body}</span>
        </div>
      </div>

      {nav.map((group) => (
        <div key={group.label}>
          <div className="section-head">
            <h2>{group.label}</h2>
            <p>{group.desc}</p>
          </div>
          <div className="grid">
            {group.entries.map((entry, ei) => (
              <a className="card" href={hrefDoc(entry.key, lang)} key={entry.key}>
                <i className={`card-accent ${accentAt(ei)}`} />
                <span className="card-kicker">{group.kicker}</span>
                <b className="card-title">{entry.title}</b>
                <span className="card-body">{entry.desc}</span>
              </a>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
