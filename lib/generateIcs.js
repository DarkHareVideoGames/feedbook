// Gera um ficheiro .ics (RFC 5545) para um evento de calendário.
// Uso:
//   generateIcs(event, { method, status, sequence, reminders })
// event: { uid, summary, description, location, start (Date), end (Date), organizerEmail, attendeeEmail, organizerName }
// options: { method: 'REQUEST'|'PUBLISH'|'CANCEL', status: 'CONFIRMED'|'CANCELLED'|'TENTATIVE', sequence: number, reminders: [{ minutes: number }] }

function pad(n) { return String(n).padStart(2, '0'); }

function formatUtc(d) {
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function escapeIcs(value) {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function foldLine(line) {
  // RFC 5545: linhas não devem exceder 75 octetos; dobrar com CRLF + espaço.
  const max = 75;
  if (line.length <= max) return line;
  const chunks = [];
  let i = 0;
  while (i < line.length) {
    chunks.push(line.slice(i, i + max));
    i += max;
  }
  return chunks.join('\r\n ');
}

export function generateIcs(event, options = {}) {
  const {
    method = 'REQUEST',
    status = 'CONFIRMED',
    sequence = 0,
    reminders = [{ minutes: 24 * 60 }, { minutes: 60 }],
  } = options;

  if (!event || !event.start || !event.end || !event.uid) return null;

  const stamp = formatUtc(new Date());
  const organizerEmail = event.organizerEmail || 'ensaios@feedbackproductions.pt';
  const organizerName = event.organizerName || 'Feedback Productions';
  const attendeeEmail = event.attendeeEmail || '';

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Feedback Productions//FeedBook//PT',
    'CALSCALE:GREGORIAN',
    `METHOD:${method}`,
    'BEGIN:VEVENT',
    `UID:${event.uid}`,
    `DTSTAMP:${stamp}`,
    `DTSTART:${formatUtc(event.start)}`,
    `DTEND:${formatUtc(event.end)}`,
    `SUMMARY:${escapeIcs(event.summary || 'Ensaio')}`,
    `DESCRIPTION:${escapeIcs(event.description || '')}`,
    `LOCATION:${escapeIcs(event.location || '')}`,
    `ORGANIZER;CN=${escapeIcs(organizerName)}:mailto:${organizerEmail}`,
  ];

  if (attendeeEmail) {
    lines.push(`ATTENDEE;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;RSVP=TRUE:mailto:${attendeeEmail}`);
  }

  lines.push(`STATUS:${status}`);
  lines.push(`SEQUENCE:${sequence}`);
  lines.push('TRANSP:OPAQUE');

  for (const r of reminders) {
    lines.push('BEGIN:VALARM');
    lines.push('ACTION:DISPLAY');
    lines.push(`DESCRIPTION:${escapeIcs('Lembrete: ' + (event.summary || 'Ensaio'))}`);
    lines.push(`TRIGGER:-PT${r.minutes}M`);
    lines.push('END:VALARM');
  }

  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.map(foldLine).join('\r\n');
}

export default generateIcs;