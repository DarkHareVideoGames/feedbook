import { afterEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { I18nProvider } from '../../i18n';
import MobileRoomJourney, { JourneyRoom } from './MobileRoomJourney';

afterEach(() => vi.unstubAllGlobals());

const rooms: JourneyRoom[] = [
  { id: 'red', name: 'RED', accent: '#d11323', capacity: 'Até 6 elementos', vibe: 'Ensaia connosco', longDescription: 'Descrição completa RED', gear: ['Bateria', 'PA'], priceLabel: 'desde 10€' },
  { id: 'live', name: 'LIVE', accent: '#540099', capacity: '', vibe: 'Eventos', longDescription: '', gear: [], priceLabel: 'Sob consulta' },
];

function render(locale = 'pt-PT') {
  vi.stubGlobal('window', {
    matchMedia: () => ({ matches: false }),
    localStorage: { getItem: () => locale },
  });
  return renderToStaticMarkup(<I18nProvider><MobileRoomJourney rooms={rooms} onChoose={() => {}} /></I18nProvider>);
}

describe('mobile room journey', () => {
  it('renders one cover per room and inline details instead of modal triggers', () => {
    const html = render();
    expect(html.match(/class="room-journey-cover"/g)).toHaveLength(2);
    expect(html).toContain('Descrição completa RED');
    expect(html).toContain('Bateria');
    expect(html).not.toContain('aria-haspopup="dialog"');
    expect(html).not.toContain('>Ver mais<');
  });

  it('links each card to its always-visible details', () => {
    const html = render();
    expect(html).toContain('id="room-story-red" class="room-journey-details" role="group"');
    expect(html).toContain('aria-labelledby="room-story-red-equipment"');
  });

  it('hides the choose button for now, keeping the card itself as the booking trigger', () => {
    const html = render();
    expect(html).not.toContain('room-journey-book');
    expect(html.match(/class="room-journey-summary" role="button"/g)).toHaveLength(2);
    expect(html).toContain('Sob consulta');
    expect(html).toContain('class="room-journey-description is-summary">Eventos</p>');
  });

  it('translates the call to action into English', () => {
    const html = render('en');
    expect(html).toContain('Choose this room');
  });

  it('handles an empty room list', () => {
    render();
    expect(renderToStaticMarkup(<I18nProvider><MobileRoomJourney rooms={[]} onChoose={() => {}} /></I18nProvider>)).not.toContain('room-journey-cover');
  });

  it('keeps one room title per card without repeating it in the details', () => {
    const html = render();
    expect(html.match(/<h2 /g)).toHaveLength(rooms.length);
    expect(html).not.toContain('room-details-title');
    expect(html).toContain('<h3 id="room-story-red-equipment">');
  });

  it('contains expandable details inside the card but outside its booking trigger', () => {
    const html = render();
    const cardStart = html.indexOf('class="room-card card room-journey-original"');
    const detailsStart = html.indexOf('id="room-story-red"');
    const cardEnd = html.indexOf('</section></article>');
    expect(cardStart).toBeLessThan(detailsStart);
    expect(detailsStart).toBeLessThan(cardEnd);
    expect(html).toContain('<div class="room-journey-summary" role="button"');
    expect(html).toContain('</p></div><div id="room-story-red"');
    expect(html).not.toContain('inert');
    expect(html).not.toContain('aria-hidden="true" class="room-journey-details"');
  });

  it('adds one bottom "more below" arrow for the whole journey', () => {
    const html = render();
    expect(html.match(/class="room-journey-cue"/g)).toHaveLength(1);
    expect(html).toContain('aria-label="Ver mais abaixo"');
    expect(render('en')).toContain('aria-label="See more below"');
  });

  it('shows every card fully open without expand arrows', () => {
    const html = render();
    expect(html).not.toContain('room-journey-scroll');
    expect(html).not.toContain('aria-expanded');
    expect(html).not.toContain('room-card-arrow');
    expect(html).not.toContain('&gt;');
  });

  it('does not repeat the short description when it already fills the details', () => {
    const html = render();
    expect(html).toContain('class="room-card-description">Ensaia connosco</p>');
    expect(html).not.toContain('class="room-card-description">Eventos</p>');
  });

  it('preserves the original card classes and content order without redesigned covers', () => {
    const html = render();
    expect(html.match(/class="room-card card room-journey-original"/g)).toHaveLength(2);
    expect(html).toContain('class="room-card-header"');
    expect(html.indexOf('room-card-header')).toBeLessThan(html.indexOf('room-card-description'));
    expect(html).not.toContain('room-journey-counter');
    expect(html).not.toContain('room-journey-quick-book');
  });

  it('omits empty room descriptions instead of rendering blank paragraphs', () => {
    vi.stubGlobal('window', { matchMedia: () => ({ matches: false }), localStorage: { getItem: () => 'pt-PT' } });
    const bare = { ...rooms[1], vibe: '', longDescription: '' };
    const html = renderToStaticMarkup(<I18nProvider><MobileRoomJourney rooms={[bare]} onChoose={() => {}} /></I18nProvider>);
    expect(html).not.toContain('room-card-description');
    expect(html).not.toContain('room-journey-description');
    expect(html).toContain('room-journey-original');
  });
});
