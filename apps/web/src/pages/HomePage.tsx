import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { resolveLoginLandingPath } from '@lz3c/shared';
import { api } from '../lib/api';
import { normalizeMemberships, readPersistedCashierOnly } from '../lib/auth-session';
import { meQueryKey } from '../lib/query-keys';
import { useAuthStore } from '../stores/auth';
import { useLocaleStore } from '../stores/locale';

export function HomePage() {
  const { t } = useTranslation();
  const token = useAuthStore((s) => s.token);
  const cashierOnly = useAuthStore((s) => s.cashierOnly);
  const { locale, setLocale } = useLocaleStore();

  const { data: me } = useQuery({
    queryKey: meQueryKey(token),
    queryFn: () => api.me(),
    enabled: !!token,
  });

  const dashboardPath =
    cashierOnly || readPersistedCashierOnly()
      ? '/dashboard/pos'
      : me
        ? resolveLoginLandingPath(normalizeMemberships(me.memberships))
        : '/dashboard';

  const primaryCta = token ? dashboardPath : '/login';
  const primaryLabel = token ? t('home.ctaDashboard') : t('home.ctaPrimary');

  const stats = [
    { value: t('home.stat1Value'), label: t('home.stat1Label') },
    { value: t('home.stat2Value'), label: t('home.stat2Label') },
    { value: t('home.stat3Value'), label: t('home.stat3Label') },
    { value: t('home.stat4Value'), label: t('home.stat4Label') },
  ];

  const benefits = [
    { icon: '🛒', title: t('home.benefit1Title'), desc: t('home.benefit1Desc') },
    { icon: '📦', title: t('home.benefit2Title'), desc: t('home.benefit2Desc') },
    { icon: '🔧', title: t('home.benefit3Title'), desc: t('home.benefit3Desc') },
    { icon: '🏪', title: t('home.benefit4Title'), desc: t('home.benefit4Desc') },
    { icon: '📊', title: t('home.benefit5Title'), desc: t('home.benefit5Desc') },
    { icon: '🔐', title: t('home.benefit6Title'), desc: t('home.benefit6Desc') },
  ];

  const features = [
    { icon: '💳', title: t('home.feature1Title'), desc: t('home.feature1Desc') },
    { icon: '📥', title: t('home.feature2Title'), desc: t('home.feature2Desc') },
    { icon: '🛠️', title: t('home.feature3Title'), desc: t('home.feature3Desc') },
    { icon: '💰', title: t('home.feature4Title'), desc: t('home.feature4Desc') },
    { icon: '🚚', title: t('home.feature5Title'), desc: t('home.feature5Desc') },
    { icon: '📈', title: t('home.feature6Title'), desc: t('home.feature6Desc') },
  ];

  const steps = [
    { num: '1', title: t('home.step1Title'), desc: t('home.step1Desc') },
    { num: '2', title: t('home.step2Title'), desc: t('home.step2Desc') },
    { num: '3', title: t('home.step3Title'), desc: t('home.step3Desc') },
  ];

  const starterFeatures = [
    t('home.planStarter1'),
    t('home.planStarter2'),
    t('home.planStarter3'),
    t('home.planStarter4'),
  ];

  const proFeatures = [
    t('home.planPro1'),
    t('home.planPro2'),
    t('home.planPro3'),
    t('home.planPro4'),
    t('home.planPro5'),
  ];

  return (
    <div className="portal-light">
      <header className="portal-light-header">
        <Link to="/" className="portal-light-brand">
          <span className="portal-light-logo-mark" aria-hidden>
            LZ
          </span>
          <span className="portal-light-brand-text">
            <strong>{t('app.title')}</strong>
            <span>{t('app.taglineShort')}</span>
          </span>
        </Link>

        <nav className="portal-light-nav" aria-label={t('home.navLabel')}>
          <a href="#features">{t('home.navFeatures')}</a>
          <a href="#plans">{t('home.navPlans')}</a>
          <div className="portal-light-lang" role="group" aria-label={t('common.language')}>
            <button
              type="button"
              className={locale === 'en' ? 'is-active' : undefined}
              onClick={() => setLocale('en')}
            >
              EN
            </button>
            <button
              type="button"
              className={locale === 'zh' ? 'is-active' : undefined}
              onClick={() => setLocale('zh')}
            >
              中文
            </button>
          </div>
          {!token && (
            <Link to="/login" className="portal-light-btn portal-light-btn--ghost">
              {t('common.login')}
            </Link>
          )}
          <Link to={primaryCta} className="portal-light-btn portal-light-btn--primary">
            {primaryLabel}
          </Link>
        </nav>
      </header>

      <main className="portal-light-main">
        <section className="portal-light-hero">
          <div>
            <span className="portal-light-pill">{t('home.pill')}</span>
            <h1 className="portal-light-h1">{t('home.h1')}</h1>
            <p className="portal-light-lead">{t('home.lead')}</p>
            <div className="portal-light-hero-cta">
              <Link to={primaryCta} className="portal-light-btn portal-light-btn--primary">
                {primaryLabel}
              </Link>
              {!token && (
                <Link to="/login" className="portal-light-btn portal-light-btn--ghost">
                  {t('home.ctaSecondary')}
                </Link>
              )}
            </div>
          </div>

          <div className="portal-light-preview" aria-hidden>
            <div className="portal-light-preview-head">
              <span className="portal-light-preview-dot" />
              <span className="portal-light-preview-dot" />
              <span className="portal-light-preview-dot" />
              {t('home.previewTitle')}
            </div>
            <div className="portal-light-preview-row">
              <strong>{t('home.previewRow1')}</strong>
              <span className="portal-light-preview-tag">{t('home.previewTag1')}</span>
            </div>
            <div className="portal-light-preview-row">
              <strong>{t('home.previewRow2')}</strong>
              <span className="portal-light-preview-tag portal-light-preview-tag--blue">
                {t('home.previewTag2')}
              </span>
            </div>
            <div className="portal-light-preview-row">
              <strong>{t('home.previewRow3')}</strong>
              <span className="portal-light-preview-tag portal-light-preview-tag--amber">
                {t('home.previewTag3')}
              </span>
            </div>
          </div>
        </section>

        <section className="portal-light-stats" aria-label={t('home.statsLabel')}>
          {stats.map((s) => (
            <div key={s.label} className="portal-light-stat">
              <strong>{s.value}</strong>
              <span>{s.label}</span>
            </div>
          ))}
        </section>

        <div className="portal-light-section-head">
          <h2>{t('home.benefitsTitle')}</h2>
          <p>{t('home.benefitsSubtitle')}</p>
        </div>
        <section className="portal-light-benefits">
          {benefits.map((b) => (
            <article key={b.title} className="portal-light-benefit">
              <div className="portal-light-benefit-icon">{b.icon}</div>
              <h3>{b.title}</h3>
              <p>{b.desc}</p>
            </article>
          ))}
        </section>

        <div className="portal-light-section-head" id="features">
          <h2>{t('home.featuresTitle')}</h2>
          <p>{t('home.featuresSubtitle')}</p>
        </div>
        <section className="portal-light-features">
          {features.map((f) => (
            <article key={f.title} className="portal-light-feature">
              <div className="portal-light-feature-icon">{f.icon}</div>
              <div>
                <h3>{f.title}</h3>
                <p>{f.desc}</p>
              </div>
            </article>
          ))}
        </section>

        <div className="portal-light-section-head">
          <h2>{t('home.stepsTitle')}</h2>
          <p>{t('home.stepsSubtitle')}</p>
        </div>
        <section className="portal-light-steps">
          {steps.map((s) => (
            <article key={s.num} className="portal-light-step">
              <div className="portal-light-step-num">{s.num}</div>
              <h3>{s.title}</h3>
              <p>{s.desc}</p>
            </article>
          ))}
        </section>

        <div className="portal-light-section-head" id="plans">
          <h2>{t('home.plansTitle')}</h2>
          <p>{t('home.plansSubtitle')}</p>
        </div>
        <section className="portal-light-plans">
          <article className="portal-light-plan">
            <span className="portal-light-plan-badge">{t('home.planStarterBadge')}</span>
            <h3>{t('home.planStarterName')}</h3>
            <p className="portal-light-plan-desc">{t('home.planStarterDesc')}</p>
            <ul>
              {starterFeatures.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Link to="/login" className="portal-light-btn portal-light-btn--ghost">
              {t('home.planStarterCta')}
            </Link>
          </article>
          <article className="portal-light-plan portal-light-plan--pro">
            <span className="portal-light-plan-badge">{t('home.planProBadge')}</span>
            <h3>{t('home.planProName')}</h3>
            <p className="portal-light-plan-desc">{t('home.planProDesc')}</p>
            <ul>
              {proFeatures.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Link to="/login" className="portal-light-btn portal-light-btn--primary">
              {t('home.planProCta')}
            </Link>
          </article>
        </section>

        <section className="portal-light-contact">
          <div className="portal-light-contact-inner">
            <div className="portal-light-contact-text">
              <h2>{t('home.contactTitle')}</h2>
              <p>{t('home.contactDesc')}</p>
              <ul className="portal-light-contact-list">
                <li>{t('home.contactPoint1')}</li>
                <li>{t('home.contactPoint2')}</li>
                <li>{t('home.contactPoint3')}</li>
              </ul>
            </div>
            <div className="portal-light-contact-card">
              <p className="portal-light-contact-label">{t('home.contactCardLabel')}</p>
              <Link to={primaryCta} className="portal-light-btn portal-light-btn--primary">
                {primaryLabel}
              </Link>
              <p className="portal-light-contact-hint">{t('home.contactHint')}</p>
            </div>
          </div>
        </section>

        <footer className="portal-light-footer">
          <p>
            © {new Date().getFullYear()} {t('app.title')} · {t('home.footerTagline')}
          </p>
        </footer>
      </main>
    </div>
  );
}
