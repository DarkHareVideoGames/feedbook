import {
  CalendarCheck,
  Clock,
  Coffee,
  Drama,
  Guitar,
  Mic,
  PartyPopper,
  Radio,
  Snowflake,
  Toilet,
  Wifi,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../../i18n';

// Icones alinhados com a ordem dos blocos nos ficheiros de locale.
// A ordem das tradutoras define a ordem visual dos cartoes.
const INFRASTRUCTURE_ICONS: LucideIcon[] = [Guitar, Drama, Coffee];
const AMENITY_ICONS: LucideIcon[] = [Snowflake, Wifi, Toilet, Clock];
const ACTIVITY_ICONS: LucideIcon[] = [CalendarCheck, Mic, Radio, PartyPopper];

/**
 * Secao "Quem somos" (Issue #44).
 * Conteudo 100% traduzido a partir de `translations.about`, para funcionar
 * em pt-PT e en sem duplicar texto no componente.
 */
export default function AboutSection() {
  const { translations } = useI18n();
  const { about } = translations;

  return (
    <section className="about-section" aria-labelledby="about-title">
      <header className="about-header">
        <p className="eyebrow">{about.eyebrow}</p>
        <h2 id="about-title">{about.title}</h2>
        <p className="about-lede">{about.lede}</p>
      </header>

      <div className="about-columns">
        <div className="about-block">
          <h3 className="about-block-title">{about.infrastructureTitle}</h3>
          <ul className="about-infrastructure-list">
            {about.infrastructure.map((item, index) => {
              const Icon = INFRASTRUCTURE_ICONS[index] ?? Guitar;

              return (
                <li className="about-infra-item" key={item.title}>
                  <span className="about-icon" aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <div className="about-item-body">
                    <h4>{item.title}</h4>
                    <p>{item.description}</p>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>

        <aside className="about-amenities">
          <h3 className="about-block-title">{about.amenitiesTitle}</h3>
          <ul className="about-amenities-list">
            {about.amenities.map((item, index) => {
              const Icon = AMENITY_ICONS[index] ?? Clock;

              return (
                <li className="about-amenity" key={item.label}>
                  <span className="about-icon about-icon-compact" aria-hidden="true">
                    <Icon size={16} />
                  </span>
                  <div className="about-item-body">
                    <strong>{item.label}</strong>
                    <span>{item.value}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      <div className="about-block">
        <h3 className="about-block-title">{about.activitiesTitle}</h3>
        <div className="about-activities-grid">
          {about.activities.map((item, index) => {
            const Icon = ACTIVITY_ICONS[index] ?? PartyPopper;

            return (
              <article className="about-activity" key={item.title}>
                <div className="about-activity-head">
                  <span className="about-icon" aria-hidden="true">
                    <Icon size={20} />
                  </span>
                  <span className="about-activity-index" aria-hidden="true">
                    {String(index + 1).padStart(2, '0')}
                  </span>
                </div>
                <h4>{item.title}</h4>
                <p>{item.description}</p>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
